/**
 * Tipo de pergunta, só por palavras de pergunta do português:
 *
 * - FATO: pede lista ou contagem de itens ("quais são os X", "quantos X",
 *   "liste os X", "que X existem").
 * - COMPORTAMENTO: o restante, inclusive "quais regras..." (o item pedido é
 *   o próprio prompt) e "a IA pode dizer quais..." (modal antes da lista).
 * - AMBIGUO: pede lista, mas também cita um assunto ou uma condição
 *   ("quantos planos existem no X", "quais X a IA deve..."): a tela mostra
 *   os dois resultados em vez de escolher em silêncio.
 */
import { normalize, stem } from "../text";
import {
  BEHAVIOR_MARKERS,
  EXISTENCE_VERBS,
  LIST_FILLERS,
  LIST_INTERROGATIVES,
  LIST_VERBS,
  META_NOUNS,
  PROMPT_REFERENCES,
  QUESTION_META,
} from "./lexicon";
import type { QuestionClassification } from "./types";

const META_STEMS = new Set(QUESTION_META.map(stem));

export function classifyQuestion(question: string): QuestionClassification {
  const original = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const words = original.map(normalize);

  // Onde começa o pedido de lista
  let start = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (LIST_VERBS.includes(w)) {
      start = i;
      break;
    }
    if (LIST_INTERROGATIVES.includes(w)) {
      // "que" só pede lista quando há verbo de existência logo adiante ("que produtos existem")
      if (w === "que" && !words.slice(i + 1, i + 5).some((x) => EXISTENCE_VERBS.includes(x))) continue;
      start = i;
      break;
    }
  }
  if (start < 0) return { kind: "COMPORTAMENTO", reason: "não pede lista nem contagem" };

  // Modal ou condição antes do pedido de lista: "a IA pode dizer quais..."
  const before = words.slice(0, start);
  if (before.some((w) => BEHAVIOR_MARKERS.includes(w))) {
    return { kind: "COMPORTAMENTO", reason: "pergunta sobre o que a IA pode ou deve fazer" };
  }

  // O que é pedido: substantivos logo após o marcador, até um verbo/“que”/fim
  const listed: string[] = [];
  let i = start + 1;
  for (; i < words.length; i++) {
    const w = words[i];
    if (LIST_FILLERS.includes(w)) continue;
    if (EXISTENCE_VERBS.includes(w) || w === "que" || BEHAVIOR_MARKERS.includes(w)) break;
    if (PROMPT_REFERENCES.includes(w) || META_STEMS.has(stem(w))) break;
    listed.push(original[i]);
  }
  if (!listed.length) return { kind: "COMPORTAMENTO", reason: "não ficou claro o que listar" };
  if (listed.some((w) => META_NOUNS.includes(normalize(w)))) {
    return { kind: "COMPORTAMENTO", reason: `pede ${listed.join(" ")} do prompt, não uma lista de itens` };
  }

  // Resto da pergunta: assunto ou condição adicional torna a lista ambígua
  const rest = words.slice(i);
  const condition = rest.find((w) => BEHAVIOR_MARKERS.includes(w));
  const subject = rest.filter(
    (w) =>
      !EXISTENCE_VERBS.includes(w) &&
      !LIST_FILLERS.includes(w) &&
      !PROMPT_REFERENCES.includes(w) &&
      !META_STEMS.has(stem(w)) &&
      w !== "que" &&
      w.length > 2
  );
  const listedLabel = listed.filter((w) => !["ou", "e"].includes(w)).join(" ou ");
  if (condition) return { kind: "AMBIGUO", listed: listedLabel, reason: `pede uma lista de ${listedLabel}, mas também uma condição (“${condition}”)` };
  if (subject.length) return { kind: "AMBIGUO", listed: listedLabel, reason: `pede uma lista de ${listedLabel} restrita a um assunto` };
  return { kind: "FATO", listed: listedLabel, reason: `pede a lista de ${listedLabel}` };
}
