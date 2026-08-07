export type PersonSearchStatus = "idle" | "loading" | "error";

// Gatilho do cadastro rápido de pessoa no seletor da agenda (RF-23): só
// oferece "Cadastrar pessoa" quando a busca REALMENTE terminou sem achar
// ninguém — termo digitado (não vazio), sem carregamento em andamento, sem
// erro, e zero resultados. Extraído para `lib/` (ALERTA da revisão de
// `crm-appointments`) para virar testável sem harness de teste de
// componente; o resto da interação do seletor (digitar, clicar, vincular)
// fica como pendência de E2E (Playwright — infra futura, `testing.md`).
export const activeSearchHasNoResults = (
  term: string,
  status: PersonSearchStatus,
  resultsCount: number,
): boolean => term.trim().length > 0 && status === "idle" && resultsCount === 0;
