import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Database } from "../../src/db/client";
import { consultants, sessions } from "../../src/db/schema";
import type { PasswordHasher } from "../../src/modules/auth/auth.service";

// Senha fixa de toda consultora semeada pela factory: previsível para quem
// quiser logar de verdade (POST /auth/login) com `testPasswordHasher`
// injetado no próprio `buildApp()` (padrão dos testes de integração de
// dashboard/appointments/leads-crm).
export const FACTORY_CONSULTANT_PASSWORD = "senha-super-secreta";

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_SCHEME = "scrypt";

// KDF real do Node (scrypt): os workers do Vitest rodam sob Node, onde o
// global `Bun` (argon2id) não existe — lesson 2026-07-17
// (project-memory/lessons.md). Mesmo padrão replicado em
// dashboard/appointments/leads-crm.integration.test.ts; exportado aqui para
// não duplicar o hasher em cada arquivo que consumir a factory.
export const testPasswordHasher: PasswordHasher = {
  hash: async (password) => {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
    return `${SCRYPT_SCHEME}$${salt.toString("hex")}$${derived.toString("hex")}`;
  },
  verify: async (password, hash) => {
    const [scheme, saltHex, derivedHex] = hash.split("$");
    if (scheme !== SCRYPT_SCHEME || !saltHex || !derivedHex) {
      return false;
    }
    const derived = scryptSync(
      password,
      Buffer.from(saltHex, "hex"),
      SCRYPT_KEY_LENGTH,
    );
    const expected = Buffer.from(derivedHex, "hex");
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  },
};

export type ConsultantOverrides = Partial<{
  name: string;
  email: string;
  whatsapp: string;
  monthlyGoalCents: number | null;
}>;

export const createConsultant = async (
  db: Database,
  overrides: ConsultantOverrides = {},
): Promise<{ id: string }> => {
  const passwordHash = await testPasswordHasher.hash(
    FACTORY_CONSULTANT_PASSWORD,
  );
  const [row] = await db
    .insert(consultants)
    .values({
      name: overrides.name ?? "Consultora Factory",
      email: overrides.email ?? `consultora-${crypto.randomUUID()}@example.com`,
      passwordHash,
      whatsapp: overrides.whatsapp ?? "11987654321",
      monthlyGoalCents: overrides.monthlyGoalCents ?? null,
    })
    .returning({ id: consultants.id });

  if (!row) {
    throw new Error("factory createConsultant: falha ao inserir a consultora");
  }

  return { id: row.id };
};

const SESSION_TOKEN_BYTE_LENGTH = 32;
const SESSION_DURATION_DAYS = 30;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
// Espelha SESSION_DURATION_MS de auth.service.ts (30 dias, sem renovação
// deslizante) — mesma janela, calculada aqui para não importar um internal do
// módulo auth além do tipo `PasswordHasher` (api.md).
const SESSION_DURATION_MS =
  SESSION_DURATION_DAYS *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MS_PER_SECOND;

// SHA-256 hex do token — mesmo esquema de `hashToken` em auth.service.ts (o
// banco nunca guarda o token em claro; ver sessions.ts `token_hash`).
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export type ConsultantSessionOverrides = Partial<{
  expiresAt: Date;
}>;

// Sessão inserida DIRETO no banco, sem passar por POST /auth/login: o guard
// (auth-guard.ts) valida por lookup do hash do token, então isto produz um
// Bearer token válido sem exigir que quem consome a factory monte o `app`
// inteiro (routes→service→repository de TODOS os módulos, api.md) só para
// autenticar fixtures de outro módulo.
export const createConsultantSession = async (
  db: Database,
  consultantId: string,
  overrides: ConsultantSessionOverrides = {},
): Promise<{ token: string }> => {
  const tokenBytes = new Uint8Array(SESSION_TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(tokenBytes);
  const token = Buffer.from(tokenBytes).toString("base64url");

  await db.insert(sessions).values({
    consultantId,
    tokenHash: hashToken(token),
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + SESSION_DURATION_MS),
  });

  return { token };
};
