/**
 * Dentro de um mesmo comportamento, aponta regras que:
 * - dizem a mesma coisa com outras palavras (duplicidade): o conteúdo de uma
 *   está contido na outra e nada a distingue ("quais" × "quantos", negação, limite);
 * - tratam do mesmo ponto com valores diferentes (divergência): conteúdo
 *   quase igual, mas uma nega e a outra afirma, ou os limites numéricos diferem.
 *
 * A comparação é por regra inteira, nunca por frase solta: duas regras com a
 * mesma consequência ("Siga direto para o encaminhamento.") e condições
 * diferentes não são duplicadas.
 */
import { normalize, sameStem, stems } from "../text";
import { DISTINGUISHERS, FREQUENCY_WORDS, NEGATIONS, NUMBER_WORDS } from "./lexicon";
import type { LocatedRule, OverlapFinding } from "./types";

const MIN_CONTENT = 4;
const DUPLICATE_CONTAINMENT = 0.8;
const DIVERGENCE_OVERLAP = 0.7;

type Profile = {
  line: number;
  content: string[];
  distinguishers: Set<string>;
  negated: boolean;
  limits: number[];
};

const NUM = `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
const LIMIT_RES = [new RegExp(`\\b(?:no maximo|no minimo|ate|apenas|somente|exatamente)\\s+${NUM}\\b`, "g"), new RegExp(`\\b${NUM}\\s+vez(?:es)?\\b`, "g")];
const VALUE_WORDS = new Set([...NEGATIONS, ...FREQUENCY_WORDS, ...Object.keys(NUMBER_WORDS), ...DISTINGUISHERS]);

function profile(r: LocatedRule): Profile {
  const n = normalize(r.text);
  const words = n.split(" ");
  const limits: number[] = [];
  for (const re of LIMIT_RES) {
    for (const m of Array.from(n.matchAll(re))) limits.push(/^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]]);
  }
  return {
    line: r.line,
    content: Array.from(new Set(words.filter((w) => !VALUE_WORDS.has(w)).flatMap((w) => stems(w)))),
    distinguishers: new Set(words.filter((w) => DISTINGUISHERS.includes(w))),
    negated: words.some((w) => NEGATIONS.includes(w)),
    limits: Array.from(new Set(limits)).sort((a, b) => a - b),
  };
}

function shared(a: string[], b: string[]) {
  return a.filter((x) => b.some((y) => sameStem(x, y))).length;
}

const L = (l: number) => `L${l + 1}`;

export function findOverlaps(rules: LocatedRule[]): OverlapFinding[] {
  const profiles = rules.map(profile).filter((p) => p.content.length >= MIN_CONTENT);
  const out: OverlapFinding[] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const [a, b] = profiles[i].content.length <= profiles[j].content.length ? [profiles[i], profiles[j]] : [profiles[j], profiles[i]];
      const common = shared(a.content, b.content);
      const ratio = common / a.content.length;
      const lines = [profiles[i].line, profiles[j].line];

      if (ratio >= DIVERGENCE_OVERLAP) {
        if (a.negated !== b.negated) {
          out.push({ kind: "divergencia", lines, explanation: `${L(lines[0])} e ${L(lines[1])} tratam do mesmo ponto, mas uma afirma e a outra nega.` });
          continue;
        }
        if (a.limits.length && b.limits.length && a.limits.join() !== b.limits.join()) {
          out.push({
            kind: "divergencia",
            lines,
            explanation: `${L(lines[0])} e ${L(lines[1])} tratam do mesmo ponto com limites diferentes (${a.limits.join(", ")} × ${b.limits.join(", ")}).`,
          });
          continue;
        }
      }

      const sameValues = Array.from(a.distinguishers).every((d) => b.distinguishers.has(d)) && a.negated === b.negated && a.limits.join() === b.limits.join();
      if (ratio >= DUPLICATE_CONTAINMENT && sameValues) {
        const both = shared(b.content, a.content) / b.content.length >= DUPLICATE_CONTAINMENT;
        out.push({
          kind: "duplicidade",
          lines,
          explanation: both
            ? `${L(lines[0])} e ${L(lines[1])} dizem a mesma coisa com palavras diferentes.`
            : `${L(b.line)} já inclui o que ${L(a.line)} diz.`,
        });
      }
    }
  }
  return out;
}
