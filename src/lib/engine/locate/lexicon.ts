/**
 * Léxico gramatical do português usado pela localização de comportamento.
 *
 * Só contém marcadores da LÍNGUA (pronomes, demonstrativos, artigos,
 * palavras de pergunta, quantificadores). O que eles marcam vem sempre do
 * prompt carregado. Nenhum termo de negócio pode entrar aqui.
 * Mudou alguma lista? Suba a versão: ela é registrada em cada resultado.
 */
export const LEXICON_VERSION = "pt-BR/2";

/** Palavras da própria pergunta ou que falam sobre o prompt — nunca são o assunto. */
export const QUESTION_META = [
  "existe", "existem", "existir", "algum", "alguma", "alguns", "algumas", "qualquer",
  "duplicada", "duplicadas", "duplicado", "duplicados", "duplicidade", "repetida", "repetidas", "repetido", "repetidos",
  "contraditoria", "contraditorias", "contradicao", "contradicoes", "conflito", "conflitos", "conflitante", "conflitantes",
  "sobreposta", "sobrepostas", "sobreposicao", "relacao", "respeito", "referente", "relacionada", "relacionadas",
  "fala", "falam", "falar", "trata", "tratam", "tratar", "diz", "dizem", "dizer", "menciona", "mencionam", "mencionar",
  "cita", "citam", "citar", "aparece", "aparecem", "consta", "constam", "escrito", "escrita", "previsto", "prevista",
  "acontece", "funciona", "age", "agir", "faz", "fazem", "deveria", "poderia", "permitido", "permitida",
  "orientacao", "orientacoes", "instrucao", "instrucoes", "comportamento",
  // verbos modais
  "precisa", "precisam", "necessita", "necessitam", "consegue", "conseguem", "costuma", "costumam",
];

/** Pronomes que, no início da regra, retomam o sujeito da regra anterior. */
export const SUBJECT_PRONOUNS = ["ela", "ele", "elas", "eles"];

/** Demonstrativos: retomam algo já citado ("essa pergunta", "isso"). */
export const DEMONSTRATIVES = [
  "esse", "essa", "esses", "essas", "este", "esta", "estes", "estas", "isso", "isto",
  "nesse", "nessa", "nesses", "nessas", "neste", "nesta", "desse", "dessa", "desses", "dessas",
  "deste", "desta", "aquele", "aquela", "aquilo", "naquele", "naquela", "daquele", "daquela",
];

/** Artigos definidos (e contrações): retomada mais fraca ("a pergunta", "o momento"). */
export const DEFINITE_ARTICLES = ["a", "o", "as", "os", "da", "do", "das", "dos", "na", "no", "nas", "nos", "pela", "pelo", "pelas", "pelos"];

/** Negação. */
export const NEGATIONS = ["nao", "nunca", "jamais", "nenhum", "nenhuma", "nem"];

/** Palavras que distinguem o que a regra pede ("quais" × "quantos"); contam na comparação de duplicidade. */
export const DISTINGUISHERS = ["qual", "quais", "quanto", "quanta", "quantos", "quantas", "quando", "onde", "quem", "como"];

/** Números por extenso usados em limites ("uma vez", "duas perguntas"). */
export const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

/** Advérbios de frequência. */
export const FREQUENCY_WORDS = ["sempre", "nunca", "jamais", "raramente", "eventualmente"];

// --- Tipo de pergunta (lista de itens × comportamento) ---

/** Interrogativos de listagem/contagem. "que" só conta quando seguido de verbo de existência. */
export const LIST_INTERROGATIVES = ["quais", "quantos", "quantas", "que"];

/** Verbos de pedido de lista. */
export const LIST_VERBS = ["liste", "listar", "lista", "listagem", "enumere", "enumerar", "relacione", "relacionar"];

/** Verbos de existência/presença que fecham o pedido de lista ("quais X existem"). */
export const EXISTENCE_VERBS = [
  "existem", "existe", "ha", "tem", "temos", "possui", "possuem", "constam", "consta", "aparecem", "aparece",
  "estao", "esta", "sao", "citados", "citadas", "citado", "citada", "mencionados", "mencionadas", "presentes", "disponiveis",
];

/** Substantivos que falam do próprio prompt: "quais regras..." pede regras, não uma lista de itens. */
export const META_NOUNS = [
  "regra", "regras", "instrucao", "instrucoes", "orientacao", "orientacoes", "trecho", "trechos", "parte", "partes",
  "secao", "secoes", "linha", "linhas", "comportamento", "comportamentos", "frase", "frases",
];

/** Modais e conectivos que transformam a pergunta em pergunta de comportamento. */
export const BEHAVIOR_MARKERS = ["pode", "podem", "deve", "devem", "precisa", "precisam", "consegue", "permitido", "permitida", "quando", "se", "caso", "antes", "depois", "apos"];

/** Determinantes e ligações ignorados ao ler o que a pergunta pede ("os produtos ou as soluções"). */
export const LIST_FILLERS = ["sao", "os", "as", "o", "a", "de", "do", "da", "dos", "das", "e", "ou", "todos", "todas", "os/as"];

/** Referência ao próprio prompt ("nesse prompt", "no texto"): não é assunto. */
export const PROMPT_REFERENCES = ["prompt", "texto", "nesse", "neste", "no", "na", "nele", "nela", "aqui", "agente", "ia", "assistente", "bot"];

/** Conectivos sem peso de assunto que podem aparecer em nomes próprios ("Departamento de Pessoal"). */
export const NAME_CONNECTORS = ["de", "da", "do", "das", "dos", "e"];

/** Contexto de definição logo após o nome ("X é...", "X faz parte..."). */
export const DEFINITION_AFTER_NAME = ["é", "são", "faz parte", "fazem parte", "atende", "atendem"];

/** Verbos de apresentação logo antes do nome ("apresente o X", "ofereça a X"). */
export const PRESENTING_VERBS = ["apresente", "apresentar", "ofereça", "oferecer", "indique", "indicar", "recomende", "recomendar"];
