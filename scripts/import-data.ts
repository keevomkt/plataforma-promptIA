/**
 * Importa prisma/export/data.json no banco apontado por DATABASE_URL
 * (usado para levar os dados do SQLite local para o Postgres do Supabase).
 * Mantém ids, datas e o histórico completo.
 *
 * Uso: npx tsx scripts/import-data.ts
 * Recusa rodar se o banco de destino já tiver prompts, para nunca duplicar
 * nem sobrescrever dados.
 */
import { readFileSync } from "fs";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type Dump = {
  prompts: Prisma.PromptCreateManyInput[];
  versions: Prisma.PromptVersionCreateManyInput[];
  changes: Prisma.ChangeRequestCreateManyInput[];
  documents: Prisma.KnowledgeDocumentCreateManyInput[];
  revisions: (Omit<Prisma.KnowledgeRevisionCreateManyInput, "original"> & { original: string })[];
};

async function main() {
  const dump = JSON.parse(readFileSync("prisma/export/data.json", "utf8")) as Dump;

  if ((await prisma.prompt.count()) > 0) {
    throw new Error("O banco de destino já tem prompts. Importação cancelada para não duplicar dados.");
  }

  await prisma.$transaction(
    async (tx) => {
      // Prompt aponta para a versão atual e a versão para o prompt: cria sem o ponteiro e liga no fim
      await tx.prompt.createMany({ data: dump.prompts.map((p) => ({ ...p, currentVersionId: null })) });
      // Em ordem de número, para que a versão "pai" sempre exista antes
      for (const v of dump.versions) await tx.promptVersion.create({ data: v as Prisma.PromptVersionUncheckedCreateInput });
      for (const p of dump.prompts) {
        if (p.currentVersionId) await tx.prompt.update({ where: { id: p.id }, data: { currentVersionId: p.currentVersionId } });
      }
      if (dump.changes.length) await tx.changeRequest.createMany({ data: dump.changes });
      if (dump.documents.length) await tx.knowledgeDocument.createMany({ data: dump.documents });
      for (const r of dump.revisions) {
        await tx.knowledgeRevision.create({ data: { ...r, original: Buffer.from(r.original, "base64") } });
      }
    },
    { timeout: 120_000 }
  );

  console.log(
    `Importado: ${dump.prompts.length} prompts, ${dump.versions.length} versões, ${dump.changes.length} alterações, ${dump.documents.length} documentos, ${dump.revisions.length} revisões.`
  );
}

main().finally(() => prisma.$disconnect());
