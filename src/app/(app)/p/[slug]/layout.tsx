import { getPromptBySlug } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { PromptTabs } from "@/components/PromptTabs";

export default async function PromptLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const [user, prompt] = await Promise.all([requireUser(), getPromptBySlug(params.slug)]);
  const isAdmin = user.role === "ADMIN";
  const open = isAdmin
    ? await prisma.changeRequest.count({
        where: { promptId: prompt.id, status: { in: ["AGUARDANDO_ESCLARECIMENTO", "AGUARDANDO_APROVACAO", "APLICADA"] } },
      })
    : 0;

  // Unidade, nome e versão ficam na barra superior (TopBar); aqui só as abas
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-6">
        <PromptTabs slug={prompt.slug} openChanges={open} isAdmin={isAdmin} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto bg-paper">{children}</main>
    </div>
  );
}
