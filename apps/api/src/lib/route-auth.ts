import { UnauthorizedError } from "../modules/auth/auth.errors";

// Helper compartilhado de autenticação de rota (route-auth): centraliza a
// extração do token Bearer, a resolução da consultora da sessão e a validação de
// formato uuid, antes duplicadas em auth/clients/leads-crm/auth-guard. Comportamento
// idêntico ao das cópias locais que substitui — nenhuma mensagem/status muda.

const BEARER_PREFIX = "Bearer ";

// Formato uuid genérico (qualquer versão): os ids do banco são uuid v7, mas o que
// importa aqui é rejeitar formato inválido antes de consultar o banco.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Extrai o token do header `Authorization: Bearer <token>`. Header ausente,
// esquema diferente de Bearer ou token vazio ⇒ `null` (tratado como 401 pelos
// consumidores).
export const extractBearerToken = (
  authorizationHeader: string | null,
): string | null => {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

// Confere se a string é um uuid (qualquer versão). Usado pelos módulos para
// mapear id malformado ao 404 de "inexistente" antes de tocar o banco.
export const isUuid = (value: string): boolean => UUID_REGEX.test(value);

// Porta mínima do service de auth exigida pelo resolver: só precisa validar a
// sessão e devolver a identidade da consultora. A `AuthService` real satisfaz
// estruturalmente este tipo (api.md: dependência explícita, não módulo inteiro).
export type ConsultantResolverAuthService = {
  validateSession: (token: string) => Promise<{ id: string }>;
};

// Fábrica do resolver de consultora: recebe o service de auth por injeção e
// devolve a função usada pelas rotas autenticadas para obter o `consultantId` da
// sessão. Token ausente/malformado ⇒ `UnauthorizedError` (401); token válido é
// revalidado no service (que também lança `UnauthorizedError` em sessão
// desconhecida/expirada). Comportamento idêntico aos `resolveConsultantId` locais.
export const createConsultantResolver =
  (authService: ConsultantResolverAuthService) =>
  async (authorizationHeader: string | null): Promise<string> => {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
      throw new UnauthorizedError();
    }
    const consultant = await authService.validateSession(token);
    return consultant.id;
  };
