/** Esboço mostrado na hora em que a pessoa troca de página, enquanto o servidor monta a próxima. */
export function PageLoading({ variant = "page" }: { variant?: "page" | "tab" }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <div className="loading-bar" />
      <span className="sr-only">Carregando…</span>
      <div className={variant === "page" ? "mx-auto max-w-4xl space-y-4 px-6 py-6" : "mx-auto max-w-4xl space-y-4 px-6 py-5"}>
        {variant === "page" && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-24 animate-pulse rounded bg-sunken" />
            <div className="space-y-1.5">
              <div className="h-4 w-40 animate-pulse rounded bg-sunken" />
              <div className="h-3 w-24 animate-pulse rounded bg-sunken" />
            </div>
          </div>
        )}
        <div className="space-y-3 rounded border border-line bg-surface px-4 py-4 shadow-panel">
          <div className="h-3 w-32 animate-pulse rounded bg-sunken" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-sunken" />
          <div className="h-4 w-9/12 animate-pulse rounded bg-sunken" />
          <div className="h-4 w-10/12 animate-pulse rounded bg-sunken" />
        </div>
        <div className="space-y-3 rounded border border-line bg-surface px-4 py-4 shadow-panel">
          <div className="h-3 w-24 animate-pulse rounded bg-sunken" />
          <div className="h-4 w-10/12 animate-pulse rounded bg-sunken" />
          <div className="h-4 w-7/12 animate-pulse rounded bg-sunken" />
        </div>
      </div>
    </div>
  );
}
