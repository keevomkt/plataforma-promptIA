"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentVersion } from "@/lib/data";
import { getCurrentUser, USER_COOKIE } from "@/lib/user";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";
import { validateChange } from "@/lib/engine/validate";
import { parsePrompt, sectionLabel, splitLines } from "@/lib/engine/parse";
import { diffArrays } from "diff";
import { resolveUnit } from "@/lib/brand";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "prompt"
  );
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await prisma.prompt.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

function checkParams(temperature: number, topP: number): string | null {
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return "Temperatura deve estar entre 0 e 2.";
  if (!Number.isFinite(topP) || topP < 0 || topP > 1) return "Top P deve estar entre 0 e 1.";
  return null;
}

/**
 * Cadastra um prompt a partir do texto original (arquivo .txt/.md ou
 * colado). O texto é salvo exatamente como veio — v1 é o prompt original.
 */
export async function createPrompt(input: {
  name: string;
  description?: string;
  businessUnit?: string | null;
  content: string;
  temperature: number;
  topP: number;
  sourceLabel?: string;
}): Promise<ActionResult<{ slug: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Dê um nome ao prompt (ex: Agente Comercial)." };
  if (!input.content.trim()) return { ok: false, error: "Cole o texto do prompt ou importe um arquivo .txt/.md." };
  const paramError = checkParams(input.temperature, input.topP);
  if (paramError) return { ok: false, error: paramError };

  const user = getCurrentUser();
  const slug = await uniqueSlug(name);
  await prisma.$transaction(async (tx) => {
    const prompt = await tx.prompt.create({
      data: { name, slug, description: input.description?.trim() || null, businessUnit: resolveUnit(input.businessUnit)?.id ?? null },
    });
    const version = await tx.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: 1,
        content: input.content,
        temperature: input.temperature,
        topP: input.topP,
        changeDescription: input.sourceLabel ? `Prompt original (${input.sourceLabel})` : "Prompt original",
        createdBy: user,
      },
    });
    await tx.prompt.update({ where: { id: prompt.id }, data: { currentVersionId: version.id } });
    await tx.changeRequest.create({
      data: {
        promptId: prompt.id,
        kind: "IMPORTACAO",
        request: input.sourceLabel ? `Importação do prompt original (${input.sourceLabel})` : "Importação do prompt original",
        status: "VERSIONADA",
        analysis: "{}",
        toVersionId: version.id,
        createdBy: user,
        decidedAt: new Date(),
      },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { slug } };
}

/**
 * Edição direta no editor. Também passa pela governança: vira uma
 * alteração "aplicada" com diff e validação, e só vira versão depois que o
 * usuário revisa e salva.
 */
export async function submitManualEdit(input: {
  promptId: string;
  baseVersionId: string;
  content: string;
}): Promise<ActionResult<{ changeId: string }>> {
  const current = await getCurrentVersion(input.promptId);
  if (!current) return { ok: false, error: "Prompt sem versão." };
  if (current.id !== input.baseVersionId) {
    return { ok: false, error: `Outra pessoa salvou a v${current.version} enquanto você editava. Recarregue a página para editar a versão atual.` };
  }
  if (!input.content.trim()) return { ok: false, error: "O prompt não pode ficar vazio." };
  if (input.content === current.content) return { ok: false, error: "Nenhuma alteração no texto." };

  const sections = changedSections(current.content, input.content);
  const validation = validateChange(current.content, input.content, undefined, (await loadKnowledgeForPrompt(input.promptId)).sources);
  const change = await prisma.changeRequest.create({
    data: {
      promptId: input.promptId,
      kind: "MANUAL",
      request: "Edição manual no editor",
      status: "APLICADA",
      analysis: "{}",
      affectedSections: JSON.stringify(sections),
      proposedContent: input.content,
      validation: JSON.stringify(validation),
      fromVersionId: current.id,
      createdBy: getCurrentUser(),
    },
  });
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id: input.promptId } });
  revalidatePath(`/p/${prompt.slug}`, "layout");
  return { ok: true, data: { changeId: change.id } };
}

function changedSections(previous: string, next: string): string[] {
  const before = parsePrompt(previous);
  const after = parsePrompt(next);
  const a = splitLines(previous).lines;
  const b = splitLines(next).lines;
  const out = new Set<string>();
  let i = 0;
  let j = 0;
  for (const part of diffArrays(a, b)) {
    const n = part.count ?? part.value.length;
    if (part.removed) {
      for (let k = 0; k < n; k++) out.add(sectionLabel(before.sections[before.lines[i + k].sectionId]));
      i += n;
    } else if (part.added) {
      for (let k = 0; k < n; k++) out.add(sectionLabel(after.sections[after.lines[j + k].sectionId]));
      j += n;
    } else {
      i += n;
      j += n;
    }
  }
  return Array.from(out);
}

/**
 * Temperatura e Top P são metadados do agente de produção (a plataforma não
 * executa modelo nenhum). Mudá-los gera uma nova versão, para manter a
 * rastreabilidade de qual configuração acompanhava cada prompt.
 */
export async function updateParams(input: {
  promptId: string;
  baseVersionId: string;
  temperature: number;
  topP: number;
}): Promise<ActionResult<{ version: number }>> {
  const paramError = checkParams(input.temperature, input.topP);
  if (paramError) return { ok: false, error: paramError };
  const current = await getCurrentVersion(input.promptId);
  if (!current) return { ok: false, error: "Prompt sem versão." };
  if (current.id !== input.baseVersionId) return { ok: false, error: "A versão atual mudou. Recarregue a página." };
  if (current.temperature === input.temperature && current.topP === input.topP) {
    return { ok: false, error: "Os valores são iguais aos da versão atual." };
  }

  const parts: string[] = [];
  if (current.temperature !== input.temperature) parts.push(`Temperatura ${current.temperature} → ${input.temperature}`);
  if (current.topP !== input.topP) parts.push(`Top P ${current.topP} → ${input.topP}`);
  const description = `Ajuste de parâmetros: ${parts.join(", ")}`;
  const user = getCurrentUser();

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.promptVersion.findFirst({ where: { promptId: input.promptId }, orderBy: { version: "desc" } });
    const version = await tx.promptVersion.create({
      data: {
        promptId: input.promptId,
        version: (latest?.version ?? 0) + 1,
        content: current.content,
        temperature: input.temperature,
        topP: input.topP,
        changeDescription: description,
        createdBy: user,
        parentVersionId: current.id,
      },
    });
    await tx.prompt.update({ where: { id: input.promptId }, data: { currentVersionId: version.id } });
    await tx.changeRequest.create({
      data: {
        promptId: input.promptId,
        kind: "PARAMETROS",
        request: description,
        status: "VERSIONADA",
        analysis: "{}",
        proposedTemperature: input.temperature,
        proposedTopP: input.topP,
        fromVersionId: current.id,
        toVersionId: version.id,
        createdBy: user,
        decidedAt: new Date(),
      },
    });
    return version;
  });

  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id: input.promptId } });
  revalidatePath(`/p/${prompt.slug}`, "layout");
  return { ok: true, data: { version: created.version } };
}

export async function setResponsible(name: string): Promise<void> {
  const value = name.trim().slice(0, 60);
  if (value) {
    cookies().set(USER_COOKIE, encodeURIComponent(value), { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax" });
  } else {
    cookies().delete(USER_COOKIE);
  }
  revalidatePath("/", "layout");
}

/** Define a unidade de negócio do prompt (HCM, ERP, EC), usada para exibir a logo correspondente. */
export async function setPromptUnit(promptId: string, unit: string | null): Promise<ActionResult<null>> {
  const resolved = unit ? resolveUnit(unit) : undefined;
  if (unit && !resolved) return { ok: false, error: "Unidade de negócio inválida." };
  await prisma.prompt.update({ where: { id: promptId }, data: { businessUnit: resolved?.id ?? null } });
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}
