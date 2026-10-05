import { getPromptBySlug } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { PromptTabs } from "@/components/PromptTabs";

export default async function PromptLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const open = await prisma.changeRequest.count({
    where: { promptId: prompt.id, status: { in: ["AGUARDANDO_ESCLARECIMENTO", "AGUARDANDO_APROVACAO", "APLICADA"] } },
  });

  // Unidade, nome e versão ficam na barra superior (TopBar); aqui só as abas
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-6">
        <PromptTabs slug={prompt.slug} openChanges={open} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto bg-paper">{children}</main>
    </div>
  );
}
