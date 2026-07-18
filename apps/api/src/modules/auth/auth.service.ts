import { createHash } from "node:crypto";
import type { AuthConsultant } from "@clientela/shared";
import { InvalidCredentialsError, UnauthorizedError } from "./auth.errors";

export type AuthClock = () => Date;

// Porta de hashing de senha (argon2id em produção). O service só conhece esta
// interface — testes injetam um fake, sem depender do custo do argon2.
export type PasswordHasher = {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
};

// Gera o token opaco de sessão (base64url). O service recebe a porta; a
// implementação de produção (`generateSecureToken`) usa CSPRNG.
export type GenerateToken = () => string;

// Registro completo da consultora que o repositório entrega ao service —
// inclui o hash da senha, usado só internamente (nunca sai do service).
export type AuthConsultantRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

export type AuthSessionInput = {
  consultantId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type SessionWithConsultant = {
  expiresAt: Date;
  consultant: AuthConsultant;
};

// Porta mínima do repositório (api.md: o service não conhece Drizzle nem o
// schema). O lookup de sessão já traz a consultora pública para evitar N+1.
export type AuthRepositoryPort = {
  findConsultantByEmail: (
    email: string,
  ) => Promise<AuthConsultantRecord | undefined>;
  insertSession: (session: AuthSessionInput) => Promise<void>;
  findSessionWithConsultantByTokenHash: (
    tokenHash: string,
  ) => Promise<SessionWithConsultant | undefined>;
  deleteSessionByTokenHash: (tokenHash: string) => Promise<void>;
  deleteExpiredSessions: (consultantId: string, now: Date) => Promise<void>;
};

export type AuthServiceDeps = {
  repository: AuthRepositoryPort;
  clock: AuthClock;
  hasher: PasswordHasher;
  generateToken: GenerateToken;
};

export type LoginResult = {
  token: string;
  // Instante de expiração como Date; a rota converte para ISO 8601 no contrato.
  expiresAt: Date;
  consultant: AuthConsultant;
};

export type AuthService = ReturnType<typeof createAuthService>;

// Duração fixa da sessão: 30 dias, sem renovação deslizante (RF-06 / plan.md).
const DAYS = 30;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
export const SESSION_DURATION_MS =
  DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

// Token opaco de 32 bytes (256 bits) do CSPRNG, em base64url (RF-07 / plan.md).
const TOKEN_BYTE_LENGTH = 32;

export const generateSecureToken: GenerateToken = () => {
  const bytes = new Uint8Array(TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
};

// Implementação de produção do hasher: argon2id nativo do Bun (security.md).
export const bunPasswordHasher: PasswordHasher = {
  hash: (password) => Bun.password.hash(password, "argon2id"),
  verify: (password, hash) => Bun.password.verify(password, hash),
};

// Hash argon2id pré-computado, verificado quando o e-mail não existe: mantém o
// custo/tempo do login constante entre "e-mail inexistente" e "senha errada"
// (anti-timing/anti-enumeração — plan.md). Não é segredo: é um placeholder fixo.
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$+QLe7rWDbLOipDQyp8jAXEGiJVjlcI+mQSUqw5WZmiU$u/CiRQedCto35OGyFZkTPWuYfYlLDkDiqbN4WbWevCU";

// O banco guarda apenas o SHA-256 hex do token (RF-07): dump do banco não
// permite sequestrar sessão. Determinístico — sem dependência nova (node:crypto).
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const toPublicConsultant = (consultant: AuthConsultant): AuthConsultant => ({
  id: consultant.id,
  name: consultant.name,
  email: consultant.email,
});

export const createAuthService = ({
  repository,
  clock,
  hasher,
  generateToken,
}: AuthServiceDeps) => {
  const login = async (
    email: string,
    password: string,
  ): Promise<LoginResult> => {
    const consultant = await repository.findConsultantByEmail(email);

    // E-mail inexistente: verifica contra o hash dummy para não vazar a
    // diferença de tempo, e responde o MESMO erro da senha errada.
    if (!consultant) {
      await hasher.verify(password, DUMMY_PASSWORD_HASH);
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await hasher.verify(
      password,
      consultant.passwordHash,
    );
    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const now = clock();

    // Limpeza oportunista: remove sessões já expiradas desta consultora no login.
    await repository.deleteExpiredSessions(consultant.id, now);

    const token = generateToken();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    await repository.insertSession({
      consultantId: consultant.id,
      tokenHash: hashToken(token),
      expiresAt,
    });

    return {
      token,
      expiresAt,
      consultant: toPublicConsultant(consultant),
    };
  };

  const validateSession = async (token: string): Promise<AuthConsultant> => {
    const session = await repository.findSessionWithConsultantByTokenHash(
      hashToken(token),
    );

    if (!session) {
      throw new UnauthorizedError();
    }

    // Sessão expirada é rejeitada (RF-06). `<=`: no instante exato da expiração
    // a sessão já não vale.
    if (session.expiresAt.getTime() <= clock().getTime()) {
      throw new UnauthorizedError();
    }

    return toPublicConsultant(session.consultant);
  };

  // Logout idempotente: remover uma sessão inexistente não é erro (RF-05).
  const logout = async (token: string): Promise<void> => {
    await repository.deleteSessionByTokenHash(hashToken(token));
  };

  return { login, validateSession, logout };
};
