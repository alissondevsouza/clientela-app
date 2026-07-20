const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4"] as const;

// Skeleton da lista "Quem me deve" (web.md: loading obrigatório em tela de dados).
// Espelha o layout real: header e linhas de recebível empilhadas. Mobile-first:
// coluna única em ~375px.
export default function CrmReceivablesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SKELETON_ROW_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-11 w-32 animate-pulse rounded-lg bg-muted md:h-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
