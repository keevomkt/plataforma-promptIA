/**
 * Camada OPCIONAL de IA (seção 14 da especificação: a plataforma nunca
 * depende disso para funcionar). Hoje usada só pelo diagnóstico de
 * conversa — analisar um pedido em linguagem natural continua 100% no
 * motor local (src/lib/engine), sem chamadas externas.
 *
 * Sem ANTHROPIC_API_KEY configurada, tudo o que depende deste arquivo fica
 * indisponível na interface, mas o resto da plataforma funciona normalmente.
 */
import Anthropic from "@anthropic-ai/sdk";

export const DIAGNOSIS_MODEL = process.env.ANTHROPIC_DIAGNOSIS_MODEL?.trim() || "claude-opus-5";

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

let client: Anthropic | undefined;

export function getAnthropicClient(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error("Diagnóstico por IA não está configurado: defina ANTHROPIC_API_KEY no arquivo .env para habilitar esta função.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
