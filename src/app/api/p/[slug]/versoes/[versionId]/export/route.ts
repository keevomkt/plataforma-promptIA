import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, unauthorized } from "@/lib/auth/session";

export async function GET(req: NextRequest, { params }: { params: { slug: string; versionId: string } }) {
  const me = await apiUser();
  if (!me) return unauthorized();
  const version = await prisma.promptVersion.findUnique({ where: { id: params.versionId }, include: { prompt: true } });
  if (!version || version.prompt.slug !== params.slug) {
    return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
  }
  const format = req.nextUrl.searchParams.get("format") === "md" ? "md" : "txt";
  const fileName = `${version.prompt.slug}-v${version.version}.${format}`;
  return new NextResponse(version.content, {
    headers: {
      "Content-Type": format === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
