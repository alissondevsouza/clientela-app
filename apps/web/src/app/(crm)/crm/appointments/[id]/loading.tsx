const SKELETON_META_KEYS = ["m1", "m2", "m3", "m4", "m5", "m6"] as const;
const SKELETON_ACTION_KEYS = ["a1", "a2", "a3"] as const;

// Skeleton do detalhe de compromisso (web.md: loading obrigatório em tela de
// dados). Mobile-first: coluna única em ~375px.
export default function AppointmentDetailLoading() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="flex items-start justify-between gap-3">
          <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2">
        {SKELETON_META_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />

      <div className="flex flex-col gap-3">
        {SKELETON_ACTION_KEYS.map((key) => (
          <div
            key={key}
            className="h-11 w-full animate-pulse rounded-lg bg-muted sm:w-40"
          />
        ))}
      </div>
    </div>
  );
}
