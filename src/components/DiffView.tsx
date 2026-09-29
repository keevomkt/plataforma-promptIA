import { computeLineDiff } from "@/lib/diff";

/**
 * Diff linha a linha estilo Git. Trechos longos sem alteração são
 * recolhidos, mantendo 3 linhas de contexto em volta de cada mudança.
 */
export function DiffView({ previous, next, context = 3 }: { previous: string; next: string; context?: number }) {
  const blocks = computeLineDiff(previous, next);
  if (blocks.every((b) => b.type === "unchanged")) {
    return <p className="px-4 py-6 text-center text-sm text-ink-faint">Nenhuma diferença entre as duas versões.</p>;
  }

  type Row = { type: "added" | "removed" | "unchanged" | "gap"; text: string; oldNo?: number; newNo?: number };
  const rows: Row[] = [];
  let oldNo = 1;
  let newNo = 1;
  blocks.forEach((block, bi) => {
    const lines = block.value.replace(/\n$/, "").split("\n");
    if (block.type === "unchanged") {
      const isFirst = bi === 0;
      const isLast = bi === blocks.length - 1;
      const head = isFirst ? 0 : context;
      const tail = isLast ? 0 : context;
      if (lines.length > head + tail + 1) {
        lines.slice(0, head).forEach((t, k) => rows.push({ type: "unchanged", text: t, oldNo: oldNo + k, newNo: newNo + k }));
        rows.push({ type: "gap", text: `${lines.length - head - tail} linhas sem alteração` });
        lines.slice(lines.length - tail).forEach((t, k) => {
          const offset = lines.length - tail + k;
          rows.push({ type: "unchanged", text: t, oldNo: oldNo + offset, newNo: newNo + offset });
        });
      } else {
        lines.forEach((t, k) => rows.push({ type: "unchanged", text: t, oldNo: oldNo + k, newNo: newNo + k }));
      }
      oldNo += lines.length;
      newNo += lines.length;
    } else if (block.type === "removed") {
      lines.forEach((t, k) => rows.push({ type: "removed", text: t, oldNo: oldNo + k }));
      oldNo += lines.length;
    } else {
      lines.forEach((t, k) => rows.push({ type: "added", text: t, newNo: newNo + k }));
      newNo += lines.length;
    }
  });

  return (
    <div className="overflow-x-auto font-mono text-[12.5px] leading-relaxed">
      {rows.map((r, i) =>
        r.type === "gap" ? (
          <div key={i} className="border-y border-line bg-sunken px-4 py-1 text-[11px] text-ink-faint">
            ⋯ {r.text}
          </div>
        ) : (
          <div
            key={i}
            className={
              r.type === "added"
                ? "flex bg-added-bg text-added"
                : r.type === "removed"
                ? "flex bg-removed-bg text-removed"
                : "flex text-ink-soft"
            }
          >
            <span className="w-10 shrink-0 select-none pr-1 text-right text-[11px] leading-[1.7rem] text-ink-faint/70">{r.oldNo ?? ""}</span>
            <span className="w-10 shrink-0 select-none pr-1 text-right text-[11px] leading-[1.7rem] text-ink-faint/70">{r.newNo ?? ""}</span>
            <span className="w-4 shrink-0 select-none text-center">{r.type === "added" ? "+" : r.type === "removed" ? "−" : ""}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap py-0.5 pr-4">{r.text || " "}</span>
          </div>
        )
      )}
    </div>
  );
}
