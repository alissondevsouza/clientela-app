import type { ProductsSummary as ProductsSummaryData } from "@clientela/shared";
import Link from "next/link";
import { formatBRL } from "@/lib/format";

const CAPITAL_LABEL = "Capital parado";
const CAPITAL_HINT = "Custo total do estoque";
const SALE_VALUE_LABEL = "Valor de venda";
const SALE_VALUE_HINT = "Preço total do estoque";
const LOW_STOCK_LABEL = "Estoque baixo";
const LOW_STOCK_UNIT_SINGULAR = "produto";
const LOW_STOCK_UNIT_PLURAL = "produtos";
const VIEW_LOW_STOCK_LABEL = "Ver produtos";

const NO_LOW_STOCK = 0;
const SINGLE = 1;

const lowStockText = (count: number): string => {
  const unit =
    count === SINGLE ? LOW_STOCK_UNIT_SINGULAR : LOW_STOCK_UNIT_PLURAL;
  return `${count} ${unit}`;
};

type SummaryCardProps = {
  label: string;
  value: string;
  hint: string;
};

function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Resumo do estoque (RSC): capital parado (custo total), valor de venda (preço
// total) e contagem de estoque baixo. Quando há produtos em estoque baixo, a
// contagem vira link para o filtro `?lowStock=true` (href montado na page,
// preservando a busca corrente). Mobile-first: uma coluna em ~375px, três a
// partir de sm.
export function ProductsSummary({
  summary,
  lowStockHref,
}: {
  summary: ProductsSummaryData;
  lowStockHref: string;
}) {
  const hasLowStock = summary.lowStockCount > NO_LOW_STOCK;

  return (
    <section
      aria-label="Resumo do estoque"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <SummaryCard
        label={CAPITAL_LABEL}
        value={formatBRL(summary.stockCostCents)}
        hint={CAPITAL_HINT}
      />
      <SummaryCard
        label={SALE_VALUE_LABEL}
        value={formatBRL(summary.stockPriceCents)}
        hint={SALE_VALUE_HINT}
      />
      <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">{LOW_STOCK_LABEL}</p>
        <p className="font-heading text-xl font-semibold">
          {lowStockText(summary.lowStockCount)}
        </p>
        {hasLowStock ? (
          <Link
            href={lowStockHref}
            className="text-xs font-medium text-primary hover:underline focus-visible:underline"
          >
            {VIEW_LOW_STOCK_LABEL}
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum alerta</p>
        )}
      </div>
    </section>
  );
}
