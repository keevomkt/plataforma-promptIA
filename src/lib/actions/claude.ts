"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentVersion } from "@/lib/data";
import { requireUser } from "@/lib/auth/session";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";
import { resolveUnit } from "@/lib/brand";
import { parsePrompt } from "@/lib/engine/parse";
import { computeImpact, preserved } from "@/lib/engine/shared";
import { findUnsourcedNames, KnowledgeIndex } from "@/lib/engine/knowledge";
import type { ChangeAnalysis } from "@/lib/engine/types";
import { buildClaudePackage } from "@/lib/claude/package";
import { parseClaudeAnswer, resolveBlocks } from "@/lib/claude/answer";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const CLAUDE_ENGINE = "claude.ai (resposta colada)";

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
 * (revisão, diff, validação e nova versão).
 */
export async function importClaudeAnswer(
  promptId: string,
  input: { problem: string; expected: string; answer: string }
): Promise<ActionResult<{ changeId: string; slug: string }>> {
  const me = await requireUser();
  const problem = input.problem.trim();
  const answer = input.answer.trim();
  if (!problem) return { ok: false, error: "Descreva o problema relatado pela curadoria (ele vira o motivo da nova versão)." };
  if (!answer) return { ok: false, error: "Cole a resposta do Claude." };
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
  const current = prompt ? await getCurrentVersion(promptId) : null;
  if (!prompt || !current) return { ok: false, error: "Prompt sem versão." };

  const read = parseClaudeAnswer(answer);
  if (!read.blocks.length) {
    return {
      ok: false,
      error:
        "Não encontrei na resposta nenhum bloco TROCAR, INSERIR DEPOIS DE ou REMOVER. Peça ao Claude: “escreva as mudanças no formato de blocos pedido” e cole a resposta de novo.",
    };
  }
  const resolved = resolveBlocks(current.content, read.blocks);
  const parsed = parsePrompt(current.content);
  const affectedSections = Array.from(new Set(resolved.operations.map((o) => o.section)));
  const { preservedRules, preservedSections } = preserved(parsed, affectedSections, resolved);
  const { impact, impactReason } = computeImpact({ operations: resolved.operations, affectedRules: resolved.affectedRules }, affectedSections);

  const kb = await loadKnowledgeForPrompt(promptId);
  const index = new KnowledgeIndex(kb.sources);
  const conflicts: ChangeAnalysis["conflicts"] = index.isEmpty
    ? []
    : findUnsourcedNames(resolved.operations.map((o) => o.newText), current.content, index).map((name) => ({
        description: `“${name}” não aparece no prompt atual nem na base de conhecimento. Confirme que esse produto/termo existe antes de aplicar.`,
      }));

  const analysis: ChangeAnalysis = {
    engine: CLAUDE_ENGINE,
    request: problem,
    answers: [],
    intent: "alterar",
    understanding: read.cause || "O Claude não explicou a causa; confira as mudanças propostas abaixo.",
    affectedSections,
    affectedRules: resolved.affectedRules,
    preservedRules,
    preservedSections,
    relatedRules: [],
    conflicts,
    suggestion: "",
    suggestionBullets: [],
    impact,
    impactReason,
    operations: resolved.operations,
    notes: [...read.problems, ...resolved.notes],
    knowledgeRefs: [],
    knowledgeDocuments: kb.sources.length,
    conversationInput: input.expected.trim() ? { hadImage: false, expectedBehavior: input.expected.trim() } : undefined,
    pastedAnswer: answer,
  };

  const change = await prisma.changeRequest.create({
    data: {
      promptId,
      kind: "CLAUDE",
      request: problem,
      status: resolved.operations.length ? "AGUARDANDO_APROVACAO" : "SEM_ALTERACAO",
      analysis: JSON.stringify(analysis),
      affectedSections: JSON.stringify(affectedSections),
      conflicts: JSON.stringify(conflicts.map((c) => c.description)),
      impactLevel: impact,
      fromVersionId: current.id,
      createdBy: me.name,
    },
  });
  revalidatePath(`/p/${prompt.slug}`, "layout");
  return { ok: true, data: { changeId: change.id, slug: prompt.slug } };
}
