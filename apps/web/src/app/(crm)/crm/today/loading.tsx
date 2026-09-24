import { TodayDetailsSkeleton } from "@/components/dashboard/section-skeletons";

// Skeleton da página "Hoje" (RF-28/web.md: loading obrigatório em tela de
// dados) — só aparece na navegação inicial da rota (o conteúdo tem o próprio
// fallback de `Suspense` depois disso); espelha o layout real: link de volta,
// título e as seções detalhadas. `TodayDetailsSkeleton` já anuncia
// "Carregando…" (`sr-only`) para leitor de tela — o resto é decorativo.
export default function CrmTodayLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden className="flex flex-col gap-2">
        <div className="h-5 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      <TodayDetailsSkeleton />
    </div>
  );
}
