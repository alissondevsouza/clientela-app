import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidCredentialsError, UnauthorizedError } from "./auth.errors";
import {
  type AuthConsultantRecord,
  type AuthRepositoryPort,
  type AuthSessionInput,
  createAuthService,
  DUMMY_PASSWORD_HASH,
  type PasswordHasher,
  SESSION_DURATION_MS,
} from "./auth.service";

const FIXED_NOW = new Date("2026-07-17T12:00:00.000Z");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const FIXED_TOKEN = "fixed-opaque-token-value";
const CORRECT_PASSWORD = "senha-correta";
const WRONG_PASSWORD = "senha-errada";

const CONSULTANT: AuthConsultantRecord = {
  id: "11111111-1111-7111-8111-111111111111",
  name: "Mary Consultora",
  email: "mary@example.com",
  passwordHash: `hashed:${CORRECT_PASSWORD}`,
};

const OTHER_CONSULTANT_ID = "22222222-2222-7222-8222-222222222222";

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

// Hasher fake determinístico (sem custo do argon2): registra as chamadas de
// verify para provar o caminho anti-timing do e-mail inexistente.
const createFakeHasher = () => {
  const verifyCalls: { password: string; hash: string }[] = [];
  const hasher: PasswordHasher = {
    hash: async (password) => `hashed:${password}`,
    verify: async (password, hash) => {
      verifyCalls.push({ password, hash });
      return hash === `hashed:${password}`;
    },
  };
  return { hasher, verifyCalls };
};

type StoredSession = AuthSessionInput;

// Repositório em memória (testing.md: fakes explícitos, sem mock de Drizzle).
const createFakeRepository = (
  seedConsultants: AuthConsultantRecord[],
  seedSessions: StoredSession[] = [],
) => {
  const consultantsById = new Map<string, AuthConsultantRecord>();
  const consultantsByEmail = new Map<string, AuthConsultantRecord>();
  for (const consultant of seedConsultants) {
    consultantsById.set(consultant.id, consultant);
    consultantsByEmail.set(consultant.email, consultant);
  }

  let storedSessions: StoredSession[] = [...seedSessions];

  const repository: AuthRepositoryPort = {
    findConsultantByEmail: async (email) => consultantsByEmail.get(email),
    insertSession: async (session) => {
      storedSessions.push(session);
    },
    findSessionWithConsultantByTokenHash: async (tokenHash) => {
      const session = storedSessions.find((s) => s.tokenHash === tokenHash);
      if (!session) {
        return undefined;
      }
      const consultant = consultantsById.get(session.consultantId);
      if (!consultant) {
        return undefined;
      }
      return {
        expiresAt: session.expiresAt,
        consultant: {
          id: consultant.id,
          name: consultant.name,
          email: consultant.email,
        },
      };
    },
    deleteSessionByTokenHash: async (tokenHash) => {
      storedSessions = storedSessions.filter((s) => s.tokenHash !== tokenHash);
    },
    deleteExpiredSessions: async (consultantId, now) => {
      storedSessions = storedSessions.filter(
        (s) =>
          !(
            s.consultantId === consultantId &&
            s.expiresAt.getTime() <= now.getTime()
          ),
      );
    },
  };

  return {
    repository,
    getSessions: () => storedSessions,
  };
};

const buildService = (
  repository: AuthRepositoryPort,
  hasher: PasswordHasher,
  overrides: { token?: string } = {},
) =>
  createAuthService({
    repository,
    hasher,
    clock: () => FIXED_NOW,
    generateToken: () => overrides.token ?? FIXED_TOKEN,
  });

describe("authService.login", () => {
  it("credenciais corretas: retorna token e cria sessão com o SHA-256 hex do token", async () => {
    const { repository, getSessions } = createFakeRepository([CONSULTANT]);
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    const result = await service.login(CONSULTANT.email, CORRECT_PASSWORD);

    expect(result.token).toBe(FIXED_TOKEN);
    expect(result.consultant).toEqual({
      id: CONSULTANT.id,
      name: CONSULTANT.name,
      email: CONSULTANT.email,
    });

    const sessions = getSessions();
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    // O banco nunca guarda o token em claro: valor armazenado = sha256(token).
    expect(session?.tokenHash).not.toBe(FIXED_TOKEN);
    expect(session?.tokenHash).toBe(sha256Hex(FIXED_TOKEN));
    expect(session?.consultantId).toBe(CONSULTANT.id);
  });

  it("expiresAt = agora + 30 dias fixos", async () => {
    const { repository, getSessions } = createFakeRepository([CONSULTANT]);
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    const result = await service.login(CONSULTANT.email, CORRECT_PASSWORD);

    const expected = FIXED_NOW.getTime() + THIRTY_DAYS_MS;
    expect(result.expiresAt.getTime()).toBe(expected);
    expect(SESSION_DURATION_MS).toBe(THIRTY_DAYS_MS);
    expect(getSessions()[0]?.expiresAt.getTime()).toBe(expected);
  });

  it("senha errada e e-mail inexistente lançam o MESMO erro com a MESMA mensagem", async () => {
    const { repository } = createFakeRepository([CONSULTANT]);
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    const wrongPasswordError = await service
      .login(CONSULTANT.email, WRONG_PASSWORD)
      .catch((error: unknown) => error);
    const unknownEmailError = await service
      .login("ninguem@example.com", CORRECT_PASSWORD)
      .catch((error: unknown) => error);

    expect(wrongPasswordError).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownEmailError).toBeInstanceOf(InvalidCredentialsError);
    if (
      !(wrongPasswordError instanceof Error) ||
      !(unknownEmailError instanceof Error)
    ) {
      throw new Error("esperava instâncias de Error em ambos os casos");
    }
    expect(wrongPasswordError.message).toBe(unknownEmailError.message);
  });

  it("e-mail inexistente verifica contra o hash dummy (anti-timing) e não cria sessão", async () => {
    const { repository, getSessions } = createFakeRepository([CONSULTANT]);
    const { hasher, verifyCalls } = createFakeHasher();
    const service = buildService(repository, hasher);

    await expect(
      service.login("ninguem@example.com", CORRECT_PASSWORD),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(verifyCalls).toHaveLength(1);
    expect(verifyCalls[0]?.hash).toBe(DUMMY_PASSWORD_HASH);
    expect(getSessions()).toHaveLength(0);
  });

  it("limpeza oportunista remove só as sessões expiradas da própria consultora", async () => {
    const expiredHashOwn = "expired-own";
    const validHashOwn = "valid-own";
    const expiredHashOther = "expired-other";
    const past = new Date(FIXED_NOW.getTime() - 1);
    const future = new Date(FIXED_NOW.getTime() + THIRTY_DAYS_MS);

    const { repository, getSessions } = createFakeRepository(
      [CONSULTANT],
      [
        {
          consultantId: CONSULTANT.id,
          tokenHash: expiredHashOwn,
          expiresAt: past,
        },
        {
          consultantId: CONSULTANT.id,
          tokenHash: validHashOwn,
          expiresAt: future,
        },
        {
          consultantId: OTHER_CONSULTANT_ID,
          tokenHash: expiredHashOther,
          expiresAt: past,
        },
      ],
    );
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await service.login(CONSULTANT.email, CORRECT_PASSWORD);

    const remaining = getSessions().map((s) => s.tokenHash);
    expect(remaining).not.toContain(expiredHashOwn);
    expect(remaining).toContain(validHashOwn);
    expect(remaining).toContain(expiredHashOther);
    expect(remaining).toContain(sha256Hex(FIXED_TOKEN));
  });
});

describe("authService.validateSession", () => {
  const seedSession = (expiresAt: Date): StoredSession => ({
    consultantId: CONSULTANT.id,
    tokenHash: sha256Hex(FIXED_TOKEN),
    expiresAt,
  });

  it("sessão válida retorna a consultora pública (sem passwordHash)", async () => {
    const future = new Date(FIXED_NOW.getTime() + THIRTY_DAYS_MS);
    const { repository } = createFakeRepository(
      [CONSULTANT],
      [seedSession(future)],
    );
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    const consultant = await service.validateSession(FIXED_TOKEN);

    expect(consultant).toEqual({
      id: CONSULTANT.id,
      name: CONSULTANT.name,
      email: CONSULTANT.email,
    });
    expect(consultant).not.toHaveProperty("passwordHash");
  });

  it("sessão expirada lança UnauthorizedError", async () => {
    const expired = new Date(FIXED_NOW.getTime() - 1);
    const { repository } = createFakeRepository(
      [CONSULTANT],
      [seedSession(expired)],
    );
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await expect(service.validateSession(FIXED_TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("sessão exatamente no instante da expiração é rejeitada", async () => {
    const { repository } = createFakeRepository(
      [CONSULTANT],
      [seedSession(FIXED_NOW)],
    );
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await expect(service.validateSession(FIXED_TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("token desconhecido lança UnauthorizedError", async () => {
    const { repository } = createFakeRepository([CONSULTANT]);
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await expect(
      service.validateSession("token-inexistente"),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("authService.logout", () => {
  it("remove a sessão pelo hash do token", async () => {
    const future = new Date(FIXED_NOW.getTime() + THIRTY_DAYS_MS);
    const { repository, getSessions } = createFakeRepository(
      [CONSULTANT],
      [
        {
          consultantId: CONSULTANT.id,
          tokenHash: sha256Hex(FIXED_TOKEN),
          expiresAt: future,
        },
      ],
    );
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await service.logout(FIXED_TOKEN);

    expect(getSessions()).toHaveLength(0);
  });

  it("é idempotente: não lança quando a sessão já não existe", async () => {
    const { repository, getSessions } = createFakeRepository([CONSULTANT]);
    const { hasher } = createFakeHasher();
    const service = buildService(repository, hasher);

    await expect(service.logout(FIXED_TOKEN)).resolves.toBeUndefined();
    expect(getSessions()).toHaveLength(0);
  });
});
