import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/auth/session";
import { getCurrentVersion } from "@/lib/data";
import { isAiConfigured } from "@/lib/ai/client";
import { diagnoseFromConversation } from "@/lib/ai/diagnose";
import { loadKnowledgeForPrompt } from "@/lib/knowledge/data";

const MAX_IMAGE_BYTES = (process.env.VERCEL ? 4 : 10) * 1024 * 1024;
const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp"> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

/** PASSO 2–4 (por diagnóstico): recebe uma conversa real + comportamento esperado e roda o diagnóstico por IA. */
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const me = await apiUser();
  if (!me) return unauthorized();
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "Diagnóstico por IA não está configurado. Defina ANTHROPIC_API_KEY no arquivo .env do servidor." }, { status: 400 });
  }

  const prompt = await prisma.prompt.findUnique({ where: { slug: params.slug } });
  if (!prompt) return NextResponse.json({ error: "Prompt não encontrado." }, { status: 404 });

  const current = await getCurrentVersion(prompt.id);
  if (!current) return NextResponse.json({ error: "Este prompt ainda não tem nenhuma versão." }, { status: 400 });

  const form = await req.formData();
  const conversationText = String(form.get("conversationText") ?? "").trim();
  const expectedBehavior = String(form.get("expectedBehavior") ?? "").trim();
  const image = form.get("image");

  if (!expectedBehavior) return NextResponse.json({ error: "Descreva qual era o comportamento esperado." }, { status: 400 });
  if (!conversationText && !(image instanceof File && image.size > 0)) {
    return NextResponse.json({ error: "Cole a conversa ou envie um print de tela." }, { status: 400 });
  }

  let conversationImage: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" } | undefined;
  if (image instanceof File && image.size > 0) {
    const mediaType = IMAGE_TYPES[image.type];
    if (!mediaType) return NextResponse.json({ error: "Formato de imagem não suportado. Use PNG, JPG ou WEBP." }, { status: 400 });
    if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: `Imagem maior que ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    const buf = Buffer.from(await image.arrayBuffer());
    conversationImage = { base64: buf.toString("base64"), mediaType };
  }

  let analysis;
  try {
    analysis = await diagnoseFromConversation({
      promptContent: current.content,
      conversationText,
      conversationImage,
      expectedBehavior,
      knowledge: (await loadKnowledgeForPrompt(prompt.id)).sources,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const status = analysis.operations.length ? "AGUARDANDO_APROVACAO" : "SEM_ALTERACAO";
  const change = await prisma.changeRequest.create({
    data: {
      promptId: prompt.id,
      kind: "DIAGNOSTICO",
      request: analysis.request,
      status,
      analysis: JSON.stringify(analysis),
      affectedSections: JSON.stringify(analysis.affectedSections),
      conflicts: JSON.stringify(analysis.conflicts.map((c) => c.description)),
      suggestion: analysis.suggestion,
      impactLevel: analysis.impact,
      fromVersionId: current.id,
      createdBy: me.name,
    },
  });

  revalidatePath(`/p/${prompt.slug}`, "layout");
  return NextResponse.json({ changeId: change.id });
}
