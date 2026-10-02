"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getClaudePackage, importClaudeAnswer } from "@/lib/actions/claude";
import { Card, CardBody, Eyebrow } from "@/components/ui/Surfaces";

const CLAUDE_URL = "https://claude.ai/new";
const input = "w-full resize-y rounded border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent";

/**
 * Corrigir com o Claude (claude.ai, conta da pessoa — sem custo extra):
 * 1) copia relato + prompt atual numerado + base da unidade e abre uma conversa nova;
 * 2) recebe a resposta colada e a transforma num pedido com diff, validação e versão.
 */
export function ClaudeAssist({ promptId, slug }: { promptId: string; slug: string }) {
  const router = useRouter();
  const storageKey = `claude-assist:${promptId}`;
  const [problem, setProblem] = useState("");
  const [expected, setExpected] = useState("");
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, startCopy] = useTransition();
  const [importing, startImport] = useTransition();

  // Guarda o rascunho no navegador: a pessoa sai para o Claude e volta
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (saved.problem) setProblem(saved.problem);
      if (saved.expected) setExpected(saved.expected);
    } catch {}
  }, [storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ problem, expected }));
    } catch {}
  }, [storageKey, problem, expected]);

  function copy() {
    setError(null);
    setCopied(null);
    setFallback(null);
    startCopy(async () => {
      const r = await getClaudePackage(promptId, problem, expected);
      if (!r.ok) return setError(r.error);
      const kb = (r.data.text.length / 1024).toFixed(0);
      try {
        await navigator.clipboard.writeText(r.data.text);
        window.open(CLAUDE_URL, "_blank", "noopener");
        setCopied(`Copiado (${kb} KB: relato, prompt v${r.data.version} e base da unidade). Na conversa nova do Claude, aperte Ctrl+V e Enter.`);
      } catch {
        setFallback(r.data.text);
      }
    });
  }

  function importAnswer() {
    setError(null);
    startImport(async () => {
      const r = await importClaudeAnswer(promptId, { problem, expected, answer });
      if (!r.ok) return setError(r.error);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      router.push(`/p/${r.data.slug}/alterar/${r.data.changeId}`);
    });
  }

  return (
    <Card className="border-accent/25">
      <CardBody className="space-y-4">
        <div>
          <Eyebrow>Corrigir com o Claude</Eyebrow>
          <p className="mt-1 text-[13px] text-ink-soft">
            Leve o problema ao Claude com todo o contexto e traga a correção de volta para revisar, validar e salvar. Usa a sua conta do claude.ai, sem
            custo extra.
          </p>
        </div>

        <section className="space-y-2">
          <p className="text-[12.5px] font-semibold text-ink">1. O problema</p>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="O que a curadoria relatou (ex.: a IA perguntou a preferência de contato duas vezes na mesma conversa)"
            className={input}
          />
          <textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Opcional: como a IA deveria se comportar, ou a correção sugerida pela curadoria"
            className={input}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copy}
              disabled={copying || !problem.trim()}
              className="rounded bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copying ? "Montando…" : "Copiar para o Claude e abrir"}
            </button>
            {copied && <span className="text-[12.5px] text-added">✓ {copied}</span>}
          </div>
          {fallback && (
            <div className="space-y-1.5 rounded border border-warn-border bg-warn-bg/60 px-3 py-2">
              <p className="text-[12.5px] text-warn">
                O navegador não deixou copiar automaticamente. Clique no texto abaixo, aperte Ctrl+A e Ctrl+C, e cole numa{" "}
                <a href={CLAUDE_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  conversa nova do Claude
                </a>
                .
              </p>
              <textarea readOnly value={fallback} rows={5} onFocus={(e) => e.currentTarget.select()} className={`${input} font-mono text-[11.5px]`} />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[12.5px] font-semibold text-ink">2. A resposta do Claude</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Cole aqui a resposta do Claude (com a CAUSA e os blocos TROCAR / INSERIR DEPOIS DE / REMOVER)"
            className={`${input} font-mono text-[12.5px]`}
          />
          <button
            type="button"
            onClick={importAnswer}
            disabled={importing || !answer.trim() || !problem.trim()}
            className="rounded border border-accent bg-surface px-4 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importing ? "Lendo a resposta…" : "Ver a correção na plataforma"}
          </button>
          <p className="text-[11.5px] text-ink-faint">
            A plataforma localiza cada trecho no prompt atual, mostra o antes e depois e valida antes de qualquer coisa ser salva.
          </p>
        </section>

        {error && <p className="rounded border border-removed-border bg-removed-bg px-3 py-2 text-[13px] text-removed">{error}</p>}
      </CardBody>
    </Card>
  );
}
