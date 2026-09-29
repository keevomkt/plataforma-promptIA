import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/engine/knowledge";
import { resolveUnit } from "@/lib/brand";

/** Documentos da base (revisão vigente) no formato usado pelo motor. */
export async function loadKnowledgeSources(): Promise<KnowledgeSource[]> {
  const docs = await prisma.knowledgeDocument.findMany();
  if (!docs.length) return [];
  const revisions = await prisma.knowledgeRevision.findMany({
    where: { OR: docs.map((d) => ({ documentId: d.id, revision: d.currentRevision })) },
    select: { documentId: true, content: true },
  });
  const content = new Map(revisions.map((r) => [r.documentId, r.content]));
  return docs.flatMap((d) =>
    content.has(d.id)
      ? [{ documentId: d.id, title: d.title, businessUnit: d.businessUnit, category: d.category, content: content.get(d.id)! }]
      : []
  );
}

/**
 * Base de conhecimento que vale para um prompt: documentos da mesma unidade
 * de negócio (HCM, ERP, EC) + documentos gerais (unidade que não é nenhuma
 * das três, ex: "Institucional"). Prompt sem unidade usa a base inteira.
 */
export async function loadKnowledgeForPrompt(promptId: string): Promise<{ sources: KnowledgeSource[]; scope: string }> {
  const [prompt, all] = await Promise.all([
    prisma.prompt.findUnique({ where: { id: promptId }, select: { businessUnit: true } }),
    loadKnowledgeSources(),
  ]);
  const unit = resolveUnit(prompt?.businessUnit);
  if (!unit) return { sources: all, scope: "toda a base" };
  const sources = all.filter((s) => {
    const docUnit = resolveUnit(s.businessUnit);
    return !docUnit || docUnit.id === unit.id;
  });
  return { sources, scope: `unidade ${unit.id} + documentos gerais` };
}

/** Lista para a tela da base (sem o conteúdo nem o arquivo original). */
export async function listKnowledgeDocuments() {
  const docs = await prisma.knowledgeDocument.findMany({
    orderBy: [{ businessUnit: "asc" }, { title: "asc" }],
    include: {
      revisions: { select: { revision: true, fileName: true, size: true, createdAt: true, createdBy: true } },
    },
  });
  return docs.map((d) => ({
    ...d,
    current: d.revisions.find((r) => r.revision === d.currentRevision),
    revisionCount: d.revisions.length,
  }));
}

export async function listBusinessUnits(): Promise<string[]> {
  const rows = await prisma.knowledgeDocument.findMany({ select: { businessUnit: true }, distinct: ["businessUnit"] });
  return rows.map((r) => r.businessUnit).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
