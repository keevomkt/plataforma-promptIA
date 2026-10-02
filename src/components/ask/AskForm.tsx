"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { askQuestion } from "@/lib/actions/questions";

export function AskForm({ promptId, initial, suggestions }: { promptId: string; initial: string; suggestions: string[] }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask(question: string) {
    setError(null);
    start(async () => {
      const r = await askQuestion(promptId, question);
      if (!r.ok) return setError(r.error);
      router.push(r.data.url);
    });
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        ask(text);
      }}
    >
      <textarea
        name="q"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            ask(text);
          }
        }}
        rows={2}
        required
        maxLength={500}
        placeholder="Escreva sua dúvida sobre o comportamento da IA ou sobre os documentos da base"
        className="w-full resize-y rounded border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-accent"
      />
      {error && <p className="text-[12.5px] text-removed">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => {
                setText(s);
                ask(s);
              }}
              className="rounded-sm border border-line bg-sunken px-2 py-1 text-[12px] text-ink-soft hover:border-accent hover:text-ink disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Consultando…" : "Perguntar"}
        </button>
      </div>
    </form>
  );
}
