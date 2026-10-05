import { getCurrentVersion, getPromptBySlug } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { resolveUnit } from "@/lib/brand";
import { PromptTabs } from "@/components/PromptTabs";
import { UnitLogo } from "@/components/Brand";

export default async function PromptLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const prompt = await getPromptBySlug(params.slug);
  const current = await getCurrentVersion(prompt.id);
  const open = await prisma.changeRequest.count({
    where: { promptId: prompt.id, status: { in: ["AGUARDANDO_ESCLARECIMENTO", "AGUARDANDO_APROVACAO", "APLICADA"] } },
  });
  const unit = resolveUnit(prompt.businessUnit);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            {unit ? (
              <UnitLogo unit={unit.id} height={34} priority />
            ) : (
              <span className="h-[34px] w-[34px] shrink-0 rounded-md border border-dashed border-line-strong" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[16px] font-semibold text-ink">{prompt.name}</h1>
                {current && (
                  <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-strong">
                    v{current.version}
                  </span>
                )}
              </div>
              {prompt.description && <p className="truncate text-xs text-ink-faint">{prompt.description}</p>}
            </div>
          </div>
        </div>
        <PromptTabs slug={prompt.slug} openChanges={open} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto bg-paper">{children}</main>
    </div>
  );
}
