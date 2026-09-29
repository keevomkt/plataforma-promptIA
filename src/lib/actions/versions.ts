"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentVersion } from "@/lib/data";
import { getCurrentUser } from "@/lib/user";
import { createPrompt } from "@/lib/actions/prompts";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Restaurar não apaga o histórico: cria uma nova versão com o conteúdo e os
 * parâmetros da versão escolhida, e ela passa a ser a atual.
 */
export async function restoreVersion(versionId: string): Promise<ActionResult<{ version: number }>> {
  const source = await prisma.promptVersion.findUnique({ where: { id: versionId }, include: { prompt: true } });
  if (!source) return { ok: false, error: "Versão não encontrada." };
  const current = await getCurrentVersion(source.promptId);
  if (current?.id === source.id) return { ok: false, error: "Esta já é a versão atual." };

  const user = getCurrentUser();
  const description = `Restauração da v${source.version}`;
  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.promptVersion.findFirst({ where: { promptId: source.promptId }, orderBy: { version: "desc" } });
    const version = await tx.promptVersion.create({
      data: {
        promptId: source.promptId,
        version: (latest?.version ?? 0) + 1,
        content: source.content,
        temperature: source.temperature,
        topP: source.topP,
        changeDescription: description,
        createdBy: user,
        parentVersionId: current?.id ?? source.id,
      },
    });
    await tx.prompt.update({ where: { id: source.promptId }, data: { currentVersionId: version.id } });
    await tx.changeRequest.create({
      data: {
        promptId: source.promptId,
        kind: "RESTAURACAO",
        request: description,
        status: "VERSIONADA",
        analysis: "{}",
        fromVersionId: current?.id,
        toVersionId: version.id,
        createdBy: user,
        decidedAt: new Date(),
      },
    });
    return version;
  });

  revalidatePath(`/p/${source.prompt.slug}`, "layout");
  return { ok: true, data: { version: created.version } };
}

/** Duplicar cria um prompt independente a partir da versão (para outro agente ou para experimentar). */
export async function duplicateVersion(versionId: string, name: string): Promise<ActionResult<{ slug: string }>> {
  const source = await prisma.promptVersion.findUnique({ where: { id: versionId }, include: { prompt: true } });
  if (!source) return { ok: false, error: "Versão não encontrada." };
  return createPrompt({
    name: name.trim() || `${source.prompt.name} (cópia)`,
    description: source.prompt.description ?? undefined,
    businessUnit: source.prompt.businessUnit,
    content: source.content,
    temperature: source.temperature,
    topP: source.topP,
    sourceLabel: `duplicado de ${source.prompt.name} v${source.version}`,
  });
}
