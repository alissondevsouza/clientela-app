"use client";

// Erro isolado por bloco da home (RF-18/plan.md): cada bloco (Hoje, Desempenho,
// Posição agora) chama um helper que NUNCA lança; `ok: false` vira ESTE card,
// só dentro daquele bloco — os demais Suspense continuam funcionando. Uma
// exceção inesperada (não tratada pelo helper) ainda cai no `error.tsx` da
// rota, fora daqui.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RETRY_LABEL = "Tentar novamente";
const RETRYING_LABEL = "Tentando novamente…";

export type SectionErrorProps = {
  /** Título do bloco que falhou (ex.: "Hoje", "Posição agora"). */
  title: string;
  /** Mensagem pt-BR já pronta para exibição (nunca internals — security.md). */
  message: string;
};

// `router.refresh()` refaz a busca dos Server Components da rota atual sem
// navegar (RSC busca de novo no servidor); `startTransition` mantém o botão
// desabilitado enquanto a nova busca está pendente, sem bloquear a interação
// com o resto da página.
export function SectionError({ title, message }: SectionErrorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const retry = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={retry}
          disabled={isPending}
          className="h-11 md:h-8"
        >
          {isPending ? RETRYING_LABEL : RETRY_LABEL}
        </Button>
      </CardContent>
    </Card>
  );
}
