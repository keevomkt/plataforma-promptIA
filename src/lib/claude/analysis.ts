/**
 * Transforma a resposta colada do Claude numa análise de alteração com o
 * mesmo tratamento de um pedido escrito: localização dos trechos, regras
 * preservadas, impacto e a mesma avaliação de conflito (engine/rulecheck.ts).
 * Sem acesso ao banco, para servir também aos testes de regressão.
 */
import { parsePrompt } from "@/lib/engine/parse";
import { computeImpact, preserved } from "@/lib/engine/shared";
import { findUnsourcedNames, KnowledgeIndex, type KnowledgeSource } from "@/lib/engine/knowledge";
import { checkRules } from "@/lib/engine/rulecheck";
import type { ChangeAnalysis } from "@/lib/engine/types";
import { parseClaudeAnswer, resolveBlocks, unreadableReason } from "./answer";

export const CLAUDE_ENGINE = "claude.ai (resposta colada)";

export type ClaudeReading =
  | { ok: true; analysis: ChangeAnalysis }
  /** Nada é criado: `notes` explica bloco a bloco o que não foi localizado. */
  | { ok: false; error: string; notes: string[]; showFormat: boolean };

export function readClaudeCorrection(
  content: string,
  input: { problem: string; expected: string; answer: string },
  knowledge: KnowledgeSource[]
): ClaudeReading {
  const answer = input.answer.trim();
  const read = parseClaudeAnswer(answer);
  if (!read.blocks.length) {
    return { ok: false, error: "Não foi possível interpretar isto como uma correção estruturada.", notes: [unreadableReason(answer)], showFormat: true };
  }

  const resolved = resolveBlocks(content, read.blocks);
  const notes = [...read.problems, ...resolved.notes];
  if (!resolved.operations.length) {
    return {
      ok: false,
      error: "Nenhum trecho da resposta foi localizado com segurança no prompt atual. Nada foi criado.",
      notes,
      showFormat: false,
    };
  }

  const parsed = parsePrompt(content);
  const affectedSections = Array.from(new Set(resolved.operations.map((o) => o.section)));
  const { preservedRules, preservedSections } = preserved(parsed, affectedSections, resolved);
  const { impact, impactReason } = computeImpact({ operations: resolved.operations, affectedRules: resolved.affectedRules }, affectedSections);

  const index = new KnowledgeIndex(knowledge);
  const conflicts: ChangeAnalysis["conflicts"] = index.isEmpty
    ? []
    : findUnsourcedNames(resolved.operations.map((o) => o.newText), content, index).map((name) => ({
        description: `“${name}” não aparece no prompt atual nem na base de conhecimento. Confirme que esse produto/termo existe antes de aplicar.`,
      }));

  return {
    ok: true,
    analysis: {
      engine: CLAUDE_ENGINE,
      request: input.problem.trim(),
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
      notes,
      knowledgeRefs: [],
      knowledgeDocuments: knowledge.length,
      conversationInput: input.expected.trim() ? { hadImage: false, expectedBehavior: input.expected.trim() } : undefined,
      pastedAnswer: answer,
      ruleChecks: checkRules(content, resolved.operations),
    },
  };
}
