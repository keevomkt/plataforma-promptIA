"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Card, CardBody } from "@/components/ui/Surfaces";
import { answerClarification, cancelChange } from "@/lib/actions/changes";
import type { Clarification } from "@/lib/engine/types";

/** Pergunta ao usuário quando o pedido é ambíguo (seção 3 da especificação). */
export function ClarificationPanel({ changeId, clarification }: { changeId: string; clarification: Clarification }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function answer(value: string) {
    setError(null);
    startTransition(async () => {
      const result = await answerClarification(changeId, value);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <Card className="border-accent/40">
      <CardBody className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">Pergunta antes de alterar</div>
        <p className="text-[15px] font-medium text-ink">{clarification.question}</p>
        {clarification.options.length > 0 && (
          <div className="flex flex-col gap-2">
            {clarification.options.map((o) => (
              <Button key={o.value} variant="secondary" className="justify-start text-left" disabled={isPending} onClick={() => answer(o.value)}>
                {o.label}
              </Button>
            ))}
          </div>
        )}
        {clarification.allowFreeText && (
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={clarification.freeTextPlaceholder ?? "Sua resposta"}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={isPending} onClick={() => startTransition(async () => { await cancelChange(changeId); router.refresh(); })}>
                Cancelar pedido
              </Button>
              <Button variant="primary" disabled={isPending || !text.trim()} onClick={() => answer(text)}>
                {isPending ? "Analisando…" : "Responder e reanalisar"}
              </Button>
            </div>
          </div>
        )}
        {!clarification.allowFreeText && isPending && <p className="text-xs text-ink-faint">Reanalisando…</p>}
        {error && <p className="text-xs text-removed">{error}</p>}
      </CardBody>
    </Card>
  );
}
