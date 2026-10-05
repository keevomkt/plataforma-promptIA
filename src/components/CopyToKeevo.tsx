"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, Eyebrow } from "@/components/ui/Surfaces";
import { recordKeevoCopy } from "@/lib/actions/versions";

type LastCopy = { at: string; by: string } | null;

/**
 * Último passo de toda alteração: o prompt roda na KeevoIA, não aqui.
 * Copia o texto completo da versão e registra quem copiou e quando.
 */
export function CopyToKeevo({
  versionId,
  version,
  content,
  lastCopy,
  isCurrent,
  variant = "inline",
}: {
  versionId: string;
  version: number;
  content: string;
  lastCopy: LastCopy;
  isCurrent: boolean;
  variant?: "card" | "inline";
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function record() {
    startTransition(async () => {
      const r = await recordKeevoCopy(versionId);
      if (!r.ok) return setError(r.error);
      setDone(true);
      setFallback(false);
      router.refresh();
    });
  }

  async function copy() {
    setError(null);
    setDone(false);
    try {
      await navigator.clipboard.writeText(content);
      record();
    } catch {
      setFallback(true);
    }
  }

  const status = lastCopy ? (
    <span>
      Copiada para a KeevoIA em {lastCopy.at} por {lastCopy.by}.
    </span>
  ) : (
    <span className={isCurrent ? "text-warn" : undefined}>Ainda não copiada para a KeevoIA.</span>
  );

  const button = (
    <Button size={variant === "card" ? "md" : "sm"} variant={variant === "card" ? "primary" : "secondary"} onClick={copy} disabled={isPending}>
      {isPending ? "Registrando…" : `Copiar v${version} para a KeevoIA`}
    </Button>
  );

  const after = (
    <>
      {done && (
        <p className="text-[12.5px] text-added">
          ✓ Copiado ({content.length.toLocaleString("pt-BR")} caracteres) e registrado no histórico. Na KeevoIA, substitua todo o texto do prompt
          oficial por este e salve.
        </p>
      )}
      {fallback && (
        <div className="space-y-1.5 rounded border border-warn-border bg-warn-bg/60 px-3 py-2">
          <p className="text-[12.5px] text-warn">O navegador não deixou copiar automaticamente. Clique no texto, aperte Ctrl+A e Ctrl+C, e depois confirme.</p>
          <textarea
            readOnly
            value={content}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-[11.5px] text-ink"
          />
          <Button size="sm" variant="secondary" onClick={record} disabled={isPending}>
            Já copiei
          </Button>
        </div>
      )}
      {error && <p className="text-[12.5px] text-removed">{error}</p>}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {button}
          <span className="text-[11.5px] text-ink-faint">{status}</span>
        </div>
        {after}
      </div>
    );
  }

  return (
    <Card className={clsx(!lastCopy && isCurrent ? "border-warn-border" : "border-accent/40")}>
      <CardBody className="space-y-2.5">
        <Eyebrow tone={!lastCopy && isCurrent ? "warn" : "faint"}>Último passo: levar para a KeevoIA</Eyebrow>
        <p className="text-[13px] text-ink-soft">
          Salvar aqui não muda a IA em produção. A mudança só passa a valer depois que o texto completo da v{version} for colado no prompt oficial da
          KeevoIA.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {button}
          <span className="text-[12px] text-ink-faint">{status}</span>
        </div>
        {after}
      </CardBody>
    </Card>
  );
}
