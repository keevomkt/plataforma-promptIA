"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

/** Quem não é administrador só vê a aba Prompt (somente leitura). */
export function PromptTabs({ slug, openChanges, isAdmin }: { slug: string; openChanges: number; isAdmin: boolean }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const all = [
    { href: base, label: "Prompt", active: pathname === base },
    { href: `${base}/perguntar`, label: "Perguntar ao prompt", active: pathname.startsWith(`${base}/perguntar`) },
    {
      href: `${base}/alterar`,
      label: "Alterar prompt",
      active: pathname.startsWith(`${base}/alterar`),
      badge: openChanges,
    },
    {
      href: `${base}/historico`,
      label: "Histórico",
      active: pathname.startsWith(`${base}/historico`) || pathname.startsWith(`${base}/versoes`) || pathname.startsWith(`${base}/comparar`),
    },
  ];

  return <Tabs tabs={isAdmin ? all : all.slice(0, 1)} />;
}
