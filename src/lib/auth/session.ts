/**
 * Sessão do usuário no servidor. Toda página, ação e rota de API passa por
 * aqui: além da assinatura do token (já conferida no middleware), confere no
 * banco se a conta continua ativa e se a sessão não foi invalidada.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authSecret, SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./token";

export type Role = "ADMIN" | "USUARIO";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
};

/** Usuário logado e ativo, ou null. Uma consulta por requisição. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const payload = await verifySession(cookies().get(SESSION_COOKIE)?.value, authSecret());
  if (!payload) return null;
  const u = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!u || u.status !== "ATIVO" || u.sessionVersion !== payload.version) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role === "ADMIN" ? "ADMIN" : "USUARIO", mustChangePassword: u.mustChangePassword };
});

/**
 * Exige usuário logado. Quem está com senha provisória é levado a trocá-la
 * antes de qualquer outra coisa.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/conta?trocar=1");
  return user;
}

/** Para rotas de API: usuário pronto para usar a plataforma, ou null (a rota responde 401). */
export async function apiUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword ? user : null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function startSession(user: { id: string; sessionVersion: number }) {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET não configurada no servidor.");
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
  const token = await signSession({ userId: user.id, version: user.sessionVersion, expiresAt }, secret);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function endSession() {
  cookies().delete(SESSION_COOKIE);
}

/** Só aceita caminhos internos depois do login (evita redirecionar para outro site). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
