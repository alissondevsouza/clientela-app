import { z } from "zod";

// Mensagens pt-BR acionáveis (core.md/security.md). O `error` no nível do tipo
// cobre também o campo AUSENTE (body sem a chave): sem ele, o `invalid_type` do
// Zod v4 responderia em inglês (lesson Zod v4 2026-07-17). Para a senha, a mesma
// mensagem é repetida no `.min(1)` para que ausente e vazio deem retorno idêntico.
const EMAIL_INVALID_MESSAGE = "Informe um e-mail válido";
const PASSWORD_REQUIRED_MESSAGE = "Informe sua senha";

// Contrato de entrada do login (POST /auth/login), fonte de verdade compartilhada
// entre o formulário do web (RHF) e a validação de fronteira da API.
export const loginRequestSchema = z.object({
  email: z.email({ error: EMAIL_INVALID_MESSAGE }),
  password: z
    .string({ error: PASSWORD_REQUIRED_MESSAGE })
    .min(1, PASSWORD_REQUIRED_MESSAGE),
});

export type LoginRequestInput = z.input<typeof loginRequestSchema>;
export type LoginRequest = z.output<typeof loginRequestSchema>;

// Dados públicos da consultora expostos ao cliente: nunca inclui `password_hash`
// nem qualquer segredo (security.md). Reusado na resposta de login e em /auth/me.
export const authConsultantSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
});

export type AuthConsultant = z.infer<typeof authConsultantSchema>;

// Resposta de sucesso do login: token opaco de sessão, instante de expiração
// (ISO 8601) e os dados públicos da consultora autenticada.
export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  consultant: authConsultantSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
