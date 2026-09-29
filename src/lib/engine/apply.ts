/**
 * Aplica operações aprovadas ao texto do prompt (seções 6 e 7 da
 * especificação): PROMPT ANTERIOR + ALTERAÇÃO APROVADA = NOVO PROMPT COMPLETO.
 *
 * Regra de preservação: só as linhas apontadas pelas operações mudam. Todo o
 * resto — títulos, ordem, terminologia, URLs, espaçamento, quebras de linha —
 * é copiado byte a byte da versão anterior. Cada operação confere o texto
 * original da linha antes de agir; se não bater, ela é recusada.
 */
import { joinLines, parsePrompt, splitLines, type PromptLine } from "./parse";
import type { Operation } from "./types";
import { sameStem, stems, stripAccents } from "./text";

/** Reconstrói a linha trocando só o conteúdo, preservando recuo e marcador de lista. */
export function lineWithText(line: PromptLine, newText: string): string {
  const prefix = line.raw.slice(0, line.raw.length - line.raw.trimStart().length) + (line.marker ?? "");
  return prefix + newText;
}

/** Remove frases de um texto preservando as demais exatamente como estão. */
export function removeSentences(text: string, sentences: string[]): string {
  let out = text;
  for (const s of sentences) {
    const i = out.indexOf(s);
    if (i === -1) continue;
    out = out.slice(0, i) + out.slice(i + s.length);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Remove um item de uma enumeração ("nome, sistema atual, quantidade de
 * CNPJs e produto de interesse") mantendo a gramática da lista. Devolve
 * null quando o texto não é uma enumeração ou o item não é identificável.
 */
export function removeFromEnumeration(sentence: string, anchorStems: string[]): string | null {
  const colon = sentence.lastIndexOf(":");
  const head = colon >= 0 ? sentence.slice(0, colon + 1) : "";
  let body = colon >= 0 ? sentence.slice(colon + 1) : sentence;
  const lead = body.match(/^\s*/)![0];
  body = body.slice(lead.length);
  const trail = body.match(/[.;!?]*\s*$/)![0];
  body = body.slice(0, body.length - trail.length);

  const parts = body.split(/(,\s+|\s+e\s+)/);
  const segments = parts.filter((_, i) => i % 2 === 0);
  if (segments.length < 3) return null;

  const hits = segments
    .map((seg, i) => ({ i, seg }))
    .filter(({ seg }) => stems(seg).some((s) => anchorStems.some((a) => sameStem(a, s))));
  if (hits.length !== 1) return null;
  const { i: segIdx, seg } = hits[0];
  if (seg.split(/\s+/).length > 8) return null;

  const idx = segIdx * 2; // posição em parts
  const last = idx === parts.length - 1;
  const out = [...parts];
  if (idx === 0) {
    out.splice(0, 2);
  } else if (last) {
    const removedDelim = out[idx - 1];
    out.splice(idx - 1, 2);
    if (/\se\s/.test(removedDelim) && out.length >= 3 && /^,/.test(out[out.length - 2])) {
      out[out.length - 2] = " e ";
    }
  } else {
    out.splice(idx - 1, 2);
  }
  return head + lead + out.join("") + trail;
}

/** Substituição sem diferenciar maiúsculas/acentos, preservando o resto da linha. */
export function replaceInsensitive(text: string, from: string, to: string): { result: string; count: number } {
  const fold = (s: string) =>
    Array.from(s).map((ch) => stripAccents(ch.toLowerCase()).charAt(0) || ch);
  const hay = fold(text);
  const needle = fold(from).join("");
  const chars = Array.from(text);
  let result = "";
  let count = 0;
  let i = 0;
  while (i < chars.length) {
    if (hay.slice(i, i + needle.length).join("") === needle && needle.length > 0) {
      result += to;
      i += Array.from(from).length;
      count++;
    } else {
      result += chars[i];
      i++;
    }
  }
  return { result, count };
}

export type ApplyResult = {
  content: string;
  applied: Operation[];
  skipped: { op: Operation; reason: string }[];
};

export function applyOperations(content: string, operations: Operation[]): ApplyResult {
  const { lines, eol, trailingNewline } = splitLines(content);
  const applied: Operation[] = [];
  const skipped: { op: Operation; reason: string }[] = [];

  const enabled = operations.filter((o) => o.enabled);
  // Uma única operação por linha (remoção/substituição); inserções podem se acumular.
  const seen = new Set<number>();
  const valid: Operation[] = [];
  for (const op of enabled) {
    if (op.type === "inserir_apos") {
      if (op.line >= lines.length || (op.line >= 0 && lines[op.line] !== op.oldText)) {
        skipped.push({ op, reason: "A linha de referência para a inserção não confere com o prompt analisado." });
        continue;
      }
      if (!op.newText.trim()) {
        skipped.push({ op, reason: "Texto a inserir vazio." });
        continue;
      }
      valid.push(op);
      continue;
    }
    if (op.line < 0 || op.line >= lines.length || lines[op.line] !== op.oldText) {
      skipped.push({ op, reason: "O texto da linha mudou desde a análise; a operação não foi aplicada." });
      continue;
    }
    if (seen.has(op.line)) {
      skipped.push({ op, reason: "Já existe outra operação sobre esta mesma linha." });
      continue;
    }
    if (op.type === "substituir_linha" && op.newText === op.oldText) {
      continue; // revisão sem mudança: nada a fazer
    }
    seen.add(op.line);
    valid.push(op);
  }

  // Aplica de baixo para cima para não deslocar os índices das próximas operações.
  const ordered = [...valid].sort((a, b) => b.line - a.line || order(a) - order(b));
  const out = [...lines];
  const touched: number[] = [];
  for (const op of ordered) {
    if (op.type === "remover_linha" || (op.type === "substituir_linha" && !op.newText.trim())) {
      out.splice(op.line, 1);
      // Evita deixar duas linhas em branco seguidas onde havia uma regra
      if (op.line > 0 && out[op.line - 1]?.trim() === "" && (out[op.line]?.trim() ?? "") === "") {
        out.splice(op.line, 1);
      }
      touched.push(op.line);
    } else if (op.type === "substituir_linha") {
      out[op.line] = op.newText;
      touched.push(op.line);
    } else {
      const newLines = op.newText.split(/\r?\n/);
      out.splice(op.line + 1, 0, ...newLines);
      touched.push(op.line + 1);
    }
    applied.push(op);
  }

  const renumbered = renumberLists(out, touched);
  return { content: joinLines(renumbered, eol, trailingNewline), applied: applied.reverse(), skipped };
}

function order(op: Operation) {
  // Na mesma linha: inserção depois da substituição
  return op.type === "inserir_apos" ? 0 : 1;
}

/**
 * Renumera listas numeradas que foram tocadas (ex: removeu o item 3 de 4 →
 * o antigo 4 vira 3). Só atua em listas que já eram sequenciais.
 */
function renumberLists(lines: string[], touched: number[]): string[] {
  if (!touched.length) return lines;
  const parsed = parsePrompt(lines.join("\n"));
  const out = [...lines];
  const done = new Set<number>();

  for (const t of touched) {
    for (const probe of [t - 1, t]) {
      const line = parsed.lines[probe];
      if (!line || line.kind !== "numbered" || line.number === undefined || done.has(probe)) continue;
      // Expande para os itens irmãos (mesmo recuo), atravessando linhas em branco e sub-itens
      const block: PromptLine[] = [];
      let i = probe;
      while (i > 0) {
        const prev = parsed.lines[i - 1];
        if (prev.kind === "blank" || (prev.indent > line.indent && prev.kind !== "heading")) { i--; continue; }
        if (prev.kind === "numbered" && prev.indent === line.indent && prev.number !== undefined) { i--; continue; }
        break;
      }
      for (let j = i; j < parsed.lines.length; j++) {
        const l = parsed.lines[j];
        if (l.kind === "numbered" && l.indent === line.indent && l.number !== undefined) block.push(l);
        else if (l.kind === "blank" || (l.indent > line.indent && l.kind !== "heading")) continue;
        else if (j > probe) break;
      }
      if (block.length < 2) continue;
      const start = block[0].number!;
      const nums = block.map((b) => b.number!);
      // Só renumera se, tirando o ponto alterado, a lista era crescente
      const increasing = nums.every((n, k) => k === 0 || n >= nums[k - 1]);
      if (!increasing) continue;
      block.forEach((b, k) => {
        done.add(b.index);
        const expected = start + k;
        if (b.number !== expected) {
          out[b.index] = b.raw.replace(/^(\s*)\d+/, `$1${expected}`);
        }
      });
    }
  }
  return out;
}
