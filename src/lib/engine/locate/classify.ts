/**
 * Tipo de pergunta, só por palavras de pergunta do português:
 *
 * - FATO: pede lista ou contagem de itens ("quais são os X", "quantos X",
 *   "liste os X", "que X existem").
 * - DOCUMENTOS: pede quais documentos/bases tratam de algo ("quais bases
 *   mencionam X").
 * - COMPORTAMENTO: o restante, inclusive "quais regras..." (o item pedido é
 *   o próprio prompt) e "a IA pode dizer quais..." (modal antes da lista).
 * - AMBIGUO: pede lista, mas também cita um assunto ou uma condição
 *   ("quantos planos existem no X", "quais X a IA deve..."): a tela mostra
 *   os dois resultados em vez de escolher em silêncio.
 *
 * Também separa as palavras que só dizem ONDE procurar ("na base de
 * conhecimento") das que dizem O QUE procurar. Quando a base é o próprio
 * assunto ("a IA pode dizer quais documentos existem na base?"), ela fica no
 * assunto e nada é escolhido como fonte.
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
  SAYING_VERBS,
  SOURCE_ARTICLES,
  SOURCE_LOCATIVES,
  SOURCE_NOUNS,
  SOURCE_QUALIFIER,
} from "./lexicon";
import type { QuestionClassification } from "./types";

const META_STEMS = new Set(QUESTION_META.map(stem));
const STOP = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "ou", "em", "na", "no", "nas", "nos", "que", "um", "uma", "se", "com", "para", "por", "sobre", "qual", "quais", "como", "quando", "onde"]);

type Token = { word: string; norm: string; start: number; end: number };
type Span = { from: number; to: number }; // índices de token, inclusivos

function tokenize(question: string): Token[] {
  const out: Token[] = [];
  for (const m of Array.from(question.matchAll(/[\p{L}\p{N}]+/gu))) {
    out.push({ word: m[0], norm: normalize(m[0]), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** Trechos que nomeiam uma fonte da plataforma: "bases de conhecimento", "a base", "documentos". */
function sourceSpans(t: Token[]): Span[] {
  const spans: Span[] = [];
  for (let i = 0; i < t.length; i++) {
    if (!SOURCE_NOUNS.includes(t[i].norm)) continue;
    const qualified = t[i + 1]?.norm === SOURCE_QUALIFIER[0] && t[i + 2]?.norm === SOURCE_QUALIFIER[1];
    const isBase = t[i].norm.startsWith("base");
    const afterListWord = LIST_INTERROGATIVES.includes(t[i - 1]?.norm ?? "") || LIST_VERBS.includes(t[i - 1]?.norm ?? ""); // "quais bases", "liste as bases"
    if (isBase && !qualified && !afterListWord && !SOURCE_ARTICLES.includes(t[i - 1]?.norm ?? "")) continue; // "com base em" não é a fonte
    let from = i;
    if (SOURCE_ARTICLES.includes(t[i - 1]?.norm ?? "")) from = i - 1;
    spans.push({ from, to: qualified ? i + 2 : i });
    i = qualified ? i + 2 : i;
  }
  return spans;
}

const inSpan = (spans: Span[], i: number) => spans.some((s) => i >= s.from && i <= s.to);

export function classifyQuestion(question: string): QuestionClassification {
  const t = tokenize(question);
  const words = t.map((x) => x.norm);
  const spans = sourceSpans(t);

  // Conteúdo que sobra fora das palavras de fonte, de pergunta e de ligação
  const restContent = t.filter(
    (x, i) =>
      !inSpan(spans, i) &&
      !STOP.has(x.norm) &&
      !META_STEMS.has(stem(x.norm)) &&
      !EXISTENCE_VERBS.includes(x.norm) &&
      !LIST_INTERROGATIVES.includes(x.norm) &&
      !LIST_VERBS.includes(x.norm) &&
      !PROMPT_REFERENCES.includes(x.norm) &&
      !BEHAVIOR_MARKERS.includes(x.norm) &&
      !LIST_FILLERS.includes(x.norm)
  );
  const withoutSources = () => {
    let out = "";
    let last = 0;
    for (const s of spans) {
      out += question.slice(last, t[s.from].start);
      last = t[s.to].end;
    }
    return (out + question.slice(last)).replace(/\s+/g, " ").trim();
  };
  const source = (selected: boolean): Partial<QuestionClassification> =>
    spans.length
      ? selected && restContent.length
        ? { sourceSelected: "BASE", topicQuestion: withoutSources(), sourceMentioned: true, sourcePhrase: question.slice(t[spans[0].from].start, t[spans[0].to].end) }
        : { sourceMentioned: true, sourcePhrase: question.slice(t[spans[0].from].start, t[spans[0].to].end) }
      : {};

  // A fonte é onde procurar: "na base…", "segundo a base…", ou sujeito de verbo de dizer ("a base diz…")
  const locative = spans.some(
    (s) => SOURCE_LOCATIVES.includes(words[s.from]) || SOURCE_LOCATIVES.includes(words[s.from - 1] ?? "") || SAYING_VERBS.includes(words[s.to + 1] ?? "")
  );

  // "documentos que citam X", "bases que mencionam X": pedido de documentos mesmo sem palavra de pergunta
  if (restContent.length && spans.some((s) => words[s.to + 1] === "que" && SAYING_VERBS.includes(words[s.to + 2] ?? ""))) {
    return { kind: "DOCUMENTOS", reason: "pede quais documentos da base tratam do assunto", ...source(true) };
  }

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
  if (start < 0) return { kind: "COMPORTAMENTO", reason: "não pede lista nem contagem", ...source(locative) };

  // Modal ou condição antes do pedido de lista: "a IA pode dizer quais..."
  const before = words.slice(0, start);
  if (before.some((w) => BEHAVIOR_MARKERS.includes(w))) {
    return { kind: "COMPORTAMENTO", reason: "pergunta sobre o que a IA pode ou deve fazer", ...source(false) };
  }

  // O que é pedido: substantivos logo após o marcador, até um verbo/“que”/fim
  const listed: string[] = [];
  const listedIdx: number[] = [];
  let i = start + 1;
  for (; i < words.length; i++) {
    const w = words[i];
    if (LIST_FILLERS.includes(w)) continue;
    if (EXISTENCE_VERBS.includes(w) || w === "que" || BEHAVIOR_MARKERS.includes(w)) break;
    if (PROMPT_REFERENCES.includes(w) || META_STEMS.has(stem(w))) break;
    listed.push(t[i].word);
    listedIdx.push(i);
  }
  if (!listed.length) return { kind: "COMPORTAMENTO", reason: "não ficou claro o que listar", ...source(locative) };

  // "Quais bases/documentos mencionam X": a lista pedida é de documentos
  if (listedIdx.some((x) => inSpan(spans, x))) {
    if (!restContent.length) return { kind: "COMPORTAMENTO", reason: "pergunta sobre a própria base de conhecimento", ...source(false) };
    return { kind: "DOCUMENTOS", listed: listed.join(" "), reason: "pede quais documentos da base tratam do assunto", ...source(true) };
  }
  if (listed.some((w) => META_NOUNS.includes(normalize(w)))) {
    return { kind: "COMPORTAMENTO", reason: `pede ${listed.join(" ")} do prompt, não uma lista de itens`, ...source(locative) };
  }

  // Resto da pergunta: assunto ou condição adicional torna a lista ambígua
  const rest = words.slice(i);
  const condition = rest.find((w) => BEHAVIOR_MARKERS.includes(w));
  const subject = rest.filter(
    (w, k) =>
      !inSpan(spans, i + k) &&
      !EXISTENCE_VERBS.includes(w) &&
      !LIST_FILLERS.includes(w) &&
      !PROMPT_REFERENCES.includes(w) &&
      !META_STEMS.has(stem(w)) &&
      w !== "que" &&
      w.length > 2
  );
  const listedLabel = listed.filter((w) => !["ou", "e"].includes(w)).join(" ou ");
  if (condition) return { kind: "AMBIGUO", listed: listedLabel, reason: `pede uma lista de ${listedLabel}, mas também uma condição (“${condition}”)`, ...source(locative) };
  if (subject.length) return { kind: "AMBIGUO", listed: listedLabel, reason: `pede uma lista de ${listedLabel} restrita a um assunto`, ...source(locative) };
  return { kind: "FATO", listed: listedLabel, reason: `pede a lista de ${listedLabel}`, ...source(locative) };
}
