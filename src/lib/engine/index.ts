/**
 * Ponto de entrada do motor de análise.
 *
 * A plataforma funciona 100% com o motor local (determinístico, sem chamadas
 * externas). Se no futuro houver um modelo de IA disponível, basta criar
 * outro `PromptAnalyzer` que devolva o mesmo `ChangeAnalysis` e registrá-lo
 * em `getAnalyzer()` — as telas, o versionamento, a aplicação das operações
 * e a validação continuam iguais, porque dependem apenas deste contrato.
 * O motor local continua sendo o fallback caso a camada de IA falhe.
 */
import { analyzeChange, LOCAL_ENGINE } from "./analyze";
import type { KnowledgeSource } from "./knowledge";
import type { ChangeAnalysis } from "./types";

export interface PromptAnalyzer {
  readonly name: string;
  /** `knowledge`: documentos da base de conhecimento, usados como fonte de referência. */
  analyze(content: string, request: string, answers: string[], knowledge: KnowledgeSource[], knowledgeScope?: string): Promise<ChangeAnalysis>;
}

export const localAnalyzer: PromptAnalyzer = {
  name: LOCAL_ENGINE,
  async analyze(content, request, answers, knowledge, knowledgeScope) {
    return analyzeChange(content, request, answers, knowledge, knowledgeScope);
  },
};

export function getAnalyzer(): PromptAnalyzer {
  // Ponto de extensão para uma camada opcional de IA (ver README).
  return localAnalyzer;
}

export { applyOperations } from "./apply";
export { validateChange } from "./validate";
export { parsePrompt, structureSummary, sectionLabel } from "./parse";
export type { KnowledgeSource } from "./knowledge";
export * from "./types";
