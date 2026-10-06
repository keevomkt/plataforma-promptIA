/**
 * Itens nomeados no prompt (produtos, soluções, planos...) para perguntas de
 * FATO, sem nenhuma lista de nomes no código. Sinais, todos tirados do prompt:
 *
 * - seção própria: seções irmãs com a mesma estrutura de subseções (cada
 *   uma descreve um item), ou seção cujo título é um nome que o texto usa;
 * - item de lista apresentada por ":" ("Caso ..., como:");
 * - nome com cara de nome próprio: maiúscula no meio da frase em todas as
 *   ocorrências, sigla + nome, ou maiúscula no meio da palavra;
 * - contexto de apresentação: "X é...", "apresente o X".
 *
 * Confiança alta exige sinais combinados; um sinal sozinho fica como baixa
 * confiança — mostrado na tela, nunca escondido.
 */
import { isRuleLine, type ParsedPrompt, type PromptSection } from "../parse";
import { normalize } from "../text";
import { properNames } from "../knowledge";
import { buildBlocks } from "./blocks";
import { DEFINITION_AFTER_NAME, LEXICON_VERSION, NAME_CONNECTORS, PRESENTING_VERBS } from "./lexicon";
import type { FactResult, NamedItem } from "./types";

const MAX_LIST_ITEM_WORDS = 5;
/** Linha curta demais ("NG Folha" sozinho na subseção Nome) não serve de contexto. */
const MIN_CONTEXT_WORDS = 6;

type Candidate = {
  name: string;
  signals: Set<string>;
  section?: PromptSection;
  parallel?: boolean;
  listItem?: { line: number; head: number };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function extractNamedItems(parsed: ParsedPrompt, question: string): FactResult {
  const stats = capitalizationStats(parsed);
  const phrase = phraseStats(parsed);
  const tokens = new Set(parsed.lines.filter((l) => l.kind === "heading" || isRuleLine(l)).flatMap((l) => stripUrls(l.text).match(/[\p{L}\p{N}]+/gu) ?? []));
  const candidates = new Map<string, Candidate>();
  const get = (name: string) => {
    const key = normalize(name);
    if (!candidates.has(key)) candidates.set(key, { name, signals: new Set() });
    return candidates.get(key)!;
  };
  const occurrences = (name: string) => linesWith(parsed, name);

  // 1. Seções irmãs com a mesma estrutura de subseções
  for (const parent of parsed.sections) {
    const kids = parsed.sections.filter((s) => s.parentId === parent.id && s.id !== 0);
    const subtitles = new Map(kids.map((k) => [k.id, new Set(parsed.sections.filter((c) => c.parentId === k.id).map((c) => normalize(c.title)))]));
    const parallel = kids.filter((k) => kids.some((o) => o.id !== k.id && Array.from(subtitles.get(k.id)!).some((t) => subtitles.get(o.id)!.has(t))));
    if (parallel.length < 2) continue;
    const shared = Array.from(subtitles.get(parallel[0].id)!).filter((t) => parallel.some((o) => o.id !== parallel[0].id && subtitles.get(o.id)!.has(t)));
    const sharedLabel = parsed.sections.filter((s) => s.parentId === parallel[0].id && shared.includes(normalize(s.title))).map((s) => s.title);
    for (const k of kids) {
      const c = get(k.title);
      c.section = k;
      c.signals.add(`seção própria (L${k.headingLine + 1})`);
      if (parallel.includes(k)) {
        c.parallel = true;
        c.signals.add(`seções irmãs com a mesma estrutura (${sharedLabel.slice(0, 3).join(", ")})`);
      } else {
        c.signals.add(`seção irmã de ${parallel.map((p) => p.title).slice(0, 2).join(", ")}`);
      }
    }
  }

  // 2. Seções cujo título é um nome que o prompt define ou apresenta ("O X é...", "Apresente o X").
  //    Título citado só como referência ("conforme as X", “seção "X"”) não é item.
  for (const s of parsed.sections) {
    if (s.id === 0 || candidates.has(normalize(s.title))) continue;
    if (!isStrongName(s.title, stats, phrase)) continue;
    const presented = occurrences(s.title).find((l) => l !== s.headingLine && inPresentingContext(parsed.lines[l].text, s.title));
    if (presented === undefined) continue;
    const c = get(s.title);
    c.section = s;
    c.signals.add(`seção própria (L${s.headingLine + 1})`);
  }

  // 3. Itens de lista apresentada por ":"
  const blocks = buildBlocks(parsed);
  for (const item of blocks.itemBlocks) {
    if (item.headLine === undefined || !/:\s*$/.test(parsed.lines[item.headLine].text)) continue;
    for (const line of item.lines) {
      if (line === item.headLine) continue;
      const l = parsed.lines[line];
      if (l.kind !== "bullet" && l.kind !== "numbered") continue;
      const text = l.text.trim().replace(/[;,.]+$/, "");
      if (!looksLikeName(text)) continue;
      const c = get(text);
      c.listItem ??= { line, head: item.headLine };
      c.signals.add(`item da lista “${truncateWords(parsed.lines[item.headLine].text, 8)}” (L${line + 1})`);
    }
  }

  // 4. Nomes próprios repetidos no texto
  const nameLines = new Map<string, { name: string; lines: Set<number> }>();
  for (const l of parsed.lines) {
    if (!isRuleLine(l)) continue;
    for (const n of properNames(stripUrls(l.text))) {
      const key = normalize(n);
      if (!nameLines.has(key)) nameLines.set(key, { name: n, lines: new Set() });
      nameLines.get(key)!.lines.add(l.index);
    }
  }
  for (const { name, lines } of nameLines.values()) {
    if (lines.size < 2) continue;
    get(name).signals.add(`nome repetido em ${lines.size} linhas`);
  }

  // Monta os itens
  const items: NamedItem[] = [];
  for (const c of candidates.values()) {
    const lines = occurrences(c.name);
    if (!lines.length) continue;
    const strong = isStrongName(c.name, stats, phrase);
    if (strong) c.signals.add("escrito como nome próprio em todas as ocorrências");
    const definition = lines.find((ln) => inPresentingContext(parsed.lines[ln].text, c.name));
    if (definition !== undefined) c.signals.add(`contexto de apresentação (L${definition + 1})`);
    const structural = !!c.section || !!c.listItem || definition !== undefined;
    const acronym = expandsAcronym(c.name, tokens);
    if (acronym) c.signals.add(`é a sigla “${acronym}” por extenso, usada no prompt (termo genérico, não nome de marca)`);
    const confidence = c.parallel || (strong && structural && !acronym) ? "alta" : "baixa";
    items.push({
      name: c.name,
      tier: c.section ? "secao" : "citado",
      confidence,
      signals: Array.from(c.signals),
      lines,
      headingLine: c.section?.headingLine,
      context: contextFor(parsed, c, lines),
      listHead: c.listItem?.head,
    });
  }

  // Fragmento: nome que só aparece dentro de nomes maiores ("People" em "Keevo People") não é item próprio
  const kept = items.filter((it) => {
    const longer = items.filter((o) => o !== it && o.name.length > it.name.length && phraseContains(o.name, it.name));
    if (!longer.length || it.tier === "secao") return true;
    const own = phrase(it.name).total;
    const inside = longer.reduce((n, o) => n + phrase(o.name).total, 0);
    return own > inside;
  });

  const withSection = kept.filter((i) => i.tier === "secao").sort((a, b) => (a.headingLine ?? 0) - (b.headingLine ?? 0));
  const cited = kept
    .filter((i) => i.tier === "citado")
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "alta" ? -1 : 1) || b.lines.length - a.lines.length);
  return { question, withSection, cited, lexiconVersion: LEXICON_VERSION };
}

// ---------------------------------------------------------------------------

type CapStats = Map<string, { capMid: number; lower: number }>;

const stripUrls = (s: string) => s.replace(/https?:\/\/\S+|\S+\.(md|pdf|docx?|txt|csv|json)\b/gi, " ");

/** Para cada palavra: quantas vezes aparece com maiúscula no meio da frase e quantas em minúscula. */
function capitalizationStats(parsed: ParsedPrompt): CapStats {
  const stats: CapStats = new Map();
  for (const l of parsed.lines) {
    if (!isRuleLine(l)) continue;
    const text = stripUrls(l.text);
    const re = /[\p{L}\p{N}]+/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const word = m[0];
      const before = text.slice(0, m.index).trimEnd();
      const sentenceStart = before === "" || /[.!?:;"“(\-–]$/.test(before);
      const key = word.toLowerCase();
      const s = stats.get(key) ?? { capMid: 0, lower: 0 };
      if (/^\p{Lu}/u.test(word)) {
        if (!sentenceStart) s.capMid++;
      } else if (!/\p{Lu}/u.test(word)) s.lower++;
      stats.set(key, s);
    }
  }
  return stats;
}

const isAcronym = (t: string) => /^[\p{Lu}\d]{2,6}$/u.test(t);
const isMixedCase = (t: string) => /^\p{Ll}+\p{Lu}/u.test(t) || /^\p{Lu}{2,}\p{Ll}/u.test(t);
const isCapitalized = (t: string) => /^\p{Lu}/u.test(t) || isMixedCase(t);
const contentTokens = (name: string) => name.split(/\s+/).filter((t) => t && !NAME_CONNECTORS.includes(t.toLowerCase()));

/**
 * Nome próprio de fato:
 * - uma palavra: maiúscula no meio da palavra, ou nunca escrita em minúscula no prompt;
 * - várias palavras: a expressão inteira sempre escrita com maiúsculas, e ao menos uma
 *   palavra que só existe como nome (sigla, maiúscula no meio, ou nunca em minúscula).
 *   "Alpha Emissor" passa mesmo com "sistema emissor" no texto; "Regras de X" não passa.
 */
function isStrongName(name: string, stats: CapStats, phrase: PhraseStats): boolean {
  const content = contentTokens(name);
  if (!content.length) return false;
  const wordIsName = (t: string) => {
    if (isMixedCase(t) || isAcronym(t)) return true;
    const s = stats.get(t.toLowerCase());
    return !!s && s.capMid >= 1 && s.lower === 0;
  };
  if (content.length === 1) return isMixedCase(content[0]) || (!isAcronym(content[0]) && wordIsName(content[0]));
  const p = phrase(name);
  return p.total >= 1 && p.exact === p.total && content.some(wordIsName);
}

type PhraseStats = (name: string) => { exact: number; total: number };

/** Quantas vezes a expressão aparece nas regras, e quantas com exatamente esta grafia. */
function phraseStats(parsed: ParsedPrompt): PhraseStats {
  const texts = parsed.lines.filter(isRuleLine).map((l) => stripUrls(l.text));
  const cache = new Map<string, { exact: number; total: number }>();
  return (name) => {
    if (!cache.has(name)) {
      const any = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, "giu");
      const exact = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, "gu");
      cache.set(name, {
        total: texts.reduce((n, t) => n + (t.match(any)?.length ?? 0), 0),
        exact: texts.reduce((n, t) => n + (t.match(exact)?.length ?? 0), 0),
      });
    }
    return cache.get(name)!;
  };
}

/** Item de lista que parece nome: curto, sem frase nem marcação, e toda palavra de conteúdo com inicial maiúscula. */
function looksLikeName(text: string): boolean {
  if (!text || /[:?!\[\]"“”(]/.test(text) || /\.(md|pdf|docx?|txt|csv|json)$/i.test(text) || /https?:/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > MAX_LIST_ITEM_WORDS) return false;
  return contentTokens(text).every(isCapitalized);
}

/** Linhas (títulos e regras) em que o nome aparece, como palavra inteira e com a mesma grafia. */
function linesWith(parsed: ParsedPrompt, name: string): number[] {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, "u");
  return parsed.lines.filter((l) => (l.kind === "heading" || isRuleLine(l)) && re.test(stripUrls(l.raw))).map((l) => l.index);
}

function inPresentingContext(text: string, name: string): boolean {
  const n = escapeRe(name);
  const after = new RegExp(`${n}\\s+(${DEFINITION_AFTER_NAME.map(escapeRe).join("|")})\\b`, "iu");
  const before = new RegExp(`\\b(${PRESENTING_VERBS.map(escapeRe).join("|")})\\s+(?:o|a|os|as)?\\s*${n}`, "iu");
  return after.test(text) || before.test(text);
}

/** Trecho literal de contexto: a primeira regra da seção que cita o nome, ou a linha da lista com sua introdução. */
function contextFor(parsed: ParsedPrompt, c: Candidate, lines: number[]): NamedItem["context"] {
  const rule = (ln: number) => ({ line: ln, text: parsed.lines[ln].text });
  if (c.section) {
    const inside = parsed.lines.filter((l) => l.index > c.section!.headingLine && l.index < c.section!.endLine && isRuleLine(l));
    const sentence = (l: { text: string }) => l.text.split(/\s+/).length >= MIN_CONTEXT_WORDS;
    // Frase que define/apresenta o item; senão a primeira frase de verdade que o cita; senão a primeira frase da seção
    const best =
      inside.find((l) => inPresentingContext(l.text, c.name)) ??
      inside.find((l) => lines.includes(l.index) && sentence(l)) ??
      inside.find(sentence) ??
      inside[0];
    return best ? rule(best.index) : undefined;
  }
  if (c.listItem) return { ...rule(c.listItem.line), intro: rule(c.listItem.head) };
  const first = lines.find((ln) => isRuleLine(parsed.lines[ln]));
  return first !== undefined ? rule(first) : undefined;
}

/**
 * Expressão por extenso de uma sigla que o prompt também usa ("Recursos Humanos" × "RH"):
 * só para nomes de palavras comuns com maiúscula (sem sigla nem maiúscula no meio).
 */
function expandsAcronym(name: string, tokens: Set<string>): string | undefined {
  const content = contentTokens(name);
  if (content.length < 2 || content.some((t) => isAcronym(t) || isMixedCase(t))) return undefined;
  const initials = content.map((t) => t[0].toUpperCase()).join("");
  return tokens.has(initials) ? initials : undefined;
}

function phraseContains(longer: string, shorter: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(shorter)}($|[^\\p{L}\\p{N}])`, "u").test(longer);
}

function truncateWords(s: string, n: number) {
  const w = s.split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : s;
}
