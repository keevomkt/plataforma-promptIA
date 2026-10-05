import Link from "next/link";
import { listPrompts } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { SidebarLink } from "@/components/SidebarLink";
import { TopBar } from "@/components/TopBar";
import { KeevoMark, UnitLogo } from "@/components/Brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const prompts = await listPrompts();
  const knowledgeCount = await prisma.knowledgeDocument.count();
  const pending = user.role === "ADMIN" ? await prisma.user.count({ where: { status: "PENDENTE" } }) : 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="sidebar-surface flex w-60 shrink-0 flex-col border-r border-accent/10">
        <div className="keevo-gradient h-1" />
        {/* 4 px da faixa + 52 px = 56 px, a mesma altura da barra superior: as duas linhas de baixo ficam alinhadas */}
        <Link href="/" className="flex h-[52px] shrink-0 items-center border-b border-accent/10 px-4">
          <KeevoMark />
        </Link>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-strong/60">Prompts</div>
          <ul className="space-y-0.5">
            {prompts.map((p) => (
              <li key={p.id}>
                <SidebarLink
                  href={`/p/${p.slug}`}
                  label={p.name}
                  icon={
                    p.businessUnit ? (
                      <UnitLogo unit={p.businessUnit} height={20} />
                    ) : (
                      <span className="h-5 w-5 shrink-0 rounded-[5px] border border-dashed border-line-strong" />
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <Link href="/?novo=1" className="mt-2 block rounded px-2.5 py-1.5 text-[13px] font-medium text-accent hover:bg-surface/80">
            + Novo prompt
          </Link>

          <div className="mt-5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-strong/60">Referência</div>
          <SidebarLink
            href="/conhecimento"
            label={`Base de conhecimento${knowledgeCount ? ` (${knowledgeCount})` : ""}`}
            icon={
              <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12Z" />
                <path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" />
                <path d="M7.5 7h4.5M7.5 10h3" strokeLinecap="round" />
              </svg>
            }
          />

          {user.role === "ADMIN" && (
            <>
              <div className="mt-5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-strong/60">Administração</div>
              <SidebarLink
                href="/usuarios"
                label="Usuários"
                badge={pending || undefined}
                icon={
                  <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <circle cx="8" cy="7" r="3" />
                    <path d="M2.5 16.5c.6-2.8 2.9-4.5 5.5-4.5s4.9 1.7 5.5 4.5" strokeLinecap="round" />
                    <path d="M13.5 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1.1.8 1.8 2.2 2 4.1" strokeLinecap="round" />
                  </svg>
                }
              />
            </>
          )}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar name={user.name} email={user.email} role={user.role} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
