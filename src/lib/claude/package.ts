/**
 * Pacote de contexto para colar numa conversa nova do Claude (claude.ai):
 * relato da curadoria + prompt atual com linhas numeradas + documentos da
 * base da unidade + o formato exato em que a correção deve voltar.
 *
 * A plataforma não interpreta nada aqui: ela só junta, na versão atual,
 * tudo o que o Claude precisa ler.
 */
export type PackageInput = {
  promptName: string;
  unitLabel?: string;
  description?: string | null;
  version: number;
  content: string;
  knowledge: { title: string; content: string }[];
  knowledgeScope: string;
  problem: string;
  expected?: string;
};

export const ANSWER_FORMAT = `Comece com uma seção CAUSA explicando, em poucas linhas, por que o problema acontece (cite as linhas, ex.: L193).

Depois, escreva SOMENTE as mudanças necessárias, uma por bloco, exatamente neste formato.
IMPORTANTE: coloque a CAUSA e todos os blocos dentro de UM ÚNICO bloco de código (entre \`\`\`), para que o botão Copiar preserve as marcas <<< e >>> letra por letra:

TROCAR
<<<
(trecho atual, copiado exatamente do prompt, sem o número da linha)
>>>
(texto novo)
FIM

INSERIR DEPOIS DE
<<<
(trecho atual exato depois do qual a nova regra entra)
>>>
(nova regra, já com o marcador de lista, se as regras vizinhas tiverem)
FIM

REMOVER
<<<
(trecho atual exato a remover)
FIM

Regras para os blocos:
- O trecho entre <<< e >>> precisa ser cópia fiel do prompt (sem “L123:”), para a plataforma localizá-lo.
- Altere o mínimo possível. Não reescreva o prompt inteiro nem mude regras que não têm relação com o problema.
- Siga o estilo e o formato das regras vizinhas.
- Se a solução depender de informação que não está na base de conhecimento, diga isso na CAUSA em vez de inventar.`;

export function buildClaudePackage(p: PackageInput): string {
  const lines = p.content.replace(/\r\n/g, "\n").split("\n");
  const width = String(lines.length).length;
  const numbered = lines.map((l, i) => `L${String(i + 1).padStart(width, "0")}: ${l}`).join("\n");
  const kb = p.knowledge.length
    ? p.knowledge.map((d) => `=== ${d.title} ===\n${d.content.trim()}`).join("\n\n")
    : "(esta unidade ainda não tem documentos na base de conhecimento)";

  return [
    `Você vai ajudar a corrigir o prompt de um agente comercial de IA da Keevo.`,
    ``,
    `AGENTE: ${p.promptName}${p.unitLabel ? ` — unidade ${p.unitLabel}` : ""}${p.description ? `\nDESCRIÇÃO: ${p.description}` : ""}`,
    ``,
    `PROBLEMA RELATADO PELA CURADORIA`,
    p.problem.trim(),
    ...(p.expected?.trim() ? [``, `COMPORTAMENTO ESPERADO / SUGESTÃO DA CURADORIA`, p.expected.trim()] : []),
    ``,
    `COMO RESPONDER`,
    ANSWER_FORMAT,
    ``,
    `PROMPT ATUAL (v${p.version}) — cada linha começa com o número dela (L001:, L002: …), que NÃO faz parte do texto`,
    `----- INÍCIO DO PROMPT -----`,
    numbered,
    `----- FIM DO PROMPT -----`,
    ``,
    `BASE DE CONHECIMENTO (${p.knowledgeScope}, ${p.knowledge.length} documento(s)) — fonte oficial de informação de produto`,
    kb,
  ].join("\n");
}
