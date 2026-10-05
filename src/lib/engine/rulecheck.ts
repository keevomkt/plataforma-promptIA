/**
 * Avaliação de conflito de uma alteração — a MESMA para todo pedido: escrito
 * em linguagem natural (analyze.ts), correção colada do Claude
 * (actions/claude.ts) e reaplicação depois de editar as operações
 * (actions/changes.ts).
 *
 * Compara o que a alteração introduz (ou remove) com as regras que ficam no
 * prompt e classifica cada regra que trata do mesmo assunto:
 * conflitante, dependente, compatível — ou substituída, quando é a própria
 * regra trocada e a alteração inverte o que ela dizia.
 *
 * O assunto em comum vem do próprio prompt: palavras raras nele (que
 * aparecem em poucas regras) compartilhadas pelos dois textos. Obrigação e
 * opção são reconhecidas por marcadores gramaticais (locate/lexicon.ts);
 * nenhum termo de negócio entra aqui.
 */
import { isRuleLine, parsePrompt, sectionLabel, type ParsedPrompt, type PromptLine } from "./parse";
import { lineWithText } from "./apply";
import { contentWords, normalize, sameStem, splitSentences, stem, truncate } from "./text";
import { findOverlaps } from "./locate/overlaps";
import { MANDATORY_MARKERS, OPTIONAL_MARKERS, PRESENCE_CONDITIONS } from "./locate/lexicon";
import type { Operation, RuleCheck, RuleCheckKind, RuleDecision } from "./types";

/** Palavra rara: aparece em no máximo esta fração das regras do prompt (mínimo 3 regras). */
const RARE_SHARE = 0.02;
const MIN_RARE_LINES = 3;
const LEAD_IN_LOOKBACK = 30;

const PRIORITY: Record<RuleCheckKind, number> = { conflitante: 4, substituida: 3, dependente: 2, compativel: 1 };

type Stance = "obrigatoria" | "opcional" | null;
type Token = { surface: string; stem: string };

const L = (line: number) => `L${line + 1}`;

/** Obriga ou deixa opcional? As marcas de opção são lidas primeiro (muitas negam uma obrigação). */
export function stanceOf(text: string): Stance {
  let n = ` ${normalize(text)} `;
  let optional = false;
  for (const m of OPTIONAL_MARKERS) {
    if (n.includes(` ${m} `)) {
      optional = true;
      n = n.split(` ${m} `).join("  ");
    }
  }
  const mandatory = MANDATORY_MARKERS.some((m) => n.includes(` ${m} `));
  if (optional && !mandatory) return "opcional";
  if (mandatory && !optional) return "obrigatoria";
  return null;
}

function hasPresenceCondition(text: string): boolean {
  const n = ` ${normalize(text)}`;
  return PRESENCE_CONDITIONS.some((p) => n.includes(` ${p}`));
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of Array.from(text.matchAll(/[\p{L}\p{N}]+/gu))) {
    const w = contentWords(m[0])[0];
    if (w) out.push({ surface: m[0], stem: stem(w) });
  }
  return out;
}

/** Em quantas regras cada radical aparece: o que é comum no prompt não identifica assunto. */
function rarity(parsed: ParsedPrompt) {
  const df = new Map<string, number>();
  let rules = 0;
  for (const l of parsed.lines) {
    if (!isRuleLine(l)) continue;
    rules++;
    for (const s of new Set(tokens(l.text).map((t) => t.stem))) df.set(s, (df.get(s) ?? 0) + 1);
  }
  const limit = Math.max(MIN_RARE_LINES, Math.floor(rules * RARE_SHARE));
  return (s: string) => {
    let count = df.get(s);
    if (count === undefined) for (const [k, v] of df) if (sameStem(k, s)) count = Math.max(count ?? 0, v);
    return (count ?? 0) <= limit;
  };
}

/** Advérbio de modo ("brevemente", "novamente"): diz como agir, nunca é o assunto. */
const MANNER = /mente$/;

/** Assunto em comum entre uma regra e um trecho da alteração, ou null. */
function sharedTopic(rule: Token[], change: Token[], rareStem: (s: string) => boolean): string | null {
  const isRare = (t: Token) => !MANNER.test(normalize(t.surface)) && rareStem(t.stem);
  // Maior sequência de palavras de conteúdo presente nos dois textos
  let best = { len: 0, end: 0 };
  const prev = new Array(change.length + 1).fill(0);
  for (let i = 1; i <= rule.length; i++) {
    let diag = 0;
    for (let j = 1; j <= change.length; j++) {
      const keep = prev[j];
      prev[j] = sameStem(rule[i - 1].stem, change[j - 1].stem) ? diag + 1 : 0;
      if (prev[j] > best.len) best = { len: prev[j], end: i };
      diag = keep;
    }
  }
  const run = rule.slice(best.end - best.len, best.end);
  const rareInRun = run.filter(isRare).length;
  if (run.length >= 2 && rareInRun >= 2) return run.map((t) => t.surface).join(" ");

  // Regra cujas palavras raras (ao menos duas) estão quase todas no trecho da alteração
  const rare = rule.filter((t, i) => isRare(t) && rule.findIndex((u) => u.stem === t.stem) === i);
  const shared = rare.filter((t) => change.some((c) => sameStem(c.stem, t.stem)));
  if (shared.length >= 2 && shared.length / rare.length >= 0.6) {
    return shared.map((t) => t.surface).join(", ");
  }
  return null;
}

/** Introdução da lista de um item ("Inclua, quando tiverem sido informadas:"), se houver. */
function leadIn(parsed: ParsedPrompt, line: PromptLine): PromptLine | undefined {
  if (line.kind !== "bullet" && line.kind !== "numbered") return undefined;
  for (let i = line.index - 1; i >= Math.max(0, line.index - LEAD_IN_LOOKBACK); i--) {
    const l = parsed.lines[i];
    if (l.sectionId !== line.sectionId || l.kind === "heading") return undefined;
    if (l.kind === "blank" || ((l.kind === "bullet" || l.kind === "numbered") && l.indent >= line.indent)) continue;
    return l.kind === "text" && /:\s*$/.test(l.raw) ? l : undefined;
  }
  return undefined;
}

/** A introdução citada pela última frase, que é a que abre a lista ("Inclua, quando tiverem sido informadas:"). */
function introQuote(intro: PromptLine): string {
  const sentences = splitSentences(intro.text.trim());
  return truncate(sentences[sentences.length - 1] ?? intro.text.trim(), 100);
}

type Piece = { text: string; tokens: Token[]; stance: Stance; from: Operation; removed: boolean };

/**
 * Trechos que a operação introduz (ou remove). Numa troca, a frase só conta
 * inteira se for nova de verdade (metade das palavras ou mais) ou se inverter
 * obrigação/opção da linha original; numa troca pequena ("consultor" →
 * "especialista") conta só o que mudou.
 */
function piecesOf(op: Operation, text: string, removed: boolean, oldText = ""): Piece[] {
  const old = tokens(oldText);
  const oldStance = stanceOf(oldText);
  return text
    .split("\n")
    .flatMap((l) => splitSentences(l))
    .map((s) => s.trim())
    .filter((s) => contentWords(s).length >= 2)
    .map((s) => {
      const all = tokens(s);
      const stance = stanceOf(s);
      const fresh = all.filter((t) => !old.some((o) => sameStem(o.stem, t.stem)));
      const whole = !old.length || fresh.length / Math.max(1, all.length) >= 0.5 || (stance !== null && stance !== oldStance);
      return { text: s, tokens: whole ? all : fresh, stance: whole ? stance : null, from: op, removed };
    });
}

/**
 * Classifica as regras do prompt `content` em relação às operações ativas.
 * Regras sem relação com a alteração não entram no resultado.
 */
export function checkRules(content: string, operations: Operation[]): RuleCheck[] {
  const parsed = parsePrompt(content);
  const isRare = rarity(parsed);
  const active = operations.filter((o) => o.enabled && !(o.type === "substituir_linha" && o.newText === o.oldText));
  const touched = new Set(active.filter((o) => o.type !== "inserir_apos").map((o) => o.line));
  const added = active.filter((o) => o.type !== "remover_linha" && o.newText.trim()).flatMap((o) => piecesOf(o, o.newText, false, o.type === "substituir_linha" ? parsed.lines[o.line]?.text ?? "" : ""));
  const removed = active.filter((o) => o.type === "remover_linha").flatMap((o) => piecesOf(o, parsed.lines[o.line]?.text ?? "", true));
  if (!added.length && !removed.length) return [];

  const found = new Map<number, RuleCheck>();
  const keep = (c: RuleCheck) => {
    const prev = found.get(c.line);
    if (!prev || PRIORITY[c.kind] > PRIORITY[prev.kind]) found.set(c.line, c);
  };

  for (const line of parsed.lines) {
    if (!isRuleLine(line) || contentWords(line.text).length < 1) continue;
    const ruleTokens = tokens(line.text);
    const base = { line: line.index, section: sectionLabel(parsed.sections[line.sectionId]), text: line.text.trim() };

    // A própria regra trocada/removida: a alteração inverte o que ela dizia?
    if (touched.has(line.index)) {
      const own = stanceOf(line.text);
      for (const p of added) {
        const topic = own && p.stance && own !== p.stance ? sharedTopic(ruleTokens, p.tokens, isRare) : null;
        if (!topic) continue;
        keep({
          ...base,
          kind: "substituida",
          topic,
          explanation:
            own === "opcional"
              ? `A alteração substitui esta regra, que deixava “${topic}” opcional. Daqui em diante passa a ser exigido.`
              : `A alteração substitui esta regra, que exigia “${topic}”. Daqui em diante passa a ser opcional.`,
        });
      }
      continue;
    }

    const intro = leadIn(parsed, line);
    const ownStance = stanceOf(line.text);
    const introStance = intro ? stanceOf(intro.text) : null;
    const stance = ownStance ?? introStance;
    const via = !ownStance && introStance && intro ? ` (pela introdução da lista, ${L(intro.index)}: “${introQuote(intro)}”)` : "";

    for (const p of [...added, ...removed]) {
      const topic = sharedTopic(ruleTokens, p.tokens, isRare);
      if (!topic) continue;

      if (p.removed) {
        keep({ ...base, kind: "dependente", topic, explanation: `Cita “${topic}”, que sai do prompt com a remoção de ${L(p.from.line)}. Confira se esta regra ainda faz sentido.` });
        continue;
      }

      if (stance && p.stance && stance !== p.stance) {
        keep({
          ...base,
          kind: "conflitante",
          topic,
          explanation:
            p.stance === "obrigatoria"
              ? `A alteração exige “${topic}”, mas esta regra deixa opcional${via}.`
              : `A alteração deixa “${topic}” opcional, mas esta regra exige${via}.`,
        });
        continue;
      }

      const overlap = findOverlaps([
        { line: -1, section: "", text: p.text, reasons: [] },
        { line: line.index, section: "", text: line.text, reasons: [] },
      ])[0];
      if (overlap?.kind === "duplicidade") {
        keep({ ...base, kind: "conflitante", topic, explanation: "Diz praticamente o mesmo que a alteração: as duas regras ficariam repetidas." });
        continue;
      }
      // Afirma × nega só vale sem marcas de obrigação/opção ("Nunca avance sem X" não nega "Pergunte X")
      if (overlap?.kind === "divergencia" && !stance && !p.stance) {
        keep({
          ...base,
          kind: "conflitante",
          topic,
          explanation: /limites/.test(overlap.explanation)
            ? "Trata do mesmo ponto que a alteração, com limites diferentes."
            : "Trata do mesmo ponto que a alteração, mas uma afirma e a outra nega.",
        });
        continue;
      }

      if (p.stance === "obrigatoria" && (hasPresenceCondition(line.text) || (intro && hasPresenceCondition(intro.text)))) {
        const where = hasPresenceCondition(line.text) ? "" : ` (introdução da lista, ${L(intro!.index)}: “${introQuote(intro!)}”)`;
        keep({
          ...base,
          kind: "dependente",
          topic,
          explanation: `Trata “${topic}” como algo que pode faltar${where}. Com a alteração ele sempre será obtido; a regra continua válida, só confira.`,
        });
        continue;
      }

      if (stance && p.stance && stance === p.stance) {
        keep({ ...base, kind: "compativel", topic, explanation: `Também trata de “${topic}”, na mesma direção da alteração.` });
        continue;
      }

      keep({ ...base, kind: "dependente", topic, explanation: `Também trata de “${topic}” e continua valendo com a alteração. Confira se ainda faz sentido.` });
    }
  }

  return Array.from(found.values()).sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.line - b.line);
}

/** Linhas que exigem decisão antes de aplicar. */
export function conflictingLines(checks: RuleCheck[] | undefined): number[] {
  return (checks ?? []).filter((c) => c.kind === "conflitante").map((c) => c.line);
}

/** Tira de "Possíveis conflitos" o que a avaliação já classificou (mesma linha), para não repetir. */
export function withoutChecked<T extends { rule?: { line: number } }>(conflicts: T[], checks: RuleCheck[]): T[] {
  const lines = new Set(checks.map((c) => c.line));
  return conflicts.filter((c) => !c.rule || !lines.has(c.rule.line));
}

/**
 * Operações que vêm das decisões "alterar a regra existente".
 * Texto vazio remove a regra; texto sem marcador de lista herda o marcador original.
 */
export function decisionOperations(content: string, decisions: RuleDecision[]): Operation[] {
  const parsed = parsePrompt(content);
  return decisions
    .filter((d) => d.choice === "alterar")
    .map((d) => {
      const line = parsed.lines[d.line];
      const text = d.text.trim();
      const withMarker = !text ? "" : line.marker && !/^\s*(?:[-*•+–]|\d{1,3}[.)]|[a-z]\))\s+/.test(text) ? lineWithText(line, text) : text;
      return {
        id: `decisao-${L(d.line)}`,
        type: text ? ("substituir_linha" as const) : ("remover_linha" as const),
        line: d.line,
        oldText: line.raw,
        newText: withMarker,
        section: sectionLabel(parsed.sections[line.sectionId]),
        reason: text ? "Regra existente ajustada na decisão sobre o conflito." : "Regra existente removida na decisão sobre o conflito.",
        role: "relacionada" as const,
        enabled: true,
      };
    });
}
