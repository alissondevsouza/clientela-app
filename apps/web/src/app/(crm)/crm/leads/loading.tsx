const SKELETON_CARD_KEYS = ["s1", "s2", "s3", "s4"] as const;
const SKELETON_TAB_KEYS = ["t1", "t2", "t3", "t4", "t5"] as const;

// Skeleton da listagem de leads (web.md: loading obrigatório em tela de dados).
// Mobile-first: coluna única de cards em ~375px, duas colunas a partir de sm.
export default function CrmLeadsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-4">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="flex flex-wrap gap-2">
          {SKELETON_TAB_KEYS.map((key) => (
            <div
              key={key}
              className="h-9 w-20 animate-pulse rounded-lg bg-muted md:h-8"
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SKELETON_CARD_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
