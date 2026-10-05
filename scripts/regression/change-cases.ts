/**
 * Casos reais da avaliação de alterações (correção colada do Claude e pedido
 * escrito), conferidos contra o prompt vigente no banco. Linhas 1-based.
 * O texto das respostas é o que o Claude devolveu; nenhum termo daqui é
 * usado pelo motor.
 */

export type ExpectedCheck = { line: number; kind: "conflitante" | "dependente" | "compativel" | "substituida" };

export type ClaudeCase = {
  id: string;
  prompt: string; // slug
  description: string;
  answer: string;
  /** Nenhum bloco reconhecido: a plataforma deve recusar, com o motivo esperado. */
  rejected?: RegExp;
  /** Linhas que as operações devem tocar. */
  touches?: number[];
  checks?: ExpectedCheck[];
  /** Linhas que NÃO podem sair como conflitantes. */
  notConflicting?: number[];
};

export type RequestCase = {
  id: string;
  prompt: string;
  description: string;
  request: string;
  /** O formulário de pedido escrito deve recusar e mandar para "Corrigir com o Claude". */
  looksLikeClaude?: boolean;
  checks?: ExpectedCheck[];
};

// Resposta real do Claude (05/10/2026) ao relato sobre o faturamento bruto anual no ERP
const OLD_L189 =
  "Caso o usuário não queira informar o faturamento bruto anual, não insista nem encerre o atendimento: continue normalmente a qualificação, seguindo para a próxima pergunta";
const NEW_L189 = [
  "O faturamento bruto anual é uma informação obrigatória para o enquadramento da solução. Caso o usuário não informe de imediato ou demonstre resistência, explique brevemente que essa informação é necessária para identificar a faixa correta do Alpha Core e pergunte novamente antes de avançar para a próxima pergunta da qualificação.",
  "Nunca avance para a próxima pergunta da qualificação sem ter obtido o faturamento bruto anual.",
].join("\n");

export const CLAUDE_CASES: ClaudeCase[] = [
  {
    id: "C1",
    prompt: "erp",
    description: "faturamento obrigatório: a troca da L189 substitui a opcionalidade; L120 depende",
    answer: `CAUSA\nA L189 deixa o faturamento opcional.\n\n\`\`\`\nTROCAR\n<<<\n${OLD_L189}\n>>>\n${NEW_L189}\nFIM\n\`\`\``,
    touches: [189],
    checks: [
      { line: 189, kind: "substituida" },
      { line: 120, kind: "dependente" },
    ],
    notConflicting: [188, 120],
  },
  {
    id: "C2",
    prompt: "erp",
    description: "a correção que NÃO trata a L189: o conflito aparece mesmo assim",
    answer: `CAUSA\nteste\n\nINSERIR DEPOIS DE\n<<<\n- Pergunte o faturamento bruto anual da empresa.\n>>>\n- ${NEW_L189.split("\n")[1]}\nFIM`,
    touches: [188],
    checks: [{ line: 189, kind: "conflitante" }],
  },
  {
    id: "C3",
    prompt: "erp",
    description: "resposta copiada sem as marcas (como chegou em 05/10): recusada, sem adivinhar",
    answer: `${OLD_L189}\n${NEW_L189}\nFIM`,
    rejected: /marcas/,
  },
  {
    id: "C4",
    prompt: "erp",
    description: "texto livre, sem nada do formato: recusado",
    answer: "Sugiro deixar o faturamento obrigatório e insistir com educação.",
    rejected: /formato/,
  },
];

export const REQUEST_CASES: RequestCase[] = [
  {
    id: "R1",
    prompt: "erp",
    description: "resposta do Claude colada no pedido escrito: recusada e mandada para o campo certo",
    request: `${OLD_L189}\n${NEW_L189}\nFIM`,
    looksLikeClaude: true,
  },
  {
    id: "R2",
    prompt: "erp",
    description: "pedido escrito com a mesma intenção: mesma avaliação de conflito",
    request: "Adicione uma regra: nunca avance para a próxima pergunta da qualificação sem ter obtido o faturamento bruto anual.",
    checks: [{ line: 189, kind: "conflitante" }],
  },
  {
    id: "R3",
    prompt: "erp",
    description: "pedido escrito comum não é confundido com resposta do Claude",
    request: "Quero que o bot seja mais objetivo.",
    looksLikeClaude: false,
  },
];
