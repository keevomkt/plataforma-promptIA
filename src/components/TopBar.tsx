"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UnitLogo } from "@/components/Brand";
import { logout } from "@/lib/actions/auth";

const iconButton =
  "flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:text-ink";

type PromptTitle = { slug: string; name: string; description: string | null; unit: string | null; version: number | null };

/** Barra superior: o prompt aberto (unidade, nome e versão) à esquerda; tema e perfil à direita. */
export function TopBar({ name, email, role, prompts }: { name: string; email: string; role: "ADMIN" | "USUARIO"; prompts: PromptTitle[] }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/80 px-6 backdrop-blur">
      <CurrentPrompt prompts={prompts} />
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <ProfileMenu name={name} email={email} role={role} />
      </div>
    </div>
  );
}

function CurrentPrompt({ prompts }: { prompts: PromptTitle[] }) {
  const pathname = usePathname();
  const slug = /^\/p\/([^/]+)/.exec(pathname)?.[1];
  const prompt = slug ? prompts.find((p) => p.slug === decodeURIComponent(slug)) : undefined;
  if (!prompt) return <span />;
  return (
    <Link href={`/p/${prompt.slug}`} className="flex min-w-0 items-center gap-3" title={prompt.description ?? prompt.name}>
      {prompt.unit ? (
        <UnitLogo unit={prompt.unit} height={30} priority />
      ) : (
        <span className="h-[30px] w-[30px] shrink-0 rounded-md border border-dashed border-line-strong" />
      )}
      <h1 className="truncate text-[16px] font-semibold text-ink">{prompt.name}</h1>
      {prompt.version !== null && (
        <span className="shrink-0 rounded-sm bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-strong">v{prompt.version}</span>
      )}
    </Link>
  );
}

export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tema", dark ? "escuro" : "claro");
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} className={iconButton} title="Alternar tema claro/escuro" aria-label="Alternar tema claro/escuro">
      {/* Lua no tema claro (vai para o escuro); sol no escuro (volta para o claro) */}
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" className="dark:hidden" aria-hidden>
        <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" className="hidden dark:block" aria-hidden>
        <circle cx="10" cy="10" r="3.4" />
        <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function ProfileMenu({ name, email, role }: { name: string; email: string; role: "ADMIN" | "USUARIO" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const firstName = name.trim().split(/\s+/)[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface pl-1 pr-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">{initial}</span>
        <span className="max-w-[140px] truncate">{firstName}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-md border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
            <p className="truncate text-[12px] text-ink-faint">{email}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-accent">{role === "ADMIN" ? "Administrador" : "Usuário"}</p>
          </div>
          <Link href="/conta" role="menuitem" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-[13px] text-ink-soft hover:bg-sunken hover:text-ink">
            Minha conta
          </Link>
          <form action={logout}>
            <button type="submit" role="menuitem" className="block w-full px-3.5 py-2 text-left text-[13px] text-ink-soft hover:bg-sunken hover:text-removed">
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
