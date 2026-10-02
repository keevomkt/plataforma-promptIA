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
  | { kind: "referencia"; marker: string; antecedentLine: number }
  /** A regra está entre duas regras já encontradas do mesmo bloco. */
  | { kind: "posicao"; before: number; after: number };

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

/**
 * Tipo de pergunta: lista de itens (FATO), o que o prompt diz (COMPORTAMENTO),
 * na dúvida os dois (AMBIGUO), ou quais documentos da base falam de algo (DOCUMENTOS).
 */
export type QuestionKind = "FATO" | "COMPORTAMENTO" | "AMBIGUO" | "DOCUMENTOS";

export type QuestionClassification = {
  kind: QuestionKind;
  /** O que a pergunta pede para listar, como foi escrito ("produtos ou soluções"). */
  listed?: string;
  /** Explicação curta da classificação, para a tela. */
  reason: string;
  /** A pergunta indica onde procurar ("na base de conhecimento"): essas palavras saem do assunto. */
  sourceSelected?: "BASE";
  /** Pergunta sem as palavras que só indicam a fonte (usada como assunto da busca). */
  topicQuestion?: string;
  /** A pergunta cita uma fonte da plataforma (mesmo que como assunto, não como lugar de busca). */
  sourceMentioned?: boolean;
  /** Como a fonte foi escrita na pergunta ("bases de conhecimento"). */
  sourcePhrase?: string;
};

/** Um trecho literal de documento, com a grafia exata do assunto encontrada nele. */
export type KnowledgeExcerpt = { text: string; forms: string[] };

export type KnowledgeDocHit = {
  documentId: string;
  title: string;
  businessUnit: string;
  /** Quantas vezes o assunto aparece no documento inteiro. */
  occurrences: number;
  /** Grafias encontradas e quantas vezes cada uma ("NGEssence": 18). */
  forms: Record<string, number>;
  /** Palavras da pergunta encontradas no documento. */
  matched: string[];
  excerpts: KnowledgeExcerpt[];
  score: number;
};

export type KnowledgeAnswer = {
  topic: string;
  /** Quantos documentos foram consultados (unidade + gerais). */
  consulted: number;
  scope: string;
  docs: KnowledgeDocHit[];
};

/** Resposta completa da aba: cada bloco com a sua fonte, nunca misturados. */
export type AskAnswer = {
  question: string;
  classification: QuestionClassification;
  /** Regras do prompt sobre o assunto (comportamento da IA). */
  behavior?: LocateResult;
  /** Itens nomeados do prompt (perguntas de lista). */
  facts?: FactResult;
  /** Trechos dos documentos da base de conhecimento. */
  knowledge?: KnowledgeAnswer;
  /** Regras do prompt SOBRE a fonte citada na pergunta (ex.: como usar a base) — seção à parte. */
  aboutSource?: LocateResult;
  /** Fontes realmente consultadas. */
  consulted: { prompt: boolean; base: boolean };
};

/** Um item nomeado no prompt (produto, solução, plano...), sem lista fixa no código. */
export type NamedItem = {
  name: string;
  /** "secao": tem seção própria no prompt. "citado": só aparece em listas ou menções. */
  tier: "secao" | "citado";
  confidence: "alta" | "baixa";
  /** Sinais estruturais que levaram ao item, em texto para a tela. */
  signals: string[];
  /** Linhas onde o nome aparece (0-based). */
  lines: number[];
  /** Título da seção própria, quando houver. */
  headingLine?: number;
  /** Trecho literal do prompt que dá contexto ao item. */
  context?: { line: number; text: string; intro?: { line: number; text: string } };
};

export type FactResult = {
  question: string;
  withSection: NamedItem[];
  cited: NamedItem[];
  lexiconVersion: string;
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
