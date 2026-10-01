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
];
