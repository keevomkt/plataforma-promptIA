/**
 * Contrato da localização de comportamento no prompt. Usado pela aba
 * "Perguntar ao prompt" e, no futuro, pela análise de "Alterar prompt".
 * Linhas sempre 0-based (a tela soma 1).
 */

/** Por que uma regra entrou no resultado. */
export type MatchReason =
  /** A regra contém termos da pergunta. */
  | { kind: "termo"; terms: string[] }
  /** O título da seção da regra trata do assunto perguntado. */
  | { kind: "secao"; section: string }
  /** A regra faz parte de um item de lista ou introdução ("Exemplos:", "Caso ...:") já encontrado. */
  | { kind: "estrutura"; headLine: number }
  /** A regra retoma, por pronome ou expressão de referência, uma regra anterior do mesmo bloco. */
  | { kind: "referencia"; marker: string; antecedentLine: number };

export type LocatedRule = {
  line: number;
  section: string;
  text: string;
  reasons: MatchReason[];
};

export type OverlapFinding = {
  /** duplicidade: dizem a mesma coisa. divergencia: mesmo ponto, valores diferentes. */
  kind: "duplicidade" | "divergencia";
  lines: number[];
  explanation: string;
};

/** Um comportamento: regras contíguas do mesmo bloco que tratam do mesmo assunto. */
export type BehaviorGroup = {
  id: string;
  title: string;
  sectionPath: string[];
  firstLine: number;
  lastLine: number;
  rules: LocatedRule[];
  score: number;
  overlaps: OverlapFinding[];
};

/** Seção com subseções cujo título trata do assunto: mostrada inteira, uma subseção por grupo. */
export type SectionHit = {
  title: string;
  path: string[];
  headingLine: number;
  score: number;
  groups: BehaviorGroup[];
};

export type LocateResult = {
  question: string;
  topic: {
    /** Radicais do assunto usados na busca (sem palavras de pergunta). */
    terms: string[];
    /** Palavras do assunto que não aparecem em nenhum lugar do prompt. */
    missing: string[];
    display: string;
  };
  sectionHits: SectionHit[];
  /** Grupos fora das seções acima, do mais para o menos relacionado. O primeiro é o principal. */
  groups: BehaviorGroup[];
  found: boolean;
  lexiconVersion: string;
};
