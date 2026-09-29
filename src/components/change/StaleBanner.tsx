"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { reanalyzeChange } from "@/lib/actions/changes";

export function StaleBanner({ changeId, slug, fromVersion, currentVersion }: { changeId: string; slug: string; fromVersion: number; currentVersion: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn">
      <span>
        Esta análise foi feita sobre a v{fromVersion}, mas a versão atual é a v{currentVersion}. Refaça a análise para aplicar sobre o prompt atual.
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await reanalyzeChange(changeId);
            if (result.ok) router.push(`/p/${slug}/alterar/${result.data.changeId}`);
          })
        }
      >
        {isPending ? "Reanalisando…" : "Refazer análise na versão atual"}
      </Button>
    </div>
  );
}
