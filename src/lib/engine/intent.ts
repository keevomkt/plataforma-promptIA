/**
 * Interpretação do pedido em linguagem natural: qual é a intenção
 * (remover, adicionar, trocar, ajustar estilo...), qual é o assunto e se o
 * usuário limitou a alteração a alguma parte do prompt.
 */
import type { Intent } from "./types";
import { capitalizeFirst, contentWords, ensurePeriod, normalize, stem, stripAccents } from "./text";

export type ParsedRequest = {
  intent: Intent;
  /** Pedido + detalhes informados nos esclarecimentos. */
  fullText: string;
  /** Palavras do assunto (sem os verbos de intenção e sem o escopo). */
  topicWords: string[];
  topicStems: string[];
  /** Assunto com a grafia original do pedido ("quantidade de CNPJs"). */
  topicDisplay: string;
  quoted: string[];
  replaceFrom?: string;
  replaceTo?: string;
  /** Texto de regra a adicionar, quando o pedido já traz a regra. */
  newRuleText?: string;
  /** Trecho do pedido que delimita onde alterar ("do fluxo geral de não clientes"). */
  scopeText?: string;
  /** Seção escolhida explicitamente em um esclarecimento. */
  scopeSection?: string;
  scopeAll: boolean;
  trigger?: string;
  behavior?: string;
  vagueBehavior: boolean;
};

const EXPLICIT_REMOVE = /\b(remov\w*|retir\w*|exclu\w*|elimin\w*|apag\w*|delet\w*|tir(e|ar|a)|corta\w*|cortar)\b/;
const SOFT_REMOVE =
  /\b(nao quero mais|nao (deve|precisa) mais|par(e|ar|ou) de|deix(e|ar) de|nao (pergunt\w*|pec\w*|solicit\w*|mencion\w*|fal\w*|inform\w*|diga)|sem (pergunt\w*|mencion\w*)|nao e mais necessari\w*)\b/;
const ADD =
  /\b(adicion\w*|inclu\w*|acrescent\w*|insir\w*|inser\w*|implement\w*|nova regra|criar (uma )?regra|crie (uma )?regra|pass(e|ar) a|comec(e|ar) a)\b/;
// Pedido de revisão/auditoria do prompt inteiro (não é uma alteração)
const AUDIT_VERB =
  /\b(analis\w*|revis\w*|audit\w*|verifi\w*|avali\w*|encontr\w*|procur\w*|identifi\w*|checa\w*|cheque|confer\w*|tem alguma|ha alguma|existe alguma|existem|tem regras?)\b/;
const AUDIT_TARGET =
  /\b(duplica\w*|sobrepost\w*|sobrepo\w*|contradi\w*|conflit\w*|mal escrit\w*|mal feit\w*|redundan\w*|repetid\w*|inconsisten\w*|ambigu\w*|anul\w*|incoeren\w*|pouco efetiv\w*|nao (tao|muito) efetiv\w*)\b/;
const REPLACE = /\b(troc\w*|troqu\w*|substitu\w*)\b.+\bpor\b|\bem vez de\b|\bao inves de\b|\bno lugar de\b/;
const LESS_QUESTIONS =
  /\b(menos pergunt\w*|tantas pergunt\w*|reduz\w*( a quantidade de| o numero de| as)? pergunt\w*|mais cedo|mais rapid\w*|encaminh\w* (antes|logo|direto|imediatamente)|encurt\w* o fluxo)\b/;
const CONCISE = /\b(mais )?(objetiv\w*|curt\w*|concis\w*|diret\w*|brev\w*|sucint\w*|enxut\w*|menos prolix\w*|sem enrol\w*|respostas? menor\w*|menos texto)\b/;
const TONE = /\b(mais |menos )?(formal|informal|simpatic\w*|emoji\w*|cordial|amigavel|humaniz\w*|educad\w*|descontraid\w*|acolhedor\w*|serio)\b/;
const CONDITIONAL =
  /\b(?:quando|se|caso)\s+(?:o |a )?(?:usuario|cliente|lead|pessoa|contato|prospect)\s+(.+?)(?:,|\s+quero que|\s+o bot deve|\s+deve)\s*(?:quero que\s+)?(?:o bot\s+|ele\s+)?(.+)$/;
const VAGUE_BEHAVIOR = /\b(de outra (maneira|forma)|diferente|melhor|de um jeito melhor|outra abordagem|mude|mudar|altere|alterar)\b/;
const SCOPE_ALL = /\b(todo o prompt|em todo (o )?prompt|de todo (o )?prompt|todas as secoes|em qualquer lugar|em todos os fluxos|de tudo|do prompt inteiro)\b/;
const SCOPE =
  /\b(?:somente|apenas|so)?\s*(?:d[oa]s?|n[oa]s?|em)\s+((?:fluxo|secao|etapa|parte|bloco|topico|regra de|regras de|passo)\b[^,.;]*)/;

// Pergunta sobre o conteúdo do prompt (não é pedido de alteração nenhuma)
const QUESTION_ENDING = /\?\s*["')\]]*\s*$/;
const QUESTION_LOOKUP =
  /\b(existe|existem|existi[ao]s?|possui\w*|conta com|contem|inclui\w*)\b.*\b(no prompt|na base|no agente|nele|nela)\b|\b(existe|existem|existi[ao]s?)\b/;
const QUESTION_WH = /^(qual|quais|quanto|quantos?|quantas?|onde|quando|como|quem)\b/;
const QUESTION_NOISE = [
  /\bexiste?m?\b/g, /\bexisti[ao]s?\b/g, /\bpossui\w*\b/g, /\bcontem\b/g, /\binclui\w*\b/g, /\balgum\w*\b/g,
  /\bconta com\b/g, /\b(qual|quais|quanto|quantos?|quantas?|onde|quando|como|quem)\b/g,
  /\bno prompt\b/g, /\bna base( de conhecimento)?\b/g, /\bno agente\b/g, /\bnele\b/g, /\bnela\b/g,
];

/** Frases de intenção removidas antes de extrair o assunto. */
const INTENT_NOISE = [
  /\bnao quero mais\b/g, /\bquero que (o bot|ele|o agente)?\b/g, /\bquero\b/g, /\bgostaria( de| que)?\b/g,
  /\bnao (deve|precisa) mais\b/g, /\bpar(e|ar|ou) de\b/g, /\bdeix(e|ar) de\b/g,
  /\b(remov|retir|exclu|elimin|apag|delet|adicion|inclu|acrescent|insir|inser|implement|troc|troqu|substitu|alter|mud|ajust|modific|melhor)\w*\b/g,
  /\bno prompt\b/g,
  /\b(tir(e|ar|a)|corta\w*)\b/g,
  /\b(a|uma|essa|esta|nova)? ?regra\b/g, /\bpergunta sobre\b/g,
  /\b(faca|faz|fazer|seja|ser|fique|ficar|comportamento|forma|maneira|jeito)\b/g,
];

function extractQuoted(text: string): string[] {
  const out: string[] = [];
  const re = /["“”'‘’«»]([^"“”'‘’«»]{3,})["“”'‘’«»]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].trim());
  return out;
}

/** "perguntar o cargo" → "Pergunte o cargo" (infinitivo → imperativo). */
export function toImperative(phrase: string): string {
  const t = phrase.trim().replace(/^(o bot|ele|o agente|a ia|o agente de ia|ia)\s+/i, "");
  const m = /^(sempre\s+|nunca\s+)?(\S+)(.*)$/i.exec(t);
  if (!m) return capitalizeFirst(t);
  const [, adv = "", verb, rest] = m;
  let v = verb;
  const lower = verb.toLowerCase();
  // Verbos com mudança ortográfica no imperativo, para manter o som do infinitivo:
  // -car → -que (qualificar→qualifique, verificar→verifique, buscar→busque)
  // -çar → -ce (começar→comece, almoçar→almoce)
  // -gar → -gue (pagar→pague, chegar→chegue, entregar→entregue)
  if (/çar$/.test(lower)) v = verb.slice(0, -3) + "ce";
  else if (/car$/.test(lower)) v = verb.slice(0, -3) + "que";
  else if (/gar$/.test(lower)) v = verb.slice(0, -3) + "gue";
  else if (/ar$/.test(lower)) v = verb.slice(0, -2) + "e";
  else if (/er$/.test(lower) || /ir$/.test(lower)) v = verb.slice(0, -2) + "a";
  // formas do subjuntivo já corretas ("pergunte", "informe") ficam como estão
  return capitalizeFirst(`${adv}${v}${rest}`);
}

/**
 * Trecho do pedido original que contém o assunto, com a grafia do usuário:
 * do primeiro ao último termo do assunto, desde que o trecho seja curto.
 */
function displaySpan(original: string, topicWords: string[]): string {
  const words = original.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
  const wanted = new Set(topicWords);
  const hits = words.map((w, i) => (wanted.has(normalize(w)) ? i : -1)).filter((i) => i >= 0);
  if (!hits.length) return topicWords.join(" ");
  const span = words.slice(hits[0], hits[hits.length - 1] + 1);
  if (span.length - hits.length > 4) return hits.map((i) => words[i]).join(" ");
  return span.join(" ");
}

export function parseRequest(request: string, answers: string[] = []): ParsedRequest {
  const details = answers.filter((a) => a.startsWith("detalhe:")).map((a) => a.slice(8).trim());
  const scopeAnswer = answers.find((a) => a.startsWith("escopo:"));
  const fullText = [request, ...details].join(". ");
  // Minúsculas sem acento, mas mantendo a pontuação (vírgulas delimitam gatilho/escopo)
  // Mesmo comprimento do texto original (NFC), para recuperar trechos com acentos pela posição
  const original = fullText.normalize("NFC");
  const n = stripAccents(original.toLowerCase());
  const orig = (fragment: string, from = 0) => {
    const i = n.indexOf(fragment, from);
    return i >= 0 && n.length === original.length ? original.slice(i, i + fragment.length) : fragment;
  };
  const quoted = extractQuoted(fullText);

  let intent: Intent;
  let replaceFrom: string | undefined;
  let replaceTo: string | undefined;
  let newRuleText: string | undefined;
  let trigger: string | undefined;
  let behavior: string | undefined;

  const conditional = CONDITIONAL.exec(n);

  if (AUDIT_VERB.test(n) && AUDIT_TARGET.test(n)) {
    intent = "auditoria";
  } else if (REPLACE.test(n)) {
    intent = "substituir";
    if (quoted.length >= 2) {
      [replaceFrom, replaceTo] = quoted;
    } else {
      const m = /(?:troc\w*|troqu\w*|substitu\w*)\s+(?:o termo |a palavra |a frase |o texto )?(.+?)\s+por\s+(.+?)[.!]?$/i.exec(
        fullText.replace(/["“”]/g, "")
      );
      const m2 = /em vez de\s+(.+?),\s*(.+?)[.!]?$/i.exec(fullText.replace(/["“”]/g, ""));
      if (m) [replaceFrom, replaceTo] = [m[1].trim(), m[2].trim()];
      else if (m2) [replaceFrom, replaceTo] = [m2[1].trim(), m2[2].trim()];
    }
  } else if (conditional && !EXPLICIT_REMOVE.test(n.split(",")[0])) {
    intent = "condicional";
    trigger = orig(conditional[1].trim());
    behavior = orig(conditional[2].trim(), conditional.index);
    // Um esclarecimento posterior define o comportamento (o último vale)
    const lastDetail = details[details.length - 1];
    if (lastDetail) {
      const detailStart = n.lastIndexOf(stripAccents(lastDetail.normalize("NFC").toLowerCase()));
      const dm = CONDITIONAL.exec(n.slice(detailStart));
      behavior = dm ? orig(dm[2].trim(), detailStart) : lastDetail;
    }
    behavior = behavior.replace(/[.!]+$/, "");
  } else if (EXPLICIT_REMOVE.test(n)) {
    intent = "remover";
  } else if (LESS_QUESTIONS.test(n)) {
    intent = "menos_perguntas";
  } else if (CONCISE.test(n) && !ADD.test(n)) {
    intent = "objetividade";
  } else if (TONE.test(n) && !ADD.test(n)) {
    intent = "tom";
  } else if (SOFT_REMOVE.test(n)) {
    intent = "remover";
  } else if (ADD.test(n)) {
    intent = "adicionar";
  } else if (QUESTION_ENDING.test(n) || QUESTION_LOOKUP.test(n) || QUESTION_WH.test(n)) {
    intent = "pergunta";
  } else {
    intent = "alterar";
  }

  if (intent === "adicionar") {
    if (quoted.length) newRuleText = quoted[0];
    else {
      const m =
        /(?:regra|instru[cç][aã]o)\s*(?:que diga|dizendo|para|que|:)\s*:?\s*(.+)$/i.exec(fullText) ??
        /(?:pass[ea]r? a|come[cç][ea]r? a)\s+(.+)$/i.exec(fullText) ??
        // "implementar (no prompt)?, para (que)? <regra>" — ex: "implementar no prompt, para a IA qualificar..."
        /implement\w*\b(?:\s+no prompt)?,?\s*para\s+(?:que\s+)?(.+)$/i.exec(fullText) ??
        /(?:adicion\w*|inclu\w*|acrescent\w*|insir\w*|implement\w*)\s+(?:que\s+)?(.+)$/i.exec(fullText);
      if (m) {
        const raw = m[1].replace(/^(o bot|ele|o agente|a ia|ia)\s+(deve\s+)?/i, "").trim();
        newRuleText = ensurePeriod(/^(sempre|nunca|não|nao)\b/i.test(raw) ? capitalizeFirst(raw) : toImperative(raw));
      }
    }
  }

  // Escopo
  let scopeText: string | undefined;
  let scopeSection: string | undefined;
  let scopeAll = SCOPE_ALL.test(n);
  if (scopeAnswer) {
    const v = scopeAnswer.slice(7);
    if (v === "*") scopeAll = true;
    else scopeSection = v;
  } else if (!scopeAll) {
    const m = SCOPE.exec(n);
    if (m) scopeText = m[1].trim();
  }

  // Assunto: tira intenção, escopo, gatilho/comportamento condicional e trechos citados
  let topicSource = n;
  if (scopeText) topicSource = topicSource.replace(scopeText, " ");
  topicSource = topicSource.replace(SCOPE_ALL, " ");
  if (intent === "substituir" && replaceFrom) topicSource = normalize(replaceFrom);
  if (intent === "condicional" && trigger) topicSource = trigger;
  for (const re of INTENT_NOISE) topicSource = topicSource.replace(re, " ");
  if (intent === "pergunta") for (const re of QUESTION_NOISE) topicSource = topicSource.replace(re, " ");
  if (intent === "adicionar" && newRuleText) topicSource = `${topicSource} ${normalize(newRuleText)}`;

  const topicWords = Array.from(new Set(contentWords(topicSource)));
  const topicStems = Array.from(new Set(topicWords.map(stem)));

  return {
    intent,
    fullText,
    topicWords,
    topicStems,
    topicDisplay: displaySpan(request, topicWords),
    quoted,
    replaceFrom,
    replaceTo,
    newRuleText,
    scopeText,
    scopeSection,
    scopeAll,
    trigger,
    behavior,
    vagueBehavior: intent === "condicional" && (!behavior || VAGUE_BEHAVIOR.test(normalize(behavior)) || contentWords(behavior).length < 2),
  };
}
