/**
 * Validação automática do novo prompt (seção 9 da especificação).
 * Compara a versão anterior com a nova e verifica integridade: estrutura,
 * regras não relacionadas, produtos, restrições, duplicidade, contradições,
 * dependências de informação removida, referências e seções vazias.
 */
import { diffArrays } from "diff";
import { isRuleLine, parsePrompt, sectionLabel, splitLines, type ParsedPrompt } from "./parse";
import { PromptIndex } from "./match";
import { normalize, polarity, sameStem, splitSentences, stems, truncate } from "./text";
import type { ValidationCheck, ValidationResult } from "./types";
import { KnowledgeIndex, properNames, type KnowledgeSource } from "./knowledge";

type Line = { index: number; section: string; text: string };

export function validateChange(
  previous: string,
  next: string,
  expectedSections?: string[],
  knowledge: KnowledgeSource[] = []
): ValidationResult {
  const before = parsePrompt(previous);
  const after = parsePrompt(next);
  const { removed, added } = changedLines(before, after, previous, next);
  const checks: ValidationCheck[] = [
    checkStructure(before, after),
    checkUnrelated(removed, added, expectedSections),
    checkProducts(previous, next, before, after),
    checkRestrictions(before, after),
    checkUrls(previous, next),
    checkDuplicates(before, after, added),
    checkContradictions(after, added),
    checkRemovedDependencies(before, after, removed, added),
    checkReferences(before, after, next),
    checkEmptySections(before, after),
    checkKnowledge(previous, added, knowledge),
  ];
  const summary = checks.some((c) => c.status === "erro") ? "erro" : checks.some((c) => c.status === "aviso") ? "aviso" : "ok";
  return { checks, summary };
}

function changedLines(before: ParsedPrompt, after: ParsedPrompt, previous: string, next: string) {
  const a = splitLines(previous).lines;
  const b = splitLines(next).lines;
  const parts = diffArrays(a, b);
  const removed: Line[] = [];
  const added: Line[] = [];
  let i = 0;
  let j = 0;
  for (const p of parts) {
    const n = p.count ?? p.value.length;
    if (p.removed) {
      for (let k = 0; k < n; k++, i++) {
        if (a[i].trim()) removed.push({ index: i, section: sectionLabel(before.sections[before.lines[i].sectionId]), text: a[i].trim() });
      }
    } else if (p.added) {
      for (let k = 0; k < n; k++, j++) {
        if (b[j].trim()) added.push({ index: j, section: sectionLabel(after.sections[after.lines[j].sectionId]), text: b[j].trim() });
      }
    } else {
      i += n;
      j += n;
    }
  }
  return { removed, added };
}

function check(label: string, problems: string[], level: "aviso" | "erro" = "aviso", okDetail?: string): ValidationCheck {
  return { label, status: problems.length ? level : "ok", details: problems.length ? problems : okDetail ? [okDetail] : [] };
}

function checkStructure(before: ParsedPrompt, after: ParsedPrompt): ValidationCheck {
  const t1 = before.sections.filter((s) => s.id !== 0).map((s) => s.title);
  const t2 = after.sections.filter((s) => s.id !== 0).map((s) => s.title);
  const problems: string[] = [];
  const missing = t1.filter((t) => !t2.includes(t));
  const extra = t2.filter((t) => !t1.includes(t));
  if (missing.length) problems.push(`Títulos removidos: ${missing.join(", ")}`);
  if (extra.length) problems.push(`Títulos novos: ${extra.join(", ")}`);
  const common1 = t1.filter((t) => t2.includes(t));
  const common2 = t2.filter((t) => t1.includes(t));
  if (common1.join("\u0000") !== common2.join("\u0000")) problems.push("A ordem das seções mudou.");
  return check("Estrutura preservada", problems, missing.length ? "erro" : "aviso", `${t2.length} títulos, na mesma ordem.`);
}

function checkUnrelated(removed: Line[], added: Line[], expected?: string[]): ValidationCheck {
  const changed = [...removed, ...added];
  if (!expected) {
    const sections = Array.from(new Set(changed.map((c) => c.section)));
    return {
      label: "Regras não relacionadas preservadas",
      status: "ok",
      details: sections.length ? [`Linhas alteradas nas seções: ${sections.join(", ")}.`] : ["Nenhuma linha alterada."],
    };
  }
  const outside = changed.filter((c) => !expected.includes(c.section));
  const problems = Array.from(new Set(outside.map((c) => c.section))).map(
    (s) => `Houve alteração fora das seções previstas: ${s}`
  );
  return check(
    "Regras não relacionadas preservadas",
    problems,
    "aviso",
    `${removed.length} linha(s) removida(s) e ${added.length} adicionada(s), todas nas seções previstas.`
  );
}

/** Nomes próprios de produtos: títulos das seções de produtos + termos como "eKeep" e "NG Folha". */
function productTerms(content: string, parsed: ParsedPrompt): string[] {
  const terms = new Set<string>();
  for (const s of parsed.sections) {
    if (s.path.length > 1 && /produt|modul|soluc|plano/i.test(normalize(s.path.slice(0, -1).join(" ")))) terms.add(s.title);
  }
  const mixed = content.match(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g) ?? []; // eKeep, iPhone
  mixed.forEach((m) => terms.add(m));
  const acronymName = content.match(/\b[A-Z]{2,5}\s[A-Z][a-zà-ÿ]+\b/g) ?? []; // NG Folha
  acronymName.forEach((m) => terms.add(m));
  return Array.from(terms);
}

function countOccurrences(hay: string, needle: string) {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (hay.match(re) ?? []).length;
}

function checkProducts(previous: string, next: string, before: ParsedPrompt, after: ParsedPrompt): ValidationCheck {
  const terms = Array.from(new Set([...productTerms(previous, before), ...productTerms(next, after)]));
  const problems: string[] = [];
  for (const t of terms) {
    const c1 = countOccurrences(previous, t);
    const c2 = countOccurrences(next, t);
    if (c1 > 0 && c2 === 0) problems.push(`“${t}” não aparece mais no prompt.`);
    else if (c2 < c1) problems.push(`“${t}” aparecia ${c1}× e agora aparece ${c2}×.`);
  }
  const hardLoss = problems.some((p) => p.includes("não aparece mais"));
  return check("Produtos preservados", problems, hardLoss ? "erro" : "aviso", terms.length ? `${terms.length} nomes de produtos/termos próprios preservados.` : undefined);
}

const RESTRICTION = /\b(nunca|jamais|proibid\w*|nao (deve|pode|informe|compartilhe|prometa|use|invente|execute|mencione|forneca|envie|busque|tente))\b/;

function restrictionSentences(parsed: ParsedPrompt) {
  const out: { sentence: string; section: string }[] = [];
  for (const l of parsed.lines) {
    if (!isRuleLine(l)) continue;
    for (const s of splitSentences(l.text)) {
      if (RESTRICTION.test(normalize(s))) out.push({ sentence: s.trim(), section: sectionLabel(parsed.sections[l.sectionId]) });
    }
  }
  return out;
}

function checkRestrictions(before: ParsedPrompt, after: ParsedPrompt): ValidationCheck {
  const r1 = restrictionSentences(before);
  const afterSet = new Set(restrictionSentences(after).map((r) => normalize(r.sentence)));
  const lost = r1.filter((r) => !afterSet.has(normalize(r.sentence)));
  return check(
    "Restrições preservadas",
    lost.map((r) => `Restrição removida ou alterada em ${r.section}: “${truncate(r.sentence, 120)}”`),
    "erro",
    `${r1.length} restrições preservadas.`
  );
}

function checkUrls(previous: string, next: string): ValidationCheck {
  const urls = (s: string) => new Set(s.match(/https?:\/\/[^\s)>"”]+/g) ?? []);
  const u1 = urls(previous);
  const u2 = urls(next);
  const lost = Array.from(u1).filter((u) => !u2.has(u));
  return check("URLs preservadas", lost.map((u) => `URL removida: ${u}`), "erro", u1.size ? `${u1.size} URL(s) preservada(s).` : undefined);
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter || 1);
}

function checkDuplicates(before: ParsedPrompt, after: ParsedPrompt, added: Line[]): ValidationCheck {
  const idx = new PromptIndex(after);
  const addedLines = new Set(added.map((a) => a.index));
  const problems: string[] = [];
  const newUnits = idx.units.filter((u) => addedLines.has(u.line) && u.stems.length >= 3);
  for (const u of newUnits) {
    for (const other of idx.units) {
      if (other.line === u.line || other.stems.length < 3) continue;
      const sim = normalize(other.sentence) === normalize(u.sentence) ? 1 : jaccard(u.stems, other.stems);
      if (sim >= 0.75) {
        problems.push(
          `“${truncate(u.sentence, 90)}” (linha ${u.line + 1}) é muito parecida com “${truncate(other.sentence, 90)}” (linha ${other.line + 1}, ${sectionLabel(after.sections[other.sectionId])}).`
        );
      }
    }
  }
  return check("Sem regras duplicadas", Array.from(new Set(problems)).slice(0, 6));
}

function checkContradictions(after: ParsedPrompt, added: Line[]): ValidationCheck {
  const idx = new PromptIndex(after);
  const addedLines = new Set(added.map((a) => a.index));
  const problems: string[] = [];
  for (const u of idx.units.filter((x) => addedLines.has(x.line))) {
    const pu = polarity(normalize(u.sentence));
    if (pu === "neutra") continue;
    for (const other of idx.units) {
      if (other.line === u.line) continue;
      const shared = u.stems.filter((s) => other.stems.some((o) => sameStem(o, s)));
      if (shared.length < 3 || jaccard(u.stems, other.stems) < 0.3) continue;
      const po = polarity(normalize(other.sentence));
      if (po !== "neutra" && po !== pu) {
        problems.push(
          `Possível contradição: “${truncate(u.sentence, 90)}” (linha ${u.line + 1}) × “${truncate(other.sentence, 90)}” (linha ${other.line + 1}).`
        );
      }
    }
  }
  return check("Sem regras contraditórias", Array.from(new Set(problems)).slice(0, 6));
}

/**
 * Para cada frase que deixou de existir, procura no prompt novo regras que
 * ainda citam o termo distintivo dela (ex: removeu "Pergunte a quantidade de
 * CNPJs" mas o resumo de encaminhamento ainda lista "quantidade de CNPJs").
 */
function checkRemovedDependencies(before: ParsedPrompt, after: ParsedPrompt, removed: Line[], added: Line[]): ValidationCheck {
  const oldIdx = new PromptIndex(before);
  const newIdx = new PromptIndex(after);
  const addedSentences = new Set(added.flatMap((a) => splitSentences(a.text)).map(normalize));
  const lostSentences = removed
    .flatMap((r) => splitSentences(r.text).map((s) => ({ s, section: r.section })))
    .filter(({ s }) => !addedSentences.has(normalize(s)));
  const addedStems = added.flatMap((a) => stems(a.text));
  const problems: string[] = [];
  for (const { s, section } of lostSentences) {
    const removedStems = Array.from(new Set(stems(s)));
    // Termos distintivos que sumiram de fato (não foram reescritos na linha nova)
    const anchors = oldIdx.anchors(removedStems).filter((t) => t.length >= 3 && !addedStems.some((a) => sameStem(a, t)));
    if (!anchors.length) continue;
    const still = newIdx.units.filter((u) => anchors.some((a) => u.stems.some((x) => sameStem(x, a))));
    for (const u of still.slice(0, 3)) {
      problems.push(
        `Removido de ${section}: “${truncate(s, 70)}”. Ainda é citado em ${sectionLabel(after.sections[u.sectionId])} (linha ${u.line + 1}): “${truncate(u.sentence, 100)}”`
      );
    }
  }
  return check("Nenhuma regra depende de informação removida", problems.slice(0, 6));
}

function checkReferences(before: ParsedPrompt, after: ParsedPrompt, next: string): ValidationCheck {
  const oldTitles = new Set(before.sections.map((s) => normalize(s.title)));
  const newTitles = new Set(after.sections.map((s) => normalize(s.title)));
  const problems: string[] = [];
  const re = /["“]([^"”\n]{3,80})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(next))) {
    const ref = normalize(m[1]);
    if (oldTitles.has(ref) && !newTitles.has(ref)) problems.push(`A referência “${m[1]}” aponta para uma seção que não existe mais.`);
  }
  return check("Referências válidas", Array.from(new Set(problems)), "erro");
}

/** Nomes próprios que entraram no prompt precisam existir na base de conhecimento. */
function checkKnowledge(previous: string, added: Line[], knowledge: KnowledgeSource[]): ValidationCheck {
  const label = "Produtos e termos novos têm fonte na base de conhecimento";
  if (!knowledge.length) {
    return { label, status: "ok", details: ["Nenhum documento na base de conhecimento; verificação não realizada."] };
  }
  const kb = new KnowledgeIndex(knowledge);
  const prevNorm = normalize(previous);
  const names = Array.from(new Set(added.flatMap((a) => properNames(a.text)))).filter((n) => !prevNorm.includes(normalize(n)));
  const missing = names.filter((n) => !kb.mentions(n));
  return check(
    label,
    missing.map((n) => `“${n}” entrou no prompt, mas não aparece em nenhum documento da base de conhecimento.`),
    "aviso",
    names.length ? `${names.length} nome(s) novo(s) confirmado(s) na base.` : `Nenhum nome novo; ${knowledge.length} documento(s) consultado(s).`
  );
}

function checkEmptySections(before: ParsedPrompt, after: ParsedPrompt): ValidationCheck {
  const hasContent = (p: ParsedPrompt, id: number) => p.lines.some((l) => l.sectionId === id && isRuleLine(l));
  const hasChildren = (p: ParsedPrompt, id: number) => p.sections.some((s) => s.parentId === id);
  const oldWithContent = new Set(
    before.sections.filter((s) => s.id !== 0 && (hasContent(before, s.id) || hasChildren(before, s.id))).map((s) => s.title)
  );
  const problems = after.sections
    .filter((s) => s.id !== 0 && oldWithContent.has(s.title) && !hasContent(after, s.id) && !hasChildren(after, s.id))
    .map((s) => `A seção “${s.title}” ficou sem nenhuma regra.`);
  return check("Nenhuma seção ficou vazia ou inconsistente", problems);
}
