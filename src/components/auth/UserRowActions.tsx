"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveUser, rejectUser, resetUserPassword, setUserBlocked, setUserRole } from "@/lib/actions/users";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USUARIO";
  status: "PENDENTE" | "ATIVO" | "BLOQUEADO";
  createdAt: string;
  lastLoginAt: string | null;
  approvedBy: string | null;
  locked: boolean;
  mustChangePassword: boolean;
  isMe: boolean;
};

type Result = { ok: true; data: unknown } | { ok: false; error: string };

const btn = "rounded border px-2 py-1 text-[12px] font-medium disabled:opacity-50";
const neutral = `${btn} border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink`;
const good = `${btn} border-added-border bg-added-bg text-added hover:bg-added hover:text-white`;
const bad = `${btn} border-removed-border bg-removed-bg text-removed hover:bg-removed hover:text-white`;

export function UserRowActions({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function run(key: string, action: () => Promise<Result>, needsConfirm = false) {
    if (needsConfirm && confirming !== key) return setConfirming(key);
    setConfirming(null);
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) return setError(r.error);
      if (key === "reset") setTempPassword((r.data as { password: string }).password);
      router.refresh();
    });
  }

  const label = (key: string, text: string) => (confirming === key ? `Confirmar: ${text.toLowerCase()}` : text);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {user.status === "PENDENTE" && (
          <>
            <button type="button" disabled={pending} className={good} onClick={() => run("approve", () => approveUser(user.id))}>
              Aprovar
            </button>
            <button type="button" disabled={pending} className={bad} onClick={() => run("reject", () => rejectUser(user.id), true)}>
              {label("reject", "Recusar")}
            </button>
          </>
        )}
        {user.status !== "PENDENTE" && (
          <>
            {user.status === "ATIVO" && (
              <button
                type="button"
                disabled={pending}
                className={neutral}
                onClick={() => run("role", () => setUserRole(user.id, user.role === "ADMIN" ? "USUARIO" : "ADMIN"), true)}
              >
                {label("role", user.role === "ADMIN" ? "Tornar usuário" : "Tornar administrador")}
              </button>
            )}
            <button type="button" disabled={pending} className={neutral} onClick={() => run("reset", () => resetUserPassword(user.id), true)}>
              {label("reset", "Gerar senha provisória")}
            </button>
            {user.status === "ATIVO" ? (
              <button type="button" disabled={pending} className={bad} onClick={() => run("block", () => setUserBlocked(user.id, true), true)}>
                {label("block", "Bloquear")}
              </button>
            ) : (
              <button type="button" disabled={pending} className={good} onClick={() => run("unblock", () => setUserBlocked(user.id, false))}>
                Desbloquear
              </button>
            )}
          </>
        )}
        {confirming && (
          <button type="button" className="px-1 text-[12px] text-ink-faint hover:text-ink" onClick={() => setConfirming(null)}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-removed">{error}</p>}
      {tempPassword && (
        <div className="rounded border border-warn-border bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
          Senha provisória de {user.name}: <code className="select-all rounded bg-surface px-1.5 py-0.5 font-mono text-[13px] text-ink">{tempPassword}</code>
          <span className="mt-0.5 block text-[11.5px]">Copie e envie à pessoa agora — ela não será mostrada de novo. No primeiro acesso, ela terá de criar a própria senha.</span>
        </div>
      )}
    </div>
  );
}
