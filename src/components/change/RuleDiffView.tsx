import { ruleDiff } from "@/lib/diff";
import { Card, CardBody, CardHeader, Eyebrow } from "@/components/ui/Surfaces";
import { WordDiff } from "@/components/change/WordDiff";
import { DiffView } from "@/components/DiffView";

/** Comparação da seção 8: Removido / Adicionado / Alterado + contagem. */
export function RuleDiffView({ previous, next, title }: { previous: string; next: string; title: string }) {
  const d = ruleDiff(previous, next);
  const nothing = !d.removed.length && !d.added.length && !d.changed.length;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex gap-3 text-xs">
          <span className="text-added">{d.stats.linesAdded} linha(s) adicionada(s)</span>
          <span className="text-removed">{d.stats.linesRemoved} linha(s) removida(s)</span>
          <span className="text-warn">{d.stats.rulesChanged} regra(s) alterada(s)</span>
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        {nothing && <p className="text-sm text-ink-faint">Nenhuma diferença de texto.</p>}

        {d.removed.length > 0 && (
          <section>
            <Eyebrow tone="removed" className="mb-1.5">
              Removido
            </Eyebrow>
            <ul className="space-y-1">
              {d.removed.map((r) => (
                <li key={r.line} className="flex gap-2 rounded bg-removed-bg px-2 py-1 font-mono text-[12.5px] text-removed">
                  <span className="shrink-0 select-none">−</span>
                  <span className="whitespace-pre-wrap">{r.text.trim()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.added.length > 0 && (
          <section>
            <Eyebrow tone="added" className="mb-1.5">
              Adicionado
            </Eyebrow>
            <ul className="space-y-1">
              {d.added.map((r) => (
                <li key={r.line} className="flex gap-2 rounded bg-added-bg px-2 py-1 font-mono text-[12.5px] text-added">
                  <span className="shrink-0 select-none">+</span>
                  <span className="whitespace-pre-wrap">{r.text.trim()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.changed.length > 0 && (
          <section>
            <Eyebrow tone="warn" className="mb-1.5">
              Alterado
            </Eyebrow>
            <ul className="space-y-2">
              {d.changed.map((c) => (
                <li key={`${c.oldLine}-${c.newLine}`} className="space-y-1 rounded border border-line px-2 py-1.5 font-mono text-[12.5px]">
                  <div className="flex gap-2 text-removed">
                    <span className="shrink-0 select-none">−</span>
                    <span className="whitespace-pre-wrap">{c.before.trim()}</span>
                  </div>
                  <div className="flex gap-2 text-added">
                    <span className="shrink-0 select-none">+</span>
                    <span className="whitespace-pre-wrap">{c.after.trim()}</span>
                  </div>
                  <div className="flex gap-2 border-t border-line pt-1">
                    <span className="shrink-0 select-none text-ink-faint">≈</span>
                    <WordDiff before={c.before.trim()} after={c.after.trim()} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!nothing && (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-accent">Ver diff completo no contexto do prompt</summary>
            <div className="mt-2 max-h-[32rem] overflow-y-auto rounded border border-line">
              <DiffView previous={previous} next={next} />
            </div>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
