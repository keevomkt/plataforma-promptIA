"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCurrentKnowledgeRevision } from "@/lib/actions/knowledge";

export function KnowledgeRevisionActions({ id, revision, isCurrent }: { id: string; revision: number; isCurrent: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex gap-3 text-[12px]">
      <a href={`/api/conhecimento/${id}/arquivo?rev=${revision}`} className="font-medium text-accent hover:underline">
        baixar original
      </a>
      {!isCurrent && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setCurrentKnowledgeRevision(id, revision);
              router.refresh();
            })
          }
          className="font-medium text-ink-soft hover:underline disabled:text-ink-faint"
        >
          {isPending ? "…" : "usar esta revisão"}
        </button>
      )}
    </div>
  );
}
