/**
 * Regressão da busca de comportamento contra os prompts reais do banco.
 * Somente leitura. Uso: npm run test:locate [-- --verbose]
 */
import { PrismaClient } from "@prisma/client";
import { parsePrompt } from "../../src/lib/engine/parse";
import { locateBehavior } from "../../src/lib/engine/locate";
import type { BehaviorGroup, LocateResult } from "../../src/lib/engine/locate/types";
import { LOCATE_CASES, type LocateCase } from "./locate-cases";

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
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
