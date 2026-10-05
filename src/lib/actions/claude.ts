"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentVersion } from "@/lib/data";
import { requireUser } from "@/lib/auth/session";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";
import { resolveUnit } from "@/lib/brand";
import { buildClaudePackage } from "@/lib/claude/package";
import { readClaudeCorrection } from "@/lib/claude/analysis";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type ImportResult = { ok: true; data: { changeId: string; slug: string } } | { ok: false; error: string; notes: string[]; showFormat: boolean };

/** Monta o pacote (relato + prompt atual numerado + base da unidade) para colar no Claude. */
export async function getClaudePackage(promptId: string, problem: string, expected: string): Promise<ActionResult<{ text: string; version: number }>> {
  await requireUser();
  if (!problem.trim()) return { ok: false, error: "Descreva o problema relatado pela curadoria." };
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  const current = prompt ? await getCurrentVersion(promptId) : null;
  if (!prompt || !current) return { ok: false, error: "Prompt sem versão." };
  const kb = await loadKnowledgeForPrompt(promptId);
  const unit = resolveUnit(prompt.businessUnit);
  const text = buildClaudePackage({
    promptName: prompt.name,
    unitLabel: unit ? `${unit.id} (${unit.brand})` : prompt.businessUnit ?? undefined,
    description: prompt.description,
    version: current.version,
    content: current.content,
    knowledge: kb.sources.map((s) => ({ title: s.title, content: s.content })),
    knowledgeScope: kb.scope,
    problem,
    expected,
  });
  return { ok: true, data: { text, version: current.version } };
}

/**
 * Registra a resposta colada do Claude como um pedido de alteração: os
 * blocos viram operações sobre a versão atual e seguem o fluxo normal
 * (avaliação de conflito, revisão, diff, validação e nova versão).
 * Se nada for interpretado ou localizado com segurança, nada é criado.
 */
export async function importClaudeAnswer(
  promptId: string,
  input: { problem: string; expected: string; answer: string }
): Promise<ImportResult> {
  const me = await requireUser();
  const problem = input.problem.trim();
  if (!problem) return { ok: false, error: "Descreva o problema relatado pela curadoria (ele vira o motivo da nova versão).", notes: [], showFormat: false };
  if (!input.answer.trim()) return { ok: false, error: "Cole a resposta do Claude.", notes: [], showFormat: false };
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  const current = prompt ? await getCurrentVersion(promptId) : null;
  if (!prompt || !current) return { ok: false, error: "Prompt sem versão.", notes: [], showFormat: false };

  const kb = await loadKnowledgeForPrompt(promptId);
  const reading = readClaudeCorrection(current.content, input, kb.sources);
  if (!reading.ok) return reading;
  const { analysis } = reading;

  const change = await prisma.changeRequest.create({
    data: {
      promptId,
      kind: "CLAUDE",
      request: problem,
      status: "AGUARDANDO_APROVACAO",
      analysis: JSON.stringify(analysis),
      affectedSections: JSON.stringify(analysis.affectedSections),
      conflicts: JSON.stringify([...analysis.conflicts.map((c) => c.description), ...(analysis.ruleChecks ?? []).filter((c) => c.kind === "conflitante").map((c) => c.explanation)]),
      impactLevel: analysis.impact,
      fromVersionId: current.id,
      createdBy: me.name,
    },
  });
  revalidatePath(`/p/${prompt.slug}`, "layout");
  return { ok: true, data: { changeId: change.id, slug: prompt.slug } };
}
