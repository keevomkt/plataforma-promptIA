"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { KNOWLEDGE_CATEGORIES } from "@/lib/engine/types";

export function KnowledgeFilters({ units }: { units: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function go(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  const select = "rounded border border-line bg-surface px-2 py-2 text-[13px] text-ink focus:border-accent focus:outline-none";
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q });
      }}
    >
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no conteúdo dos documentos (ex: eKeep, preço, CNPJ)" className="min-w-[16rem] flex-1" />
      <select value={params.get("unidade") ?? ""} onChange={(e) => go({ unidade: e.target.value })} className={select} aria-label="Unidade de negócio">
        <option value="">Todas as unidades</option>
        {units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <select value={params.get("categoria") ?? ""} onChange={(e) => go({ categoria: e.target.value })} className={select} aria-label="Categoria">
        <option value="">Todas as categorias</option>
        {Object.entries(KNOWLEDGE_CATEGORIES).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <Button type="submit">Buscar</Button>
      {(params.get("q") || params.get("unidade") || params.get("categoria")) && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
        >
          Limpar
        </Button>
      )}
    </form>
  );
}
