import { diffArrays, diffLines, diffWords, type Change } from "diff";
import { splitLines } from "@/lib/engine/parse";

export type DiffBlock = {
  type: "added" | "removed" | "unchanged";
  value: string;
};

/** Diff linha a linha entre duas versões, estilo Git. */
export function computeLineDiff(previous: string, next: string): DiffBlock[] {
  const changes: Change[] = diffLines(previous ?? "", next ?? "");
  return changes.map((c) => ({
    type: c.added ? "added" : c.removed ? "removed" : "unchanged",
    value: c.value,
  }));
}

/** Diff palavra a palavra, usado para destacar o que mudou dentro de uma regra alterada. */
export function computeWordDiff(previous: string, next: string): DiffBlock[] {
  const changes: Change[] = diffWords(previous ?? "", next ?? "");
  return changes.map((c) => ({
    type: c.added ? "added" : c.removed ? "removed" : "unchanged",
    value: c.value,
  }));
}

export type RuleDiff = {
  removed: { line: number; text: string }[];
  added: { line: number; text: string }[];
  changed: { oldLine: number; newLine: number; before: string; after: string }[];
  stats: { linesAdded: number; linesRemoved: number; rulesChanged: number };
};

/**
 * Diff agrupado por regra (seção 8): linhas só removidas, só adicionadas e
 * regras alteradas (uma linha removida imediatamente substituída por outra).
 * Linhas em branco não contam como regra.
 */
export function ruleDiff(previous: string, next: string): RuleDiff {
  const a = splitLines(previous ?? "").lines;
  const b = splitLines(next ?? "").lines;
  const parts = diffArrays(a, b);
  const out: RuleDiff = { removed: [], added: [], changed: [], stats: { linesAdded: 0, linesRemoved: 0, rulesChanged: 0 } };
  let i = 0;
  let j = 0;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const n = part.count ?? part.value.length;
    if (part.removed) {
      const nextPart = parts[p + 1];
      const removedLines = a.slice(i, i + n).map((text, k) => ({ line: i + k, text })).filter((l) => l.text.trim());
      if (nextPart?.added) {
        const m = nextPart.count ?? nextPart.value.length;
        const addedLines = b.slice(j, j + m).map((text, k) => ({ line: j + k, text })).filter((l) => l.text.trim());
        const pairs = Math.min(removedLines.length, addedLines.length);
        for (let k = 0; k < pairs; k++) {
          out.changed.push({ oldLine: removedLines[k].line, newLine: addedLines[k].line, before: removedLines[k].text, after: addedLines[k].text });
        }
        out.removed.push(...removedLines.slice(pairs));
        out.added.push(...addedLines.slice(pairs));
        i += n;
        j += m;
        p++;
        continue;
      }
      out.removed.push(...removedLines);
      i += n;
    } else if (part.added) {
      out.added.push(...b.slice(j, j + n).map((text, k) => ({ line: j + k, text })).filter((l) => l.text.trim()));
      j += n;
    } else {
      i += n;
      j += n;
    }
  }
  out.stats = {
    linesAdded: out.added.length + out.changed.length,
    linesRemoved: out.removed.length + out.changed.length,
    rulesChanged: out.changed.length,
  };
  return out;
}

/** Resumo numérico usado na lista de versões. */
export function diffStats(previous: string, next: string) {
  const d = ruleDiff(previous, next);
  return { added: d.stats.linesAdded, removed: d.stats.linesRemoved };
}
