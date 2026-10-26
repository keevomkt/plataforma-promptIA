import Link from "next/link";
import clsx from "clsx";

export type TabItem = {
  href: string;
  label: string;
  active: boolean;
  icon?: React.ReactNode;
  /** Contagem discreta ao lado do nome (ex.: documentos da unidade). */
  count?: number;
  /** Selo de destaque (ex.: alterações em aberto); não aparece quando é 0. */
  badge?: number;
};

/** Abas de navegação por link, com a aba ativa sublinhada. */
export function Tabs({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  return (
    <nav className={clsx("flex gap-1 overflow-x-auto", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={clsx(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium transition-colors",
            tab.active ? "border-accent text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
          )}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && (
            <span className={clsx("rounded-full px-1.5 text-[10.5px] font-semibold leading-4", tab.active ? "bg-accent-soft text-accent-strong" : "bg-sunken text-ink-faint")}>
              {tab.count}
            </span>
          )}
          {!!tab.badge && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">{tab.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
