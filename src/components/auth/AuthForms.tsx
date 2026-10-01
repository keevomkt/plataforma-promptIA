"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePassword, login, register } from "@/lib/actions/auth";

const input =
  "mt-1 w-full rounded border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
const label = "block text-[12.5px] font-medium text-ink-soft";
const primary =
  "w-full rounded bg-accent px-4 py-2 text-[14px] font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60";

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded border border-removed-border bg-removed-bg px-3 py-2 text-[13px] text-removed">{text}</p>;
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    start(async () => {
      const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""), next);
      if (!r.ok) return setError(r.error);
      router.replace(r.data.redirectTo);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">Entrar</h1>
        <p className="text-[13px] text-ink-faint">Acesse com o seu e-mail e senha.</p>
      </div>
      {notice && <p className="rounded border border-added-border bg-added-bg px-3 py-2 text-[13px] text-added">{notice}</p>}
      <ErrorBox text={error} />
      <label className={label}>
        E-mail
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className={label}>
        Senha
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center text-[13px] text-ink-faint">
        Ainda não tem acesso?{" "}
        <Link href="/cadastro" className="font-medium text-accent hover:underline">
          Cadastre-se
        </Link>
      </p>
      <p className="text-center text-[12px] text-ink-faint">Esqueceu a senha? Peça a um administrador para gerar uma senha provisória.</p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(form: FormData) {
    setError(null);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) return setError("As senhas não conferem.");
    start(async () => {
      const r = await register(String(form.get("name") ?? ""), String(form.get("email") ?? ""), password);
      if (!r.ok) return setError(r.error);
      if (r.data.firstAdmin) {
        router.replace("/");
        router.refresh();
      } else router.replace("/login?cadastro=enviado");
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">Criar cadastro</h1>
        <p className="text-[13px] text-ink-faint">Depois do cadastro, um administrador precisa aprovar o seu acesso.</p>
      </div>
      <ErrorBox text={error} />
      <label className={label}>
        Nome
        <input name="name" autoComplete="name" required maxLength={80} className={input} />
      </label>
      <label className={label}>
        E-mail
        <input name="email" type="email" autoComplete="email" required className={input} />
      </label>
      <label className={label}>
        Senha
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={input} />
        <span className="mt-1 block text-[11.5px] font-normal text-ink-faint">Pelo menos 8 caracteres, com letras e números.</span>
      </label>
      <label className={label}>
        Confirme a senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={input} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Enviando…" : "Cadastrar"}
      </button>
      <p className="text-center text-[13px] text-ink-faint">
        Já tem acesso?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit(form: FormData) {
    setError(null);
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return setError("As senhas novas não conferem.");
    start(async () => {
      const r = await changePassword(String(form.get("current") ?? ""), next);
      if (!r.ok) return setError(r.error);
      setDone(true);
      if (forced) {
        router.replace("/");
        router.refresh();
      }
    });
  }

  if (done && !forced) {
    return <p className="rounded border border-added-border bg-added-bg px-3 py-2 text-[13px] text-added">Senha alterada. As outras sessões abertas foram encerradas.</p>;
  }

  return (
    <form action={submit} className="space-y-4">
      <ErrorBox text={error} />
      <label className={label}>
        {forced ? "Senha provisória" : "Senha atual"}
        <input name="current" type="password" autoComplete="current-password" required className={input} />
      </label>
      <label className={label}>
        Nova senha
        <input name="next" type="password" autoComplete="new-password" required minLength={8} className={input} />
        <span className="mt-1 block text-[11.5px] font-normal text-ink-faint">Pelo menos 8 caracteres, com letras e números.</span>
      </label>
      <label className={label}>
        Confirme a nova senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={input} />
      </label>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
