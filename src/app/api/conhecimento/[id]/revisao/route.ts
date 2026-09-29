import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { extractText } from "@/lib/knowledge/extract";

/** Substitui o arquivo de um documento: cria uma nova revisão e ela passa a valer. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const doc = await prisma.knowledgeDocument.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const note = String(form.get("note") ?? "").trim() || null;
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Selecione o arquivo." }, { status: 400 });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { text, mimeType } = await extractText(file.name, buf);
    const user = getCurrentUser();
    const revision = await prisma.$transaction(async (tx) => {
      const last = await tx.knowledgeRevision.findFirst({ where: { documentId: doc.id }, orderBy: { revision: "desc" } });
      const next = (last?.revision ?? 0) + 1;
      await tx.knowledgeRevision.create({
        data: { documentId: doc.id, revision: next, fileName: file.name, mimeType, size: buf.length, content: text, original: buf, note, createdBy: user },
      });
      await tx.knowledgeDocument.update({ where: { id: doc.id }, data: { currentRevision: next } });
      return next;
    });
    revalidatePath("/conhecimento", "layout");
    return NextResponse.json({ revision });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
