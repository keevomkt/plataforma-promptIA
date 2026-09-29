/**
 * Base de conhecimento como fonte de referência do motor.
 *
 * Os documentos são quebrados em trechos (parágrafos) e pontuados contra o
 * assunto do pedido com os mesmos critérios usados para encontrar regras no
 * prompt: termos raros pesam mais, sinônimos contam com peso menor. Também
 * extrai nomes próprios (produtos, módulos, termos) para conferir se o que
 * entra no prompt existe na base — o prompt não deve inventar produtos.
 */
import { conceptOf, normalize, sameStem, stems, truncate } from "./text";
import type { KnowledgeRef } from "./types";

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

  /** O termo aparece em algum documento? (sem diferenciar maiúsculas/acentos) */
  mentions(term: string): boolean {
    const needle = normalize(term);
    if (!needle) return false;
    return this.sources.some((s) => normalize(s.content).includes(needle) || normalize(s.title).includes(needle));
  }
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
