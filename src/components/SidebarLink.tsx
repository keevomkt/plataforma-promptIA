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
        active
          ? "bg-white font-medium text-accent-strong shadow-[0_1px_3px_rgba(90,18,150,0.10)] ring-1 ring-accent/10"
          : "text-ink-soft hover:bg-white/70 hover:text-ink"
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />}
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
