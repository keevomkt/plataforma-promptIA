/**
 * Lê a resposta colada do Claude (formato pedido em package.ts) e converte
 * cada bloco em operações sobre o prompt atual, localizando os trechos pelo
 * TEXTO — nunca pelo número de linha. O que não for localizado com
 * segurança vira aviso, não operação.
 */
import { isRuleLine, parsePrompt, sectionLabel, type ParsedPrompt } from "@/lib/engine/parse";
import { lineWithText } from "@/lib/engine/apply";
import type { Operation, RuleRef } from "@/lib/engine/types";

export type ClaudeBlock = { kind: "TROCAR" | "INSERIR" | "REMOVER"; quote: string; newText: string };

const HEADER = /^[\s#*>_-]*\**\s*(TROCAR|SUBSTITUIR|INSERIR(?:\s+(?:DEPOIS|AP[OÓ]S)(?:\s+(?:DE|DO|DA))?)?|ADICIONAR\s+(?:DEPOIS|AP[OÓ]S)(?:\s+(?:DE|DO|DA))?|REMOVER|EXCLUIR)\b\s*\**\s*:?\s*\**\s*$/i;
const OPEN = /^\s*<<<\s?(.*)$/;
const ARROW = /^\s*>>>\s?(.*)$/;
const END = /^\s*\**\s*FIM\s*\**\s*$/i;

/** Separa a explicação (CAUSA) dos blocos de mudança. */
export function parseClaudeAnswer(text: string): { cause: string; blocks: ClaudeBlock[]; problems: string[] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*```/.test(l)); // cercas de código do markdown
  const blocks: ClaudeBlock[] = [];
  const problems: string[] = [];
  const cause: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const h = HEADER.exec(lines[i]);
    if (!h) {
      if (!blocks.length) cause.push(lines[i]);
      i++;
      continue;
    }
    const word = h[1].toUpperCase();
    const kind: ClaudeBlock["kind"] = /^(TROCAR|SUBSTITUIR)/.test(word) ? "TROCAR" : /^(REMOVER|EXCLUIR)/.test(word) ? "REMOVER" : "INSERIR";
    i++;
    while (i < lines.length && !lines[i].trim()) i++;
    const open = OPEN.exec(lines[i] ?? "");
    if (!open) {
      problems.push(`Um bloco ${kind} não tem a marca “<<<” com o trecho atual.`);
      continue;
    }
    const quote: string[] = open[1].trim() ? [open[1]] : [];
    i++;
    while (i < lines.length && !ARROW.test(lines[i]) && !END.test(lines[i]) && !HEADER.test(lines[i])) quote.push(lines[i++]);
    const newText: string[] = [];
    const arrow = ARROW.exec(lines[i] ?? "");
    if (arrow) {
      if (arrow[1].trim()) newText.push(arrow[1]);
      i++;
      while (i < lines.length && !END.test(lines[i]) && !HEADER.test(lines[i])) newText.push(lines[i++]);
    }
    if (END.test(lines[i] ?? "")) i++;
    blocks.push({ kind, quote: trimBlock(quote), newText: trimBlock(newText) });
  }
  return { cause: cause.join("\n").replace(/^\s*\**\s*CAUSA\s*\**\s*:?\s*/i, "").trim(), blocks, problems };
}

function trimBlock(lines: string[]): string {
  const out = lines.map((l) => l.replace(/^\s*L\d{1,4}:\s?/, "").replace(/\s+$/, ""));
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join("\n");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const LIST_MARK = /^\s*(?:[-*•+–]|\d{1,3}[.)]|[a-z]\))\s+/;
const strip = (s: string) => norm(s.replace(LIST_MARK, ""));

type Match = { start: number; end: number; partial: boolean; exact: boolean };

/** Onde o trecho citado está no prompt. Linha exata, com folga de espaços, ou sem o marcador de lista. */
function locate(parsed: ParsedPrompt, quote: string): Match[] {
  const q = quote.split("\n").filter((l) => l.trim());
  const L = parsed.lines;
  if (!q.length) return [];
  if (q.length === 1) {
    const one = q[0];
    const out: Match[] = [];
    for (const l of L) {
      if (l.kind === "blank") continue;
      if (l.raw.includes(one.trim())) out.push({ start: l.index, end: l.index, partial: norm(l.raw) !== norm(one) && strip(l.raw) !== strip(one), exact: true });
      else if (norm(l.raw).includes(norm(one)) || strip(l.raw) === strip(one)) out.push({ start: l.index, end: l.index, partial: strip(l.raw) !== strip(one) && norm(l.raw) !== norm(one), exact: false });
    }
    return out;
  }
  // Várias linhas: sequência de linhas não vazias, comparadas sem marcador e com folga de espaços
  const out: Match[] = [];
  for (let s = 0; s < L.length; s++) {
    if (!L[s].raw.trim() || !(strip(L[s].raw) === strip(q[0]) || norm(L[s].raw).endsWith(norm(q[0])))) continue;
    let k = 1;
    let j = s;
    while (k < q.length) {
      j++;
      while (j < L.length && !L[j].raw.trim()) j++;
      if (j >= L.length) break;
      const last = k === q.length - 1;
      if (!(strip(L[j].raw) === strip(q[k]) || (last && norm(L[j].raw).startsWith(norm(q[k]))))) break;
      k++;
    }
    if (k === q.length) out.push({ start: s, end: j, partial: false, exact: true });
  }
  return out;
}

const L1 = (n: number) => `L${n + 1}`;

export type ResolvedAnswer = { operations: Operation[]; affectedRules: RuleRef[]; notes: string[] };

export function resolveBlocks(content: string, blocks: ClaudeBlock[]): ResolvedAnswer {
  const parsed = parsePrompt(content);
  const operations: Operation[] = [];
  const affectedRules: RuleRef[] = [];
  const notes: string[] = [];
  const busy = new Set<number>();
  let n = 0;

  const label = (line: number) => sectionLabel(parsed.sections[parsed.lines[line].sectionId]);
  const ref = (line: number): RuleRef => ({ line, section: label(line), text: parsed.lines[line].text });
  const push = (op: Omit<Operation, "id" | "oldText" | "section" | "role" | "enabled">) => {
    operations.push({ id: `claude-op-${++n}`, oldText: parsed.lines[op.line]?.raw ?? "", section: label(Math.max(0, op.line)), role: "principal", enabled: true, ...op });
  };

  blocks.forEach((b, idx) => {
    const tag = `bloco ${idx + 1} (${b.kind === "INSERIR" ? "inserir" : b.kind.toLowerCase()})`;
    const matches = locate(parsed, b.quote);
    if (!matches.length) {
      notes.push(`Não encontrei no prompt atual o trecho do ${tag}: “${short(b.quote)}”. Peça ao Claude para copiar o trecho exatamente como está no prompt.`);
      return;
    }
    const m = matches[0];
    if (matches.length > 1) notes.push(`O trecho do ${tag} aparece ${matches.length} vezes no prompt (${matches.map((x) => L1(x.start)).join(", ")}); usei a primeira (${L1(m.start)}). Confira no diff.`);
    const lines = Array.from({ length: m.end - m.start + 1 }, (_, k) => m.start + k);
    if (b.kind !== "INSERIR" && lines.some((l) => busy.has(l))) {
      notes.push(`O ${tag} mexe numa linha que outro bloco já altera (${L1(m.start)}); ele foi ignorado.`);
      return;
    }
    const first = parsed.lines[m.start];
    const newLines = b.newText ? b.newText.split("\n") : [];

    if (b.kind === "INSERIR") {
      if (!b.newText.trim()) return notes.push(`O ${tag} não tem o texto a inserir.`);
      const anchor = parsed.lines[m.end];
      const next = parsed.lines[m.end + 1];
      const paragraph = anchor.kind === "text" && next?.kind === "blank";
      push({ type: "inserir_apos", line: m.end, newText: paragraph ? `\n${b.newText}` : b.newText, reason: `Inserção sugerida pelo Claude (${tag}).` });
      affectedRules.push(ref(m.end));
      return;
    }

    if (b.kind === "REMOVER") {
      if (m.partial && m.start === m.end) {
        if (!m.exact) return notes.push(`O trecho do ${tag} é só parte da ${L1(m.start)} e não bate letra por letra; não removi para não errar. Peça ao Claude a linha inteira.`);
        const rest = first.text.replace(b.quote.trim(), "").replace(/\s{2,}/g, " ").trim();
        if (rest && rest.replace(/[.,;:\s]/g, "")) push({ type: "substituir_linha", line: m.start, newText: lineWithText(first, rest), reason: `Remove só o trecho indicado (${tag}).` });
        else push({ type: "remover_linha", line: m.start, newText: "", reason: `Remove a regra (${tag}).` });
      } else {
        for (const l of lines) push({ type: "remover_linha", line: l, newText: "", reason: `Remove a regra (${tag}).` });
      }
      lines.forEach((l) => busy.add(l));
      affectedRules.push(...lines.filter((l) => isRuleLine(parsed.lines[l])).map(ref));
      return;
    }

    // TROCAR
    if (!b.newText.trim()) return notes.push(`O ${tag} não tem o texto novo. Se a ideia era apagar o trecho, use REMOVER.`);
    let replacement: string[];
    if (m.partial && m.start === m.end) {
      if (!m.exact || !first.raw.includes(b.quote.trim())) return notes.push(`O trecho do ${tag} é só parte da ${L1(m.start)} e não bate letra por letra; não troquei para não errar. Peça ao Claude a linha inteira.`);
      replacement = first.raw.replace(b.quote.trim(), b.newText).split("\n");
    } else {
      replacement = [...newLines];
      // Citou a regra sem o marcador de lista e devolveu sem marcador: mantém o marcador original
      if (first.marker && !LIST_MARK.test(replacement[0])) replacement[0] = lineWithText(first, replacement[0].trim());
    }
    push({ type: "substituir_linha", line: m.start, newText: replacement[0], reason: `Troca sugerida pelo Claude (${tag}).` });
    for (const l of lines.slice(1)) push({ type: "remover_linha", line: l, newText: "", reason: `Parte do trecho trocado (${tag}).` });
    if (replacement.length > 1) push({ type: "inserir_apos", line: m.start, newText: replacement.slice(1).join("\n"), reason: `Continuação do texto novo (${tag}).` });
    lines.forEach((l) => busy.add(l));
    affectedRules.push(...lines.filter((l) => isRuleLine(parsed.lines[l])).map(ref));
  });

  return { operations, affectedRules, notes };
}

function short(s: string) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 90 ? `${t.slice(0, 89)}…` : t;
}

