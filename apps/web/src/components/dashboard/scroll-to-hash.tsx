"use client";

// Rola até a seção da URL (RF-28 — QA Emenda M8/C2): `/crm/today` renderiza
// por streaming (`Suspense` interno com `TodayDetailsSkeleton`), então o
// `id` da seção ainda não existe no DOM quando o navegador tenta a rolagem
// nativa do hash — a usuária cai no topo da página. Este componente-folha é
// renderizado DENTRO de `TodayDetails`, depois que os dados (e portanto os
// `id`) já existem: no commit, rola até `location.hash`; também reage a
// `hashchange` para o clique num cartão da própria página (navegação só de
// hash, sem novo carregamento de `/crm/today`) funcionar igual.

import { useEffect } from "react";

const scrollToCurrentHash = (): void => {
  const { hash } = window.location;
  if (hash.length <= 1) {
    return;
  }
  const id = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(id);
  if (target === null) {
    return;
  }
  target.scrollIntoView({ block: "start" });
};

export function ScrollToHash() {
  useEffect(() => {
    scrollToCurrentHash();

    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => {
      window.removeEventListener("hashchange", scrollToCurrentHash);
    };
  }, []);

  return null;
}
