/**
 * Exporta todos os dados do banco atual (DATABASE_URL) para
 * prisma/export/data.json — prompts, versões, alterações e a base de
 * conhecimento (arquivos originais em base64).
 *
 * Uso: npx tsx scripts/export-data.ts
 * O arquivo gerado contém dados da empresa e NÃO vai para o Git.
 */
import { mkdirSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [prompts, versions, changes, documents, revisions] = await Promise.all([
    prisma.prompt.findMany(),
    prisma.promptVersion.findMany({ orderBy: [{ promptId: "asc" }, { version: "asc" }] }),
    prisma.changeRequest.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.knowledgeDocument.findMany(),
    prisma.knowledgeRevision.findMany({ orderBy: [{ documentId: "asc" }, { revision: "asc" }] }),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    prompts,
    versions,
    changes,
    documents,
    revisions: revisions.map((r) => ({ ...r, original: Buffer.from(r.original).toString("base64") })),
  };

  mkdirSync("prisma/export", { recursive: true });
  writeFileSync("prisma/export/data.json", JSON.stringify(data));
  console.log(
    `Exportado: ${prompts.length} prompts, ${versions.length} versões, ${changes.length} alterações, ${documents.length} documentos, ${revisions.length} revisões → prisma/export/data.json`
  );
}

main().finally(() => prisma.$disconnect());
