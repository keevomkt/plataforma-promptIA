/**
 * Diagnóstico de conversa (camada opcional de IA — ver src/lib/ai/client.ts).
 *
 * Entrada: o prompt atual, uma conversa real (texto colado e/ou uma imagem
 * de print) e o comportamento que era esperado. Saída: o mesmo formato
 * `ChangeAnalysis` que o motor local produz, para passar pelas telas de
 * revisão, diff, validação e versionamento já existentes sem nenhuma tela
 * nova de aprovação.
 *
 * Nada aqui é aplicado automaticamente: o resultado são OPERAÇÕES PROPOSTAS.
 * Cada operação só é aceita se o trecho citado pelo modelo existir,
 * verbatim, no prompt atual — resolvido localmente, nunca a partir de
 * números de linha "confiados" da resposta do modelo. Isso preserva a
 * mesma regra de preservação do motor local mesmo usando IA para o
 * diagnóstico.
 */
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, DIAGNOSIS_MODEL } from "./client";
import { lineWithText, removeSentences, replaceInsensitive } from "@/lib/engine/apply";
import { KnowledgeIndex, findUnsourcedNames, type KnowledgeSource } from "@/lib/engine/knowledge";
import { parsePrompt, sectionLabel, visibleSections, type ParsedPrompt, type PromptLine, type PromptSection } from "@/lib/engine/parse";
import { computeImpact, computeInsertion, preserved } from "@/lib/engine/shared";
import { stems, truncate } from "@/lib/engine/text";
import type { ChangeAnalysis, Operation, RuleRef } from "@/lib/engine/types";

export const AI_ENGINE = `ia-diagnostico (${DIAGNOSIS_MODEL})`;

export type DiagnoseInput = {
  promptContent: string;
  conversationText: string;
  conversationImage?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" };
  expectedBehavior: string;
  knowledge: KnowledgeSource[];
};

const OperationSchema = z.object({
  kind: z.enum(["remover_trecho", "substituir_trecho", "adicionar_regra"]),
  quote: z.string().nullable(),
  sectionTitle: z.string().nullable(),
  newText: z.string().nullable(),
  reason: z.string(),
});

const DiagnosisSchema = z.object({
  rootCauseFound: z.boolean(),
  understanding: z.string(),
  affectedSectionTitles: z.array(z.string()),
  conflicts: z.array(z.object({ description: z.string(), quote: z.string().nullable() })),
  suggestion: z.string(),
  operations: z.array(OperationSchema),
  notes: z.array(z.string()),
});

type DiagnosisOutput = z.infer<typeof DiagnosisSchema>;

const TOOL_INPUT_SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rootCauseFound", "understanding", "affectedSectionTitles", "conflicts", "suggestion", "operations", "notes"],
  properties: {
    rootCauseFound: {
      type: "boolean",
      description: "true se você identificou, no texto do prompt, a(s) regra(s) que provavelmente causou(aram) o comportamento incorreto.",
    },
    understanding: {
      type: "string",
      description: "1-3 frases: o que aconteceu de errado na conversa e por que, ligando ao texto real do prompt.",
    },
    affectedSectionTitles: {
      type: "array",
      items: { type: "string" },
      description: "Títulos EXATOS das seções do prompt (como aparecem nos cabeçalhos) relacionadas ao diagnóstico.",
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quote"],
        properties: {
          description: { type: "string" },
          quote: { type: ["string", "null"], description: "Trecho exato do prompt relacionado, se houver." },
        },
      },
      description: "Riscos ou regras que podem entrar em conflito com a correção proposta.",
    },
    suggestion: {
      type: "string",
      description: "Explicação da correção recomendada, em linguagem clara para quem não escreveu o prompt.",
    },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "quote", "sectionTitle", "newText", "reason"],
        properties: {
          kind: { type: "string", enum: ["remover_trecho", "substituir_trecho", "adicionar_regra"] },
          quote: {
            type: ["string", "null"],
            description:
              "OBRIGATÓRIO para remover_trecho/substituir_trecho: uma cópia EXATA, palavra por palavra, de uma frase ou trecho que existe no PROMPT ATUAL abaixo (não da conversa). Copie e cole o texto real, não parafraseie. Nulo para adicionar_regra.",
          },
          sectionTitle: {
            type: ["string", "null"],
            description: "Para adicionar_regra: o título EXATO da seção do prompt onde a nova regra deve entrar. Nulo nos outros casos.",
          },
          newText: {
            type: ["string", "null"],
            description: "Texto novo: a regra completa (para adicionar_regra) ou o texto que substitui o trecho citado (para substituir_trecho). Nulo para remover_trecho.",
          },
          reason: { type: "string", description: "Por que esta mudança corrige o problema observado na conversa." },
        },
      },
      description: "Lista vazia se rootCauseFound for false. Cada operação deve ser a menor mudança possível.",
    },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "Observações para quem for revisar: limitações do diagnóstico, alternativas consideradas, etc.",
    },
  },
};

const SYSTEM_PROMPT = `Você é um engenheiro de prompts sênior que audita o prompt de um agente comercial de atendimento (Keevo Software) a partir de uma conversa real que deu errado.

Você recebe: (1) o PROMPT ATUAL completo, com números de linha só para referência humana — nunca os copie na resposta; (2) trechos da BASE DE CONHECIMENTO da empresa, se houver; (3) uma CONVERSA REAL entre o agente e um lead (texto e/ou uma imagem de print de tela); (4) o COMPORTAMENTO ESPERADO, descrito por quem revisou a conversa.

Sua tarefa: encontrar, no texto real do prompt, a causa provável do comportamento incorreto, e propor a MENOR alteração possível que resolveria isso — sem reescrever ou reorganizar o prompt.

Regras obrigatórias:
1. Baseie-se exclusivamente no texto do PROMPT ATUAL fornecido. Nunca invente uma seção, regra ou produto que não esteja escrito ali ou na base de conhecimento.
2. Em cada operação "remover_trecho" ou "substituir_trecho", o campo "quote" deve ser uma cópia EXATA (mesmas palavras, mesma pontuação) de um trecho que você pode encontrar no PROMPT ATUAL. Se você não conseguir citar um trecho exato, não proponha essa operação — em vez disso, explique a limitação em "notes".
3. Se a causa não estiver em nenhuma regra existente (ex: o problema é uma lacuna, não uma regra errada), prefira "adicionar_regra" com o texto completo da nova regra, indicando a seção certa.
4. Se, mesmo assim, você não conseguir identificar nenhuma causa no prompt (o problema pode ser do modelo de produção, de um dado ausente na base de conhecimento, ou de comportamento aleatório), marque rootCauseFound como false, deixe operations vazio e explique em notes.
5. Nunca proponha uma alteração maior do que o necessário para o comportamento observado. Preserve terminologia, produtos, preços e regras de segurança que não têm relação com o problema.
6. Não use as palavras dos participantes da conversa como fonte de fatos sobre produtos/preços — use apenas o prompt e a base de conhecimento para isso.

Responda SEMPRE chamando a ferramenta submit_diagnosis exatamente uma vez, com todos os campos preenchidos.`;

export async function diagnoseFromConversation(input: DiagnoseInput): Promise<ChangeAnalysis> {
  const parsed = parsePrompt(input.promptContent);
  const client = getAnthropicClient();

  const numberedPrompt = input.promptContent
    .split(/\r?\n/)
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n");

  const kb = new KnowledgeIndex(input.knowledge);
  const kbTopic = Array.from(new Set(stems(`${input.conversationText} ${input.expectedBehavior}`)));
  const knowledgeRefs = kb.isEmpty ? [] : kb.search(kbTopic, 8);
  const kbBlock = knowledgeRefs.length
    ? knowledgeRefs.map((r) => `### ${r.title} (${r.businessUnit})\n${r.excerpt}`).join("\n\n")
    : input.knowledge.length
      ? "(Nenhum trecho da base de conhecimento pareceu relacionado a esta conversa.)"
      : "(Nenhum documento cadastrado na base de conhecimento.)";

  const textParts = [
    `PROMPT ATUAL (com numeração de linha apenas como referência):\n"""\n${numberedPrompt}\n"""`,
    `BASE DE CONHECIMENTO (trechos relacionados):\n"""\n${kbBlock}\n"""`,
    input.conversationText.trim()
      ? `CONVERSA REAL COM O LEAD:\n"""\n${input.conversationText.trim()}\n"""`
      : input.conversationImage
        ? "CONVERSA REAL COM O LEAD: ver a imagem de print anexada nesta mensagem."
        : "CONVERSA REAL COM O LEAD: (não fornecida em texto)",
    `COMPORTAMENTO ESPERADO (segundo quem revisou):\n"""\n${input.expectedBehavior.trim()}\n"""`,
  ];

  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (input.conversationImage) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.conversationImage.mediaType, data: input.conversationImage.base64 },
    });
  }
  content.push({ type: "text", text: textParts.join("\n\n") });

  const response = await client.messages.create({
    model: DIAGNOSIS_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    tools: [
      {
        name: "submit_diagnosis",
        description: "Envia o diagnóstico estruturado da conversa e a correção proposta para o prompt.",
        input_schema: TOOL_INPUT_SCHEMA,
        strict: true,
      },
    ],
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("O modelo recusou analisar esta conversa. Revise o conteúdo enviado (pode conter algo sinalizado como sensível).");
  }

  const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === "submit_diagnosis");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("O modelo não retornou um diagnóstico estruturado. Tente novamente.");
  }

  const parsedOutput = DiagnosisSchema.safeParse(toolUse.input);
  if (!parsedOutput.success) {
    throw new Error("O diagnóstico retornado não teve o formato esperado. Tente novamente.");
  }
  const raw = parsedOutput.data;

  return buildAnalysis(parsed, raw, input, kb, knowledgeRefs);
}

/** Exportado também para testes: resolve a saída bruta do modelo contra o prompt real. */
export function buildAnalysis(
  parsed: ParsedPrompt,
  raw: DiagnosisOutput,
  input: DiagnoseInput,
  kb: KnowledgeIndex,
  knowledgeRefs: ChangeAnalysis["knowledgeRefs"]
): ChangeAnalysis {
  const notes = [...raw.notes];
  let opCounter = 0;
  const operations: Operation[] = [];
  const affectedRules: RuleRef[] = [];

  for (const op of raw.operations) {
    const resolved = resolveOperation(parsed, op, () => `ia-op-${++opCounter}`);
    if (!resolved) {
      notes.push(
        `Não localizei no prompt o trecho citado para uma correção sugerida (“${truncate(op.quote ?? op.sectionTitle ?? "", 80)}”). Essa operação não pôde ser proposta automaticamente.`
      );
      continue;
    }
    operations.push(resolved.operation);
    if (resolved.rule) affectedRules.push(resolved.rule);
  }

  // Seções citadas pelo modelo: só as que realmente existem no prompt
  const sectionByTitle = new Map(parsed.sections.map((s) => [s.title, s]));
  const invented = raw.affectedSectionTitles.filter((t) => !sectionByTitle.has(t));
  const claimedSections = raw.affectedSectionTitles.map((t) => sectionByTitle.get(t)).filter((s): s is PromptSection => !!s).map(sectionLabel);
  const affectedSections = Array.from(new Set([...claimedSections, ...operations.map((o) => o.section)]));
  if (invented.length) {
    notes.push(`O diagnóstico citou seções que não existem no prompt e foram ignoradas: ${invented.join(", ")}.`);
  }

  const conflicts: ChangeAnalysis["conflicts"] = raw.conflicts.map((c) => {
    if (!c.quote) return { description: c.description };
    const found = findQuote(parsed, c.quote);
    return found ? { description: c.description, rule: lineRef(parsed, found.index) } : { description: c.description };
  });

  const newTexts = operations.filter((o) => o.enabled && o.role !== "revisao").map((o) => o.newText);
  if (!kb.isEmpty) {
    for (const name of findUnsourcedNames(newTexts, input.promptContent, kb)) {
      conflicts.push({
        description: `“${name}” não aparece no prompt atual nem na base de conhecimento. Confirme que esse produto/termo existe antes de aplicar.`,
      });
    }
  }

  const { preservedRules, preservedSections } = preserved(parsed, affectedSections, { operations, affectedRules });
  const { impact, impactReason } = computeImpact({ operations, affectedRules, minImpact: "MEDIO" }, affectedSections);

  const summaryRequest = truncate(input.expectedBehavior.trim(), 140) || "Diagnóstico de conversa";

  return {
    engine: AI_ENGINE,
    request: `Diagnóstico de conversa: ${summaryRequest}`,
    answers: [],
    intent: "alterar",
    understanding: raw.understanding,
    affectedSections,
    affectedRules,
    preservedRules,
    preservedSections,
    relatedRules: [],
    conflicts,
    suggestion: raw.rootCauseFound
      ? raw.suggestion
      : raw.suggestion || "Não foi possível localizar, no texto do prompt, uma regra que explique esse comportamento. Pode ser um problema fora do prompt (dado ausente na base de conhecimento, comportamento do modelo em produção, etc.).",
    suggestionBullets: [],
    impact,
    impactReason,
    operations,
    notes,
    knowledgeRefs,
    knowledgeDocuments: input.knowledge.length,
    conversationInput: {
      transcript: input.conversationText.trim() || undefined,
      hadImage: !!input.conversationImage,
      expectedBehavior: input.expectedBehavior.trim(),
    },
  };
}

function lineRef(parsed: ParsedPrompt, lineIndex: number): RuleRef {
  const line = parsed.lines[lineIndex];
  return { line: lineIndex, section: sectionLabel(parsed.sections[line.sectionId]), text: line.text };
}

/** Localiza a linha cujo texto contém o trecho citado (exato, com folga de espaçamento). */
function findQuote(parsed: ParsedPrompt, quote: string): PromptLine | undefined {
  const q = quote.trim();
  if (!q) return undefined;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const target = norm(q);
  return parsed.lines.find((l) => l.raw.includes(q) || norm(l.raw).includes(target));
}

function resolveOperation(
  parsed: ParsedPrompt,
  op: z.infer<typeof OperationSchema>,
  nextId: () => string
): { operation: Operation; rule?: RuleRef } | null {
  if (op.kind === "adicionar_regra") {
    if (!op.newText?.trim()) return null;
    const section = resolveSection(parsed, op.sectionTitle);
    if (!section) return null;
    const { line, newText, note } = computeInsertion(parsed, section, op.newText.trim());
    return {
      operation: {
        id: nextId(),
        type: "inserir_apos",
        line,
        oldText: line >= 0 ? parsed.lines[line].raw : "",
        newText,
        section: sectionLabel(section),
        reason: note ? `${op.reason} ${note}` : op.reason,
        role: "principal",
        enabled: true,
      },
    };
  }

  if (!op.quote?.trim()) return null;
  const line = findQuote(parsed, op.quote);
  if (!line) return null;
  const section = sectionLabel(parsed.sections[line.sectionId]);
  const rule = lineRef(parsed, line.index);

  if (op.kind === "remover_trecho") {
    const remaining = removeSentences(line.text, [op.quote.trim()]);
    if (!remaining) {
      return {
        operation: { id: nextId(), type: "remover_linha", line: line.index, oldText: line.raw, newText: "", section, reason: op.reason, role: "principal", enabled: true },
        rule,
      };
    }
    if (remaining === line.text) return null; // trecho não bateu com nenhuma frase inteira
    return {
      operation: {
        id: nextId(),
        type: "substituir_linha",
        line: line.index,
        oldText: line.raw,
        newText: lineWithText(line, remaining),
        section,
        reason: op.reason,
        role: "principal",
        enabled: true,
      },
      rule,
    };
  }

  // substituir_trecho
  if (!op.newText?.trim()) return null;
  const { result, count } = replaceInsensitive(line.raw, op.quote.trim(), op.newText.trim());
  if (!count) return null;
  return {
    operation: { id: nextId(), type: "substituir_linha", line: line.index, oldText: line.raw, newText: result, section, reason: op.reason, role: "principal", enabled: true },
    rule,
  };
}

function resolveSection(parsed: ParsedPrompt, title: string | null): PromptSection | undefined {
  if (!title) return visibleSections(parsed).at(-1);
  const exact = parsed.sections.find((s) => s.title === title);
  if (exact) return exact;
  const norm = title.trim().toLowerCase();
  return parsed.sections.find((s) => s.title.trim().toLowerCase() === norm) ?? visibleSections(parsed).at(-1);
}
