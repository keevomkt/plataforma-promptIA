/**
 * Utilitários de texto em português usados pelo motor de análise:
 * normalização, tokenização, radicais (stemming leve), grupos de sinônimos
 * e divisão em frases. Tudo determinístico e local — nenhuma chamada externa.
 */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das d no na nos nas em num numa ao aos à às " +
    "por pelo pela pelos pelas para pra pro com sem sob sobre entre ate até apos após " +
    "e ou mas nem que se como quando onde qual quais quanto quanta cada todo toda todos todas " +
    "eu tu ele ela nos vos eles elas voce voces você vocês me te lhe lhes seu sua seus suas " +
    "meu minha meus minhas nosso nossa isso isto esse essa este esta aquele aquela aquilo " +
    "ja já so só tambem também ainda muito muita muitos muitas mais menos bem " +
    "ser estar ter haver ir fazer é e foi era sao são esta está estao estão tem têm ha há " +
    "seja sejam deve devem pode podem vai vao vão fica ficar " +
    "nao sim quero queria gostaria preciso precisamos desejo favor porfavor por-favor " +
    "bot agente assistente ia prompt regra regras parte partes"
  )
    .split(/\s+/)
    .map((w) => stripAccents(w))
);

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sem acentos, só letras/números/espaço. */
export function normalize(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sufixos removidos do fim da palavra (ordem importa: mais longos primeiro).
const SUFFIXES = [
  "amentos", "imentos", "amento", "imento", "mentos", "mento",
  "acoes", "icoes", "acao", "icao", "coes", "cao",
  "ismos", "ismo", "istas", "ista",
  "ando", "endo", "indo", "adas", "ados", "idas", "idos", "ada", "ado", "ida", "ido",
  "ariam", "eriam", "iriam", "aram", "eram", "iram", "arao", "erao",
  "ar", "er", "ir", "am", "em", "ou", "as", "es", "os", "is",
  "a", "e", "o", "s",
];

/**
 * Radical leve: suficiente para que "pergunte", "perguntar" e "perguntas"
 * caiam no mesmo radical ("pergunt"), sem a agressividade de um stemmer
 * completo (que juntaria palavras sem relação em prompts técnicos).
 */
export function stem(word: string): string {
  let w = normalize(word);
  if (w.length <= 3) return w;
  // Plurais irregulares comuns
  if (w.endsWith("oes") || w.endsWith("aes")) w = w.slice(0, -3) + "ao";
  else if (w.endsWith("ns")) w = w.slice(0, -2) + "m";
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

/** Palavras significativas (sem stopwords) de um texto, já normalizadas. */
export function contentWords(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export function stems(s: string): string[] {
  return contentWords(s).map(stem);
}

/**
 * Grupos de sinônimos do domínio. Um termo do pedido que não aparece
 * literalmente no prompt ainda casa com uma regra que usa um sinônimo do
 * mesmo grupo (com peso menor do que a correspondência exata).
 */
const CONCEPT_GROUPS: Record<string, string[]> = {
  perguntar: ["pergunt", "question", "indag", "coletar", "colet", "solicit", "levant"],
  encaminhar: ["encaminh", "transfer", "passag", "repass", "direcion", "handoff", "escal"],
  consultor: ["consultor", "vendedor", "comercial", "especialist", "closer", "sdr", "execut"],
  preco: ["prec", "valor", "cust", "invest", "mensalidad", "orcament", "cotac", "proposta", "tabel"],
  objetivo: ["objetiv", "curt", "concis", "diret", "brev", "sucint", "enxut", "resumid", "prolix", "longa", "long"],
  cliente: ["client", "usuari", "lead", "pessoa", "contato", "prospect"],
  colaboradores: ["colaborador", "funcionari", "empregad", "vida", "headcount"],
  empresa: ["empres", "companhi", "organizac", "negoci"],
  saudacao: ["saudac", "cumpriment", "boas vindas", "apresent"],
  tom: ["tom", "formal", "informal", "cordial", "educad", "simpat", "amigavel", "linguag", "emoj"],
  qualificar: ["qualific", "diagnost", "triag", "descobert"],
  resumo: ["resum", "sintes", "registr", "anot", "confirm"],
  produto: ["produt", "modul", "solucao", "sistem", "plataform", "ferrament"],
  seguranca: ["segur", "restri", "proib", "sigil", "confidencial", "privacidad"],
  suporte: ["suport", "atendiment", "chamad", "ticket", "helpdesk"],
  mensagem: ["mensag", "respost", "texto"],
};

const STEM_TO_CONCEPT = new Map<string, string>();
for (const [concept, list] of Object.entries(CONCEPT_GROUPS)) {
  for (const s of list) STEM_TO_CONCEPT.set(s, concept);
}

/** Conceito (grupo de sinônimos) de um radical, se houver. */
export function conceptOf(s: string): string | undefined {
  if (STEM_TO_CONCEPT.has(s)) return STEM_TO_CONCEPT.get(s);
  // Radicais registrados funcionam como prefixo ("encaminh" cobre "encaminhament")
  for (const [prefix, concept] of STEM_TO_CONCEPT) {
    if (prefix.length >= 4 && s.startsWith(prefix)) return concept;
  }
  return undefined;
}

/** Dois radicais representam a mesma palavra? (igualdade ou prefixo próximo) */
export function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3;
}

/**
 * Divide uma linha em frases, preservando o texto original de cada uma
 * (inclusive a pontuação), para que a remoção de uma única frase de um
 * parágrafo não altere as demais.
 */
export function splitSentences(line: string): string[] {
  const parts: string[] = [];
  // Quebra após . ! ? seguidos de espaço e letra maiúscula/aspas — evita
  // quebrar "ex." ou números decimais na maioria dos casos.
  const re = /(?<=[.!?])\s+(?=["“(]?[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const piece = line.slice(last, m.index);
    // Não quebra depois de abreviações curtas ("ex.", "Sr.", "etc.")
    if (/\b(ex|sr|sra|dr|dra|etc|obs|p\.ex)\.$/i.test(piece)) continue;
    parts.push(piece);
    last = m.index + m[0].length;
  }
  parts.push(line.slice(last));
  return parts.filter((p) => p.trim().length > 0);
}

/** Palavras típicas de restrição/obrigação, usadas para polaridade e validação. */
export const NEGATIVE_RE = /\b(nunca|jamais|nao|proibid[oa]s?|evite|evitar|sem)\b/;
export const POSITIVE_RE = /\b(sempre|obrigatori[oa]s?|deve|devem|precisa|necessari[oa]|pergunte|informe|confirme)\b/;

export function polarity(textNormalized: string): "negativa" | "positiva" | "neutra" {
  if (NEGATIVE_RE.test(textNormalized)) return "negativa";
  if (POSITIVE_RE.test(textNormalized)) return "positiva";
  return "neutra";
}

export function capitalizeFirst(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function ensurePeriod(s: string): string {
  const t = s.trim();
  return /[.!?:)"”]$/.test(t) ? t : `${t}.`;
}

export function truncate(s: string, max = 140): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
