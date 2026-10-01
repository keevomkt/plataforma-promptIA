"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { endSession, getSessionUser, safeNext, startSession } from "@/lib/auth/session";
import { authSecret } from "@/lib/auth/token";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos.";

const normEmail = (e: string) => e.trim().toLowerCase();

export async function login(emailInput: string, password: string, next?: string): Promise<ActionResult<{ redirectTo: string }>> {
  if (!authSecret()) return { ok: false, error: "Login indisponível: a configuração AUTH_SECRET não foi definida no servidor." };
  const email = normEmail(emailInput);
  if (!email || !password) return { ok: false, error: "Informe e-mail e senha." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyPassword(password, await dummyHash()); // mesmo tempo de resposta de um e-mail existente
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { ok: false, error: `Muitas tentativas erradas. Tente de novo em ${min} minuto(s) ou peça a um administrador para redefinir sua senha.` };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const fails = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLogins: fails },
    });
    return { ok: false, error: fails >= MAX_FAILS ? `Muitas tentativas erradas. Acesso travado por ${LOCK_MINUTES} minutos.` : GENERIC_LOGIN_ERROR };
  }
  // Situação da conta só é revelada para quem acertou a senha
  if (user.status === "PENDENTE") return { ok: false, error: "Seu cadastro ainda aguarda a aprovação de um administrador." };
  if (user.status === "BLOQUEADO") return { ok: false, error: "Sua conta está bloqueada. Fale com um administrador." };

  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await startSession(user);
  return { ok: true, data: { redirectTo: user.mustChangePassword ? "/conta?trocar=1" : safeNext(next) } };
}

/**
 * Cadastro. A primeira conta do sistema vira administradora e já entra;
 * as demais ficam aguardando aprovação.
 */
export async function register(nameInput: string, emailInput: string, password: string): Promise<ActionResult<{ firstAdmin: boolean }>> {
  if (!authSecret()) return { ok: false, error: "Cadastro indisponível: a configuração AUTH_SECRET não foi definida no servidor." };
  const name = nameInput.trim().replace(/\s+/g, " ");
  const email = normEmail(emailInput);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe seu nome." };
  if (!EMAIL.test(email) || email.length > 160) return { ok: false, error: "Informe um e-mail válido." };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, error: "Já existe um cadastro com este e-mail." };

  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (tx) => {
    // Trava curta para que dois cadastros simultâneos não virem "o primeiro"
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(827364)`;
    const first = (await tx.user.count()) === 0;
    return tx.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: first ? "ADMIN" : "USUARIO",
        status: first ? "ATIVO" : "PENDENTE",
        ...(first ? { approvedBy: "primeiro cadastro do sistema", approvedAt: new Date(), lastLoginAt: new Date() } : {}),
      },
    });
  });
  const firstAdmin = created.role === "ADMIN";
  if (firstAdmin) await startSession(created);
  return { ok: true, data: { firstAdmin } };
}

export async function logout() {
  endSession();
  redirect("/login");
}

export async function changePassword(current: string, next: string): Promise<ActionResult<null>> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "A senha atual está incorreta." };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };
  if (current === next) return { ok: false, error: "A nova senha precisa ser diferente da atual." };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  await startSession(updated); // encerra as outras sessões e mantém esta
  return { ok: true, data: null };
}
