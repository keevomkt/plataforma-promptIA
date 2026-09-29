import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/user";
import { extractText } from "@/lib/knowledge/extract";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";

/** Upload de um ou mais arquivos para a base de conhecimento. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const businessUnit = String(form.get("businessUnit") ?? "").trim();
  const category = String(form.get("category") ?? "");
  const description = String(form.get("description") ?? "").trim() || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!businessUnit) return NextResponse.json({ error: "Informe a unidade de negócio." }, { status: 400 });
  if (!KNOWLEDGE_CATEGORIES[category]) return NextResponse.json({ error: "Categoria inválida." }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: "Selecione ao menos um arquivo." }, { status: 400 });

  const user = getCurrentUser();
  const created: { id: string; title: string }[] = [];
  const errors: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const { text, mimeType } = await extractText(file.name, buf);
      const doc = await prisma.knowledgeDocument.create({
        data: {
          title: file.name.replace(/\.[^.]+$/, ""),
          businessUnit,
          category,
          description,
          createdBy: user,
          revisions: {
            create: { revision: 1, fileName: file.name, mimeType, size: buf.length, content: text, original: buf, createdBy: user },
          },
        },
      });
      created.push({ id: doc.id, title: doc.title });
    } catch (err) {
      errors.push({ fileName: file.name, error: (err as Error).message });
    }
  }

  revalidatePath("/conhecimento", "layout");
  return NextResponse.json({ created, errors }, { status: created.length ? 200 : 400 });
}
