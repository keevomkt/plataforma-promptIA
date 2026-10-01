import Link from "next/link";
import { logout } from "@/lib/actions/auth";

export function UserMenu({ name, email, role }: { name: string; email: string; role: "ADMIN" | "USUARIO" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-white">{initials}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium text-ink" title={email}>
          {name}
        </p>
        <p className="text-[11px] text-ink-faint">
          {role === "ADMIN" ? "Administrador" : "Usuário"} ·{" "}
          <Link href="/conta" className="hover:text-accent hover:underline">
            Minha conta
          </Link>
        </p>
      </div>
      <form action={logout}>
        <button type="submit" title="Sair" className="rounded px-1.5 py-1 text-[12px] font-medium text-ink-faint hover:bg-white hover:text-removed">
          Sair
        </button>
      </form>
    </div>
  );
}
