/**
 * Estimativa de tokens sem dependência de um tokenizador específico de
 * modelo (evita acoplar o projeto a um encoding que pode não bater com o
 * modelo configurado em cada versão). Para textos em português, ~3.7
 * caracteres por token é uma aproximação razoável para famílias GPT atuais.
 * Se for necessária contagem exata, troque esta função por um tokenizador
 * real (ex: gpt-tokenizer) mantendo a mesma assinatura.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.7);
}

export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}
