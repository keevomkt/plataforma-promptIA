import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { ChangeAnalysis, ValidationResult } from "@/lib/engine/types";

export async function listPrompts() {
  return prisma.prompt.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getPromptBySlug(slug: string) {
  const prompt = await prisma.prompt.findUnique({ where: { slug } });
  if (!prompt) notFound();
  return prompt;
}

export async function getCurrentVersion(promptId: string) {
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
  if (prompt.currentVersionId) {
    const version = await prisma.promptVersion.findUnique({ where: { id: prompt.currentVersionId } });
    if (version) return version;
  }
  return prisma.promptVersion.findFirst({ where: { promptId }, orderBy: { version: "desc" } });
}

export async function listVersions(promptId: string) {
  return prisma.promptVersion.findMany({ where: { promptId }, orderBy: { version: "desc" } });
}

export async function getVersion(promptId: string, versionId: string) {
  const version = await prisma.promptVersion.findUnique({ where: { id: versionId } });
  if (!version || version.promptId !== promptId) notFound();
  return version;
}

/**
 * Lista de pedidos: só os campos que a lista mostra. Trazer as versões e a
 * análise junto custava ~160 KB por prompt (texto do prompt 2× por pedido),
 * e tudo era enviado ao navegador.
 */
export async function listChanges(promptId: string) {
  return prisma.changeRequest.findMany({
    where: { promptId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, request: true, status: true, impactLevel: true, createdAt: true, createdBy: true },
  });
}

export async function getChange(promptId: string, changeId: string) {
  const change = await prisma.changeRequest.findUnique({
    where: { id: changeId },
    include: { fromVersion: true, toVersion: true },
  });
  if (!change || change.promptId !== promptId) notFound();
  return change;
}

export function readAnalysis(raw: string): ChangeAnalysis | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && "understanding" in parsed ? (parsed as ChangeAnalysis) : null;
  } catch {
    return null;
  }
}

export function readValidation(raw: string | null): ValidationResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ValidationResult;
  } catch {
    return null;
  }
}

export function readStringList(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
