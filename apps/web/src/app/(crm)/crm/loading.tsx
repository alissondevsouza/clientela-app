const SUMMARY_SKELETON_KEYS = ["s1", "s2", "s3", "s4"] as const;

// Skeleton da home do CRM (web.md: loading obrigatório em tela de dados).
// Espelha o layout real: header, 4 cards de resumo e o card de meta. Mobile-
// first: coluna única em ~375px, duas colunas a partir de sm.
export default function CrmHomeLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUMMARY_SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
