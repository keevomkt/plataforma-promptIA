"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function PromptTabs({ slug, openChanges }: { slug: string; openChanges: number }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const tabs = [
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

  return (
    <nav className="mt-2 flex gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            "flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium transition-colors",
            tab.active ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
          )}
        >
          {tab.label}
          {!!tab.badge && (
            <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{tab.badge}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
