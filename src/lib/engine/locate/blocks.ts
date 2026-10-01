/**
 * Divide o prompt em blocos de forma determinística, só pela estrutura:
 *
 * - bloco de seção: as regras próprias de uma seção (antes das subseções);
 * - bloco de item: dentro de uma seção, um item de lista com subitens
 *   recuados, ou uma introdução terminada em ":" seguida da lista que ela
 *   apresenta ("Exemplos:", "Caso o usuário ..., como:").
 *
 * Nenhum título ou palavra do prompt é usado para decidir os blocos.
 */
import { isRuleLine, type ParsedPrompt, type PromptLine, type PromptSection } from "../parse";

export type Block = {
  id: string;
  kind: "secao" | "item";
  section: PromptSection;
  /** Linha que abre o item (só em blocos de item). */
  headLine?: number;
  /** Linhas de regra do bloco, em ordem (0-based). */
  lines: number[];
};

export type BlockMap = {
  sectionBlocks: Map<number, Block>;
  itemBlocks: Block[];
  /** Para cada linha de regra: o bloco de seção e o bloco de item mais externo, se houver. */
  of: Map<number, { section: Block; item?: Block }>;
};

/** Fim do conteúdo próprio da seção (antes da primeira subseção). */
export function ownEnd(parsed: ParsedPrompt, s: PromptSection): number {
  const child = parsed.sections.find((c) => c.parentId === s.id && c.headingLine > s.headingLine);
  return child ? child.headingLine : s.endLine;
}

const isList = (l: PromptLine) => l.kind === "bullet" || l.kind === "numbered";
const opensList = (l: PromptLine) => /:\s*$/.test(l.text);

export function buildBlocks(parsed: ParsedPrompt): BlockMap {
  const sectionBlocks = new Map<number, Block>();
  const itemBlocks: Block[] = [];
  const of = new Map<number, { section: Block; item?: Block }>();

  for (const s of parsed.sections) {
    if (s.id === 0 && s.endLine === 0) continue;
    const rules = parsed.lines.slice(s.startLine, ownEnd(parsed, s)).filter(isRuleLine);
    if (!rules.length) continue;
    const block: Block = { id: `s${s.id}`, kind: "secao", section: s, lines: rules.map((l) => l.index) };
    sectionBlocks.set(s.id, block);
    rules.forEach((l) => of.set(l.index, { section: block }));

    // Blocos de item (só os mais externos: um item dentro de outro faz parte do de fora)
    let i = 0;
    while (i < rules.length) {
      const head = rules[i];
      let j = i + 1;
      // Subitens recuados
      while (j < rules.length && rules[j].indent > head.indent) j++;
      // Introdução com ":" seguida da lista que ela apresenta (mesmo recuo ou maior)
      if (j === i + 1 && head.kind === "text" && opensList(head)) {
        while (j < rules.length && (isList(rules[j]) && rules[j].indent >= head.indent || rules[j].indent > head.indent)) j++;
      }
      if (j > i + 1) {
        const item: Block = {
          id: `i${head.index}`,
          kind: "item",
          section: s,
          headLine: head.index,
          lines: rules.slice(i, j).map((l) => l.index),
        };
        itemBlocks.push(item);
        item.lines.forEach((ln) => of.set(ln, { section: block, item }));
      }
      i = j;
    }
  }
  return { sectionBlocks, itemBlocks, of };
}
