import {
  PerformanceSkeleton,
  PositionSkeleton,
  TodaySummarySkeleton,
} from "@/components/dashboard/section-skeletons";

const QUICK_ACTIONS_KEYS = ["q1", "q2", "q3", "q4"] as const;

// Skeleton da home do CRM (web.md: loading obrigatório em tela de dados) —
// só aparece na navegação inicial da rota (cada bloco tem o próprio fallback
// de `Suspense` depois disso); espelha o layout real: header, ações rápidas e
// os três blocos, NESTA ordem (RF-18, emenda 2026-09-24) — Desempenho, Hoje
// (cartões-resumo), Posição agora —, reusando os mesmos skeletons por bloco
// que a page usa nos `Suspense`.
export default function CrmHomeLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      <div aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ACTIONS_KEYS.map((key) => (
          <div
            key={key}
            className="h-11 w-full animate-pulse rounded-md bg-muted md:h-9"
          />
        ))}
      </div>

      <PerformanceSkeleton />
      <TodaySummarySkeleton />
      <PositionSkeleton />
    </div>
  );
}
