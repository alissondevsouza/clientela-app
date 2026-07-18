const FORWARDED_FOR_SEPARATOR = ",";

// Extrai o IP do visitante do header `x-forwarded-for`: o ÚLTIMO valor — o único
// anexado pelo proxy confiável (Caddy dá append; valores anteriores são forjáveis
// pelo cliente e usá-los reabriria o bypass do rate limit fechado no LP-02). Mesma
// semântica do `resolveClientIp` da API (RF-06). Header ausente/vazio → `undefined`
// (a action omite o header e a API faz fail-closed no socket).
export const extractClientIp = (
  headerValue: string | null,
): string | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const last = headerValue.split(FORWARDED_FOR_SEPARATOR).at(-1);
  const trimmed = last?.trim();
  return trimmed ? trimmed : undefined;
};
