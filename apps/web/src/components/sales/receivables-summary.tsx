import type { ReceivablesSummary as ReceivablesSummaryData } from "@clientela/shared";
import Link from "next/link";
import { formatBRL } from "@/lib/format";

const SECTION_LABEL = "A receber";
const PENDING_LABEL = "Total pendente";
const PENDING_HINT = "Soma das parcelas em aberto";
const OVERDUE_LABEL = "Em atraso";
const VIEW_RECEIVABLES_LABEL = "Ver quem me deve";
const NO_OVERDUE_TEXT = "Nenhuma parcela atrasada";

const NO_OVERDUE = 0;
const SINGLE = 1;

const OVERDUE_UNIT_SINGULAR = "parcela atrasada";
const OVERDUE_UNIT_PLURAL = "parcelas atrasadas";

// Texto do atraso (a11y/RF-08): a informação vive no TEXTO pt-BR — a cor de
// destaque é só reforço, nunca o único sinal.
const overdueText = (count: number, cents: number): string => {
  const unit = count === SINGLE ? OVERDUE_UNIT_SINGULAR : OVERDUE_UNIT_PLURAL;
  return `${formatBRL(cents)} · ${count} ${unit}`;
};

// Bloco "A receber" (RSC): total pendente e destaque textual de atraso — sempre
// do agregado `GET /receivables/summary`, NUNCA derivado da lista paginada
// (RF-08). Quando há atraso, o valor/contagem ganham destaque textual e a seção
// leva para a lista "Quem me deve". Mobile-first: coluna única em ~375px.
export function ReceivablesSummary({
  summary,
  receivablesHref,
}: {
  summary: ReceivablesSummaryData;
  receivablesHref: string;
}) {
  const hasOverdue = summary.overdueCount > NO_OVERDUE;

  return (
    <section
      aria-label={SECTION_LABEL}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{PENDING_LABEL}</p>
        <p className="font-heading text-xl font-semibold">
          {formatBRL(summary.pendingCents)}
        </p>
        <p className="text-xs text-muted-foreground">{PENDING_HINT}</p>
      </div>

      {hasOverdue ? (
        <p className="text-sm font-medium text-destructive">
          {OVERDUE_LABEL}:{" "}
          {overdueText(summary.overdueCount, summary.overdueCents)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{NO_OVERDUE_TEXT}</p>
      )}

      <Link
        href={receivablesHref}
        className="text-sm font-medium text-primary hover:underline focus-visible:underline"
      >
        {VIEW_RECEIVABLES_LABEL}
      </Link>
    </section>
  );
}
