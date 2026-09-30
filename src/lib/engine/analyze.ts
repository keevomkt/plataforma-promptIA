/**
 * Motor local de análise de alterações (seções 2 a 5 da especificação).
 *
 * Recebe o prompt atual e o pedido em linguagem natural e devolve a análise
 * completa — entendimento, seções e regras afetadas, regras preservadas,
 * conflitos, sugestão, impacto e, quando há ambiguidade, uma pergunta ao
 * usuário. Nada é alterado aqui: o resultado inclui apenas as operações
 * PROPOSTAS, que o usuário revisa, edita e aprova.
 */
import { parseRequest, toImperative, type ParsedRequest } from "./intent";
import { PromptIndex, key, type UnitMatch } from "./match";
import {
  isRuleLine,
  parsePrompt,
  sectionLabel,
  visibleSections,
  type ParsedPrompt,
  type PromptLine,
  type PromptSection,
} from "./parse";
import { lineWithText, removeFromEnumeration, removeSentences, replaceInsensitive } from "./apply";
import type { ChangeAnalysis, Clarification, ImpactLevel, Operation, RuleRef } from "./types";
import { conceptOf, ensurePeriod, normalize, polarity, stems, truncate } from "./text";
import { findUnsourcedNames, KnowledgeIndex, type KnowledgeSource } from "./knowledge";
import { computeImpact, computeInsertion, preserved } from "./shared";
import { auditPrompt, isGenericStem } from "./audit";

export const LOCAL_ENGINE = "motor-local-v1";

type Draft = {
  understanding: string;
  suggestion: string;
  suggestionBullets: string[];
  suggestedRule?: string;
  affectedRules: RuleRef[];
  relatedRules: RuleRef[];
  conflicts: { description: string; rule?: RuleRef }[];
  operations: Operation[];
  clarification?: Clarification;
  notes: string[];
  minImpact?: ImpactLevel;
  extraSections: string[];
};

type Ctx = {
  parsed: ParsedPrompt;
  index: PromptIndex;
  req: ParsedRequest;
  scope?: PromptSection;
  ops: Operation[];
};

const SENSITIVE = /(segur|restri|proib|preco|valor|comercia|produt|nunca|jamais|qualific|confidencial|dados)/;
const SUMMARY_SECTION = /(resum|registr|informac|confirm|encaminh|passag|crm|anot|dados)/;

export function analyzeChange(
  content: string,
  request: string,
  answers: string[] = [],
  knowledge: KnowledgeSource[] = [],
  knowledgeScope = "toda a base"
): ChangeAnalysis {
  const parsed = parsePrompt(content);
  const req = parseRequest(request, answers);
  if (req.intent === "auditoria") return auditAnalysis(parsed, request, answers, knowledge, knowledgeScope);
  if (req.intent === "pergunta") return questionAnalysis(parsed, request, answers, knowledge, knowledgeScope, req);
  const index = new PromptIndex(parsed);
  const notes: string[] = [];

  let scope: PromptSection | undefined;
  if (req.scopeSection) {
    scope = index.sectionByTitle(req.scopeSection);
  } else if (req.scopeText) {
    scope = index.resolveScope(req.scopeText);
    if (!scope) notes.push(`Não encontrei uma seção correspondente a “${req.scopeText}”. A análise considerou o prompt inteiro.`);
  }

  const ctx: Ctx = { parsed, index, req, scope, ops: [] };
  const draft = HANDLERS[req.intent](ctx);
  draft.notes.unshift(...notes);

  // Seções afetadas: de onde vêm as operações e as regras afetadas
  const affectedSections = unique([
    ...draft.operations.filter((o) => o.enabled || o.role === "principal").map((o) => o.section),
    ...draft.affectedRules.map((r) => r.section),
    ...draft.extraSections,
  ]);

  const { preservedRules, preservedSections } = preserved(parsed, affectedSections, draft);

  // Base de conhecimento: trechos de referência + nomes novos que não existem em lugar nenhum
  const kb = new KnowledgeIndex(knowledge);
  const newTexts = draft.operations.filter((o) => o.enabled && o.role !== "revisao").map((o) => o.newText);
  if (draft.suggestedRule) newTexts.push(draft.suggestedRule);
  const kbTopic = unique([...req.topicStems, ...newTexts.flatMap((t) => stems(t))]);
  const knowledgeRefs = kb.isEmpty ? [] : kb.search(kbTopic);
  if (!kb.isEmpty) {
    for (const name of findUnsourcedNames(newTexts, content, kb)) {
      draft.conflicts.push({
        description: `“${name}” não aparece no prompt atual nem na base de conhecimento. Confirme que esse produto/termo existe antes de aplicar — o prompt não deve citar informações sem fonte.`,
      });
    }
  }

  const { impact, impactReason } = computeImpact(draft, affectedSections);

  return {
    engine: LOCAL_ENGINE,
    request,
    answers,
    intent: req.intent,
    understanding: draft.understanding,
    affectedSections,
    affectedRules: draft.affectedRules,
    preservedRules,
    preservedSections,
    relatedRules: draft.relatedRules,
    conflicts: draft.conflicts,
    suggestion: draft.suggestion,
    suggestionBullets: draft.suggestionBullets,
    suggestedRule: draft.suggestedRule,
    impact,
    impactReason,
    clarification: draft.clarification,
    operations: draft.operations,
    notes: draft.notes,
    knowledgeRefs,
    knowledgeDocuments: knowledge.length,
  };
}

/**
 * Revisão completa: não propõe operações, só aponta problemas. Cada ponto
 * encontrado traz um pedido de correção pronto para o fluxo normal.
 */
function auditAnalysis(
  parsed: ParsedPrompt,
  request: string,
  answers: string[],
  knowledge: KnowledgeSource[],
  knowledgeScope: string
): ChangeAnalysis {
  const audit = auditPrompt(parsed, knowledge, knowledgeScope);
  const total = Object.values(audit.counts).reduce((a, b) => a + (b ?? 0), 0);
  const serious = audit.findings.filter((f) => f.severity === "alta").length;
  return {
    engine: LOCAL_ENGINE,
    request,
    answers,
    intent: "auditoria",
    understanding: `Revisão completa do prompt: ${audit.checkedRules} regras comparadas entre si${
      audit.knowledgeDocuments ? ` e com ${audit.knowledgeDocuments} documento(s) da base de conhecimento (${knowledgeScope})` : ""
    }, procurando regras contraditórias, com valores divergentes, duplicadas, sobrepostas, mal escritas e sem fonte na base. Nada é alterado.`,
    affectedSections: [],
    affectedRules: [],
    preservedRules: [],
    preservedSections: [],
    relatedRules: [],
    conflicts: [],
    suggestion: total
      ? `Encontrei ${total} ponto(s) de atenção${serious ? `, ${serious} de gravidade alta` : ""}. Para corrigir um deles, use “Pedir correção”: o pedido abre pronto na aba Alterar prompt e passa pela análise, diff e validação normais.`
      : "Não encontrei regras duplicadas, contraditórias ou com valores divergentes pela comparação de texto.",
    suggestionBullets: [],
    impact: "BAIXO",
    impactReason: "revisão sem alteração",
    operations: [],
    notes: [],
    knowledgeRefs: [],
    knowledgeDocuments: knowledge.length,
    audit,
  };
}

/**
 * Pergunta sobre o conteúdo do prompt (seção 17: a plataforma também serve
 * para consultar o que já está escrito, não só para propor mudanças).
 * Nunca gera operação nenhuma — só aponta os trechos do prompt e da base de
 * conhecimento relacionados à pergunta.
 */
function questionAnalysis(
  parsed: ParsedPrompt,
  request: string,
  answers: string[],
  knowledge: KnowledgeSource[],
  knowledgeScope: string,
  req: ParsedRequest
): ChangeAnalysis {
  const topicLabel = displayTopic(req);
  const kb = new KnowledgeIndex(knowledge);

  if (!req.topicStems.length) {
    return {
      engine: LOCAL_ENGINE,
      request,
      answers,
      intent: "pergunta",
      understanding: "Você fez uma pergunta, mas não ficou claro sobre qual assunto do prompt.",
      affectedSections: [],
      affectedRules: [],
      preservedRules: [],
      preservedSections: [],
      relatedRules: [],
      conflicts: [],
      suggestion: "Descreva com mais detalhes o que você quer saber.",
      suggestionBullets: [],
      impact: "BAIXO",
      impactReason: "pergunta, sem alteração",
      operations: [],
      notes: [],
      knowledgeRefs: [],
      knowledgeDocuments: knowledge.length,
      answer: { question: request, promptRules: [] },
    };
  }

  const index = new PromptIndex(parsed);
  const found = index.find(req.topicStems);
  // Sem nenhum termo raro/distintivo do assunto presente no prompt, os resultados costumam
  // ser só palavras genéricas em comum (ex: "produto") — melhor responder "não encontrei"
  // do que listar trechos pouco relacionados à pergunta.
  const specificAnchors = found.anchors.filter((a) => !isGenericStem(a));
  const confident = specificAnchors.length > 0 || req.topicStems.length <= 1;
  const promptRules = confident
    ? uniqueBy(
        [...found.primary, ...found.related.filter((u) => u.score >= 0.45)].sort((a, b) => b.score - a.score),
        (u) => u.line
      )
        .slice(0, 10)
        .map((u) => ref(parsed, u))
    : [];

  const knowledgeRefs = kb.isEmpty ? [] : kb.search(req.topicStems, 6);
  const inPrompt = promptRules.length > 0;
  const inKnowledge = knowledgeRefs.length > 0;

  const suggestion = !inPrompt && !inKnowledge
    ? `Não encontrei nada sobre “${topicLabel}” no texto do prompt${knowledge.length ? ` nem na base de conhecimento (${knowledgeScope})` : ""}.`
    : inPrompt
      ? `Encontrei ${promptRules.length} trecho(s) do prompt relacionados a essa pergunta${inKnowledge ? `, e mais ${knowledgeRefs.length} na base de conhecimento` : ""}.`
      : `Não encontrei isso no texto do prompt, mas a base de conhecimento tem ${knowledgeRefs.length} trecho(s) relacionados.`;

  return {
    engine: LOCAL_ENGINE,
    request,
    answers,
    intent: "pergunta",
    understanding: `Você perguntou sobre “${topicLabel}”.`,
    affectedSections: [],
    affectedRules: [],
    preservedRules: [],
    preservedSections: [],
    relatedRules: [],
    conflicts: [],
    suggestion,
    suggestionBullets: [],
    impact: "BAIXO",
    impactReason: "pergunta, sem alteração",
    operations: [],
    notes: [],
    knowledgeRefs,
    knowledgeDocuments: knowledge.length,
    answer: { question: request, promptRules },
  };
}

// ---------------------------------------------------------------------------
// Handlers por intenção
// ---------------------------------------------------------------------------

const HANDLERS: Record<Exclude<ChangeAnalysis["intent"], "auditoria" | "pergunta">, (ctx: Ctx) => Draft> = {
  remover: handleRemove,
  adicionar: handleAdd,
  substituir: handleReplace,
  condicional: handleConditional,
  objetividade: handleConcise,
  tom: handleTone,
  menos_perguntas: handleLessQuestions,
  alterar: handleGeneric,
};

function emptyDraft(): Draft {
  return {
    understanding: "",
    suggestion: "",
    suggestionBullets: [],
    affectedRules: [],
    relatedRules: [],
    conflicts: [],
    operations: [],
    notes: [],
    extraSections: [],
  };
}

function handleRemove(ctx: Ctx): Draft {
  const { index, req, scope, parsed } = ctx;
  const d = emptyDraft();
  const topicLabel = displayTopic(req);

  if (!req.topicStems.length) {
    d.understanding = "Você quer remover algo do prompt, mas não ficou claro o quê.";
    d.suggestion = "Informe a regra ou o assunto que deve deixar de existir.";
    d.clarification = {
      question: "O que exatamente deve ser removido?",
      options: [],
      allowFreeText: true,
      freeTextPlaceholder: "Ex: a pergunta sobre quantidade de CNPJs",
    };
    return d;
  }

  const found = index.find(req.topicStems, scope ? [scope] : undefined);
  const allPrimary = [...found.primary, ...found.primaryOutOfScope];

  if (allPrimary.length === 0) {
    d.understanding = `O objetivo é remover do prompt a regra sobre “${topicLabel}”.`;
    d.notes.push(`Não encontrei nenhuma regra que trate diretamente de “${topicLabel}”.`);
    d.relatedRules = found.related.slice(0, 8).map((u) => ref(parsed, u));
    d.suggestion = d.relatedRules.length
      ? "Nenhuma regra corresponde exatamente ao pedido. Veja abaixo as regras com termos parecidos; se a regra desejada estiver entre elas, cole o trecho exato para refazer a análise."
      : "Nenhuma regra relacionada foi encontrada. Nada precisa ser removido.";
    d.clarification = {
      question: "Qual é o trecho exato que deve ser removido?",
      options: [],
      allowFreeText: true,
      freeTextPlaceholder: "Cole aqui o trecho do prompt",
    };
    return d;
  }

  const primarySections = groupSections(parsed, allPrimary);

  // Ambiguidade: o assunto aparece em várias seções e o usuário não disse onde
  if (!scope && !req.scopeAll && primarySections.length > 1) {
    d.understanding = `O objetivo é que o agente deixe de seguir a regra sobre “${topicLabel}”.`;
    d.affectedRules = allPrimary.map((u) => ref(parsed, u));
    d.relatedRules = found.related.map((u) => ref(parsed, u));
    d.suggestion = `A regra aparece em ${primarySections.length} seções diferentes (${primarySections.map((s) => sectionLabel(s)).join(", ")}). Antes de alterar, é preciso saber se a remoção vale para todo o prompt ou só para uma parte, porque cada seção pode depender dessa informação de forma diferente.`;
    d.clarification = {
      question: `Você deseja remover “${topicLabel}” de todo o prompt ou somente de uma seção?`,
      options: [
        ...primarySections.map((s) => ({ label: `Somente em ${sectionLabel(s)}`, value: `escopo:${s.title}` })),
        { label: "De todo o prompt", value: "escopo:*" },
      ],
      allowFreeText: false,
    };
    return d;
  }

  const targets = scope ? found.primary : allPrimary;
  if (scope && targets.length === 0) {
    d.understanding = `O objetivo é remover a regra sobre “${topicLabel}” somente em ${sectionLabel(scope)}.`;
    d.notes.push(`A seção ${sectionLabel(scope)} não contém regra sobre “${topicLabel}”. Ela aparece em: ${primarySections.map((s) => sectionLabel(s)).join(", ")}.`);
    d.affectedRules = allPrimary.map((u) => ref(parsed, u));
    d.suggestion = "Escolha outra seção ou remova de todo o prompt.";
    d.clarification = {
      question: "Onde a regra deve ser removida?",
      options: [
        ...primarySections.map((s) => ({ label: `Somente em ${sectionLabel(s)}`, value: `escopo:${s.title}` })),
        { label: "De todo o prompt", value: "escopo:*" },
      ],
      allowFreeText: false,
    };
    return d;
  }

  // Operações principais: remove a frase (ou o item da enumeração), não a linha inteira sem necessidade
  const anchorStems = found.anchors.length ? found.anchors : req.topicStems;
  for (const [lineIdx, units] of byLine(targets)) {
    const line = parsed.lines[lineIdx];
    const section = sectionLabel(parsed.sections[line.sectionId]);
    const sentences = units.map((u) => u.sentence);

    // Frase única que é uma enumeração com o item pedido → remove só o item
    if (units.length === 1) {
      const enumResult = removeFromEnumeration(units[0].sentence, anchorStems);
      if (enumResult && hasOtherTopics(units[0].sentence, anchorStems)) {
        pushOp(ctx, d, {
          type: "substituir_linha",
          line: lineIdx,
          newText: lineWithText(line, line.text.replace(units[0].sentence, enumResult)),
          section,
          reason: `Remove apenas “${topicLabel}” da enumeração, preservando os demais itens.`,
          role: "principal",
          enabled: true,
        });
        continue;
      }
    }

    const remaining = removeSentences(line.text, sentences);
    if (!remaining) {
      pushOp(ctx, d, {
        type: "remover_linha",
        line: lineIdx,
        newText: "",
        section,
        reason: "Remove a regra inteira.",
        role: "principal",
        enabled: true,
      });
    } else {
      pushOp(ctx, d, {
        type: "substituir_linha",
        line: lineIdx,
        newText: lineWithText(line, remaining),
        section,
        reason: "Remove só a frase correspondente e mantém o restante da regra.",
        role: "principal",
        enabled: true,
      });
    }
  }

  d.affectedRules = targets.map((u) => ref(parsed, u));
  const targetLines = new Set(targets.map((u) => u.line));

  // Dependências: outras regras que citam o mesmo assunto
  const related = [...found.related, ...(scope ? found.primaryOutOfScope : [])].filter((u) => !targetLines.has(u.line));
  d.relatedRules = related.map((u) => ref(parsed, u));

  const relatedAdjustments: string[] = [];
  for (const u of related) {
    const line = parsed.lines[u.line];
    const sec = parsed.sections[line.sectionId];
    const secNorm = normalize(sec.path.join(" "));
    const isSummary = SUMMARY_SECTION.test(secNorm) || SUMMARY_SECTION.test(normalize(u.sentence));
    const isProductSpecific = /produt|modul|solucao/.test(secNorm);
    const enumResult = removeFromEnumeration(u.sentence, anchorStems);

    if (isSummary && enumResult && !d.operations.some((o) => o.line === u.line)) {
      pushOp(ctx, d, {
        type: "substituir_linha",
        line: u.line,
        newText: lineWithText(line, line.text.replace(u.sentence, enumResult)),
        section: sectionLabel(sec),
        reason: `A informação removida também aparece aqui. Se o agente não perguntar mais, ela não estará disponível ${
          /resum/.test(normalize(u.sentence)) ? "no resumo" : "neste ponto"
        }.`,
        role: "relacionada",
        enabled: req.scopeAll || !scope,
      });
      relatedAdjustments.push(sectionLabel(sec));
      continue;
    }

    if (polarity(normalize(u.sentence)) === "positiva" || isSummary) {
      d.conflicts.push({
        description: isProductSpecific
          ? `Referência específica de produto: esta regra também usa “${topicLabel}”. Recomendo preservar, a menos que a remoção deva valer também aqui.`
          : `Esta regra depende de “${topicLabel}” e pode ficar inconsistente após a remoção.`,
        rule: ref(parsed, u),
      });
    }
  }

  const where = scope ? `somente em ${sectionLabel(scope)}` : req.scopeAll ? "em todo o prompt" : `em ${primarySections.map((s) => sectionLabel(s)).join(", ")}`;
  d.understanding = `O objetivo é que o agente deixe de seguir a regra sobre “${topicLabel}” ${where}.`;
  d.suggestion = [
    `Remover ${targets.length === 1 ? "a regra" : `as ${targets.length} regras`} ${where}, sem reescrever o restante da seção.`,
    relatedAdjustments.length
      ? `Ajuste relacionado: a mesma informação aparece em ${unique(relatedAdjustments).join(", ")}; ${scope && !req.scopeAll ? "está proposto como opcional, marque se quiser remover também" : "também será removida para não ficar pedindo algo que não é mais coletado"}.`
      : "",
    d.conflicts.length ? "Verifique as referências listadas em “Possíveis conflitos” antes de aplicar." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return d;
}

function handleAdd(ctx: Ctx): Draft {
  const { index, req, scope, parsed } = ctx;
  const d = emptyDraft();
  const ruleText = req.newRuleText;

  if (!ruleText) {
    d.understanding = "Você quer adicionar uma nova regra, mas o texto da regra não foi informado.";
    d.suggestion = "Escreva a regra como ela deve aparecer no prompt.";
    d.clarification = {
      question: "Qual regra deve ser adicionada?",
      options: [],
      allowFreeText: true,
      freeTextPlaceholder: "Ex: Nunca mencione concorrentes pelo nome.",
    };
    return d;
  }

  const ruleStems = Array.from(new Set(stems(ruleText)));
  const section = scope ?? index.bestSectionFor(ruleStems) ?? index.bestSectionFor([], /(comportament|regras gerais|diretriz|instruc)/) ?? lastSection(parsed);
  d.understanding = `O objetivo é adicionar uma nova regra ao prompt: “${ruleText}”.`;

  // Regras parecidas já existentes → possível duplicidade ou contradição
  const similar = index.units
    .map((u) => index.scoreUnit(u, ruleStems, []))
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const newPolarity = polarity(normalize(ruleText));
  for (const s of similar) {
    const oldPolarity = polarity(normalize(s.sentence));
    if (oldPolarity !== "neutra" && newPolarity !== "neutra" && oldPolarity !== newPolarity) {
      d.conflicts.push({ description: "Regra atual com orientação oposta sobre o mesmo assunto.", rule: ref(parsed, s) });
    } else if (s.score >= 0.85) {
      d.conflicts.push({ description: "Já existe uma regra muito parecida; a nova pode ficar duplicada.", rule: ref(parsed, s) });
    }
  }
  d.relatedRules = similar.map((s) => ref(parsed, s));

  if (section) insertRule(ctx, d, section, ruleText, "principal", `Nova regra inserida no fim de ${sectionLabel(section)}, no mesmo formato das regras vizinhas.`);
  d.suggestedRule = ruleText;
  d.suggestion = section
    ? `Adicionar a regra em ${sectionLabel(section)}, que é a seção mais relacionada ao assunto, mantendo o formato das regras existentes.${
        d.conflicts.length ? " Revise os conflitos apontados antes de aplicar." : ""
      }`
    : "Adicionar a regra ao final do prompt.";
  return d;
}

function handleReplace(ctx: Ctx): Draft {
  const { parsed, req, scope } = ctx;
  const d = emptyDraft();
  if (!req.replaceFrom || !req.replaceTo) {
    d.understanding = "Você quer trocar um trecho do prompt por outro, mas não ficou claro o que trocar e pelo quê.";
    d.suggestion = "Use o formato: troque “texto atual” por “texto novo”.";
    d.clarification = {
      question: "O que deve ser trocado, e pelo quê?",
      options: [],
      allowFreeText: true,
      freeTextPlaceholder: "Ex: troque “consultor” por “especialista”",
    };
    return d;
  }

  d.understanding = `O objetivo é trocar “${req.replaceFrom}” por “${req.replaceTo}”${scope ? ` somente em ${sectionLabel(scope)}` : " no prompt"}.`;
  const titles = new Set(parsed.sections.filter((s) => s.id !== 0).map((s) => normalize(s.title)));
  let protectedHits = 0;
  for (const line of parsed.lines) {
    if (line.kind === "blank" || line.kind === "separator") continue;
    if (scope && !inSection(line.index, scope)) continue;
    const section = sectionLabel(parsed.sections[line.sectionId]);

    // Títulos mudam a estrutura: a troca fica disponível, mas desmarcada
    if (line.kind === "heading") {
      const { result, count } = replaceInsensitive(line.raw, req.replaceFrom, req.replaceTo);
      if (!count) continue;
      pushOp(ctx, d, {
        type: "substituir_linha",
        line: line.index,
        newText: result,
        section,
        reason: "Altera o título da seção (muda a estrutura do prompt e as referências a ela). Marque só se for intencional.",
        role: "relacionada",
        enabled: false,
      });
      continue;
    }

    // URLs e referências entre aspas a títulos de seção são preservadas
    const { text: newRaw, count, skipped } = replaceOutsideProtected(line.raw, req.replaceFrom, req.replaceTo, titles);
    protectedHits += skipped;
    if (!count) continue;
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: line.index,
      newText: newRaw,
      section,
      reason: `${count} ocorrência(s) de “${req.replaceFrom}”.`,
      role: "principal",
      enabled: true,
    });
    d.affectedRules.push({ line: line.index, section, text: line.text });
  }
  if (protectedHits) d.notes.push(`${protectedHits} ocorrência(s) dentro de URLs ou de referências a títulos de seção foram preservadas.`);
  if (!d.operations.length) {
    d.notes.push(`O trecho “${req.replaceFrom}” não foi encontrado${scope ? ` em ${sectionLabel(scope)}` : ""}.`);
    d.suggestion = "Nada a trocar. Confira a grafia do trecho atual.";
    return d;
  }
  const active = d.operations.filter((o) => o.enabled);
  const sections = unique(active.map((o) => o.section));
  const headingOps = d.operations.length - active.length;
  d.suggestion = `Trocar ${active.length} linha(s) em ${sections.length} seção(ões). Cada ocorrência pode ser desmarcada individualmente${
    sections.length > 1 ? " — confira se a troca faz sentido em todas as seções" : ""
  }.${headingOps ? ` O termo também aparece em ${headingOps} título(s) de seção; essa troca ficou desmarcada para preservar a estrutura.` : ""}`;
  if (/^[A-ZÀ-Þ]/.test(req.replaceFrom) || /[A-Z].*[A-Z]/.test(req.replaceFrom)) {
    d.conflicts.push({ description: `“${req.replaceFrom}” parece ser nome de produto ou termo próprio. Trocar esse nome muda a terminologia usada em todo o prompt.` });
  }
  return d;
}

function handleConditional(ctx: Ctx): Draft {
  const { index, req, parsed, scope } = ctx;
  const d = emptyDraft();
  const trigger = req.trigger ?? "";
  const triggerStems = Array.from(new Set(stems(trigger)));
  const found = index.find(triggerStems, scope ? [scope] : undefined);
  const existing = [...found.primary, ...found.related.filter((u) => u.score >= 0.5)].slice(0, 6);
  const isPrice = triggerStems.some((s) => conceptOf(s) === "preco");

  d.affectedRules = existing.map((u) => ref(parsed, u));
  d.understanding = `O objetivo é mudar como o agente reage quando o usuário ${trigger}.`;

  if (req.vagueBehavior) {
    d.suggestion = existing.length
      ? `Hoje o prompt já trata essa situação nas regras listadas acima. O pedido não diz qual deve ser o novo comportamento, então nada será alterado até isso ficar definido.`
      : "O prompt não tem regra específica para essa situação. Informe como o agente deve conduzir.";
    d.clarification = {
      question: `Como o agente deve conduzir a conversa quando o usuário ${trigger}?`,
      options: isPrice
        ? [
            { label: "Não informar valores e explicar que o consultor apresentará a proposta", value: "detalhe:quando o usuário perguntar preço, explique que o valor depende do cenário da empresa e que um consultor apresentará a proposta comercial" },
            { label: "Fazer uma pergunta de qualificação antes de falar de valores", value: "detalhe:quando o usuário perguntar preço, faça uma pergunta de qualificação para entender o cenário antes de falar de valores" },
            { label: "Encaminhar direto para um consultor", value: "detalhe:quando o usuário perguntar preço, encaminhe diretamente para um consultor comercial" },
          ]
        : [],
      allowFreeText: true,
      freeTextPlaceholder: "Descreva o comportamento desejado",
    };
    return d;
  }

  const behavior = toImperative(req.behavior ?? "").replace(/^./, (c) => c.toLowerCase());
  const ruleText = ensurePeriod(`Quando o usuário ${trigger}, ${behavior}`);
  d.suggestedRule = ruleText;

  const anchorLine = existing[0];
  const section =
    scope ??
    (anchorLine ? parsed.sections[parsed.lines[anchorLine.line].sectionId] : undefined) ??
    index.bestSectionFor(triggerStems) ??
    lastSection(parsed);
  insertRule(ctx, d, section, ruleText, "principal", "Nova regra para a situação descrita.");

  for (const u of existing) {
    const line = parsed.lines[u.line];
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: u.line,
      newText: line.raw,
      section: sectionLabel(parsed.sections[line.sectionId]),
      reason: "Regra atual sobre a mesma situação. Edite ou apague o texto se ela contradizer a nova regra; se mantida como está, nada muda.",
      role: "revisao",
      enabled: false,
    });
    d.conflicts.push({ description: "Regra atual que trata da mesma situação — confirme que não contradiz a nova.", rule: ref(parsed, u) });
  }

  d.suggestion = `Adicionar a regra “${ruleText}” em ${sectionLabel(section)}${
    existing.length ? " e revisar as regras atuais que tratam da mesma situação (listadas como revisão)" : ""
  }.${isPrice ? " Por envolver preço, confira se a nova orientação respeita as restrições comerciais do prompt." : ""}`;
  if (isPrice) d.minImpact = "MEDIO";
  return d;
}

function handleConcise(ctx: Ctx): Draft {
  const { index, parsed } = ctx;
  const d = emptyDraft();
  d.understanding = "O objetivo é tornar as respostas do agente mais curtas e diretas, sem mudar o fluxo de atendimento, a qualificação ou as regras comerciais.";
  d.notes.push("Essa solicitação é ampla e pode afetar diversas partes do prompt.");
  d.suggestion = "Em vez de alterar todas as respostas do agente, recomendo concentrar a mudança nas regras de comunicação:";
  d.suggestionBullets = [
    "reduzir explicações desnecessárias;",
    "manter uma pergunta por mensagem;",
    "evitar listas extensas;",
    "evitar repetir informações;",
    "preservar as regras de qualificação.",
  ];
  d.suggestedRule = "Priorize respostas curtas, objetivas e naturais, fornecendo somente as informações necessárias para avançar a conversa.";
  d.minImpact = "MEDIO";

  const styleSection = index.bestSectionFor([], /(comunica|comportament|estilo|\btom\b|linguag|formato|respost)/) ?? firstSection(parsed);
  // Regras atuais sobre tamanho/estilo de resposta
  const styleUnits = index.units
    .map((u) => index.scoreUnit(u, ["objetiv", "curt", "mensag", "respost", "frase"], []))
    .filter((m) => m.stems.some((s) => conceptOf(s) === "objetivo") || /\b\d+\s*(-|a)\s*\d+\s*frases?\b|\bno maximo\b/.test(normalize(m.sentence)));
  const conflictRe = /(detalhad|explique (tudo|todos|completamente|em detalhes)|list(e|ar) todos|mensagens? longas?|explicac\w* complet|seja (bem )?detalhista)/;
  const conflicting = index.units.filter((u) => conflictRe.test(normalize(u.sentence)));

  d.relatedRules = styleUnits.map((u) => ref(parsed, u));
  for (const u of conflicting) d.conflicts.push({ description: "Esta regra pede respostas mais longas/detalhadas.", rule: ref(parsed, u) });

  const existing = uniqueBy(styleUnits.filter((u) => u.sectionId === styleSection?.id), (u) => u.line);
  if (existing.length) {
    d.notes.push("Já existe uma regra sobre respostas curtas nesta seção. Para não duplicar, você pode editar a regra atual (em “Revisão sugerida”) e desmarcar a nova.");
    d.affectedRules.push(...existing.map((u) => ref(parsed, u)));
  }
  if (styleSection) insertRule(ctx, d, styleSection, d.suggestedRule, "principal", "Regra de objetividade nas regras de comunicação.");
  for (const u of existing) {
    const line = parsed.lines[u.line];
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: u.line,
      newText: line.raw,
      section: sectionLabel(parsed.sections[line.sectionId]),
      reason: "Regra atual sobre tamanho das respostas — edite para incorporar a objetividade, se preferir não adicionar uma regra nova.",
      role: "revisao",
      enabled: false,
    });
  }
  for (const u of conflicting) {
    const line = parsed.lines[u.line];
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: u.line,
      newText: line.raw,
      section: sectionLabel(parsed.sections[line.sectionId]),
      reason: "Pede respostas detalhadas — edite se conflitar com a objetividade.",
      role: "revisao",
      enabled: false,
    });
  }
  d.extraSections = visibleSections(parsed)
    .filter((s) => /(fluxo geral|comportament|qualidade|comunica|respost)/.test(normalize(s.title)))
    .map(sectionLabel);
  return d;
}

function handleTone(ctx: Ctx): Draft {
  const { index, parsed, req } = ctx;
  const d = emptyDraft();
  const n = normalize(req.fullText);
  let rule: string;
  let label: string;
  if (/(sem|nao use|nao usar|evit\w*|tir\w*|remov\w*) emoj/.test(n)) {
    rule = "Não use emojis nas respostas.";
    label = "sem emojis";
  } else if (/emoj/.test(n)) {
    rule = "Use emojis com moderação (no máximo um por mensagem) e nunca em assuntos sensíveis, como problemas ou reclamações.";
    label = "com uso moderado de emojis";
  } else if (/(mais formal|formal)/.test(n) && !/informal/.test(n)) {
    rule = "Use linguagem profissional e cordial, evitando gírias, abreviações e emojis.";
    label = "mais formal";
  } else {
    rule = "Use um tom próximo e natural, como uma conversa entre pessoas, mantendo a cordialidade e o profissionalismo.";
    label = "mais próximo e natural";
  }
  d.understanding = `O objetivo é deixar o tom do agente ${label}, sem alterar fluxo, qualificação ou regras comerciais.`;
  d.suggestion = "Concentrar a mudança nas regras de comunicação/tom, sem mexer nas mensagens de cada fluxo.";
  d.suggestedRule = rule;
  d.minImpact = "MEDIO";

  const section = index.bestSectionFor([], /(comunica|comportament|estilo|\btom\b|linguag|identidade|persona)/) ?? firstSection(parsed);
  const toneUnits = index.units.filter((u) => u.stems.some((s) => conceptOf(s) === "tom"));
  d.relatedRules = toneUnits.map((u) => ref(parsed, u));
  for (const u of toneUnits) {
    d.conflicts.push({ description: "Regra atual sobre tom/linguagem — confirme se continua compatível.", rule: ref(parsed, u) });
    const line = parsed.lines[u.line];
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: u.line,
      newText: line.raw,
      section: sectionLabel(parsed.sections[line.sectionId]),
      reason: "Regra atual de tom — edite se conflitar com a nova orientação.",
      role: "revisao",
      enabled: false,
    });
  }
  if (section) insertRule(ctx, d, section, rule, "principal", "Nova orientação de tom.");
  return d;
}

function handleLessQuestions(ctx: Ctx): Draft {
  const { index, parsed, req } = ctx;
  const d = emptyDraft();

  // Escopo explícito, ou implícito quando o pedido cita um produto/seção (ex: "eKeep").
  // O vocabulário da própria intenção ("encaminhar", "perguntas", "mais cedo") não conta como assunto.
  const subjectStems = req.topicStems.filter(
    (s) => !["perguntar", "encaminhar", "consultor", "cliente", "qualificar"].includes(conceptOf(s) ?? "") && !/^(ced|rapid|menos|antes|tant|logo|diret|fluxo|faz|fac)/.test(s)
  );
  const named = index.sectionsNamedBy(subjectStems);
  const scopeSections = ctx.scope ? [ctx.scope] : named;
  const scopeName = scopeSections.length ? scopeSections.map((s) => s.title).join(", ") : undefined;

  const inScope = (line: number) =>
    scopeSections.length
      ? scopeSections.some((s) => inSection(line, s))
      : /(fluxo|qualific|triag|diagnost|nao client|interesse)/.test(normalize(sectionOf(parsed, line).path.join(" ")));

  const questionUnits = index.units.filter((u) => u.stems.some((s) => conceptOf(s) === "perguntar") && inScope(u.line));
  const handoffSections = visibleSections(parsed).filter((s) => /(encaminh|passag|transfer|consultor)/.test(normalize(s.title)));
  const handoffUnits = index.units.filter(
    (u) =>
      u.stems.some((s) => conceptOf(s) === "encaminhar") &&
      (inScope(u.line) || handoffSections.some((s) => inSection(u.line, s)))
  );
  const conflictRe =
    /((somente|apenas|so) (apos|depois|quando)|antes de encaminhar|qualificac\w* (minima|complet)|diagnostic\w* complet|todas as perguntas|alem das perguntas padrao|perguntas? padrao)/;
  const conflicting = index.units.filter((u) => conflictRe.test(normalize(u.sentence)) && (inScope(u.line) || handoffSections.some((s) => inSection(u.line, s))));

  d.understanding = `O objetivo é reduzir a quantidade de perguntas feitas${scopeName ? ` no fluxo ${scopeName}` : ""} antes do encaminhamento ao consultor.`;
  d.suggestion = `Alterar a regra de passagem${scopeName ? ` de ${scopeName}` : ""} para permitir encaminhamento após identificação de aderência, sem exigir diagnóstico completo. As perguntas atuais continuam no prompt; revise na lista abaixo quais podem virar opcionais.`;
  d.suggestionBullets = [
    "encaminhar assim que houver interesse real e aderência ao produto;",
    "manter somente as perguntas essenciais para o consultor;",
    "deixar as demais informações para o consultor coletar;",
    "preservar as regras de segmentação e de segurança.",
  ];
  const subject = scopeName && scopeSections.every((s) => /(produt)/.test(normalize(s.path.join(" "))) || s.level > 1)
    ? `Para leads interessados em ${scopeName}, encaminhe`
    : "Encaminhe";
  d.suggestedRule = `${subject} para o consultor comercial assim que identificar interesse real e aderência ao produto, sem exigir que todas as perguntas de qualificação tenham sido respondidas. As informações que faltarem podem ser coletadas pelo consultor.`;
  d.minImpact = "MEDIO";

  d.affectedRules = unique([...questionUnits, ...handoffUnits].map((u) => key(u))).map((k) => {
    const u = [...questionUnits, ...handoffUnits].find((x) => key(x) === k)!;
    return ref(parsed, u);
  });
  for (const u of conflicting) {
    d.conflicts.push({ description: "Esta regra exige completar perguntas/qualificação antes de encaminhar.", rule: ref(parsed, u) });
  }
  if (!d.conflicts.length) d.notes.push("Nenhuma regra exige explicitamente completar todas as perguntas antes do encaminhamento.");

  const target = scopeSections[scopeSections.length - 1] ?? handoffSections[0] ?? index.bestSectionFor(["encaminh", "consultor"]) ?? lastSection(parsed);
  insertRule(ctx, d, target, d.suggestedRule, "principal", "Nova regra de passagem para o comercial.");

  const reviewUnits = uniqueBy([...conflicting, ...questionUnits], (u) => u.line);
  for (const u of reviewUnits) {
    const line = parsed.lines[u.line];
    pushOp(ctx, d, {
      type: "substituir_linha",
      line: u.line,
      newText: line.raw,
      section: sectionLabel(parsed.sections[line.sectionId]),
      reason: conflicting.includes(u)
        ? "Exige completar a qualificação antes de encaminhar — edite para não contradizer a nova regra."
        : "Pergunta atual do fluxo — apague o texto para removê-la ou deixe como está.",
      role: "revisao",
      enabled: false,
    });
  }
  return d;
}

function handleGeneric(ctx: Ctx): Draft {
  const { index, req, parsed } = ctx;
  const d = emptyDraft();
  const named = ctx.scope ? [ctx.scope] : index.sectionsNamedBy(req.topicStems);
  const found = req.topicStems.length ? index.find(req.topicStems, named.length ? named : undefined) : undefined;
  const topicLabel = displayTopic(req);

  const rules: RuleRef[] = [];
  for (const s of named) {
    for (const line of parsed.lines) {
      if (isRuleLine(line) && inSection(line.index, s)) rules.push({ line: line.index, section: sectionLabel(sectionOf(parsed, line.index)), text: line.text });
    }
  }
  for (const u of found?.primary ?? []) rules.push(ref(parsed, u));
  d.affectedRules = uniqueBy(rules, (r) => r.line).slice(0, 12);

  const subject = named.length ? named.map((s) => sectionLabel(s)).join(", ") : topicLabel ? `“${topicLabel}”` : "o prompt";
  d.understanding = `Você quer mudar o comportamento do agente em ${subject}, mas o pedido não diz qual mudança deve ser feita.`;
  d.suggestion = d.affectedRules.length
    ? `Estas são as regras atuais sobre ${subject}. Diga o que deve mudar para que eu proponha a alteração mínima.`
    : `Não encontrei regras sobre ${subject}. Descreva a mudança com mais detalhes.`;
  const base = named.length ? ` em ${named[0].title}` : "";
  d.clarification = {
    question: `O que exatamente deve mudar${base}?`,
    options: [
      { label: "Fazer menos perguntas antes de encaminhar", value: `detalhe:fazer menos perguntas antes de encaminhar${base}` },
      { label: "Deixar as respostas mais objetivas", value: "detalhe:ser mais objetivo" },
    ],
    allowFreeText: true,
    freeTextPlaceholder: "Ex: não perguntar mais a quantidade de documentos",
  };
  return d;
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function pushOp(ctx: Ctx, d: Draft, op: Omit<Operation, "id" | "oldText">) {
  const oldText = op.line >= 0 ? ctx.parsed.lines[op.line].raw : "";
  const created: Operation = { id: `op-${ctx.ops.length + 1}`, oldText, ...op };
  ctx.ops.push(created);
  d.operations.push(created);
}

/**
 * Insere uma regra no fim do conteúdo próprio da seção (antes das
 * subseções), copiando o formato da última regra: item de lista com o mesmo
 * marcador, item numerado com o próximo número, ou parágrafo.
 */
function insertRule(ctx: Ctx, d: Draft, section: PromptSection, text: string, role: Operation["role"], reason: string) {
  const { line, newText, note } = computeInsertion(ctx.parsed, section, text);
  pushOp(ctx, d, {
    type: "inserir_apos",
    line,
    newText,
    section: sectionLabel(section),
    reason: note ? `${reason} ${note}` : reason,
    role,
    enabled: true,
  });
}

function inSection(line: number, s: PromptSection) {
  return (line >= s.startLine && line < s.endLine) || line === s.headingLine;
}

function sectionOf(parsed: ParsedPrompt, line: number): PromptSection {
  return parsed.sections[parsed.lines[line].sectionId];
}

function ref(parsed: ParsedPrompt, u: { line: number; sentence?: string; text?: string }): RuleRef {
  return {
    line: u.line,
    section: sectionLabel(sectionOf(parsed, u.line)),
    text: u.sentence ?? u.text ?? parsed.lines[u.line].text,
  };
}

function groupSections(parsed: ParsedPrompt, units: UnitMatch[]): PromptSection[] {
  const ids = unique(units.map((u) => parsed.lines[u.line].sectionId));
  return ids.map((id) => parsed.sections[id]);
}

function byLine(units: UnitMatch[]): Map<number, UnitMatch[]> {
  const map = new Map<number, UnitMatch[]>();
  for (const u of units) map.set(u.line, [...(map.get(u.line) ?? []), u]);
  return map;
}

/** A frase trata de outras coisas além do assunto? (então remove só o item) */
function hasOtherTopics(sentence: string, anchors: string[]): boolean {
  const s = stems(sentence);
  const others = s.filter((x) => !anchors.some((a) => x === a || x.startsWith(a) || a.startsWith(x)));
  return others.length >= 4;
}

function displayTopic(req: ParsedRequest): string {
  if (req.quoted[0]) return req.quoted[0];
  return req.topicDisplay;
}

function firstSection(parsed: ParsedPrompt) {
  return visibleSections(parsed)[0];
}

function lastSection(parsed: ParsedPrompt) {
  const v = visibleSections(parsed);
  return v[v.length - 1];
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function uniqueBy<T>(arr: T[], k: (x: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return arr.filter((x) => {
    const v = k(x);
    if (seen.has(v)) return false;
    seen.add(v);
    return true;
  });
}

/** Troca fora de URLs e de referências entre aspas a títulos de seção. */
function replaceOutsideProtected(raw: string, from: string, to: string, titles: Set<string>) {
  const parts = raw.split(/(https?:\/\/\S+|["“][^"”]{3,80}["”])/);
  let count = 0;
  let skipped = 0;
  const text = parts
    .map((p, i) => {
      const isProtected = i % 2 === 1 && (/^https?:/.test(p) || titles.has(normalize(p.slice(1, -1))));
      const r = replaceInsensitive(p, from, to);
      if (isProtected) {
        skipped += r.count;
        return p;
      }
      count += r.count;
      return r.result;
    })
    .join("");
  return { text, count, skipped };
}
