/**
 * Gabarito da busca de comportamento no prompt (aba "Perguntar ao prompt").
 *
 * Linhas em numeração 1-based, como aparecem na tela, sobre a versão
 * importada dos prompts reais (v1). Os casos de controle (kind "controle")
 * foram registrados antes de qualquer código do algoritmo existir e tratam
 * de assuntos diferentes do caso de desenvolvimento.
 */
export type LocateCase = {
  id: string;
  kind: "desenvolvimento" | "controle";
  prompt: string; // slug
  question: string;
  /** O grupo principal precisa conter estas linhas. */
  mainGroupIncludes?: number[];
  /** O grupo principal deve ser exatamente este conjunto. */
  mainGroupExactly?: number[];
  /** Nenhuma destas linhas pode estar no grupo principal. */
  mainGroupExcludes?: number[];
  /** A resposta deve trazer a seção com estas subseções, cada uma como grupo. */
  sectionWithSubgroups?: { title: string; subgroupIncludes: number[][] };
  /** Duplicidade/divergência esperada: pelo menos um achado envolvendo estas linhas. */
  overlapInvolves?: number[];
  /** Nenhum achado de duplicidade/divergência no grupo principal (proteção contra alarme falso). */
  noOverlapInMainGroup?: boolean;
  /** Lacuna conhecida e ainda não resolvida: é reportada, mas não conta como aprovada nem derruba a execução. */
  knownGap?: string;
};

export const LOCATE_CASES: LocateCase[] = [
  {
    id: "D1-hcm-preferencia",
    kind: "desenvolvimento",
    prompt: "hcm",
    question: "Quais regras falam da preferência de contato?",
    mainGroupExactly: [191, 193, 195, 197, 199, 201, 203],
    noOverlapInMainGroup: true,
  },
  {
    id: "D2-hcm-encaminhamento",
    kind: "desenvolvimento",
    prompt: "hcm",
    question: "Existe alguma regra duplicada em relação a encaminhamento de mensagem ao consultor",
    sectionWithSubgroups: {
      title: "Encaminhamento ao Consultor Comercial",
      subgroupIncludes: [
        [163, 165, 179, 181, 183, 185, 187],
        [191, 193, 195, 197, 199, 201, 203],
      ],
    },
  },
  {
    id: "C1-ec-valor-sem-contexto",
    kind: "controle",
    prompt: "ec",
    question: "O que a IA faz quando o cliente fala de um valor sem dizer de qual produto é?",
    mainGroupIncludes: [66, 68, 70, 71, 72, 73],
  },
  {
    id: "C2-erp-solucao-contabil",
    kind: "controle",
    prompt: "erp",
    question: "Como a IA deve agir se o lead procurar uma solução contábil?",
    mainGroupIncludes: [276, 277, 278, 279, 280, 282, 284, 285, 286],
    mainGroupExcludes: [289, 299, 301, 302, 303],
  },
  {
    id: "C3-erp-documentos-base",
    kind: "controle",
    prompt: "erp",
    question: "A IA pode dizer quais documentos existem na base de conhecimento?",
    mainGroupIncludes: [321, 322, 323, 324],
    overlapInvolves: [324],
  },
  {
    // Encontrado na 1ª checagem às cegas: falhou antes de as regras herdarem o assunto do caminho da seção.
    id: "B1-hcm-qualificacao-produto",
    kind: "controle",
    prompt: "hcm",
    question: "O que a IA precisa descobrir sobre a folha de pagamento na qualificação do eKeep?",
    mainGroupIncludes: [329, 330, 331, 332, 333, 334, 335, 336, 337],
    knownGap:
      "o bloco certo vem completo, mas em 2º lugar, quase empatado com a descrição do produto: a pergunta diz “descobrir” e o prompt diz “busque identificar”, e não há sinônimos",
  },
  // 2ª checagem às cegas (blocos sorteados, perguntas escritas antes de rodar)
  {
    id: "B2-hcm-folha-nao-clientes",
    kind: "controle",
    prompt: "hcm",
    question: "O que a IA pergunta sobre a folha de pagamento para quem não é cliente?",
    mainGroupIncludes: [117, 118, 119, 120],
  },
  {
    id: "B3-ec-resistencia",
    kind: "controle",
    prompt: "ec",
    question: "Como a IA reage quando o escritório resiste a responder as perguntas?",
    mainGroupIncludes: [297, 299, 301, 303, 305],
    knownGap: "“resiste” (verbo) não casa com “Resistência” (substantivo): o radical leve não junta palavras derivadas",
  },
  {
    id: "B4-erp-apresentacao-generica",
    kind: "controle",
    prompt: "erp",
    question: "Como a IA apresenta as soluções quando o usuário pergunta de forma genérica?",
    mainGroupIncludes: [89, 90, 91],
  },
];

// ---------------------------------------------------------------------------
// Tipo de pergunta: FATO (listagem/contagem de itens) × COMPORTAMENTO.
// Além destes, toda pergunta de LOCATE_CASES precisa continuar COMPORTAMENTO.
// ---------------------------------------------------------------------------
export type ClassifyCase = { question: string; expect: "FATO" | "COMPORTAMENTO" | "AMBIGUO"; note?: string };

export const CLASSIFY_CASES: ClassifyCase[] = [
  { question: "Quais regras falam da preferência de contato?", expect: "COMPORTAMENTO", note: "armadilha: “quais” + regra (metalinguagem)" },
  { question: "A IA pode dizer quais documentos existem na base de conhecimento?", expect: "COMPORTAMENTO", note: "armadilha: modal antes de “quais”" },
  { question: "Quais são os produtos ou soluções que existem nesse prompt", expect: "FATO" },
  { question: "Liste as soluções citadas no prompt", expect: "FATO" },
  { question: "Que produtos existem no prompt?", expect: "FATO" },
  { question: "Quantos planos existem no NG Essence?", expect: "AMBIGUO", note: "lista, mas restrita a um assunto: mostra os dois" },
  { question: "Quando a IA deve perguntar o nome do usuário?", expect: "COMPORTAMENTO" },
];

// ---------------------------------------------------------------------------
// Extração de itens nomeados para perguntas de FATO. Nomes exatamente como no prompt.
// HCM e EC usados no desenvolvimento; ERP é a prova sem ajuste de código.
// ---------------------------------------------------------------------------
export type EntityCase = {
  id: string;
  prompt: string;
  question: string;
  /** Itens com seção própria: exatamente estes. */
  withSectionExactly: string[];
  /** Itens citados (sem seção própria): pelo menos estes. */
  citedIncludes?: string[];
  /** Se aparecerem, precisam estar marcados como baixa confiança. */
  lowConfidenceIfPresent?: string[];
};

// ---------------------------------------------------------------------------
// Resposta completa da aba (prompt + base de conhecimento). Registrado antes do
// código da busca na base. Títulos de documento exatamente como cadastrados.
// ---------------------------------------------------------------------------
export type AnswerCase = {
  id: string;
  prompt: string;
  question: string;
  expectKind: "FATO" | "COMPORTAMENTO" | "AMBIGUO" | "DOCUMENTOS";
  /** Documentos da base na resposta: exatamente estes. */
  docsExactly?: string[];
  /** Documentos da base na resposta: pelo menos estes. */
  docsIncludes?: string[];
  /** Primeiro documento da lista (o mais relacionado). */
  firstDoc?: string;
  /** Ocorrências do assunto contadas por documento. */
  occurrences?: Record<string, number>;
  /** A grafia exata encontrada precisa aparecer ao lado do trecho (ex.: "NGEssence"). */
  formsInclude?: string[];
  /** A base não pode aparecer como seção da resposta (nada relevante). */
  noKnowledgeSection?: boolean;
  /** O grupo principal do prompt precisa conter estas linhas. */
  promptMainIncludes?: number[];
  /** O grupo principal do prompt precisa estar numa seção cujo caminho contém este título. */
  promptMainSection?: string;
  /** Linhas que não podem aparecer como resposta do prompt (só, no máximo, na seção à parte sobre a fonte). */
  notInPromptAnswer?: number[];
};

export const ANSWER_CASES: AnswerCase[] = [
  {
    id: "K1-ec-docs-ng-essence",
    prompt: "ec",
    question: "Quais são as bases de conhecimento que mencionam o NG Essence?",
    expectKind: "DOCUMENTOS",
    docsExactly: ["NGEssence Run", "NGEssence Start", "Tabela NGessence (2)", "Exemplos de interação - Agente EC", "Keevo Institucional - EC"],
    firstDoc: "NGEssence Run",
    occurrences: { "NGEssence Run": 18, "NGEssence Start": 16, "Tabela NGessence (2)": 11, "Exemplos de interação - Agente EC": 3, "Keevo Institucional - EC": 1 },
    formsInclude: ["NGEssence", "NG Essence"],
    notInPromptAnswer: [26, 27, 28, 29, 30],
  },
  {
    id: "K2-ec-preferencia-so-prompt",
    prompt: "ec",
    question: "Quais regras falam da preferência de contato?",
    expectKind: "COMPORTAMENTO",
    promptMainIncludes: [135, 137, 144, 146, 148, 150],
    noKnowledgeSection: true,
  },
  {
    id: "K3-ec-preco-duas-fontes",
    prompt: "ec",
    question: "Como a IA deve falar sobre o preço do NG Essence?",
    expectKind: "COMPORTAMENTO",
    promptMainSection: "Preço",
    docsIncludes: ["NGEssence Run"],
    firstDoc: "NGEssence Run",
  },
  {
    id: "K4-erp-docs-alpha-core",
    prompt: "erp",
    question: "Quais documentos da base mencionam o Alpha Core?",
    expectKind: "DOCUMENTOS",
    docsExactly: ["Alpha Core", "Quebra de Objeções Alpha", "Keevo Institucional", "Keevo Institucional - ERP", "Alpha Emissor"],
    firstDoc: "Alpha Core",
    occurrences: { "Alpha Core": 10 },
  },
  {
    id: "K5-hcm-preferencia-sem-base",
    prompt: "hcm",
    question: "Quais regras falam da preferência de contato?",
    expectKind: "COMPORTAMENTO",
    promptMainIncludes: [191, 193, 195, 197, 199, 201, 203],
    noKnowledgeSection: true,
  },
  {
    // Relatado pelo usuário: nome em minúsculas e precedido de "produto" perdia 3 documentos
    id: "K7-ec-minusculas-com-descritor",
    prompt: "ec",
    question: "quais bases de conhecimento mencionam o produto ng essence?",
    expectKind: "DOCUMENTOS",
    docsExactly: ["NGEssence Run", "NGEssence Start", "Tabela NGessence (2)", "Exemplos de interação - Agente EC", "Keevo Institucional - EC"],
    firstDoc: "NGEssence Run",
    occurrences: { "NGEssence Run": 18, "NGEssence Start": 16, "Tabela NGessence (2)": 11, "Exemplos de interação - Agente EC": 3, "Keevo Institucional - EC": 1 },
  },
  {
    // Mesma correção em outra unidade, sem ajuste
    id: "K8-erp-minusculas-com-descritor",
    prompt: "erp",
    question: "quais documentos falam da solução alpha core?",
    expectKind: "DOCUMENTOS",
    docsExactly: ["Alpha Core", "Quebra de Objeções Alpha", "Keevo Institucional", "Keevo Institucional - ERP", "Alpha Emissor"],
    firstDoc: "Alpha Core",
  },
  {
    // A base é o ASSUNTO (comportamento da IA sobre a base), não a fonte a consultar
    id: "K6-erp-base-como-assunto",
    prompt: "erp",
    question: "A IA pode dizer quais documentos existem na base de conhecimento?",
    expectKind: "COMPORTAMENTO",
    promptMainIncludes: [321, 322, 323, 324],
    noKnowledgeSection: true,
  },
];

export const ENTITY_CASES: EntityCase[] = [
  {
    id: "F1-hcm-produtos",
    prompt: "hcm",
    question: "Quais são os produtos ou soluções que existem nesse prompt",
    withSectionExactly: ["NG Folha", "eKeep", "NG Ponto", "Keevo People"],
    lowConfidenceIfPresent: ["Regras de Segmentação", "Departamento Pessoal"],
  },
  {
    id: "F2-ec-produtos",
    prompt: "ec",
    question: "Quais são os produtos ou soluções que existem nesse prompt",
    withSectionExactly: ["NG Essence", "Captura Notas", "Holos"],
  },
  {
    id: "F3-erp-produtos",
    prompt: "erp",
    question: "Quais são os produtos ou soluções que existem nesse prompt",
    withSectionExactly: ["Alpha Core", "Alpha Emissor"],
    citedIncludes: ["NG Essence", "Holos", "NG Folha", "Keevo People", "eKeep", "Captura Notas"],
    // Acrescentado depois da 1ª execução: siglas por extenso apareciam como alta confiança
    lowConfidenceIfPresent: ["Departamento Pessoal", "Recursos Humanos"],
  },
];
