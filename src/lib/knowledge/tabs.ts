import { resolveUnit } from "@/lib/brand";

/** Aba dos documentos de unidade que não é nenhuma das quatro (ex: "Institucional"). */
export const GENERAL_TAB = "GERAL";

/** Aba da tela "Base de conhecimento" em que um documento aparece. */
export function knowledgeTab(businessUnit: string): string {
  return resolveUnit(businessUnit)?.id ?? GENERAL_TAB;
}
