/**
 * Léxico gramatical do português usado pela localização de comportamento.
 *
 * Só contém marcadores da LÍNGUA (pronomes, demonstrativos, artigos,
 * palavras de pergunta, quantificadores). O que eles marcam vem sempre do
 * prompt carregado. Nenhum termo de negócio pode entrar aqui.
 * Mudou alguma lista? Suba a versão: ela é registrada em cada resultado.
 */
export const LEXICON_VERSION = "pt-BR/1";

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
