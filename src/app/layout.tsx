import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { listPrompts } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ANONYMOUS } from "@/lib/user";
import { ResponsibleInput } from "@/components/ResponsibleInput";
import { SidebarLink } from "@/components/SidebarLink";
import { KeevoMark, UnitLogo } from "@/components/Brand";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Keevo Prompt Studio",
  description: "Engenharia, manutenção e governança dos prompts dos agentes de IA da Keevo.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prompts = await listPrompts();
  const knowledgeCount = await prisma.knowledgeDocument.count();
  const user = getCurrentUser();

  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
            <div className="keevo-gradient h-1" />
            <Link href="/" className="block border-b border-line px-4 py-4">
              <KeevoMark />
            </Link>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Prompts</div>
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
              <Link
                href="/?novo=1"
                className="mt-2 block rounded px-2.5 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft"
              >
                + Novo prompt
              </Link>

              <div className="mt-5 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Referência</div>
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
            </nav>

            <div className="border-t border-line px-4 py-3">
              <ResponsibleInput initial={user === ANONYMOUS ? "" : user} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
