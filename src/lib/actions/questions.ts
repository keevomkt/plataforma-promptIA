"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { classifyQuestion } from "@/lib/engine/locate";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX = 500;

/**
 * Registra a pergunta no histórico do prompt e devolve o endereço da
 * resposta. A mesma pergunta feita de novo só sobe para o topo.
 */
export async function askQuestion(promptId: string, input: string): Promise<ActionResult<{ url: string }>> {
  const me = await requireUser();
  const text = input.trim().replace(/\s+/g, " ").slice(0, MAX);
  if (!text) return { ok: false, error: "Escreva a sua pergunta." };
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId }, select: { slug: true } });
  if (!prompt) return { ok: false, error: "Prompt não encontrado." };

  const existing = await prisma.question.findFirst({ where: { promptId, text: { equals: text, mode: "insensitive" } }, select: { id: true } });
  if (existing) {
    await prisma.question.update({ where: { id: existing.id }, data: { createdAt: new Date(), createdBy: me.name, text } });
  } else {
    await prisma.question.create({ data: { promptId, text, kind: classifyQuestion(text).kind, createdBy: me.name } });
  }
  revalidatePath(`/p/${prompt.slug}/perguntar`);
  return { ok: true, data: { url: `/p/${prompt.slug}/perguntar?q=${encodeURIComponent(text)}` } };
}

/** Remove uma pergunta do histórico (só o registro; nada no prompt muda). */
export async function deleteQuestion(id: string): Promise<ActionResult<null>> {
  await requireUser();
  const q = await prisma.question.findUnique({ where: { id }, select: { prompt: { select: { slug: true } } } });
  if (!q) return { ok: true, data: null };
  await prisma.question.delete({ where: { id } });
  revalidatePath(`/p/${q.prompt.slug}/perguntar`);
  return { ok: true, data: null };
}
