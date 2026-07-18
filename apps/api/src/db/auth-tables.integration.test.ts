import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { consultants, sessions } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const insertConsultant = async (ctx: PgTestContext, email: string) => {
  const [inserted] = await ctx.db
    .insert(consultants)
    .values({
      name: "Consultora Teste",
      email,
      passwordHash: "hash-fake",
      whatsapp: "11987654321",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao inserir consultora de apoio no teste.");
  }

  return inserted;
};

describe("tabelas consultants e sessions (integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await ctx.truncateAll();
  });

  describe("consultants", () => {
    it("insere consultora aplicando defaults do banco", async () => {
      const [inserted] = await ctx.db
        .insert(consultants)
        .values({
          name: "Mary Kay",
          email: "mary@example.com",
          passwordHash: "argon2-hash",
          whatsapp: "11987654321",
        })
        .returning();

      expect(inserted).toBeDefined();
      expect(inserted?.id).toMatch(UUID_V7_REGEX);
      expect(inserted?.name).toBe("Mary Kay");
      expect(inserted?.email).toBe("mary@example.com");
      expect(inserted?.passwordHash).toBe("argon2-hash");
      expect(inserted?.whatsapp).toBe("11987654321");
      expect(inserted?.createdAt).toBeInstanceOf(Date);
      expect(inserted?.updatedAt).toBeInstanceOf(Date);
    });

    it("rejeita insert sem name (NOT NULL)", async () => {
      await expect(
        ctx.sql`INSERT INTO consultants (email, password_hash, whatsapp) VALUES ('a@b.com', 'h', '11999999999')`,
      ).rejects.toThrow();
    });

    it("rejeita insert sem email (NOT NULL)", async () => {
      await expect(
        ctx.sql`INSERT INTO consultants (name, password_hash, whatsapp) VALUES ('Ana', 'h', '11999999999')`,
      ).rejects.toThrow();
    });

    it("rejeita insert sem password_hash (NOT NULL)", async () => {
      await expect(
        ctx.sql`INSERT INTO consultants (name, email, whatsapp) VALUES ('Ana', 'a@b.com', '11999999999')`,
      ).rejects.toThrow();
    });

    it("rejeita insert sem whatsapp (NOT NULL)", async () => {
      await expect(
        ctx.sql`INSERT INTO consultants (name, email, password_hash) VALUES ('Ana', 'a@b.com', 'h')`,
      ).rejects.toThrow();
    });

    it("rejeita email duplicado (UNIQUE)", async () => {
      await insertConsultant(ctx, "dup@example.com");

      await expect(insertConsultant(ctx, "dup@example.com")).rejects.toThrow();
    });
  });

  describe("sessions", () => {
    it("insere sessão válida aplicando defaults do banco", async () => {
      const consultant = await insertConsultant(ctx, "session@example.com");
      const expiresAt = new Date("2026-08-16T12:00:00.000Z");

      const [inserted] = await ctx.db
        .insert(sessions)
        .values({
          consultantId: consultant.id,
          tokenHash: "token-hash-1",
          expiresAt,
        })
        .returning();

      expect(inserted).toBeDefined();
      expect(inserted?.id).toMatch(UUID_V7_REGEX);
      expect(inserted?.consultantId).toBe(consultant.id);
      expect(inserted?.tokenHash).toBe("token-hash-1");
      expect(inserted?.expiresAt).toEqual(expiresAt);
      expect(inserted?.createdAt).toBeInstanceOf(Date);
      expect(inserted?.updatedAt).toBeInstanceOf(Date);
    });

    it("rejeita token_hash duplicado (UNIQUE)", async () => {
      const consultant = await insertConsultant(ctx, "unique@example.com");

      await ctx.db.insert(sessions).values({
        consultantId: consultant.id,
        tokenHash: "same-token",
        expiresAt: new Date("2026-08-16T12:00:00.000Z"),
      });

      await expect(
        ctx.db.insert(sessions).values({
          consultantId: consultant.id,
          tokenHash: "same-token",
          expiresAt: new Date("2026-09-16T12:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });

    it("rejeita consultant_id inexistente (FK)", async () => {
      const orphanId = "00000000-0000-7000-8000-000000000000";

      await expect(
        ctx.db.insert(sessions).values({
          consultantId: orphanId,
          tokenHash: "orphan-token",
          expiresAt: new Date("2026-08-16T12:00:00.000Z"),
        }),
      ).rejects.toThrow();
    });

    it("rejeita insert sem expires_at (NOT NULL)", async () => {
      const consultant = await insertConsultant(ctx, "noexpiry@example.com");

      await expect(
        ctx.sql`INSERT INTO sessions (consultant_id, token_hash) VALUES (${consultant.id}, 'tok')`,
      ).rejects.toThrow();
    });

    it("remove sessões ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
      const consultant = await insertConsultant(ctx, "cascade@example.com");

      await ctx.db.insert(sessions).values({
        consultantId: consultant.id,
        tokenHash: "cascade-token",
        expiresAt: new Date("2026-08-16T12:00:00.000Z"),
      });

      await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

      const remaining = await ctx.db
        .select()
        .from(sessions)
        .where(eq(sessions.consultantId, consultant.id));

      expect(remaining).toHaveLength(0);
    });

    it("mantém índice explícito na FK consultant_id", async () => {
      const rows = await ctx.sql<{ indexname: string }[]>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'sessions'
          AND indexname = 'sessions_consultant_id_idx'
      `;

      expect(rows).toHaveLength(1);
    });
  });
});
