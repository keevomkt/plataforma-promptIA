/**
 * Regressão da avaliação de alterações (correção do Claude e pedido escrito)
 * contra os prompts reais do banco. Somente leitura. Uso: npm run test:changes [-- --verbose]
 */
import { PrismaClient } from "@prisma/client";
import { analyzeChange } from "../../src/lib/engine/analyze";
import { looksLikeClaudeAnswer } from "../../src/lib/claude/answer";
import { readClaudeCorrection } from "../../src/lib/claude/analysis";
import { loadKnowledgeForPrompt } from "../../src/lib/knowledge/data";
import type { RuleCheck } from "../../src/lib/engine/types";
import { CLAUDE_CASES, REQUEST_CASES, type ExpectedCheck } from "./change-cases";

const verbose = process.argv.includes("--verbose");
const prisma = new PrismaClient();

async function contentOf(slug: string) {
  const prompt = await prisma.prompt.findUniqueOrThrow({ where: { slug } });
  const version = await prisma.promptVersion.findUniqueOrThrow({ where: { id: prompt.currentVersionId! } });
  return { content: version.content, kb: (await loadKnowledgeForPrompt(prompt.id)).sources };
}

function checkFails(expected: ExpectedCheck[] = [], got: RuleCheck[], notConflicting: number[] = []): string[] {
  const fails: string[] = [];
  for (const e of expected) {
    const c = got.find((g) => g.line + 1 === e.line);
    if (!c) fails.push(`L${e.line} deveria sair como ${e.kind}, não apareceu`);
    else if (c.kind !== e.kind) fails.push(`L${e.line} deveria ser ${e.kind}, veio ${c.kind}`);
  }
  for (const l of notConflicting) {
    if (got.some((g) => g.line + 1 === l && g.kind === "conflitante")) fails.push(`alarme falso: L${l} saiu como conflitante`);
  }
  return fails;
}

function show(checks: RuleCheck[]) {
  for (const c of checks) console.log(`    ${c.kind.padEnd(11)} L${c.line + 1} [${c.topic}] ${c.explanation}`);
}

(async () => {
  let pass = 0;
  let total = 0;

  console.log("Correção colada do Claude");
  for (const c of CLAUDE_CASES) {
    total++;
    const { content, kb } = await contentOf(c.prompt);
    const r = readClaudeCorrection(content, { problem: "teste", expected: "", answer: c.answer }, kb);
    const fails: string[] = [];
    if (c.rejected) {
      if (r.ok) fails.push("deveria ser recusada, mas virou alteração");
      else if (!c.rejected.test(r.notes.join(" "))) fails.push(`motivo inesperado: ${r.notes.join(" ")}`);
    } else if (!r.ok) {
      fails.push(`recusada: ${r.error} ${r.notes.join(" ")}`);
    } else {
      const touched = Array.from(new Set(r.analysis.operations.map((o) => o.line + 1)));
      for (const l of c.touches ?? []) if (!touched.includes(l)) fails.push(`deveria tocar L${l}, tocou ${touched.map((x) => `L${x}`).join(", ")}`);
      fails.push(...checkFails(c.checks, r.analysis.ruleChecks ?? [], c.notConflicting));
    }
    if (!fails.length) pass++;
    console.log(`${fails.length ? "FALHOU" : "ok    "} ${c.id} ${c.description}`);
    for (const f of fails) console.log(`    - ${f}`);
    if ((fails.length || verbose) && r.ok) show(r.analysis.ruleChecks ?? []);
    if (verbose && r.ok) for (const o of r.analysis.operations) console.log(`    op ${o.type} L${o.line + 1}: ${JSON.stringify(o.newText).slice(0, 120)}`);
  }

  console.log("\nPedido escrito");
  for (const c of REQUEST_CASES) {
    total++;
    const fails: string[] = [];
    if (c.looksLikeClaude !== undefined && looksLikeClaudeAnswer(c.request) !== c.looksLikeClaude) {
      fails.push(c.looksLikeClaude ? "deveria ser reconhecida como resposta do Claude" : "pedido comum confundido com resposta do Claude");
    }
    let checks: RuleCheck[] = [];
    if (c.checks) {
      const { content, kb } = await contentOf(c.prompt);
      checks = analyzeChange(content, c.request, [], kb).ruleChecks ?? [];
      fails.push(...checkFails(c.checks, checks));
    }
    if (!fails.length) pass++;
    console.log(`${fails.length ? "FALHOU" : "ok    "} ${c.id} ${c.description}`);
    for (const f of fails) console.log(`    - ${f}`);
    if (fails.length || verbose) show(checks);
  }

  console.log(`\n${pass}/${total} casos ok`);
  await prisma.$disconnect();
  process.exit(pass === total ? 0 : 1);
})();
