import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { leads } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("tabela leads (integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await ctx?.stop();
  });

  it("insere lead válido aplicando os defaults do banco", async () => {
    const consentAt = new Date("2026-07-16T12:00:00.000Z");

    const [inserted] = await ctx.db
      .insert(leads)
      .values({
        name: "Maria Silva",
        whatsapp: "11987654321",
        interest: "Base líquida",
        consentAt,
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.status).toBe("new");
    expect(inserted?.source).toBe("landing");
    expect(inserted?.interest).toBe("Base líquida");
    expect(inserted?.consentAt).toEqual(consentAt);
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("aceita interest ausente (coluna nullable)", async () => {
    const [inserted] = await ctx.db
      .insert(leads)
      .values({
        name: "Joana Souza",
        whatsapp: "11912345678",
        consentAt: new Date(),
      })
      .returning();

    expect(inserted?.interest).toBeNull();
  });

  it("rejeita insert sem name (NOT NULL)", async () => {
    await expect(
      ctx.sql`INSERT INTO leads (whatsapp, consent_at) VALUES ('11999999999', now())`,
    ).rejects.toThrow();
  });

  it("rejeita insert sem consent_at (NOT NULL — LGPD)", async () => {
    await expect(
      ctx.sql`INSERT INTO leads (name, whatsapp) VALUES ('Ana', '11999999999')`,
    ).rejects.toThrow();
  });

  it("rejeita status fora do domínio (CHECK)", async () => {
    await expect(
      ctx.sql`INSERT INTO leads (name, whatsapp, consent_at, status) VALUES ('Ana', '11999999999', now(), 'invalido')`,
    ).rejects.toThrow();
  });
});
