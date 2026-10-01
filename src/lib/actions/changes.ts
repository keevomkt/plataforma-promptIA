"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentVersion, readAnalysis } from "@/lib/data";
import { requireUser } from "@/lib/auth/session";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";
import { getAnalyzer } from "@/lib/engine";
import { applyOperations } from "@/lib/engine/apply";
import { validateChange } from "@/lib/engine/validate";
import type { ChangeAnalysis } from "@/lib/engine/types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function statusFor(analysis: ChangeAnalysis) {
  if (analysis.audit) return "REVISAO_CONCLUIDA";
  if (analysis.answer) return "RESPONDIDA";
  if (analysis.clarification) return "AGUARDANDO_ESCLARECIMENTO";
  return analysis.operations.length ? "AGUARDANDO_APROVACAO" : "SEM_ALTERACAO";
}

function analysisColumns(analysis: ChangeAnalysis) {
  return {
    analysis: JSON.stringify(analysis),
    affectedSections: JSON.stringify(analysis.affectedSections),
    conflicts: JSON.stringify(analysis.conflicts.map((c) => c.description)),
    suggestion: analysis.suggestedRule ?? analysis.suggestion,
    impactLevel: analysis.audit || analysis.answer ? null : analysis.impact,
    status: statusFor(analysis),
  };
}

async function slugOf(promptId: string) {
  const p = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
  return p.slug;
}

function refresh(slug: string) {
  revalidatePath(`/p/${slug}`, "layout");
}

/** PASSO 2–4: registra o pedido e roda a análise. Nada é alterado no prompt. */
export async function requestChange(promptId: string, request: string): Promise<ActionResult<{ changeId: string }>> {
  const me = await requireUser();
  const text = request.trim();
  if (!text) return { ok: false, error: "Descreva o que você deseja alterar." };
  const current = await getCurrentVersion(promptId);
  if (!current) return { ok: false, error: "Este prompt ainda não tem nenhuma versão." };

  const kb = await loadKnowledgeForPrompt(promptId);
  const analysis = await getAnalyzer().analyze(current.content, text, [], kb.sources, kb.scope);
  const change = await prisma.changeRequest.create({
    data: {
      promptId,
      kind: "PEDIDO",
      request: text,
      fromVersionId: current.id,
      createdBy: me.name,
      ...analysisColumns(analysis),
    },
  });
  refresh(await slugOf(promptId));
  return { ok: true, data: { changeId: change.id } };
}

/** Resposta a uma pergunta de esclarecimento (escopo, detalhe) → refaz a análise. */
export async function answerClarification(changeId: string, answer: string): Promise<ActionResult<null>> {
  await requireUser();
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId }, include: { fromVersion: true } });
  if (!change?.fromVersion) return { ok: false, error: "Alteração não encontrada." };
  if (!["AGUARDANDO_ESCLARECIMENTO", "SEM_ALTERACAO"].includes(change.status)) {
    return { ok: false, error: "Esta alteração não está aguardando esclarecimento." };
  }
  const value = answer.trim();
  if (!value) return { ok: false, error: "Escolha uma opção ou escreva a resposta." };
  const normalized = /^(escopo|detalhe):/.test(value) ? value : `detalhe:${value}`;

  const previous = readAnalysis(change.analysis);
  const answers = [...(previous?.answers ?? []), normalized];
  const kb = await loadKnowledgeForPrompt(change.promptId);
  const analysis = await getAnalyzer().analyze(change.fromVersion.content, change.request, answers, kb.sources, kb.scope);
  await prisma.changeRequest.update({ where: { id: changeId }, data: analysisColumns(analysis) });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: null };
}

const EditSchema = z.array(z.object({ id: z.string(), enabled: z.boolean(), newText: z.string() }));

/**
 * PASSO 5–8: aplica as operações aprovadas (com as edições do usuário),
 * gera o prompt completo atualizado e roda a validação. Ainda não cria a
 * versão — o usuário revisa o diff e a validação antes de salvar.
 */
export async function applyChange(
  changeId: string,
  edits: { id: string; enabled: boolean; newText: string }[]
): Promise<ActionResult<null>> {
  await requireUser();
  const parsedEdits = EditSchema.safeParse(edits);
  if (!parsedEdits.success) return { ok: false, error: "Operações inválidas." };

  const change = await prisma.changeRequest.findUnique({ where: { id: changeId }, include: { fromVersion: true } });
  if (!change?.fromVersion) return { ok: false, error: "Alteração não encontrada." };
  if (change.status !== "AGUARDANDO_APROVACAO") return { ok: false, error: "Esta alteração não está aguardando aprovação." };

  const current = await getCurrentVersion(change.promptId);
  if (current?.id !== change.fromVersionId) {
    return {
      ok: false,
      error: `O prompt mudou desde a análise (análise feita sobre a v${change.fromVersion.version}, versão atual v${current?.version}). Refaça a análise.`,
    };
  }

  const analysis = readAnalysis(change.analysis);
  if (!analysis) return { ok: false, error: "Análise não encontrada." };

  // Só aceitamos do navegador: ligar/desligar e o texto novo. Linha, tipo e texto antigo vêm da análise.
  const byId = new Map(parsedEdits.data.map((e) => [e.id, e]));
  const operations = analysis.operations.map((op) => {
    const e = byId.get(op.id);
    return e ? { ...op, enabled: e.enabled, newText: op.type === "remover_linha" ? "" : e.newText } : op;
  });

  const result = applyOperations(change.fromVersion.content, operations);
  if (result.skipped.length) {
    return { ok: false, error: result.skipped.map((s) => s.reason).join(" ") };
  }
  if (!result.applied.length || result.content === change.fromVersion.content) {
    return { ok: false, error: "Nenhuma alteração selecionada: marque ao menos uma operação ou edite o texto de uma revisão." };
  }

  const expectedSections = Array.from(new Set(result.applied.map((o) => o.section)));
  const validation = validateChange(change.fromVersion.content, result.content, expectedSections, (await loadKnowledgeForPrompt(change.promptId)).sources);

  await prisma.changeRequest.update({
    where: { id: changeId },
    data: {
      status: "APLICADA",
      analysis: JSON.stringify({ ...analysis, operations }),
      proposedContent: result.content,
      validation: JSON.stringify(validation),
    },
  });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: null };
}

/** Volta uma alteração aplicada (ainda não salva) para edição das operações. */
export async function reopenChange(changeId: string): Promise<ActionResult<null>> {
  await requireUser();
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId } });
  if (!change || change.status !== "APLICADA" || !["PEDIDO", "DIAGNOSTICO"].includes(change.kind)) {
    return { ok: false, error: "Só é possível editar alterações aplicadas e ainda não salvas." };
  }
  await prisma.changeRequest.update({
    where: { id: changeId },
    data: { status: "AGUARDANDO_APROVACAO", proposedContent: null, validation: null },
  });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: null };
}

/** PASSO 9: salva o novo prompt completo como uma nova versão. */
export async function saveAsVersion(changeId: string, description: string): Promise<ActionResult<{ versionId: string }>> {
  const user = (await requireUser()).name;
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId }, include: { fromVersion: true } });
  if (!change?.fromVersion || change.proposedContent === null) return { ok: false, error: "Alteração não encontrada." };
  if (change.status !== "APLICADA") return { ok: false, error: "Esta alteração não está pronta para ser salva." };
  const desc = description.trim();
  if (!desc) return { ok: false, error: "Descreva a alteração para o histórico." };

  const current = await getCurrentVersion(change.promptId);
  if (current?.id !== change.fromVersionId) {
    return { ok: false, error: `O prompt mudou desde a análise (versão atual v${current?.version}). Refaça a alteração sobre a versão atual.` };
  }

  const version = await prisma.$transaction(async (tx) => {
    const latest = await tx.promptVersion.findFirst({ where: { promptId: change.promptId }, orderBy: { version: "desc" } });
    const created = await tx.promptVersion.create({
      data: {
        promptId: change.promptId,
        version: (latest?.version ?? 0) + 1,
        content: change.proposedContent!,
        temperature: change.proposedTemperature ?? change.fromVersion!.temperature,
        topP: change.proposedTopP ?? change.fromVersion!.topP,
        changeDescription: desc,
        createdBy: user,
        parentVersionId: change.fromVersionId,
      },
    });
    await tx.changeRequest.update({
      where: { id: changeId },
      data: { status: "VERSIONADA", toVersionId: created.id, decidedAt: new Date() },
    });
    await tx.prompt.update({ where: { id: change.promptId }, data: { currentVersionId: created.id } });
    return created;
  });

  refresh(await slugOf(change.promptId));
  return { ok: true, data: { versionId: version.id } };
}

export async function cancelChange(changeId: string): Promise<ActionResult<null>> {
  await requireUser();
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Alteração não encontrada." };
  if (change.status === "VERSIONADA") return { ok: false, error: "Alterações já versionadas não podem ser canceladas. Restaure uma versão anterior." };
  await prisma.changeRequest.update({ where: { id: changeId }, data: { status: "CANCELADA", decidedAt: new Date() } });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: null };
}

/**
 * Remove da lista um pedido que nunca virou versão (cancelado ou sem
 * alteração a propor). Pedidos versionados nunca podem ser excluídos por
 * aqui — são a explicação por trás de uma versão real do prompt; a versão
 * em si segue disponível no Histórico e nunca é apagada.
 */
const DELETABLE_STATUSES = ["CANCELADA", "SEM_ALTERACAO", "REVISAO_CONCLUIDA", "RESPONDIDA"];

export async function deleteChange(changeId: string): Promise<ActionResult<null>> {
  await requireUser();
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId } });
  if (!change) return { ok: false, error: "Alteração não encontrada." };
  if (!DELETABLE_STATUSES.includes(change.status)) {
    return { ok: false, error: "Só é possível excluir pedidos cancelados, sem alteração a propor, revisões ou perguntas já respondidas. Cancele o pedido primeiro." };
  }
  await prisma.changeRequest.delete({ where: { id: changeId } });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: null };
}

/** Limpa de uma vez todos os pedidos cancelados/sem alteração de um prompt. */
export async function clearDeadChanges(promptId: string): Promise<ActionResult<{ count: number }>> {
  await requireUser();
  const { count } = await prisma.changeRequest.deleteMany({
    where: { promptId, status: { in: DELETABLE_STATUSES } },
  });
  refresh(await slugOf(promptId));
  return { ok: true, data: { count } };
}

/** Refaz a análise do mesmo pedido sobre a versão atual (quando o prompt mudou). */
export async function reanalyzeChange(changeId: string): Promise<ActionResult<{ changeId: string }>> {
  const me = await requireUser();
  const change = await prisma.changeRequest.findUnique({ where: { id: changeId } });
  if (!change || change.kind !== "PEDIDO") return { ok: false, error: "Alteração não encontrada." };
  const current = await getCurrentVersion(change.promptId);
  if (!current) return { ok: false, error: "Prompt sem versão." };
  const previous = readAnalysis(change.analysis);
  const kb = await loadKnowledgeForPrompt(change.promptId);
  const analysis = await getAnalyzer().analyze(current.content, change.request, previous?.answers ?? [], kb.sources, kb.scope);
  if (!["VERSIONADA", "CANCELADA"].includes(change.status)) {
    await prisma.changeRequest.update({ where: { id: changeId }, data: { status: "CANCELADA", decidedAt: new Date() } });
  }
  const created = await prisma.changeRequest.create({
    data: {
      promptId: change.promptId,
      kind: "PEDIDO",
      request: change.request,
      fromVersionId: current.id,
      createdBy: me.name,
      ...analysisColumns(analysis),
    },
  });
  refresh(await slugOf(change.promptId));
  return { ok: true, data: { changeId: created.id } };
}
