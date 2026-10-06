/**
 * Base de conhecimento como fonte de referência do motor.
 *
 * Os documentos são quebrados em trechos (parágrafos) e pontuados contra o
 * assunto do pedido com os mesmos critérios usados para encontrar regras no
 * prompt: termos raros pesam mais, sinônimos contam com peso menor. Também
 * extrai nomes próprios (produtos, módulos, termos) para conferir se o que
 * entra no prompt existe na base — o prompt não deve inventar produtos.
 */
import { conceptOf, normalize, sameStem, splitSentences, stem, stems, stripAccents, truncate } from "./text";
import type { KnowledgeRef } from "./types";
import type { KnowledgeDocHit, KnowledgeExcerpt } from "./locate/types";

/** Assunto de uma pergunta, já separado: nomes (grafia flexível) e palavras (por radical). */
export type QuestionTopic = { phrases: string[]; words: { word: string; stem: string }[] };

const ACCENTS: Record<string, string> = { a: "[aáàâãä]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôõö]", u: "[uúùûü]", c: "[cç]", n: "[nñ]" };

/**
 * Padrão que reconhece um nome com qualquer variação de espaço, hífen,
 * maiúscula ou acento: "NG Essence", "NGEssence", "ng-essence", "NGessence".
 */
export function spellingPattern(phrase: string, opts: { splitInside?: boolean } = {}): RegExp {
  const parts = stripAccents(phrase.toLowerCase()).split(/[\s\-_]+/).filter(Boolean);
  const char = (ch: string) => ACCENTS[ch] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // splitInside: palavra digitada colada ("ngessence") também casa com a forma separada ("NG Essence")
  const part = (p: string) => Array.from(p).map(char).join(opts.splitInside ? "[\\s\\-_]?" : "");
  return new RegExp(`(?<![\\p{L}\\p{N}])${parts.map(part).join("[\\s\\-_]*")}(?![\\p{L}\\p{N}])`, "giu");
}

type Hit = { start: number; end: number; form: string; matcher: number };

export type { KnowledgeRef };

export type KnowledgeSource = {
  documentId: string;
  title: string;
  businessUnit: string;
  category: string;
  content: string;
};

type Chunk = { source: KnowledgeSource; text: string; stems: string[] };

const MAX_CHUNK = 700;

/** Parágrafos agrupados até ~700 caracteres, sem cortar no meio de um parágrafo curto. */
export function chunkText(content: string): string[] {
  const paragraphs = content
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  const out: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (p.length > MAX_CHUNK) {
      if (current) out.push(current);
      current = "";
      // Parágrafo longo: quebra por frases
      let buf = "";
      for (const s of p.split(/(?<=[.!?;])\s+/)) {
        if ((buf + " " + s).length > MAX_CHUNK && buf) {
          out.push(buf);
          buf = s;
        } else buf = buf ? `${buf} ${s}` : s;
      }
      if (buf) out.push(buf);
      continue;
    }
    if ((current + "\n" + p).length > MAX_CHUNK && current) {
      out.push(current);
      current = p;
    } else current = current ? `${current}\n${p}` : p;
  }
  if (current) out.push(current);
  return out;
}

export class KnowledgeIndex {
  private chunks: Chunk[] = [];
  private df = new Map<string, number>();

  constructor(readonly sources: KnowledgeSource[]) {
    for (const source of sources) {
      for (const text of chunkText(source.content)) {
        const s = Array.from(new Set(stems(text)));
        this.chunks.push({ source, text, stems: s });
        for (const x of s) this.df.set(x, (this.df.get(x) ?? 0) + 1);
      }
    }
  }

  get isEmpty() {
    return this.chunks.length === 0;
  }

  private weight(term: string) {
    let df = 0;
    for (const [s, n] of this.df) if (sameStem(s, term)) df += n;
    if (df === 0) return 0;
    return Math.log((this.chunks.length + 1) / (df + 0.5)) + 0.5;
  }

  /** Trechos mais relacionados ao assunto (no máximo um por documento, para variar as fontes). */
  search(topic: string[], limit = 5): KnowledgeRef[] {
    const terms = topic.filter((t) => this.weight(t) > 0 || conceptOf(t));
    if (!terms.length) return [];
    const weights = new Map(terms.map((t) => [t, this.weight(t) || 0.5]));
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);

    const scored = this.chunks
      .map((c) => {
        let got = 0;
        let exact = 0;
        for (const t of terms) {
          const w = weights.get(t)!;
          if (c.stems.some((s) => sameStem(s, t))) {
            got += w;
            exact++;
          } else {
            const concept = conceptOf(t);
            if (concept && c.stems.some((s) => conceptOf(s) === concept)) got += w * 0.5;
          }
        }
        return { c, score: got / total, exact };
      })
      .filter((x) => x.exact > 0 && x.score >= 0.35)
      .sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const out: KnowledgeRef[] = [];
    for (const { c, score } of scored) {
      if (seen.has(c.source.documentId)) continue;
      seen.add(c.source.documentId);
      out.push({
        documentId: c.source.documentId,
        title: c.source.title,
        businessUnit: c.source.businessUnit,
        category: c.source.category,
        excerpt: truncate(c.text, 420),
        score: Math.round(score * 100) / 100,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Busca para a aba "Perguntar ao prompt". Diferente de `search` (usada por
   * "Alterar prompt", que não muda): sem a lista de sinônimos, conta as
   * ocorrências no documento inteiro, traz vários trechos por documento e
   * guarda a grafia exata encontrada.
   *
   * Termo raro entre os documentos pesa mais. Termo da pergunta que nenhum
   * documento tem continua contando no total: a base só "responde" se cobre
   * o que distingue a pergunta, não só palavras comuns.
   *
   * Assunto só de palavras (sem nome), com duas ou mais: elas precisam
   * aparecer perto umas das outras — na mesma frase ou a poucas palavras de
   * distância. "preferência" num parágrafo e "contato" em outro não é
   * "preferência de contato"; "preferência do lead para o contato" é.
   */
  findForQuestion(
    topic: QuestionTopic,
    opts: {
      minScore?: number;
      maxExcerpts?: number;
      /** Termos que importam mais: os trechos mostrados saem deles quando o documento os tem. */
      focus?: string[];
    } = {}
  ): KnowledgeDocHit[] {
    const minScore = opts.minScore ?? 0.5;
    const maxExcerpts = opts.maxExcerpts ?? 3;
    const matchers = [
      // Nome de uma palavra só (≥6 letras) também casa com a forma separada ("ngessence" × "NG Essence")
      ...topic.phrases.map((p) => ({ label: p, phrase: true, re: spellingPattern(p, { splitInside: !/[\s\-_]/.test(p.trim()) && p.trim().length >= 6 }) })),
      ...topic.words.map((w) => ({ label: w.word, phrase: false, stem: w.stem })),
    ];
    if (!matchers.length || !this.sources.length) return [];
    const wordOnly = !topic.phrases.length && topic.words.length >= 2;
    const focus = new Set(opts.focus ?? []);
    const focused = (hits: Hit[]) => {
      const own = hits.filter((h) => focus.has(matchers[h.matcher].label));
      return own.length ? own : hits;
    };
    const neededNearby = topic.words.length <= 3 ? topic.words.length : Math.ceil(topic.words.length * 0.67);

    const perDoc = this.sources.map((source) => {
      const hits: Hit[] = [];
      matchers.forEach((m, k) => {
        if ("re" in m && m.re) {
          for (const x of Array.from(source.content.matchAll(m.re))) hits.push({ start: x.index!, end: x.index! + x[0].length, form: x[0], matcher: k });
        } else {
          for (const x of Array.from(source.content.matchAll(/[\p{L}\p{N}]+/gu))) {
            if (stem(x[0]) === (m as { stem: string }).stem) hits.push({ start: x.index!, end: x.index! + x[0].length, form: x[0], matcher: k });
          }
        }
      });
      return { source, hits: wordOnly ? nearbyHits(source.content, hits, neededNearby) : hits };
    });

    const n = this.sources.length;
    const df = matchers.map((_, k) => perDoc.filter((d) => d.hits.some((h) => h.matcher === k)).length);
    const weight = df.map((d) => Math.log((n + 1) / (d + 0.5)) + 0.5);
    const total = weight.reduce((a, b) => a + b, 0);
    const phraseIdx = matchers.map((m, k) => (m.phrase ? k : -1)).filter((k) => k >= 0);

    const out: KnowledgeDocHit[] = [];
    for (const { source, hits } of perDoc) {
      const present = new Set(hits.map((h) => h.matcher));
      if (phraseIdx.length && !phraseIdx.some((k) => present.has(k))) continue;
      const score = Array.from(present).reduce((a, k) => a + weight[k], 0) / total;
      if (score < minScore) continue;
      const counted = hits.filter((h) => (phraseIdx.length ? matchers[h.matcher].phrase : true));
      const forms: Record<string, number> = {};
      for (const h of counted) forms[h.form] = (forms[h.form] ?? 0) + 1;
      const counts: Record<string, number> = {};
      for (const k of Array.from(new Set(counted.map((h) => h.matcher))).sort((a, b) => a - b)) {
        counts[matchers[k].label] = counted.filter((h) => h.matcher === k).length;
      }
      const itemForms: Record<string, string[]> = {};
      for (const label of Object.keys(counts)) {
        const k = matchers.findIndex((m) => m.label === label);
        itemForms[label] = Array.from(new Set(counted.filter((h) => h.matcher === k).map((h) => h.form)));
      }
      out.push({
        documentId: source.documentId,
        title: source.title,
        businessUnit: source.businessUnit,
        occurrences: counted.length,
        forms,
        counts,
        itemForms,
        matched: Array.from(present).map((k) => matchers[k].label),
        excerpts: excerptsFor(source.content, focused(hits), maxExcerpts),
        score: Math.round(score * 100) / 100,
      });
    }
    return out.sort((a, b) => b.score - a.score || b.occurrences - a.occurrences);
  }

  /** O termo aparece em algum documento? (sem diferenciar maiúsculas/acentos) */
  mentions(term: string): boolean {
    const needle = normalize(term);
    if (!needle) return false;
    return this.sources.some((s) => normalize(s.content).includes(needle) || normalize(s.title).includes(needle));
  }
}

const MAX_EXCERPT = 320;
/** "Perto": na mesma frase, ou a até tantas palavras de distância (frases quebradas por lista, tabela...). */
const NEARBY_WORDS = 8;

/**
 * Só as ocorrências que aparecem perto de outras palavras da pergunta: ao
 * menos `needed` palavras diferentes na mesma frase ou a até NEARBY_WORDS
 * palavras de distância. Palavras soltas em pontos distantes não contam.
 */
function nearbyHits(content: string, hits: Hit[], needed: number): Hit[] {
  if (hits.length < needed) return [];
  const tokenStarts = Array.from(content.matchAll(/[\p{L}\p{N}]+/gu)).map((m) => m.index!);
  const tokenAt = (pos: number) => {
    let lo = 0;
    let hi = tokenStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tokenStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const sentences = sentenceSpans(content);
  const sentenceAt = (pos: number) => sentences.findIndex((s) => pos >= s.start && pos < s.end);
  const info = hits.map((h) => ({ h, token: tokenAt(h.start), sentence: sentenceAt(h.start) }));
  const keep = new Set<Hit>();
  for (const a of info) {
    const near = info.filter((b) => (a.sentence >= 0 && b.sentence === a.sentence) || Math.abs(b.token - a.token) <= NEARBY_WORDS);
    if (new Set(near.map((b) => b.h.matcher)).size >= needed) near.forEach((b) => keep.add(b.h));
  }
  return hits.filter((h) => keep.has(h));
}

/** Frases do documento com a posição de cada uma no texto. */
function sentenceSpans(content: string): { start: number; end: number; text: string }[] {
  const sentences: { start: number; end: number; text: string }[] = [];
  let offset = 0;
  for (const line of content.split("\n")) {
    let pos = 0;
    for (const s of splitSentences(line)) {
      const at = line.indexOf(s, pos);
      if (s.trim()) sentences.push({ start: offset + at, end: offset + at + s.length, text: s });
      pos = at + s.length;
    }
    offset += line.length + 1;
  }
  return sentences;
}

/**
 * Frases literais do documento onde o assunto aparece: as que reúnem mais
 * termos da pergunta primeiro, mostradas na ordem do documento.
 */
function excerptsFor(content: string, hits: Hit[], max: number): KnowledgeExcerpt[] {
  const sentences = sentenceSpans(content);
  const scored = sentences
    .map((s, i) => {
      const inside = hits.filter((h) => h.start >= s.start && h.end <= s.end);
      return { s, i, inside, distinct: new Set(inside.map((h) => h.matcher)).size };
    })
    .filter((x) => x.inside.length);
  return scored
    .sort((a, b) => b.distinct - a.distinct || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(({ s, inside }) => {
      let text = s.text.trim().replace(/\s+/g, " ");
      if (text.length > MAX_EXCERPT) {
        const first = inside[0].start - s.start;
        const from = Math.max(0, first - 120);
        text = `${from > 0 ? "…" : ""}${s.text.slice(from, from + MAX_EXCERPT).trim()}…`;
      }
      return { text, forms: Array.from(new Set(inside.map((h) => h.form))) };
    });
}

/**
 * Nomes próprios citados em textos novos (regras adicionadas/alteradas) que
 * não existem nem no prompt atual nem na base de conhecimento — sinal de
 * que a alteração pode estar inventando um produto ou termo.
 */
export function findUnsourcedNames(newTexts: string[], promptContent: string, kb: KnowledgeIndex): string[] {
  const promptNorm = normalize(promptContent);
  const names = Array.from(new Set(newTexts.flatMap(properNames)));
  return names.filter((name) => !promptNorm.includes(normalize(name)) && !kb.mentions(name));
}

/**
 * Nomes próprios de um trecho: palavras com maiúscula no meio ("eKeep"),
 * siglas seguidas de nome ("NG Folha") e sequências de palavras
 * capitalizadas fora do início de frase ("Keevo People").
 */
export function properNames(text: string): string[] {
  const out = new Set<string>();
  (text.match(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g) ?? []).forEach((m) => out.add(m));
  (text.match(/\b[A-Z]{2,6}(?:\s[A-Z][a-zà-ÿ]+)+\b/g) ?? []).forEach((m) => out.add(m));
  const re = /(?<![.!?:]\s|^|\n|["“(]\s?)\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ÿ]+(?:\s(?:de|da|do|dos|das|e)?\s?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zà-ÿ]+)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1].replace(/\s+/g, " ").trim());
  return Array.from(out).filter((n) => n.length >= 3);
}
