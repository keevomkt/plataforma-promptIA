/**
 * Regressão da busca de comportamento contra os prompts reais do banco.
 * Somente leitura. Uso: npm run test:locate [-- --verbose]
 */
import { PrismaClient } from "@prisma/client";
import { parsePrompt } from "../../src/lib/engine/parse";
import { answerQuestion, classifyQuestion, extractNamedItems, locateBehavior } from "../../src/lib/engine/locate";
import type { AskAnswer, BehaviorGroup, FactResult, LocateResult } from "../../src/lib/engine/locate/types";
import { loadKnowledgeForPrompt } from "../../src/lib/knowledge/data";
import { ANSWER_CASES, CLASSIFY_CASES, ENTITY_CASES, LOCATE_CASES, type AnswerCase, type EntityCase, type LocateCase } from "./locate-cases";

const verbose = process.argv.includes("--verbose");
const prisma = new PrismaClient();

const oneBased = (g: BehaviorGroup) => g.rules.map((r) => r.line + 1);

function check(c: LocateCase, r: LocateResult): string[] {
  const fails: string[] = [];
  const main = r.groups[0];
  const mainLines = main ? oneBased(main) : [];
  if (c.mainGroupExactly) {
    const exp = [...c.mainGroupExactly].sort((a, b) => a - b).join(",");
    const got = [...mainLines].sort((a, b) => a - b).join(",");
    if (exp !== got) fails.push(`grupo principal deveria ser exatamente [${exp}], veio [${got}]`);
  }
  if (c.mainGroupIncludes) {
    const missing = c.mainGroupIncludes.filter((l) => !mainLines.includes(l));
    if (missing.length) fails.push(`faltaram no grupo principal: ${missing.map((l) => `L${l}`).join(", ")}`);
  }
  if (c.mainGroupExcludes) {
    const extra = c.mainGroupExcludes.filter((l) => mainLines.includes(l));
    if (extra.length) fails.push(`não deveriam estar no grupo principal: ${extra.map((l) => `L${l}`).join(", ")}`);
  }
  if (c.sectionWithSubgroups) {
    const hit = r.sectionHits.find((h) => h.title === c.sectionWithSubgroups!.title);
    if (!hit) fails.push(`seção “${c.sectionWithSubgroups.title}” não apareceu como seção com subseções`);
    else {
      for (const expected of c.sectionWithSubgroups.subgroupIncludes) {
        const ok = hit.groups.some((g) => expected.every((l) => oneBased(g).includes(l)));
        if (!ok) fails.push(`nenhuma subseção contém [${expected.join(",")}]`);
      }
    }
  }
  if (c.overlapInvolves) {
    const all = [...r.groups, ...r.sectionHits.flatMap((h) => h.groups)].flatMap((g) => g.overlaps);
    const ok = all.some((o) => c.overlapInvolves!.every((l) => o.lines.map((x) => x + 1).includes(l)));
    if (!ok) fails.push(`nenhuma duplicidade/divergência envolvendo ${c.overlapInvolves.map((l) => `L${l}`).join(", ")}`);
  }
  if (c.noOverlapInMainGroup && main?.overlaps.length) {
    fails.push(`alarme falso no grupo principal: ${main.overlaps.map((o) => `${o.kind} ${o.lines.map((l) => `L${l + 1}`).join("/")}`).join("; ")}`);
  }
  return fails;
}

function describe(r: LocateResult) {
  const out: string[] = [`  assunto: ${r.topic.terms.join(", ")}${r.topic.missing.length ? ` (ausentes: ${r.topic.missing.join(", ")})` : ""}`];
  for (const h of r.sectionHits) {
    out.push(`  SEÇÃO ${h.title} (score ${h.score.toFixed(2)})`);
    for (const g of h.groups) out.push(`    · ${g.title}: ${oneBased(g).map((l) => `L${l}`).join(" ")}`);
  }
  r.groups.forEach((g, i) => {
    out.push(`  ${i === 0 ? "PRINCIPAL" : "grupo"} ${g.title} (score ${g.score.toFixed(2)})`);
    for (const rule of g.rules) {
      const why = rule.reasons
        .map((x) => {
          if (x.kind === "termo") return `termo(${x.terms.join("+")})`;
          if (x.kind === "secao") return "seção";
          if (x.kind === "estrutura") return `estrutura(L${x.headLine + 1})`;
          if (x.kind === "posicao") return `posição(L${x.before + 1}–L${x.after + 1})`;
          return `ref(“${x.marker}”→L${x.antecedentLine + 1})`;
        })
        .join(", ");
      out.push(`      L${rule.line + 1} [${why}] ${rule.text.slice(0, 90)}`);
    }
    for (const o of g.overlaps) out.push(`      ⚠ ${o.kind}: ${o.lines.map((l) => `L${l + 1}`).join("/")} — ${o.explanation}`);
  });
  return out.join("\n");
}

async function currentContent(slug: string): Promise<string> {
  const prompt = await prisma.prompt.findUnique({ where: { slug } });
  const version = prompt?.currentVersionId ? await prisma.promptVersion.findUnique({ where: { id: prompt.currentVersionId } }) : null;
  return version?.content ?? "";
}

function checkEntities(c: EntityCase, r: FactResult): string[] {
  const fails: string[] = [];
  const names = (l: { name: string }[]) => l.map((i) => i.name);
  const got = names(r.withSection).sort().join(" | ");
  const exp = [...c.withSectionExactly].sort().join(" | ");
  if (got !== exp) fails.push(`seção própria deveria ser [${exp}], veio [${got}]`);
  if (c.citedIncludes) {
    const all = names([...r.withSection, ...r.cited]);
    const missing = c.citedIncludes.filter((n) => !names(r.cited).includes(n));
    if (missing.length) fails.push(`faltaram nos citados: ${missing.join(", ")}${missing.some((m) => all.includes(m)) ? " (alguns vieram como seção própria)" : ""}`);
  }
  for (const n of c.lowConfidenceIfPresent ?? []) {
    const item = [...r.withSection, ...r.cited].find((i) => i.name === n);
    if (item && item.confidence !== "baixa") fails.push(`“${n}” deveria estar como baixa confiança`);
  }
  return fails;
}

function checkAnswer(c: AnswerCase, r: AskAnswer): string[] {
  const fails: string[] = [];
  if (r.classification.kind !== c.expectKind) fails.push(`tipo ${r.classification.kind}, esperado ${c.expectKind}`);
  const docs = r.knowledge?.docs ?? [];
  const titles = docs.map((d) => d.title);
  if (c.docsExactly) {
    const exp = [...c.docsExactly].sort().join(" | ");
    const got = [...titles].sort().join(" | ");
    if (exp !== got) fails.push(`documentos deveriam ser [${exp}], vieram [${got}]`);
  }
  for (const t of c.docsIncludes ?? []) if (!titles.includes(t)) fails.push(`faltou o documento “${t}”`);
  if (c.firstDoc && titles[0] !== c.firstDoc) fails.push(`primeiro documento deveria ser “${c.firstDoc}”, veio “${titles[0] ?? "—"}”`);
  for (const [t, n] of Object.entries(c.occurrences ?? {})) {
    const d = docs.find((x) => x.title === t);
    if (d?.occurrences !== n) fails.push(`“${t}” deveria ter ${n} ocorrência(s), veio ${d?.occurrences ?? "—"}`);
  }
  const forms = new Set(docs.flatMap((d) => Object.keys(d.forms)));
  for (const f of c.formsInclude ?? []) if (!forms.has(f)) fails.push(`grafia “${f}” não foi mostrada`);
  if (c.noKnowledgeSection && docs.length) fails.push(`a base não deveria aparecer, mas trouxe: ${titles.join(", ")}`);
  for (const want of c.categoryOtherIncludes ?? []) {
    const got = (r.knowledge?.itemGroups?.other ?? []).map((i) => `${i.name}:${i.confidence}`);
    if (!got.includes(want)) fails.push(`“também citados” deveria ter ${want}; veio ${got.join(", ") || "nada"}`);
  }
  for (const [doc, want] of Object.entries(c.countsInclude ?? {})) {
    const d = docs.find((x) => x.title === doc);
    for (const [item, n] of Object.entries(want)) {
      if (d?.counts[item] !== n) fails.push(`${doc}: ${item} deveria ter ${n} ocorrência(s), veio ${d?.counts[item] ?? 0}`);
    }
  }
  if (c.categoryItems) {
    const exp = [...c.categoryItems].sort().join(" | ");
    const got = [...(r.knowledge?.items ?? [])].sort().join(" | ");
    if (exp !== got) fails.push(`categoria deveria virar os itens [${exp}], virou [${got || "—"}]`);
  }
  if (c.noCategory && r.knowledge?.items?.length) fails.push(`busca literal virou categoria: ${r.knowledge.items.join(", ")}`);
  const main = r.behavior?.groups[0];
  const mainLines = main ? main.rules.map((x) => x.line + 1) : [];
  const missing = (c.promptMainIncludes ?? []).filter((l) => !mainLines.includes(l));
  if (missing.length) fails.push(`faltaram no grupo principal do prompt: ${missing.map((l) => `L${l}`).join(", ")}`);
  if (c.promptMainSection && !main?.sectionPath.includes(c.promptMainSection)) fails.push(`grupo principal do prompt deveria estar em “${c.promptMainSection}”, veio “${main?.sectionPath.join(" › ") ?? "—"}”`);
  if (c.notInPromptAnswer) {
    const answerLines = [
      ...(r.behavior ? [...r.behavior.groups, ...r.behavior.sectionHits.flatMap((h) => h.groups)] : []),
    ].flatMap((g) => g.rules.map((x) => x.line + 1));
    const leaked = c.notInPromptAnswer.filter((l) => answerLines.includes(l));
    if (leaked.length) fails.push(`regras sobre a fonte apareceram como resposta do prompt: ${leaked.map((l) => `L${l}`).join(", ")}`);
  }
  return fails;
}

async function main() {
  let failed = 0;
  let gaps = 0;
  for (const c of LOCATE_CASES) {
    const prompt = await prisma.prompt.findUnique({ where: { slug: c.prompt } });
    const version = prompt?.currentVersionId ? await prisma.promptVersion.findUnique({ where: { id: prompt.currentVersionId } }) : null;
    if (!version) {
      console.log(`✗ ${c.id}: prompt “${c.prompt}” não encontrado`);
      failed++;
      continue;
    }
    const result = locateBehavior(parsePrompt(version.content), c.question);
    const fails = check(c, result);
    const gap = fails.length > 0 && !!c.knownGap;
    console.log(`${!fails.length ? "✓" : gap ? "◐" : "✗"} ${c.id} [${c.kind}] “${c.question}”`);
    fails.forEach((f) => console.log(`    - ${f}`));
    if (gap) console.log(`    lacuna conhecida: ${c.knownGap}`);
    if (!fails.length && c.knownGap) console.log(`    (a lacuna conhecida foi resolvida — remova “knownGap” do caso)`);
    if (verbose || fails.length) console.log(describe(result));
    if (fails.length && !gap) failed++;
    if (gap) gaps++;
  }
  console.log(`\n${LOCATE_CASES.length - failed - gaps}/${LOCATE_CASES.length} casos passaram${gaps ? `, ${gaps} lacuna(s) conhecida(s)` : ""}${failed ? `, ${failed} falha(s)` : ""}.`);

  // Tipo de pergunta
  console.log("\n— Tipo de pergunta");
  const classify = [...CLASSIFY_CASES, ...LOCATE_CASES.map((c) => ({ question: c.question, expect: "COMPORTAMENTO" as const, note: `caso ${c.id}` }))];
  let classFailed = 0;
  for (const c of classify) {
    const got = classifyQuestion(c.question);
    const ok = got.kind === c.expect;
    if (!ok) classFailed++;
    if (!ok || verbose) console.log(`${ok ? "✓" : "✗"} ${got.kind}${ok ? "" : ` (esperado ${c.expect})`} “${c.question}”${c.note ? ` — ${c.note}` : ""} [${got.reason}]`);
  }
  console.log(`${classify.length - classFailed}/${classify.length} classificações corretas.`);

  // Itens nomeados
  console.log("\n— Itens nomeados (perguntas de fato)");
  let entFailed = 0;
  for (const c of ENTITY_CASES) {
    const version = await currentContent(c.prompt);
    const r = extractNamedItems(parsePrompt(version), c.question);
    const fails = checkEntities(c, r);
    console.log(`${fails.length ? "✗" : "✓"} ${c.id} “${c.question}”`);
    fails.forEach((f) => console.log(`    - ${f}`));
    if (verbose || fails.length) {
      for (const [label, list] of [["seção própria", r.withSection], ["citados", r.cited]] as const) {
        console.log(`  ${label}: ${list.map((i) => `${i.name}${i.confidence === "baixa" ? " (baixa)" : ""}`).join(", ") || "—"}`);
        if (verbose) for (const i of list) console.log(`      · ${i.name}: ${i.signals.join("; ")}`);
      }
    }
    if (fails.length) entFailed++;
  }
  console.log(`${ENTITY_CASES.length - entFailed}/${ENTITY_CASES.length} extrações corretas.`);

  // Resposta completa (prompt + base de conhecimento)
  console.log("\n— Resposta completa (prompt + base de conhecimento)");
  let ansFailed = 0;
  for (const c of ANSWER_CASES) {
    const prompt = await prisma.prompt.findUnique({ where: { slug: c.prompt } });
    const kb = await loadKnowledgeForPrompt(prompt!.id);
    const r = answerQuestion(parsePrompt(await currentContent(c.prompt)), c.question, kb, {
      unitTerms: [prompt!.slug, prompt!.name, prompt!.businessUnit ?? ""].filter(Boolean),
    });
    const fails = checkAnswer(c, r);
    console.log(`${fails.length ? "✗" : "✓"} ${c.id} “${c.question}”`);
    fails.forEach((f) => console.log(`    - ${f}`));
    if (verbose || fails.length) {
      console.log(`  tipo: ${r.classification.kind}${r.classification.sourceSelected ? " (fonte escolhida: base)" : ""} · consultado: ${[r.consulted.prompt && "prompt", r.consulted.base && "base"].filter(Boolean).join(" + ")}`);
      for (const d of r.knowledge?.docs ?? []) console.log(`    📄 ${d.title}: ${d.occurrences}× ${JSON.stringify(d.forms)} — ${d.excerpts.length} trecho(s)`);
      const main = r.behavior?.groups[0];
      if (main) console.log(`    prompt: ${main.sectionPath.join(" › ")} → ${main.rules.map((x) => `L${x.line + 1}`).join(" ")}`);
      if (r.aboutSource?.found) console.log(`    sobre a fonte: ${[...r.aboutSource.sectionHits.flatMap((h) => h.groups), ...r.aboutSource.groups].map((g) => g.title).join(", ")}`);
    }
    if (fails.length) ansFailed++;
  }
  console.log(`${ANSWER_CASES.length - ansFailed}/${ANSWER_CASES.length} respostas corretas.`);

  await prisma.$disconnect();
  process.exit(failed || classFailed || entFailed || ansFailed ? 1 : 0);
}

main();
