"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";
import { requireUser } from "@/lib/auth/session";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateKnowledgeMeta(
  id: string,
  input: { title: string; businessUnit: string; category: string; description: string }
): Promise<ActionResult<null>> {
  await requireUser();
  const title = input.title.trim();
  const businessUnit = input.businessUnit.trim();
  if (!title) return { ok: false, error: "O título não pode ficar vazio." };
  if (!businessUnit) return { ok: false, error: "Informe a unidade de negócio." };
  if (!KNOWLEDGE_CATEGORIES[input.category]) return { ok: false, error: "Categoria inválida." };
  await prisma.knowledgeDocument.update({
    where: { id },
    data: { title, businessUnit, category: input.category, description: input.description.trim() || null },
  });
  revalidatePath("/conhecimento", "layout");
  return { ok: true, data: null };
}

/** Volta a usar uma revisão anterior do arquivo (as demais continuam guardadas). */
export async function setCurrentKnowledgeRevision(id: string, revision: number): Promise<ActionResult<null>> {
  await requireUser();
  const exists = await prisma.knowledgeRevision.findUnique({ where: { documentId_revision: { documentId: id, revision } } });
  if (!exists) return { ok: false, error: "Revisão não encontrada." };
  await prisma.knowledgeDocument.update({ where: { id }, data: { currentRevision: revision } });
  revalidatePath("/conhecimento", "layout");
  return { ok: true, data: null };
}

export async function deleteKnowledgeDocument(id: string): Promise<ActionResult<null>> {
  await requireUser();
  await prisma.knowledgeDocument.delete({ where: { id } });
  revalidatePath("/conhecimento", "layout");
  return { ok: true, data: null };
}
