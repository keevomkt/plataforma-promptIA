/**
 * Leitura estrutural do prompt (seção 15 da especificação): identifica
 * títulos, subtítulos, listas, regras, blocos e seções.
 *
 * O resultado é derivado — nunca é salvo nem substitui o texto. O prompt
 * continua sendo mantido exatamente como foi importado; esta estrutura só
 * serve para navegar, localizar regras e analisar alterações.
 */

export type LineKind = "heading" | "bullet" | "numbered" | "text" | "blank" | "separator" | "code";

export type PromptLine = {
  index: number; // 0-based
  raw: string; // linha original, sem o terminador
  kind: LineKind;
  /** Texto sem marcador de lista/título. */
  text: string;
  /** Marcador original da lista ("- ", "* ", "1. ", "a) "...), quando houver. */
  marker?: string;
  /** Recuo (espaços à esquerda). */
  indent: number;
  /** Número do item em listas numeradas. */
  number?: number;
  sectionId: number;
};

export type PromptSection = {
  id: number;
  title: string;
  level: number; // 1 = mais alto
  headingLine: number; // -1 para o bloco inicial sem título
  startLine: number; // primeira linha de conteúdo
  endLine: number; // exclusivo; inclui subseções
  parentId: number | null;
  path: string[]; // títulos desde a raiz
};

export type ParsedPrompt = {
  lines: PromptLine[];
  sections: PromptSection[];
  eol: "\n" | "\r\n";
  trailingNewline: boolean;
};

export const PREAMBLE_TITLE = "Início do prompt (antes do primeiro título)";

const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BOLD_HEADING = /^\s*\*\*([^*]{2,80})\*\*\s*:?\s*$/;
const BULLET = /^(\s*)([-*•+–]\s+)(.*)$/;
const NUMBERED = /^(\s*)((\d{1,3})([.)])\s+)(.*)$/;
const LETTERED = /^(\s*)(([a-z])\)\s+)(.*)$/;
const SEPARATOR = /^\s*([-=_*]\s*){3,}$/;

function isCapsHeading(line: string): boolean {
  const t = line.trim().replace(/:$/, "");
  if (t.length < 4 || t.length > 80) return false;
  if (/[.!?]$/.test(t)) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length >= 0.85;
}

export function splitLines(content: string): { lines: string[]; eol: "\n" | "\r\n"; trailingNewline: boolean } {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(content);
  const body = trailingNewline ? content.replace(/\r?\n$/, "") : content;
  return { lines: body.split(/\r?\n/), eol, trailingNewline };
}

export function joinLines(lines: string[], eol: "\n" | "\r\n", trailingNewline: boolean): string {
  return lines.join(eol) + (trailingNewline ? eol : "");
}

export function parsePrompt(content: string): ParsedPrompt {
  const { lines: rawLines, eol, trailingNewline } = splitLines(content);
  const hasMarkdownHeadings = rawLines.some((l) => MD_HEADING.test(l));

  const sections: PromptSection[] = [
    { id: 0, title: PREAMBLE_TITLE, level: 0, headingLine: -1, startLine: 0, endLine: rawLines.length, parentId: null, path: [] },
  ];
  const stack: PromptSection[] = [sections[0]];
  const lines: PromptLine[] = [];
  let inCode = false;

  const openSection = (title: string, level: number, lineIndex: number) => {
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop()!.endLine = lineIndex;
    }
    const parent = stack[stack.length - 1];
    const section: PromptSection = {
      id: sections.length,
      title,
      level,
      headingLine: lineIndex,
      startLine: lineIndex + 1,
      endLine: rawLines.length,
      parentId: parent.id,
      path: [...parent.path, title],
    };
    sections.push(section);
    stack.push(section);
    return section;
  };

  rawLines.forEach((raw, index) => {
    const indent = raw.length - raw.trimStart().length;
    const base = { index, raw, indent };

    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      lines.push({ ...base, kind: "code", text: raw.trim(), sectionId: stack[stack.length - 1].id });
      return;
    }
    if (inCode) {
      lines.push({ ...base, kind: "code", text: raw, sectionId: stack[stack.length - 1].id });
      return;
    }
    if (!raw.trim()) {
      lines.push({ ...base, kind: "blank", text: "", sectionId: stack[stack.length - 1].id });
      return;
    }

    // Títulos markdown (#, ##...). Sem markdown, linhas em CAIXA ALTA ou só
    // em **negrito** também são tratadas como títulos (prompts em .txt).
    const md = MD_HEADING.exec(raw);
    const bold = !md ? BOLD_HEADING.exec(raw) : null;
    const caps = !md && !bold && indent === 0 && isCapsHeading(raw);
    // Setext: "Título" seguido de "====" ou "----"
    const nextLine = rawLines[index + 1] ?? "";
    // Item de lista seguido de "---" é lista + separador, não título
    const isListItem = BULLET.test(raw) || NUMBERED.test(raw) || LETTERED.test(raw);
    const setext =
      !md && !bold && !caps && !isListItem && indent === 0 && /^\s*(=+|-{3,})\s*$/.test(nextLine) && raw.trim().length <= 80;

    if (md || bold || caps || setext) {
      let level: number;
      let title: string;
      if (md) {
        level = md[1].length;
        title = md[2].trim();
      } else if (bold) {
        level = hasMarkdownHeadings ? 6 : 3;
        title = bold[1].trim();
      } else if (setext) {
        level = nextLine.trim().startsWith("=") ? 1 : 2;
        title = raw.trim();
      } else {
        level = hasMarkdownHeadings ? 5 : 2;
        title = raw.trim().replace(/:$/, "");
      }
      const section = openSection(title, level, index);
      lines.push({ ...base, kind: "heading", text: title, sectionId: section.id });
      return;
    }

    if (SEPARATOR.test(raw)) {
      lines.push({ ...base, kind: "separator", text: "", sectionId: stack[stack.length - 1].id });
      return;
    }

    const sectionId = stack[stack.length - 1].id;
    const num = NUMBERED.exec(raw);
    if (num) {
      lines.push({ ...base, kind: "numbered", marker: num[2], number: Number(num[3]), text: num[5].trim(), sectionId });
      return;
    }
    const letter = LETTERED.exec(raw);
    if (letter) {
      lines.push({ ...base, kind: "numbered", marker: letter[2], text: letter[4].trim(), sectionId });
      return;
    }
    const bullet = BULLET.exec(raw);
    if (bullet) {
      lines.push({ ...base, kind: "bullet", marker: bullet[2], text: bullet[3].trim(), sectionId });
      return;
    }
    lines.push({ ...base, kind: "text", text: raw.trim(), sectionId });
  });

  // Fecha seções ainda abertas
  while (stack.length > 1) stack.pop()!.endLine = rawLines.length;

  // Remove o bloco inicial se ele não tiver conteúdo
  const preambleHasContent = lines.some((l) => l.sectionId === 0 && l.kind !== "blank");
  if (!preambleHasContent && sections.length > 1) {
    sections[0].endLine = 0;
  } else {
    const firstHeading = sections[1]?.headingLine ?? rawLines.length;
    sections[0].endLine = firstHeading;
  }

  return { lines, sections, eol, trailingNewline };
}

/** É uma linha com conteúdo de regra (não título, não vazia)? */
export function isRuleLine(line: PromptLine): boolean {
  return line.kind === "bullet" || line.kind === "numbered" || line.kind === "text";
}

export function sectionOf(parsed: ParsedPrompt, lineIndex: number): PromptSection {
  const line = parsed.lines[lineIndex];
  return parsed.sections[line?.sectionId ?? 0];
}

/** Rótulo curto da seção, com o caminho quando ela é subseção ("Produtos › eKeep"). */
export function sectionLabel(section: PromptSection): string {
  if (section.path.length === 0) return section.title;
  return section.path.slice(-2).join(" › ");
}

/** Seções visíveis (exclui o preâmbulo vazio). */
export function visibleSections(parsed: ParsedPrompt): PromptSection[] {
  return parsed.sections.filter((s) => s.id !== 0 || s.endLine > 0);
}

/** Resumo estrutural exibido após importar/abrir o prompt. */
export function structureSummary(parsed: ParsedPrompt) {
  const count = (k: LineKind) => parsed.lines.filter((l) => l.kind === k).length;
  const headings = parsed.sections.filter((s) => s.id !== 0);
  const topLevel = headings.length ? Math.min(...headings.map((s) => s.level)) : 1;
  return {
    titles: headings.filter((s) => s.level === topLevel).length,
    subtitles: headings.filter((s) => s.level > topLevel).length,
    listItems: count("bullet") + count("numbered"),
    rules: parsed.lines.filter(isRuleLine).length,
    paragraphs: count("text"),
    blocks: countBlocks(parsed),
    sections: visibleSections(parsed).length,
  };
}

function countBlocks(parsed: ParsedPrompt): number {
  let blocks = 0;
  let inBlock = false;
  for (const l of parsed.lines) {
    const content = l.kind !== "blank" && l.kind !== "separator";
    if (content && !inBlock) blocks++;
    inBlock = content;
  }
  return blocks;
}

/** Títulos de primeiro/segundo nível, usados na validação de estrutura. */
export function headingTitles(content: string): string[] {
  return parsePrompt(content)
    .sections.filter((s) => s.id !== 0)
    .map((s) => s.title);
}
