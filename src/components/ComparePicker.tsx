"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function ComparePicker({
  slug,
  versions,
  initialFrom,
  initialTo,
}: {
  slug: string;
  versions: { id: string; version: number }[];
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom ?? versions[1]?.id ?? versions[0]?.id ?? "");
  const [to, setTo] = useState(initialTo ?? versions[0]?.id ?? "");
  if (versions.length < 2) return null;

  const select = "rounded border border-line bg-surface px-2 py-1 font-mono text-[12.5px] text-ink focus:border-accent focus:outline-none";
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
      Comparar
      <select value={from} onChange={(e) => setFrom(e.target.value)} className={select} aria-label="Versão de origem">
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version}
          </option>
        ))}
      </select>
      com
      <select value={to} onChange={(e) => setTo(e.target.value)} className={select} aria-label="Versão de destino">
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.version}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={from === to} onClick={() => router.push(`/p/${slug}/comparar?de=${from}&para=${to}`)}>
        Comparar
      </Button>
    </div>
  );
}
