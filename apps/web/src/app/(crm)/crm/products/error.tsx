"use client";

import { Button } from "@/components/ui/button";

const ERROR_TITLE = "Não foi possível carregar os produtos";
const ERROR_DESCRIPTION =
  "Ocorreu um problema ao buscar seus produtos. Verifique sua conexão e tente novamente.";
const RETRY_LABEL = "Tentar novamente";

type ProductsErrorProps = {
  // `error` é exigido pela assinatura do error boundary do App Router; não é
  // exibido para a usuária (nunca vaza internals — security.md/core.md).
  error: Error & { digest?: string };
  reset: () => void;
};

// Error boundary da listagem (RF-06): Client Component obrigatório pelo Next.
// Mensagem pt-BR + retry via `reset()`.
export default function ProductsError({ reset }: ProductsErrorProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{ERROR_TITLE}</p>
        <p className="text-sm text-muted-foreground">{ERROR_DESCRIPTION}</p>
      </div>
      <Button type="button" onClick={reset} className="h-11 md:h-8">
        {RETRY_LABEL}
      </Button>
    </div>
  );
}
