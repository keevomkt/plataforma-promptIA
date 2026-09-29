"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function SidebarLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={clsx(
        "relative flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm",
        active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-soft hover:bg-sunken hover:text-ink"
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />}
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
