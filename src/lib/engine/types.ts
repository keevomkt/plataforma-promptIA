import { z } from "zod";

export type Intent =
  | "remover"
  | "adicionar"
  | "substituir"
  | "alterar"
  | "objetividade"
  | "tom"
  | "menos_perguntas"
  | "condicional"
  | "auditoria";

export type ImpactLevel = "BAIXO" | "MEDIO" | "ALTO";

/** Uma regra (linha, ou frase dentro de uma linha) do prompt. */
export type RuleRef = {
  line: number; // 0-based
  section: string;
  text: string;
};

/**
 * Operação concreta sobre o texto do prompt. É o que a plataforma propõe
 * e o usuário pode editar antes de aplicar. Operações sempre apontam para
 * a linha original e conferem o texto antigo antes de aplicar, para nunca
 * alterar uma linha diferente da analisada.
 */
export const OperationSchema = z.object({
  id: z.string(),
  type: z.enum(["remover_linha", "substituir_linha", "inserir_apos"]),
  line: z.number().int().min(-1), // -1 = inserir no início
  /** Texto original da linha (conferido na aplicação). */
  oldText: z.string(),
  /** Novo texto completo da linha (substituir) ou linha(s) inseridas (inserir). */
  newText: z.string(),
  section: z.string(),
  /** Explicação curta mostrada ao usuário. */
  reason: z.string(),
  /** Principal = atende o pedido. Relacionada = ajuste de dependência. Revisão = conflito que o usuário decide. */
  role: z.enum(["principal", "relacionada", "revisao"]),
  enabled: z.boolean(),
});

export type Operation = z.infer<typeof OperationSchema>;

export type Clarification = {
  question: string;
  /** Opções prontas; `value` é enviado de volta para refazer a análise. */
  options: { label: string; value: string }[];
  /** Aceita resposta livre além das opções. */
  allowFreeText: boolean;
  freeTextPlaceholder?: string;
};

export type ChangeAnalysis = {
  engine: string; // identifica quem gerou a análise (motor local ou camada de IA opcional)
  request: string;
  /** Respostas de esclarecimento acumuladas (escopo escolhido, detalhe informado...). */
  answers: string[];
  intent: Intent;
  understanding: string;
  affectedSections: string[];
  affectedRules: RuleRef[];
  preservedRules: RuleRef[];
  preservedSections: string[];
  /** Outras partes que citam o mesmo assunto (dependências). */
  relatedRules: RuleRef[];
  conflicts: { description: string; rule?: RuleRef }[];
  suggestion: string;
  suggestionBullets: string[];
  suggestedRule?: string;
  impact: ImpactLevel;
  impactReason: string;
  clarification?: Clarification;
  operations: Operation[];
  /** Observações do motor (ex: nada encontrado). */
  notes: string[];
  /** Trechos da base de conhecimento relacionados ao pedido (análises antigas podem não ter). */
  knowledgeRefs?: KnowledgeRef[];
  /** Quantos documentos da base foram consultados. */
  knowledgeDocuments?: number;
  /** Presente só em revisões completas do prompt (intenção "auditoria", ver audit.ts). */
  audit?: AuditResult;
  /** Presente só em diagnósticos gerados a partir de uma conversa real (ver src/lib/ai/diagnose.ts). */
  conversationInput?: { transcript?: string; hadImage: boolean; expectedBehavior: string };
};

export type AuditCategory =
  | "contraditoria"
  | "valores_divergentes"
  | "duplicada"
  | "sobreposta"
  | "mal_escrita"
  | "estrutura"
  | "base_conhecimento";

export type AuditFinding = {
  id: string;
  category: AuditCategory;
  severity: "alta" | "media" | "baixa";
  title: string;
  detail: string;
  rules: RuleRef[];
  /** Pedido pronto para abrir na aba Alterar prompt e corrigir este ponto. */
  suggestedRequest?: string;
};

export type AuditResult = {
  findings: AuditFinding[];
  /** Total por categoria, antes de qualquer limite de exibição. */
  counts: Partial<Record<AuditCategory, number>>;
  checkedRules: number;
  knowledgeDocuments: number;
  knowledgeScope: string;
  limitations: string[];
};

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  contraditoria: "Regras contraditórias",
  valores_divergentes: "Valores divergentes",
  duplicada: "Regras duplicadas",
  sobreposta: "Regras sobrepostas",
  mal_escrita: "Regras mal escritas",
  estrutura: "Estrutura",
  base_conhecimento: "Sem fonte na base de conhecimento",
};

export type KnowledgeRef = {
  documentId: string;
  title: string;
  businessUnit: string;
  category: string;
  excerpt: string;
  score: number;
};

export const KNOWLEDGE_CATEGORIES: Record<string, string> = {
  PRODUTOS: "Produtos e módulos",
  EMPRESA: "Institucional / empresa",
  TERMOS: "Termos e glossário",
  COMERCIAL: "Comercial e preços",
  PROCESSOS: "Processos e atendimento",
  OUTROS: "Outros",
};

export type ValidationCheck = {
  label: string;
  status: "ok" | "aviso" | "erro";
  details: string[];
};

export type ValidationResult = {
  checks: ValidationCheck[];
  summary: "ok" | "aviso" | "erro";
};

export type ChangeStatus =
  | "AGUARDANDO_ESCLARECIMENTO"
  | "AGUARDANDO_APROVACAO"
  | "SEM_ALTERACAO"
  | "APLICADA"
  | "VERSIONADA"
  | "CANCELADA"
  | "REVISAO_CONCLUIDA";

export const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_ESCLARECIMENTO: "Aguardando esclarecimento",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  SEM_ALTERACAO: "Nada a alterar",
  APLICADA: "Aplicada — aguardando salvar",
  VERSIONADA: "Versionada",
  REVISAO_CONCLUIDA: "Revisão concluída",
  CANCELADA: "Cancelada",
};

export const IMPACT_LABELS: Record<ImpactLevel, string> = {
  BAIXO: "Baixo",
  MEDIO: "Médio",
  ALTO: "Alto",
};
