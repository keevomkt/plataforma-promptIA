/**
 * Localiza no prompt as regras de um comportamento a partir de uma pergunta
 * em linguagem natural.
 *
 * 1. Assunto: palavras da pergunta, sem as de pergunta/metalinguagem.
 * 2. Sementes: regras com os termos do assunto (termos raros no prompt pesam mais).
 * 3. Seções cujo título trata do assunto entram inteiras.
 * 4. Expansão dentro do bloco de cada semente, nunca além dele:
 *    - estrutura: item de lista ↔ seus subitens / introdução ":" ↔ lista;
 *    - referência: pronome no início da regra retoma a regra anterior;
 *      demonstrativo/artigo + substantivo retoma regra recente que o cita;
 *    - posição: regra entre duas regras já incluídas.
 *
 * Função pura: recebe o prompt já interpretado e não depende de banco nem de tela.
 */
import { isRuleLine, sectionLabel, type ParsedPrompt, type PromptSection } from "../parse";
import { normalize, sameStem, stem, stems } from "../text";
import { buildBlocks, type Block, type BlockMap } from "./blocks";
import { DEFINITE_ARTICLES, DEMONSTRATIVES, LEXICON_VERSION, QUESTION_META, SUBJECT_PRONOUNS } from "./lexicon";
import { findOverlaps } from "./overlaps";
import type { BehaviorGroup, LocatedRule, LocateResult, MatchReason, SectionHit } from "./types";

/** Fração do peso do assunto que uma regra precisa cobrir para ser semente. */
const SEED_SCORE = 0.5;
/** Fração do peso do assunto que o título precisa cobrir para a seção entrar inteira. */
const TITLE_SCORE = 0.6;
/** Retomada por artigo definido só vale para palavras pouco frequentes no prompt. */
const ARTICLE_MAX_DF = 0.15;
/** Quantas regras para trás uma retomada por substantivo pode alcançar. */
const NOMINAL_REACH = 3;
const MAX_GROUPS = 8;
/** Peso de um termo que está no caminho da seção, e não no texto da regra. */
const PATH_WEIGHT = 0.5;

const META_STEMS = QUESTION_META.map(stem);

type Ctx = {
  parsed: ParsedPrompt;
  blocks: BlockMap;
  lineStems: Map<number, string[]>;
  pathStems: (line: number) => string[];
  df: (term: string) => number;
  weight: (term: string) => number;
  ruleCount: number;
};

export function locateBehavior(parsed: ParsedPrompt, question: string): LocateResult {
  const ctx = buildContext(parsed);
  const { terms, display, missing, wordOf } = extractTopic(question, ctx);
  const present = terms.filter((t) => ctx.df(t) > 0);
  const empty: LocateResult = {
    question,
    topic: { terms, missing, display },
    sectionHits: [],
    groups: [],
    found: false,
    lexiconVersion: LEXICON_VERSION,
  };
  if (!present.length) return empty;

  const totalWeight = present.reduce((a, t) => a + ctx.weight(t), 0);
  const coverage = (s: string[], inherited: string[] = []) => {
    const has = (list: string[], t: string) => list.some((x) => sameStem(x, t));
    const matched = present.filter((t) => has(s, t));
    const fromPath = present.filter((t) => !has(s, t) && has(inherited, t));
    const got = matched.reduce((a, t) => a + ctx.weight(t), 0) + fromPath.reduce((a, t) => a + ctx.weight(t) * PATH_WEIGHT, 0);
    return { score: got / totalWeight, matched };
  };

  // Termos por linha (guardados como as palavras da pergunta, para exibição).
  // A regra herda, com peso menor, o assunto dos títulos sob os quais está escrita.
  const termHits: TermHits = new Map();
  for (const [line, s] of ctx.lineStems) {
    const c = coverage(s, ctx.pathStems(line));
    if (c.matched.length) termHits.set(line, { score: c.score, matched: c.matched.map((t) => wordOf.get(t) ?? t) });
  }

  // Seções cujo título trata do assunto
  const titleScore = new Map<number, number>();
  for (const s of parsed.sections) {
    if (s.id === 0) continue;
    const c = coverage(stems(s.title));
    if (c.score >= TITLE_SCORE) titleScore.set(s.id, c.score);
  }
  const hasChildren = (s: PromptSection) => parsed.sections.some((c) => c.parentId === s.id);
  const coveredByHit = new Set<number>(); // linhas já mostradas dentro de uma seção com subseções
  const sectionHits: SectionHit[] = [];
  for (const [id, score] of titleScore) {
    const s = parsed.sections[id];
    if (!hasChildren(s)) continue;
    // Uma seção que já aparece dentro de outra seção encontrada não é repetida
    if (ancestors(parsed, s).some((a) => titleScore.has(a.id))) continue;
    const groups: BehaviorGroup[] = [];
    const own = ctx.blocks.sectionBlocks.get(s.id);
    if (own) groups.push(wholeSectionGroup(ctx, own, termHits, s.title));
    for (const child of parsed.sections.filter((c) => c.parentId === s.id)) {
      const lines = parsed.lines.filter((l) => l.index > child.headingLine && l.index < child.endLine && isRuleLine(l)).map((l) => l.index);
      if (!lines.length) continue;
      groups.push(wholeSectionGroup(ctx, { id: `s${child.id}`, kind: "secao", section: child, lines }, termHits, s.title));
    }
    groups.forEach((g) => g.rules.forEach((r) => coveredByHit.add(r.line)));
    sectionHits.push({ title: s.title, path: s.path, headingLine: s.headingLine, score, groups });
  }

  // Domínios de expansão: seções-folha inteiras (título) ou o bloco de cada semente
  const domains = new Map<string, { block: Block; titleMatch: boolean }>();
  for (const [id] of titleScore) {
    const s = parsed.sections[id];
    const block = ctx.blocks.sectionBlocks.get(id);
    if (block && !hasChildren(s)) domains.set(block.id, { block, titleMatch: true });
  }
  for (const [line, hit] of termHits) {
    if (hit.score < SEED_SCORE || coveredByHit.has(line)) continue;
    const where = ctx.blocks.of.get(line);
    if (!where) continue;
    const block = where.item ?? where.section;
    if (domains.has(where.section.id)) continue;
    if (!domains.has(block.id)) domains.set(block.id, { block, titleMatch: false });
  }
  // Um bloco de item cuja seção também virou domínio é absorvido por ela
  for (const [id, d] of domains) {
    if (d.block.kind === "item" && domains.has(`s${d.block.section.id}`)) domains.delete(id);
  }

  const groups: BehaviorGroup[] = [];
  for (const { block, titleMatch } of domains.values()) {
    const g = titleMatch ? wholeSectionGroup(ctx, block, termHits) : expandGroup(ctx, block, termHits);
    if (g.rules.length) groups.push(g);
  }
  groups.sort((a, b) => b.score - a.score || a.firstLine - b.firstLine);

  return {
    ...empty,
    sectionHits: sectionHits.sort((a, b) => b.score - a.score),
    groups: groups.slice(0, MAX_GROUPS),
    found: sectionHits.length > 0 || groups.length > 0,
  };
}

// ---------------------------------------------------------------------------

function buildContext(parsed: ParsedPrompt): Ctx {
  const lineStems = new Map<number, string[]>();
  for (const l of parsed.lines) if (isRuleLine(l)) lineStems.set(l.index, Array.from(new Set(stems(l.text))));
  const dfCache = new Map<string, number>();
  const ruleCount = lineStems.size || 1;
  const df = (term: string) => {
    if (!dfCache.has(term)) {
      let n = 0;
      for (const s of lineStems.values()) if (s.some((x) => sameStem(x, term))) n++;
      dfCache.set(term, n);
    }
    return dfCache.get(term)!;
  };
  const weight = (term: string) => Math.log((ruleCount + 1) / (df(term) + 0.5)) + 0.5;
  const pathCache = new Map<number, string[]>();
  const pathStems = (line: number) => {
    const id = parsed.lines[line].sectionId;
    if (!pathCache.has(id)) pathCache.set(id, Array.from(new Set(stems(parsed.sections[id].path.join(" ")))));
    return pathCache.get(id)!;
  };
  return { parsed, blocks: buildBlocks(parsed), lineStems, pathStems, df, weight, ruleCount };
}

function ancestors(parsed: ParsedPrompt, s: PromptSection): PromptSection[] {
  const out: PromptSection[] = [];
  for (let p = s.parentId; p !== null && p !== 0; p = parsed.sections[p].parentId) out.push(parsed.sections[p]);
  return out;
}

function extractTopic(question: string, ctx: Ctx) {
  // Palavras como foram escritas (com acento), para exibição; o radical vem da forma normalizada
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept: { word: string; stem: string }[] = [];
  for (const w of words) {
    const [s] = stems(w);
    if (!s || META_STEMS.some((m) => m === s || sameStem(m, s))) continue;
    if (!kept.some((k) => k.stem === s)) kept.push({ word: w, stem: s });
  }
  return {
    terms: kept.map((k) => k.stem),
    display: kept.map((k) => k.word).join(" "),
    missing: kept.filter((k) => ctx.df(k.stem) === 0).map((k) => k.word),
    wordOf: new Map(kept.map((k) => [k.stem, k.word])),
  };
}

function rule(ctx: Ctx, line: number, reasons: MatchReason[]): LocatedRule {
  const l = ctx.parsed.lines[line];
  return { line, section: sectionLabel(ctx.parsed.sections[l.sectionId]), text: l.text, reasons };
}

type TermHits = Map<number, { score: number; matched: string[] }>;

function termReason(termHits: TermHits, line: number): MatchReason[] {
  const hit = termHits.get(line);
  return hit ? [{ kind: "termo", terms: hit.matched }] : [];
}

function makeGroup(ctx: Ctx, block: Block, rules: LocatedRule[], score: number): BehaviorGroup {
  const sorted = rules.sort((a, b) => a.line - b.line);
  const title =
    block.kind === "item" && block.headLine !== undefined
      ? ctx.parsed.lines[block.headLine].text
      : block.section.title;
  return {
    id: block.id,
    title,
    sectionPath: block.section.path,
    firstLine: sorted[0]?.line ?? 0,
    lastLine: sorted[sorted.length - 1]?.line ?? 0,
    rules: sorted,
    score,
    overlaps: findOverlaps(sorted),
  };
}

/**
 * Relevância de um grupo: a regra que melhor cobre o assunto, mais quantas
 * regras cobrem o assunto inteiro e quantas são sementes. O título da seção
 * só desempata — regras que tratam do assunto completo pesam mais que ele.
 */
function groupScore(lines: number[], termHits: TermHits, titleMatch: boolean): number {
  const scores = lines.map((l) => termHits.get(l)?.score ?? 0);
  const best = Math.max(0, ...scores);
  const full = scores.filter((s) => s >= 0.999).length;
  const seeds = scores.filter((s) => s >= SEED_SCORE).length;
  return best + full * 0.05 + seeds * 0.02 + (titleMatch ? 0.1 : 0);
}

/** Seção cujo título trata do assunto: todas as regras dela, sem expansão. */
function wholeSectionGroup(ctx: Ctx, block: Block, termHits: TermHits, viaParent?: string): BehaviorGroup {
  const label = viaParent ?? block.section.title;
  const rules = block.lines.map((line) => rule(ctx, line, [{ kind: "secao", section: label }, ...termReason(termHits, line)]));
  return makeGroup(ctx, block, rules, groupScore(block.lines, termHits, true));
}

/** Sementes do bloco + expansão por estrutura, referência e posição. */
function expandGroup(ctx: Ctx, block: Block, termHits: TermHits): BehaviorGroup {
  const reasons = new Map<number, MatchReason[]>();
  const seeds = block.lines.filter((l) => (termHits.get(l)?.score ?? 0) >= SEED_SCORE);
  for (const l of seeds) reasons.set(l, termReason(termHits, l));

  const order = block.lines;
  const included = (l: number) => reasons.has(l);
  const add = (l: number, r: MatchReason) => {
    if (included(l)) return false;
    reasons.set(l, [r, ...termReason(termHits, l)]);
    return true;
  };

  let changed = true;
  while (changed) {
    changed = false;

    // Estrutura: item de lista ↔ subitens, introdução ↔ lista
    for (const item of ctx.blocks.itemBlocks) {
      if (item.section.id !== block.section.id || item.headLine === undefined) continue;
      if (!item.lines.every((l) => order.includes(l))) continue;
      const head = item.headLine;
      if (included(head)) for (const l of item.lines) changed = add(l, { kind: "estrutura", headLine: head }) || changed;
      else if (item.lines.some(included)) changed = add(head, { kind: "estrutura", headLine: head }) || changed;
    }

    for (let i = 0; i < order.length; i++) {
      const line = order[i];
      if (included(line)) continue;
      const ref = reference(ctx, order, i, included);
      if (ref) {
        changed = add(line, ref) || changed;
        continue;
      }
      // Posição: entre duas regras já incluídas do mesmo bloco
      if (i > 0 && i < order.length - 1 && included(order[i - 1]) && included(order[i + 1])) {
        changed = add(line, { kind: "posicao", before: order[i - 1], after: order[i + 1] }) || changed;
      }
    }
  }

  const rules = Array.from(reasons.entries()).map(([line, r]) => rule(ctx, line, r));
  return makeGroup(ctx, block, rules, groupScore(Array.from(reasons.keys()), termHits, false));
}

/**
 * A regra na posição `i` retoma alguma regra já incluída?
 * - pronome sujeito no início ("Ela deve...") → retoma a regra imediatamente anterior;
 * - demonstrativo + substantivo ("esse valor") → retoma uma das regras recentes que cita o substantivo;
 * - artigo + substantivo pouco frequente no prompt ("a pergunta") → idem.
 */
function reference(ctx: Ctx, order: number[], i: number, included: (l: number) => boolean): MatchReason | undefined {
  const line = order[i];
  const words = normalize(ctx.parsed.lines[line].text).split(" ");
  const prev = order[i - 1];

  if (prev !== undefined && SUBJECT_PRONOUNS.includes(words[0]) && included(prev)) {
    return { kind: "referencia", marker: words[0], antecedentLine: prev };
  }

  const recent = order.slice(Math.max(0, i - NOMINAL_REACH), i).filter(included).reverse();
  if (!recent.length) return undefined;
  for (let w = 0; w < words.length - 1; w++) {
    const det = words[w];
    const isDem = DEMONSTRATIVES.includes(det);
    const isArt = DEFINITE_ARTICLES.includes(det);
    if (!isDem && !isArt) continue;
    const [noun] = stems(words[w + 1]);
    if (!noun) continue;
    if (isArt && ctx.df(noun) / ctx.ruleCount > ARTICLE_MAX_DF) continue;
    const antecedent = recent.find((l) => ctx.lineStems.get(l)!.some((s) => sameStem(s, noun)));
    if (antecedent !== undefined) return { kind: "referencia", marker: `${det} ${words[w + 1]}`, antecedentLine: antecedent };
  }
  return undefined;
}
