/**
 * Revisão completa do prompt (intenção "auditoria").
 *
 * Diferente dos outros pedidos, aqui nada é alterado: a plataforma cruza
 * todas as regras entre si (e com a base de conhecimento da unidade) e
 * aponta o que parece duplicado, sobreposto, contraditório, com valores
 * divergentes, vago ou sem fonte. Cada ponto encontrado vem com um pedido
 * de correção pronto, que entra no fluxo normal de alteração governada.
 *
 * É comparação de texto, não julgamento: encontra repetições e choques
 * explícitos, mas não decide se uma regra faz sentido comercialmente.
 */
import { PromptIndex, type Unit } from "./match";
import { isRuleLine, sectionLabel, type ParsedPrompt } from "./parse";
import { normalize, sameStem, splitSentences, truncate } from "./text";
import { properNames, type KnowledgeSource } from "./knowledge";
import type { AuditCategory, AuditFinding, AuditResult, RuleRef } from "./types";

const MAX_PER_CATEGORY = 15;

// Polaridade estrita: "sem", "evite" etc. geram muitos falsos positivos numa revisão do prompt inteiro
const NEG_STRICT =
  /\b(nunca|jamais|proibid\w*|nao (deve|devem|pode|podem|informe|pergunte|mencione|envie|ofereca|use|faca|diga|compartilhe|prometa|encaminhe|solicite|cite|apresente|responda|invente))\b/;
const POS_STRICT = /\b(sempre|obrigatori\w*|deve|devem|precisa|pergunte|informe|solicite|encaminhe|ofereca|mencione|envie|apresente|cite)\b/;

const VAGUE =
  /\b(se possivel|quando possivel|sempre que possivel|na medida do possivel|talvez|de preferencia|preferencialmente|tente|procure|evite ao maximo|etc|e afins|algo como|mais ou menos|de certa forma|geralmente|normalmente|eventualmente|se achar necessario|se julgar necessario)\b/;

function strictPolarity(text: string): "neg" | "pos" | null {
  const n = normalize(text);
  if (NEG_STRICT.test(n)) return "neg";
  if (POS_STRICT.test(n)) return "pos";
  return null;
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a);
  let inter = 0;
  for (const x of new Set(b)) if (A.has(x)) inter++;
  return inter / (A.size + new Set(b).size - inter || 1);
}

/**
 * Palavras presentes em quase toda regra de um agente comercial. Duas regras
 * compartilharem só essas palavras não indica que tratam do mesmo assunto.
 */
const GENERIC_STEMS = [
  "usuari", "client", "lead", "pessoa", "respond", "respost", "pergunt", "utiliz", "inform", "agent", "assist",
  "keevo", "mensag", "convers", "atend", "soluc", "produt", "sempr", "nunc", "cas", "sej", "possu", "voc",
  "dev", "pod", "quand", "apen", "tod", "faz", "fac", "diga", "diz", "sobr", "algum", "qual", "outr",
];

/** Palavra comum demais para, sozinha, identificar o assunto de uma busca (ver questionAnalysis em analyze.ts). */
export function isGenericStem(s: string) {
  return GENERIC_STEMS.some((g) => s === g || (s.startsWith(g) && s.length - g.length <= 3));
}

function numbersOf(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).sort();
}

export function auditPrompt(parsed: ParsedPrompt, knowledge: KnowledgeSource[], knowledgeScope: string): AuditResult {
  const index = new PromptIndex(parsed);
  // Frases que citam nomes de arquivo (lista de documentos da base) são referências, não regras a comparar
  const FILE_REF = /\.(md|txt|pdf|docx?|csv|json)\b/i;
  const units = index.units.filter((u) => u.stems.length >= 4 && !FILE_REF.test(u.sentence));
  const all: AuditFinding[] = [];
  let seq = 0;
  const id = () => `aud-${++seq}`;

  const sectionOf = (u: { sectionId: number }) => parsed.sections[u.sectionId];
  const ref = (u: Unit): RuleRef => ({ line: u.line, section: sectionLabel(sectionOf(u)), text: u.sentence });
  // Seções com o mesmo título sob pais diferentes (ex: "Qualificação" de cada produto): repetição provavelmente intencional
  const parallel = (a: Unit, b: Unit) => {
    const sa = sectionOf(a);
    const sb = sectionOf(b);
    return sa.id !== sb.id && sa.title === sb.title;
  };
  const changeRequest = (u: Unit, verb = "altere") => `Na seção “${sectionOf(u).title}”, ${verb} a regra “${truncate(u.sentence, 180)}”: `;
  const isList = (u: Unit) => {
    const k = parsed.lines[u.line].kind;
    return k === "bullet" || k === "numbered";
  };
  // Itens vizinhos da mesma lista (arquivos, variáveis a coletar...) são parecidos por natureza
  const siblingItems = (a: Unit, b: Unit) => a.sectionId === b.sectionId && isList(a) && isList(b) && Math.abs(a.line - b.line) <= 6;

  // Uma dupla de linhas é reportada uma vez só, mesmo que várias frases delas coincidam
  const seenPairs = new Set<string>();
  const push = (f: Omit<AuditFinding, "id">) => {
    const lines = f.rules.map((r) => r.line).sort((x, y) => x - y);
    const k = `${f.category}:${lines.join("-")}`;
    if (seenPairs.has(k)) return;
    seenPairs.add(k);
    all.push({ id: id(), ...f });
  };

  // 1) Comparação entre pares de regras
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (a.line === b.line) continue;
      const sim = normalize(a.sentence) === normalize(b.sentence) ? 1 : jaccard(a.stems, b.stems);
      if (sim < 0.3) continue;

      const specificShared = a.stems.filter((s) => !isGenericStem(s) && b.stems.some((t) => sameStem(s, t))).length;
      const specA = a.stems.filter((s) => !isGenericStem(s));
      const specB = b.stems.filter((s) => !isGenericStem(s));
      // Similaridade só pelas palavras de conteúdo (sem "usuário", "informe", "solução"...)
      const specSim = jaccard(specA, specB);
      const pa = strictPolarity(a.sentence);
      const pb = strictPolarity(b.sentence);
      const isParallel = parallel(a, b);

      if (pa && pb && pa !== pb && specificShared >= 3 && sim >= 0.35) {
        push({
          category: "contraditoria",
          severity: isParallel ? "media" : "alta",
          title: "Uma regra manda fazer o que a outra proíbe",
          detail: `As duas tratam do mesmo assunto, mas com orientações opostas${isParallel ? " (em seções paralelas — confirme se a diferença é intencional)" : ""}. O agente pode seguir qualquer uma delas, ou uma anular a outra.`,
          rules: [ref(a), ref(b)],
          suggestedRequest: changeRequest(b),
        });
        continue;
      }

      const na = numbersOf(a.sentence);
      const nb = numbersOf(b.sentence);
      if (sim >= 0.55 && !siblingItems(a, b) && na.length && nb.length && na.join("|") !== nb.join("|")) {
        push({
          category: "valores_divergentes",
          severity: isParallel ? "media" : "alta",
          title: `Mesma regra com valores diferentes (${na.join(", ")} × ${nb.join(", ")})`,
          detail: `O texto é quase igual, mas os números não batem${isParallel ? " — pode ser proposital por produto; confirme" : ""}. O agente não tem como saber qual vale.`,
          rules: [ref(a), ref(b)],
          suggestedRequest: changeRequest(b),
        });
        continue;
      }

      if (sim >= 0.8) {
        push({
          category: "duplicada",
          severity: isParallel ? "baixa" : "alta",
          title: isParallel ? "Regra repetida em seções paralelas" : "Regra duplicada",
          detail: isParallel
            ? "A mesma regra aparece em seções com o mesmo título (provavelmente a estrutura de cada produto). Se for intencional, está tudo certo; se não, pode ser centralizada."
            : "Duas regras dizem praticamente a mesma coisa. Duplicidade aumenta o prompt, e se uma for editada e a outra não, elas passam a se contradizer.",
          rules: [ref(a), ref(b)],
          suggestedRequest: isParallel ? undefined : `Remova a regra duplicada “${truncate(b.sentence, 180)}” da seção “${sectionOf(b).title}”`,
        });
        continue;
      }

      if (sim >= 0.5 && specSim >= 0.6 && specA.length >= 3 && specB.length >= 3 && (pa ?? "x") === (pb ?? "x") && !siblingItems(a, b)) {
        push({
          category: "sobreposta",
          severity: isParallel ? "baixa" : "media",
          title: "Regras sobrepostas",
          detail: "As duas cobrem quase o mesmo ponto com palavras diferentes. Vale unificar em uma só, no lugar mais lógico, para evitar interpretações diferentes.",
          rules: [ref(a), ref(b)],
          suggestedRequest: isParallel ? undefined : changeRequest(b),
        });
      }
    }
  }

  // 2) Regras mal escritas: vagas ou longas demais (por linha)
  for (const line of parsed.lines) {
    if (!isRuleLine(line)) continue;
    const n = normalize(line.text);
    const vague = n.match(VAGUE)?.[0];
    const words = line.text.split(/\s+/).length;
    const sentences = splitSentences(line.text).length;
    const section = parsed.sections[line.sectionId];
    const r: RuleRef = { line: line.index, section: sectionLabel(section), text: truncate(line.text, 260) };
    const req = `Na seção “${section.title}”, altere a regra “${truncate(line.text, 180)}”: `;
    if (vague) {
      all.push({
        id: id(),
        category: "mal_escrita",
        severity: "baixa",
        title: `Linguagem vaga (“${vague}”)`,
        detail: "Expressões como essa deixam a regra opcional aos olhos do modelo. Se é obrigatória, escreva de forma direta; se é opcional, diga em que situação vale.",
        rules: [r],
        suggestedRequest: req,
      });
    }
    if (words > 70 || sentences >= 4) {
      all.push({
        id: id(),
        category: "mal_escrita",
        severity: "baixa",
        title: `Regra longa (${words} palavras, ${sentences} frases)`,
        detail: "Várias instruções no mesmo parágrafo são mais difíceis de o modelo seguir e de manter. Considere quebrar em itens separados.",
        rules: [r],
        suggestedRequest: req,
      });
    }
  }

  // 3) Estrutura: seções com título mas sem nenhuma regra nem subseção
  for (const s of parsed.sections) {
    if (s.id === 0) continue;
    const hasRules = parsed.lines.some((l) => l.sectionId === s.id && isRuleLine(l));
    const hasChildren = parsed.sections.some((c) => c.parentId === s.id);
    if (!hasRules && !hasChildren) {
      all.push({
        id: id(),
        category: "estrutura",
        severity: "media",
        title: `Seção vazia: “${s.title}”`,
        detail: "O título existe, mas não há nenhuma regra dentro. Se ele deveria agrupar as seções seguintes, elas precisam de um nível de título abaixo (ex: ### em vez de ##); senão, pode ser resto de uma edição antiga.",
        rules: [{ line: s.headingLine, section: sectionLabel(s), text: s.title }],
      });
    }
  }

  // 4) Produtos/termos próprios citados no prompt sem menção na base de conhecimento da unidade
  if (knowledge.length) {
    const kbNorm = normalize(knowledge.map((k) => `${k.title}\n${k.content}`).join("\n"));
    const kbCompact = kbNorm.replace(/ /g, "");
    const productSections = parsed.sections.filter(
      (s) => s.path.length > 1 && /produt|modul|soluc|plano/.test(normalize(s.path.slice(0, -1).join(" ")))
    );
    const titles = new Set(parsed.sections.map((s) => normalize(s.title)));
    const candidates = new Map<string, number>();
    for (const line of parsed.lines) {
      if (!isRuleLine(line)) continue;
      for (const name of properNames(line.text)) {
        // Só nomes com cara de produto: maiúscula no meio (eKeep) ou sigla + nome (NG Folha)
        if (!/[a-z][A-Z]|^[A-Z]{2,6}\s[A-Z]/.test(name)) continue;
        if (!candidates.has(name)) candidates.set(name, line.index);
      }
    }
    for (const s of productSections) if (!candidates.has(s.title) && !titles.has(normalize(s.path[0] ?? ""))) candidates.set(s.title, s.headingLine);
    const missing = Array.from(candidates.entries()).filter(([name]) => {
      const n = normalize(name);
      return n.length >= 3 && !kbNorm.includes(n) && !kbCompact.includes(n.replace(/ /g, ""));
    });
    if (missing.length) {
      all.push({
        id: id(),
        category: "base_conhecimento",
        severity: "baixa",
        title: `${missing.length} produto(s)/termo(s) sem menção na base de conhecimento`,
        detail: `Citados no prompt, mas não encontrados em nenhum documento da base (${knowledgeScope}): ${missing.map(([n]) => n).join(", ")}. Pode ser base incompleta ou nome desatualizado no prompt.`,
        rules: missing.slice(0, 6).map(([name, line]) => {
          const l = parsed.lines[line];
          return { line, section: sectionLabel(parsed.sections[l.sectionId]), text: truncate(l.text || name, 200) };
        }),
      });
    }
  }

  // Duplicatas que compartilham linhas (A=B, B=C) viram um único achado com todas as ocorrências
  mergeDuplicates(all);

  // Ordena por gravidade e limita a exibição por categoria (as contagens mostram o total)
  const rank = { alta: 0, media: 1, baixa: 2 } as const;
  const counts: Partial<Record<AuditCategory, number>> = {};
  for (const f of all) counts[f.category] = (counts[f.category] ?? 0) + 1;
  const shown: AuditFinding[] = [];
  const perCat: Partial<Record<AuditCategory, number>> = {};
  for (const f of [...all].sort((x, y) => rank[x.severity] - rank[y.severity])) {
    const n = perCat[f.category] ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    perCat[f.category] = n + 1;
    shown.push(f);
  }

  return {
    findings: shown,
    counts,
    checkedRules: index.units.length,
    knowledgeDocuments: knowledge.length,
    knowledgeScope,
    limitations: [
      "A revisão compara o texto das regras (sem IA): encontra repetições e choques explícitos, mas não julga se uma regra faz sentido comercialmente — esse julgamento continua com a curadoria.",
      "Regras que se contradizem com palavras bem diferentes (sem termos em comum) podem passar despercebidas.",
    ],
  };
}

function mergeDuplicates(all: AuditFinding[]) {
  const dups = all.filter((f) => f.category === "duplicada" && f.severity === "alta");
  const groups: AuditFinding[][] = [];
  for (const f of dups) {
    const lines = new Set(f.rules.map((r) => r.line));
    const hit = groups.find((g) => g.some((x) => x.rules.some((r) => lines.has(r.line))));
    if (hit) hit.push(f);
    else groups.push([f]);
  }
  for (const g of groups) {
    if (g.length < 2) continue;
    const rules = new Map<number, RuleRef>();
    for (const f of g) for (const r of f.rules) rules.set(r.line, r);
    const sorted = Array.from(rules.values()).sort((x, y) => x.line - y.line);
    const [first, ...rest] = g;
    first.title = `Regra repetida ${sorted.length} vezes`;
    first.detail = "A mesma regra aparece em vários pontos do prompt. Mantenha uma só, no lugar mais lógico — se uma cópia for editada e as outras não, elas passam a se contradizer.";
    first.rules = sorted;
    const last = sorted[sorted.length - 1];
    first.suggestedRequest = `Remova a regra duplicada “${truncate(last.text, 180)}” da seção “${last.section.split(" › ").pop()}”`;
    for (const f of rest) all.splice(all.indexOf(f), 1);
  }
}
