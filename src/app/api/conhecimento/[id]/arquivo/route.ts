import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Download do arquivo original de uma revisão (?rev=N; padrão: a vigente). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const rev = Number(req.nextUrl.searchParams.get("rev") ?? doc.currentRevision);
  const revision = await prisma.knowledgeRevision.findUnique({
    where: { documentId_revision: { documentId: doc.id, revision: rev } },
  });
  if (!revision) return NextResponse.json({ error: "Revisão não encontrada." }, { status: 404 });

  const asText = req.nextUrl.searchParams.get("formato") === "texto";
  const body = asText ? revision.content : Buffer.from(revision.original);
  const name = asText ? revision.fileName.replace(/\.[^.]+$/, "") + ".txt" : revision.fileName;
  return new NextResponse(body, {
    headers: {
      "Content-Type": asText ? "text/plain; charset=utf-8" : revision.mimeType,
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
