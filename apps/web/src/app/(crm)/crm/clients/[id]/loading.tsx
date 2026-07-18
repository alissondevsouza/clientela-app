const SKELETON_FIELD_KEYS = ["f1", "f2", "f3", "f4", "f5"] as const;

// Skeleton do detalhe de cliente (web.md: loading obrigatório em tela de dados).
// Mobile-first: coluna única de campos em ~375px.
export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="flex items-start justify-between gap-3">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="size-11 animate-pulse rounded-lg bg-muted md:size-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>

      <div className="flex flex-col gap-4">
        {SKELETON_FIELD_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded-lg bg-muted md:h-9" />
          </div>
        ))}
      </div>
    </div>
  );
}
