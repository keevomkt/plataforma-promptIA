"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { hashPassword, temporaryPassword } from "@/lib/auth/password";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function refresh() {
  revalidatePath("/usuarios");
  revalidatePath("/", "layout");
}

async function target(id: string, adminId: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Usuário não encontrado." } as const;
  if (user.id === adminId) return { error: "Para mudar a sua própria conta, use “Minha conta”." } as const;
  return { user } as const;
}

/** Nunca deixa o sistema sem pelo menos um administrador ativo. */
async function wouldLeaveNoAdmin(userId: string) {
  const others = await prisma.user.count({ where: { role: "ADMIN", status: "ATIVO", NOT: { id: userId } } });
  return others === 0;
}

export async function approveUser(id: string): Promise<ActionResult<null>> {
  const admin = await requireAdmin();
  const t = await target(id, admin.id);
  if ("error" in t) return { ok: false, error: t.error! };
  if (t.user.status !== "PENDENTE") return { ok: false, error: "Este cadastro não está aguardando aprovação." };
  await prisma.user.update({ where: { id }, data: { status: "ATIVO", approvedBy: admin.name, approvedAt: new Date() } });
  refresh();
  return { ok: true, data: null };
}

/** Recusa um cadastro pendente: a conta nunca teve acesso, então é apagada. */
export async function rejectUser(id: string): Promise<ActionResult<null>> {
  const admin = await requireAdmin();
  const t = await target(id, admin.id);
  if ("error" in t) return { ok: false, error: t.error! };
  if (t.user.status !== "PENDENTE") return { ok: false, error: "Só cadastros pendentes podem ser recusados. Para tirar o acesso de uma conta ativa, bloqueie." };
  await prisma.user.delete({ where: { id } });
  refresh();
  return { ok: true, data: null };
}

export async function setUserBlocked(id: string, blocked: boolean): Promise<ActionResult<null>> {
  const admin = await requireAdmin();
  const t = await target(id, admin.id);
  if ("error" in t) return { ok: false, error: t.error! };
  if (t.user.status === "PENDENTE") return { ok: false, error: "Aprove ou recuse o cadastro primeiro." };
  if (blocked && t.user.role === "ADMIN" && (await wouldLeaveNoAdmin(id))) return { ok: false, error: "Não é possível bloquear o último administrador." };
  await prisma.user.update({
    where: { id },
    data: blocked ? { status: "BLOQUEADO", sessionVersion: { increment: 1 } } : { status: "ATIVO", failedLogins: 0, lockedUntil: null },
  });
  refresh();
  return { ok: true, data: null };
}

export async function setUserRole(id: string, role: "ADMIN" | "USUARIO"): Promise<ActionResult<null>> {
  const admin = await requireAdmin();
  const t = await target(id, admin.id);
  if ("error" in t) return { ok: false, error: t.error! };
  if (t.user.status !== "ATIVO") return { ok: false, error: "Só contas ativas podem mudar de permissão." };
  if (role === "USUARIO" && t.user.role === "ADMIN" && (await wouldLeaveNoAdmin(id))) return { ok: false, error: "Não é possível remover o último administrador." };
  await prisma.user.update({ where: { id }, data: { role } });
  refresh();
  return { ok: true, data: null };
}

/** Gera uma senha provisória (mostrada uma única vez) e obriga a troca no próximo acesso. */
export async function resetUserPassword(id: string): Promise<ActionResult<{ password: string }>> {
  const admin = await requireAdmin();
  const t = await target(id, admin.id);
  if ("error" in t) return { ok: false, error: t.error! };
  if (t.user.status === "PENDENTE") return { ok: false, error: "Aprove ou recuse o cadastro primeiro." };
  const password = temporaryPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  refresh();
  return { ok: true, data: { password } };
}
