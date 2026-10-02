/**
 * Monta a resposta da aba "Perguntar ao prompt" a partir das duas fontes,
 * sem misturá-las e sem gerar texto: cada bloco sai com a sua origem.
 *
 * - prompt: regras de comportamento (locateBehavior) e itens nomeados (extractNamedItems);
 * - base de conhecimento: trechos literais dos documentos (KnowledgeIndex.findForQuestion);
 * - regras do prompt SOBRE a fonte citada ("como usar a base") ficam numa seção à parte.
 *
 * Função pura: recebe o prompt interpretado e os documentos já carregados.
 */
import type { ParsedPrompt } from "../parse";
import { normalize, stem, stems } from "../text";
import { KnowledgeIndex, spellingPattern, type KnowledgeSource, type QuestionTopic } from "../knowledge";
import { classifyQuestion } from "./classify";
import { extractNamedItems } from "./entities";
import { locateBehavior } from "./locate";
import {
  BEHAVIOR_MARKERS,
  EXISTENCE_VERBS,
  LIST_INTERROGATIVES,
  LIST_VERBS,
  NAME_CONNECTORS,
  PROMPT_REFERENCES,
  QUESTION_META,
  SOURCE_NOUNS,
} from "./lexicon";
import type { AskAnswer } from "./types";

const META_STEMS = new Set(QUESTION_META.map(stem));

export function answerQuestion(parsed: ParsedPrompt, question: string, kb: { sources: KnowledgeSource[]; scope: string }): AskAnswer {
  const classification = classifyQuestion(question);
  const { kind } = classification;
  const topicQuestion = classification.topicQuestion ?? question;
  const answer: AskAnswer = { question, classification, consulted: { prompt: false, base: false } };

  if (kind === "FATO" || kind === "AMBIGUO") {
    answer.facts = extractNamedItems(parsed, question);
    answer.consulted.prompt = true;
  }
  if (kind === "COMPORTAMENTO" || kind === "AMBIGUO") {
    answer.behavior = locateBehavior(parsed, topicQuestion);
    answer.consulted.prompt = true;
  }

  // Base de conhecimento: quando a pergunta escolhe a base como fonte, ou não cita
  // fonte nenhuma. Se a base é o próprio assunto ("a IA pode dizer quais documentos
  // existem na base?"), quem responde é o prompt — os documentos não entram.
  const baseIsSubject = classification.sourceMentioned && !classification.sourceSelected;
  if (kind !== "FATO" && !baseIsSubject) {
    const corpus = [parsed.lines.map((l) => l.raw).join("\n"), ...kb.sources.map((s) => s.content)];
    const topic = questionTopic(topicQuestion, corpus);
    if (topic.phrases.length || topic.words.length) {
      const index = new KnowledgeIndex(kb.sources);
      answer.knowledge = { topic: [...topic.phrases, ...topic.words.map((w) => w.word)].join(", "), consulted: kb.sources.length, scope: kb.scope, docs: index.findForQuestion(topic) };
      answer.consulted.base = true;
    }
  }

  // Regras do prompt sobre a fonte citada: seção à parte, nunca como resposta
  if (classification.sourceSelected && classification.sourcePhrase) {
    answer.aboutSource = locateBehavior(parsed, classification.sourcePhrase);
    answer.consulted.prompt = true;
  }
  return answer;
}

/** Artigos e contrações que, antes de um substantivo, marcam "o produto X", "da solução X". */
const ARTICLES = ["o", "a", "os", "as", "do", "da", "dos", "das", "no", "na", "nos", "nas", "um", "uma"];

/**
 * Assunto da pergunta para a busca nos documentos:
 *
 * - nomes, buscados com grafia flexível (espaço, hífen, maiúscula, acento):
 *   sequências escritas com maiúscula/sigla, OU palavras vizinhas da pergunta
 *   que aparecem juntas como uma unidade nas fontes ("ng essence" →
 *   "NGEssence"), mesmo digitadas em minúsculas;
 * - palavra que só descreve o nome logo a seguir ("o produto X", "da solução
 *   X") não é assunto: diz o tipo da coisa, não o que procurar;
 * - as demais palavras de conteúdo, por radical.
 */
export function questionTopic(question: string, corpus: string[] = []): QuestionTopic {
  const tokens = Array.from(question.matchAll(/[\p{L}\p{N}]+/gu)).map((m) => ({ word: m[0], norm: normalize(m[0]) }));
  const ignored = (t: { norm: string }) =>
    PROMPT_REFERENCES.includes(t.norm) ||
    SOURCE_NOUNS.includes(t.norm) ||
    EXISTENCE_VERBS.includes(t.norm) ||
    LIST_INTERROGATIVES.includes(t.norm) ||
    LIST_VERBS.includes(t.norm) ||
    BEHAVIOR_MARKERS.includes(t.norm) ||
    META_STEMS.has(stem(t.norm));
  const nameLike = (w: string, i: number) =>
    !ignored({ norm: normalize(w) }) && (/^\p{Ll}+\p{Lu}/u.test(w) || /^[\p{Lu}\d]{2,6}$/u.test(w) || (i > 0 && /^\p{Lu}/u.test(w)));

  const phrases: string[] = [];
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (!nameLike(tokens[i].word, i)) continue;
    let j = i;
    while (j + 1 < tokens.length) {
      if (nameLike(tokens[j + 1].word, j + 1)) j++;
      else if (NAME_CONNECTORS.includes(tokens[j + 1].norm) && j + 2 < tokens.length && nameLike(tokens[j + 2].word, j + 2)) j += 2;
      else break;
    }
    phrases.push(tokens.slice(i, j + 1).map((t) => t.word).join(" "));
    for (let k = i; k <= j; k++) used.add(k);
    i = j;
  }

  // Nomes digitados sem maiúscula: palavras vizinhas que as fontes usam juntas como
  // unidade. Entre as sequências possíveis, vale a mais usada nas fontes ("ng essence"
  // aparece ~50 vezes; "produto ng essence", 1): é ela que nomeia a coisa.
  const content = (i: number) => !used.has(i) && !ignored(tokens[i]) && stems(tokens[i].word).length > 0;
  const uses = (text: string) => corpus.reduce((n, c) => n + (c.match(spellingPattern(text))?.length ?? 0), 0);
  for (let i = 0; i < tokens.length; i++) {
    if (!content(i)) continue;
    let end = i;
    while (end + 1 < tokens.length && content(end + 1)) end++;
    for (;;) {
      let best: { from: number; to: number; n: number } | undefined;
      for (let from = i; from < end; from++) {
        for (let to = from + 1; to <= end; to++) {
          if (Array.from({ length: to - from + 1 }, (_, k) => from + k).some((k) => used.has(k))) break;
          const n = uses(tokens.slice(from, to + 1).map((t) => t.word).join(" "));
          if (n > 0 && (!best || n > best.n || (n === best.n && to - from > best.to - best.from))) best = { from, to, n };
        }
      }
      if (!best) break;
      phrases.push(tokens.slice(best.from, best.to + 1).map((t) => t.word).join(" "));
      for (let k = best.from; k <= best.to; k++) used.add(k);
    }
    i = end;
  }

  // Palavra digitada colada que as fontes também escrevem separada ("ngessence" × "NG Essence"):
  // é um nome. Palavra comum nunca aparece partida assim, então não vira nome.
  tokens.forEach((t, i) => {
    if (!content(i) || t.norm.length < 6) return;
    const re = spellingPattern(t.word, { splitInside: true });
    if (corpus.some((c) => Array.from(c.matchAll(re)).some((m) => /[\s\-_]/.test(m[0])))) {
      phrases.push(t.word);
      used.add(i);
    }
  });

  // "o produto X": o substantivo entre o artigo e o nome só descreve o nome
  const phraseStarts = new Set<number>();
  tokens.forEach((t, i) => {
    if (used.has(i) && !used.has(i - 1)) phraseStarts.add(i);
  });
  const descriptor = (i: number) => phraseStarts.has(i + 1) && ARTICLES.includes(tokens[i - 1]?.norm ?? "");

  const words: QuestionTopic["words"] = [];
  tokens.forEach((t, i) => {
    if (used.has(i) || ignored(t) || descriptor(i)) return;
    const [s] = stems(t.word);
    if (s && !words.some((w) => w.stem === s)) words.push({ word: t.word, stem: s });
  });
  return { phrases, words };
}
