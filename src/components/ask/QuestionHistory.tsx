"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { deleteQuestion } from "@/lib/actions/questions";
import { Eyebrow } from "@/components/ui/Surfaces";

export type HistoryItem = { id: string; text: string; kind: string | null; when: string; createdBy: string };

const KIND_LABELS: Record<string, string> = {
  COMPORTAMENTO: "Comportamento",
  FATO: "Lista",
  AMBIGUO: "Lista + regras",
  DOCUMENTOS: "Documentos",
};

export function QuestionHistory({ slug, items, current }: { slug: string; items: HistoryItem[]; current?: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((i) => !hidden.has(i.id));
  if (!visible.length) return null;

  return (
    <div>
      <Eyebrow className="mb-2">Perguntas recentes</Eyebrow>
      <ul className="space-y-1.5">
        {visible.map((item) => (
          <HistoryRow
            key={item.id}
            slug={slug}
            item={item}
            active={!!current && current.toLowerCase() === item.text.toLowerCase()}
            onRemoved={() => setHidden((h) => new Set(h).add(item.id))}
            onFailed={() =>
              setHidden((h) => {
                const n = new Set(h);
                n.delete(item.id);
                return n;
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function HistoryRow({
  slug,
  item,
  active,
  onRemoved,
  onFailed,
}: {
  slug: string;
  item: HistoryItem;
  active: boolean;
  onRemoved: () => void;
  onFailed: () => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function remove() {
    onRemoved(); // some da lista na hora; o banco é atualizado em seguida
    start(async () => {
      const r = await deleteQuestion(item.id);
      if (!r.ok) onFailed();
      router.refresh();
    });
  }

  return (
    <li
      className={clsx(
        "flex items-center gap-3 rounded border bg-surface px-3 py-2 shadow-panel",
        active ? "border-accent/40 ring-1 ring-accent/10" : "border-line hover:border-line-strong"
      )}
    >
      <Link href={`/p/${slug}/perguntar?q=${encodeURIComponent(item.text)}`} className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">{item.text}</p>
        <p className="text-[11px] text-ink-faint">
          {item.when} · {item.createdBy}
          {item.kind && KIND_LABELS[item.kind] ? ` · ${KIND_LABELS[item.kind]}` : ""}
        </p>
      </Link>
      <button
        type="button"
        onClick={remove}
        title="Remover do histórico"
        aria-label={`Remover “${item.text}” do histórico`}
        className="shrink-0 rounded-sm px-1.5 py-1 text-ink-faint hover:bg-removed-bg hover:text-removed"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5v8a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-8" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}
