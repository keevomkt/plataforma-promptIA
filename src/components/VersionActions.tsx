"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { duplicateVersion, restoreVersion } from "@/lib/actions/versions";

export function VersionActions({
  slug,
  versionId,
  version,
  isCurrent,
  currentId,
  promptName,
}: {
  slug: string;
  versionId: string;
  version: number;
  isCurrent: boolean;
  currentId?: string;
  promptName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "restore" | "duplicate">("idle");
  const [name, setName] = useState(`${promptName} (cópia da v${version})`);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function restore() {
    setError(null);
    startTransition(async () => {
      const result = await restoreVersion(versionId);
      if (result.ok) {
        setMode("idle");
        router.refresh();
      } else setError(result.error);
    });
  }

  function duplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateVersion(versionId, name);
      if (result.ok) router.push(`/p/${result.data.slug}`);
      else setError(result.error);
    });
  }

  if (mode === "restore") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-ink-soft">Criar uma nova versão igual à v{version}?</span>
        <Button size="sm" variant="primary" onClick={restore} disabled={isPending}>
          {isPending ? "Restaurando…" : "Restaurar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("idle")} disabled={isPending}>
          Cancelar
        </Button>
        {error && <span className="text-[12px] text-removed">{error}</span>}
      </div>
    );
  }

  if (mode === "duplicate") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-56 py-1 text-[13px]" aria-label="Nome do novo prompt" />
        <Button size="sm" variant="primary" onClick={duplicate} disabled={isPending || !name.trim()}>
          {isPending ? "Duplicando…" : "Criar cópia"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("idle")} disabled={isPending}>
          Cancelar
        </Button>
        {error && <span className="text-[12px] text-removed">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <Link href={`/p/${slug}/versoes/${versionId}`}>
        <Button size="sm" variant="ghost">
          Ver
        </Button>
      </Link>
      {!isCurrent && currentId && (
        <Link href={`/p/${slug}/comparar?de=${versionId}&para=${currentId}`}>
          <Button size="sm" variant="ghost">
            Comparar com atual
          </Button>
        </Link>
      )}
      {!isCurrent && (
        <Button size="sm" variant="ghost" onClick={() => setMode("restore")}>
          Restaurar
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setMode("duplicate")}>
        Duplicar
      </Button>
      <a href={`/api/p/${slug}/versoes/${versionId}/export?format=txt`}>
        <Button size="sm" variant="ghost">
          .txt
        </Button>
      </a>
      <a href={`/api/p/${slug}/versoes/${versionId}/export?format=md`}>
        <Button size="sm" variant="ghost">
          .md
        </Button>
      </a>
    </div>
  );
}
