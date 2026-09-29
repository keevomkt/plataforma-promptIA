/**
 * Localiza no prompt as regras relacionadas ao assunto do pedido.
 *
 * Cada frase de cada regra vira uma "unidade". A pontuação de uma unidade é
 * a fração do assunto que ela cobre, com peso maior para termos raros no
 * prompt (ex: "CNPJ", "eKeep") do que para termos que aparecem em toda
 * parte (ex: "cliente"). Sinônimos do mesmo grupo contam com peso menor.
 */
import { isRuleLine, sectionLabel, type ParsedPrompt, type PromptSection } from "./parse";
import { conceptOf, sameStem, splitSentences, stems } from "./text";

export type Unit = {
  line: number;
  sentenceIndex: number;
  sentenceCount: number;
  sentence: string;
  sectionId: number;
  stems: string[];
};

export type UnitMatch = Unit & { score: number; matched: number; hasAnchor: boolean };

export class PromptIndex {
  readonly units: Unit[];
  private df = new Map<string, number>();

  constructor(readonly parsed: ParsedPrompt) {
    this.units = [];
    for (const line of parsed.lines) {
      if (!isRuleLine(line)) continue;
      const sentences = splitSentences(line.text);
      sentences.forEach((sentence, i) => {
        this.units.push({
          line: line.index,
          sentenceIndex: i,
          sentenceCount: sentences.length,
          sentence,
          sectionId: line.sectionId,
          stems: Array.from(new Set(stems(sentence))),
        });
      });
    }
    for (const u of this.units) {
      for (const s of u.stems) this.df.set(s, (this.df.get(s) ?? 0) + 1);
    }
  }

  /** Em quantas unidades o termo aparece (por radical parecido). */
  docFreq(term: string): number {
    let total = 0;
    for (const [s, n] of this.df) if (sameStem(s, term)) total += n;
    return total;
  }

  weight(term: string): number {
    const n = this.units.length || 1;
    const df = this.docFreq(term);
    if (df === 0) return 0.8; // termo ausente: ainda pode casar por sinônimo
    return Math.log((n + 1) / (df + 0.5)) + 0.5;
  }

  /**
   * Termos distintivos do assunto: existem no prompt, são raros nele e
   * estão entre os mais raros do próprio pedido (em "quantidade de CNPJs",
   * o termo distintivo é "CNPJ", não "quantidade").
   */
  anchors(topic: string[]): string[] {
    const n = this.units.length || 1;
    const candidates = topic
      .map((t) => ({ t, df: this.docFreq(t) }))
      .filter((c) => c.df > 0 && c.df / n <= 0.2 && !isGeneric(c.t));
    if (!candidates.length) return [];
    const min = Math.min(...candidates.map((c) => c.df));
    const limit = Math.floor(min * 1.25);
    return candidates.filter((c) => c.df <= limit).map((c) => c.t);
  }

  scoreUnit(unit: Unit, topic: string[], anchors: string[]): UnitMatch {
    let got = 0;
    let total = 0;
    let matched = 0;
    for (const t of topic) {
      const w = this.weight(t);
      total += w;
      if (unit.stems.some((s) => sameStem(s, t))) {
        got += w;
        matched++;
        continue;
      }
      const c = conceptOf(t);
      if (c && unit.stems.some((s) => conceptOf(s) === c)) {
        got += w * 0.6;
        matched += 0.6;
      }
    }
    const hasAnchor = anchors.some((a) => unit.stems.some((s) => sameStem(s, a)));
    return { ...unit, score: total ? got / total : 0, matched, hasAnchor };
  }

  /**
   * Classifica as unidades em "principais" (tratam diretamente do assunto)
   * e "relacionadas" (citam o assunto, mas tratam de outra coisa — são as
   * dependências que precisam ser verificadas).
   */
  find(topic: string[], restrictTo?: PromptSection[]) {
    const anchors = this.anchors(topic);
    const presentTopic = topic.filter((t) => this.docFreq(t) > 0 || conceptOf(t));
    const needed = Math.max(1, Math.ceil(presentTopic.length * 0.67 - 1e-9));

    const inScope = (u: Unit) =>
      !restrictTo || restrictTo.some((s) => (u.line >= s.startLine && u.line < s.endLine) || u.line === s.headingLine);

    const scored = this.units.map((u) => this.scoreUnit(u, topic, anchors)).filter((m) => m.score > 0);
    scored.sort((a, b) => b.score - a.score || a.line - b.line);

    let primary = scored.filter(
      (m) => m.score >= 0.7 && m.matched >= needed - 0.4 && (anchors.length === 0 || m.hasAnchor)
    );
    if (primary.length === 0 && scored.length && scored[0].score >= 0.5) {
      const best = scored[0].score;
      primary = scored.filter((m) => m.score >= best - 0.05 && (anchors.length === 0 || m.hasAnchor));
    }
    const primaryKeys = new Set(primary.map(key));
    const related = scored.filter(
      (m) => !primaryKeys.has(key(m)) && (anchors.length ? m.hasAnchor : m.score >= 0.45)
    );

    return {
      anchors,
      primary: primary.filter(inScope),
      primaryOutOfScope: primary.filter((m) => !inScope(m)),
      related,
    };
  }

  /** Seções cujo título (ou caminho) cita um termo distintivo do assunto — ex: "eKeep". */
  sectionsNamedBy(topic: string[]): PromptSection[] {
    const anchors = this.anchors(topic).concat(topic.filter((t) => this.docFreq(t) === 0));
    return this.parsed.sections.filter((s) => {
      if (s.id === 0) return false;
      const titleStems = stems(s.title);
      return anchors.some((a) => titleStems.some((t) => sameStem(t, a)));
    });
  }

  /** Seção que melhor corresponde a um trecho de escopo ("fluxo geral de não clientes"). */
  resolveScope(scopeText: string): PromptSection | undefined {
    const scopeStems = stems(scopeText).filter((s) => !["secao", "etapa", "part", "bloco", "topico"].includes(s));
    if (!scopeStems.length) return undefined;
    let best: { section: PromptSection; score: number } | undefined;
    for (const section of this.parsed.sections) {
      if (section.id === 0) continue;
      const pathStems = stems(section.path.join(" "));
      const titleStems = stems(section.title);
      const hit = scopeStems.filter((s) => pathStems.some((p) => sameStem(p, s))).length;
      const titleHit = scopeStems.filter((s) => titleStems.some((p) => sameStem(p, s))).length;
      // Cobertura do escopo pelo caminho, desempate por título mais específico
      const score = hit / scopeStems.length + titleHit * 0.01 - pathStems.length * 0.001;
      if (!best || score > best.score) best = { section, score };
    }
    return best && best.score >= 0.5 ? best.section : undefined;
  }

  sectionByTitle(title: string): PromptSection | undefined {
    return this.parsed.sections.find((s) => s.title === title || sectionLabel(s) === title);
  }

  /** Seção mais adequada para receber uma regra sobre os termos informados. */
  bestSectionFor(terms: string[], preferTitle?: RegExp): PromptSection | undefined {
    const sections = this.parsed.sections.filter((s) => s.id !== 0 || s.endLine > 0);
    if (preferTitle) {
      const byTitle = sections.filter((s) => preferTitle.test(normalizeTitle(s.title)));
      // Prefere a subseção mais específica
      byTitle.sort((a, b) => b.level - a.level);
      if (byTitle.length) return byTitle[0];
    }
    if (!terms.length) return undefined;
    const scores = new Map<number, number>();
    for (const u of this.units) {
      const m = this.scoreUnit(u, terms, []);
      scores.set(u.sectionId, (scores.get(u.sectionId) ?? 0) + m.score);
    }
    let best: PromptSection | undefined;
    let bestScore = 0;
    for (const s of sections) {
      const titleStems = stems(s.title);
      const titleScore = terms.filter((t) => titleStems.some((x) => sameStem(x, t))).length * 1.5;
      const total = (scores.get(s.id) ?? 0) + titleScore;
      if (total > bestScore) {
        best = s;
        bestScore = total;
      }
    }
    return best;
  }
}

/**
 * Palavras que qualificam o assunto mas não o identificam ("quantidade de
 * CNPJs": o assunto é CNPJ). Nunca viram termo distintivo.
 */
const GENERIC = [
  "quantidad", "quant", "numer", "tip", "informac", "dad", "utiliz", "usa", "usar", "possu", "atual", "hoje",
  "algum", "outr", "divers", "cad", "part", "form", "vez", "cas", "tod", "faz", "fac", "ter", "tenh", "pod",
  "dev", "precis", "sobr", "aproximad", "exat", "princip", "geral", "nov",
];

function isGeneric(stem: string) {
  return GENERIC.some((g) => stem === g || (g.length >= 5 && stem.startsWith(g)));
}

function normalizeTitle(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function key(u: { line: number; sentenceIndex: number }) {
  return `${u.line}:${u.sentenceIndex}`;
}
