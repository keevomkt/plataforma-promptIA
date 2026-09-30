"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Form";
import { Card, CardBody, CardHeader } from "@/components/ui/Surfaces";
import { requestChange } from "@/lib/actions/changes";

const EXAMPLES = [
  "Existe algum vídeo de divulgação do produto no prompt?",
  "Revise o prompt completo: há regras duplicadas, contraditórias, sobrepostas ou mal escritas?",
  "Quero que o bot faça menos perguntas antes de encaminhar para o consultor.",
  "Não quero mais perguntar quantidade de CNPJs.",
  "Quero que o bot seja mais objetivo.",
  "Quando o usuário perguntar preço, quero que o bot conduza a conversa de outra maneira.",
  "Adicione uma regra: nunca mencione concorrentes pelo nome.",
  "Troque “consultor” por “especialista”.",
];

export function ChangeRequestForm({ promptId, slug, initial }: { promptId: string; slug: string; initial: string }) {
  const router = useRouter();
  const [request, setRequest] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await requestChange(promptId, request);
      if (result.ok) router.push(`/p/${slug}/alterar/${result.data.changeId}`);
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-medium text-ink">O que você deseja alterar?</span>
      </CardHeader>
      <CardBody className="space-y-3">
        <Textarea
          rows={3}
          value={request}
          autoFocus
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && request.trim()) submit();
          }}
          placeholder="Descreva em linguagem natural o comportamento que deve mudar…"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setRequest(ex)}
              className="rounded-sm border border-line bg-sunken px-2 py-1 text-left text-[11.5px] text-ink-faint hover:border-line-strong hover:text-ink-soft"
            >
              {ex}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-removed">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">Nada é alterado agora: primeiro a plataforma mostra a análise para você aprovar.</p>
          <Button variant="primary" onClick={submit} disabled={isPending || !request.trim()}>
            {isPending ? "Analisando…" : "Analisar alteração"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
