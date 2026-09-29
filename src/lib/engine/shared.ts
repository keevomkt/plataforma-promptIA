/**
 * Lógica compartilhada entre o motor local (analyze.ts) e a camada opcional
 * de diagnóstico por IA (src/lib/ai/diagnose.ts) — para que as duas fontes
 * de análise produzam "regras preservadas" e "impacto" com o mesmo critério,
 * e para que a inserção de uma nova regra siga sempre o mesmo formato.
 */
import { isRuleLine, sectionLabel, visibleSections, type ParsedPrompt, type PromptLine, type PromptSection } from "./parse";
import { normalize, truncate } from "./text";
import type { ImpactLevel, Operation, RuleRef } from "./types";

const SENSITIVE = /(segur|restri|proib|preco|valor|comercia|produt|nunca|jamais|qualific|confidencial|dados)/;

export function preserved(
  parsed: ParsedPrompt,
  affectedSections: string[],
  input: { operations: Operation[]; affectedRules: RuleRef[] }
): { preservedRules: RuleRef[]; preservedSections: string[] } {
  const touched = new Set(input.operations.filter((o) => o.enabled).map((o) => o.line));
  const affectedLines = new Set(input.affectedRules.map((r) => r.line));
  const preservedRules: RuleRef[] = [];
  for (const line of parsed.lines) {
    if (!isRuleLine(line) || touched.has(line.index) || affectedLines.has(line.index)) continue;
    const label = sectionLabel(parsed.sections[line.sectionId]);
    if (affectedSections.includes(label)) preservedRules.push({ line: line.index, section: label, text: truncate(line.text, 200) });
  }
  const preservedSections = visibleSections(parsed)
    .map(sectionLabel)
    .filter((s) => !affectedSections.includes(s));
  return { preservedRules: preservedRules.slice(0, 8), preservedSections };
}

export function computeImpact(
  input: { operations: Operation[]; affectedRules: RuleRef[]; minImpact?: ImpactLevel },
  _allSections: string[]
): { impact: ImpactLevel; impactReason: string } {
  const active = input.operations.filter((o) => o.enabled && o.role !== "revisao");
  const sections = unique([...active.map((o) => o.section), ...input.affectedRules.map((r) => r.section)]);
  const sensitiveHits = unique(
    [
      ...sections,
      ...active.filter((o) => o.type !== "inserir_apos").map((o) => o.oldText),
      ...active.map((o) => o.newText),
    ]
      .map((t) => normalize(t).match(SENSITIVE)?.[1])
      .filter((x): x is string => !!x)
  );
  const rank: Record<ImpactLevel, number> = { BAIXO: 0, MEDIO: 1, ALTO: 2 };
  let impact: ImpactLevel = "BAIXO";
  const reasons: string[] = [];

  if (sections.length >= 2 || active.length >= 3) {
    impact = "MEDIO";
    reasons.push(`afeta ${sections.length} seções`);
  }
  if (sensitiveHits.length) {
    impact = sections.length >= 3 || active.length >= 4 ? "ALTO" : "MEDIO";
    reasons.push("toca regras sensíveis (comercial, produtos, qualificação ou segurança)");
  }
  if (active.some((o) => o.type === "remover_linha" && /(segur|restri|proib|nunca|jamais)/.test(normalize(o.oldText)))) {
    impact = "ALTO";
    reasons.push("remove uma restrição");
  }
  if (input.minImpact && rank[input.minImpact] > rank[impact]) {
    impact = input.minImpact;
    reasons.push("mudança de comportamento geral do agente");
  }
  if (!reasons.length) reasons.push(active.length ? "alteração isolada, em uma única seção" : "nenhuma alteração aplicada ainda");
  return { impact, impactReason: reasons.join("; ") };
}

/** Fim do conteúdo próprio da seção (antes da primeira subseção). */
export function ownContentEnd(parsed: ParsedPrompt, section: PromptSection): number {
  const child = parsed.sections.find((s) => s.parentId === section.id && s.headingLine > section.headingLine);
  return child ? child.headingLine : section.endLine;
}

/**
 * Calcula onde e como inserir uma nova regra no fim do conteúdo próprio da
 * seção, copiando o formato da última regra (item de lista com o mesmo
 * marcador, item numerado com o próximo número, ou parágrafo). Retorna os
 * campos brutos da operação — quem chama decide o `role` e o `reason`.
 *
 * Em listas cujo último passo fecha o fluxo ("Encaminhe...", "Resuma e
 * confirme..."), a nova regra entra antes desse passo, a menos que ela
 * mesma seja um passo de fechamento.
 */
export function computeInsertion(
  parsed: ParsedPrompt,
  section: PromptSection,
  text: string
): { line: number; newText: string; note?: string } {
  const ownEnd = ownContentEnd(parsed, section);
  let last: PromptLine | undefined;
  let prevItem: PromptLine | undefined;
  for (let i = section.startLine; i < ownEnd; i++) {
    const l = parsed.lines[i];
    if (isRuleLine(l)) {
      if (last && last.kind === l.kind && last.indent === l.indent) prevItem = last;
      else prevItem = undefined;
      last = l;
    }
  }

  const CLOSING = /(encaminh|finaliz|encerr|resum|confirm|transfer)/;
  if (
    last &&
    prevItem &&
    (last.kind === "numbered" || last.kind === "bullet") &&
    CLOSING.test(normalize(last.text)) &&
    !CLOSING.test(normalize(text))
  ) {
    const closing = last;
    const indent = prevItem.raw.slice(0, prevItem.indent);
    let itemText: string;
    if (closing.kind === "numbered" && closing.number !== undefined) {
      const sep = /\)/.test(closing.marker ?? "") ? ")" : ".";
      itemText = `${indent}${closing.number}${sep} ${text}`;
    } else itemText = `${indent}${prevItem.marker ?? ""}${text}`;
    return { line: prevItem.index, newText: itemText, note: `Inserida antes do passo final da lista (“${truncate(closing.text, 60)}”).` };
  }

  let newText: string;
  let anchor: number;
  if (!last) {
    anchor = section.headingLine >= 0 ? section.headingLine : -1;
    const blankAfterHeadings = parsed.lines.some((l, i) => l.kind === "heading" && parsed.lines[i + 1]?.kind === "blank");
    newText = blankAfterHeadings && anchor >= 0 ? `\n${text}` : text;
  } else {
    anchor = last.index;
    const indent = last.raw.slice(0, last.indent);
    if (last.kind === "bullet") newText = `${indent}${last.marker}${text}`;
    else if (last.kind === "numbered" && last.number !== undefined) {
      const sep = /\)/.test(last.marker ?? "") ? ")" : ".";
      newText = `${indent}${last.number + 1}${sep} ${text}`;
    } else if (last.kind === "numbered") newText = `${indent}${text}`;
    else {
      const prev = parsed.lines[last.index - 1];
      const paragraphs = prev && prev.kind === "blank" && prev.index >= section.startLine;
      const blocks = parsed.lines.slice(section.startLine, ownEnd).filter((l) => l.kind === "text").length;
      newText = paragraphs || blocks === 1 ? `\n${text}` : text;
    }
  }
  return { line: anchor, newText };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
