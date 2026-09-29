import { computeWordDiff } from "@/lib/diff";

/** Destaca, dentro de uma regra, só as palavras que mudaram. */
export function WordDiff({ before, after }: { before: string; after: string }) {
  const blocks = computeWordDiff(before, after);
  return (
    <span className="whitespace-pre-wrap">
      {blocks.map((b, i) =>
        b.type === "removed" ? (
          <del key={i} className="bg-removed-bg text-removed decoration-removed/50">
            {b.value}
          </del>
        ) : b.type === "added" ? (
          <ins key={i} className="bg-added-bg text-added no-underline">
            {b.value}
          </ins>
        ) : (
          <span key={i} className="text-ink-soft">
            {b.value}
          </span>
        )
      )}
    </span>
  );
}
