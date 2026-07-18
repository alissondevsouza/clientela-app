import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { clients, consultants } from "./schema";

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

describe("tabela clients (integração)", () => {
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

  it("insere cliente aplicando defaults do banco", async () => {
    const consultant = await insertConsultant(ctx, "insert@example.com");

    const [inserted] = await ctx.db
      .insert(clients)
      .values({
        consultantId: consultant.id,
        name: "Cliente Feliz",
        whatsapp: "11912345678",
        birthday: "1990-05-10",
        skinTone: "média",
        notes: "Prefere batom vermelho",
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toMatch(UUID_V7_REGEX);
    expect(inserted?.consultantId).toBe(consultant.id);
    expect(inserted?.name).toBe("Cliente Feliz");
    expect(inserted?.whatsapp).toBe("11912345678");
    expect(inserted?.birthday).toBe("1990-05-10");
    expect(inserted?.skinTone).toBe("média");
    expect(inserted?.notes).toBe("Prefere batom vermelho");
    expect(inserted?.createdAt).toBeInstanceOf(Date);
    expect(inserted?.updatedAt).toBeInstanceOf(Date);
  });

  it("aceita campos nullable ausentes (birthday, skin_tone, notes)", async () => {
    const consultant = await insertConsultant(ctx, "nullable@example.com");

    const [inserted] = await ctx.db
      .insert(clients)
      .values({
        consultantId: consultant.id,
        name: "Sem Extras",
        whatsapp: "11900000000",
      })
      .returning();

    expect(inserted?.birthday).toBeNull();
    expect(inserted?.skinTone).toBeNull();
    expect(inserted?.notes).toBeNull();
  });

  it("faz ida-e-volta do birthday sem shift de timezone", async () => {
    const consultant = await insertConsultant(ctx, "birthday@example.com");

    await ctx.db.insert(clients).values({
      consultantId: consultant.id,
      name: "Aniversariante",
      whatsapp: "11911111111",
      birthday: "1990-05-10",
    });

    const [row] = await ctx.db
      .select({ birthday: clients.birthday })
      .from(clients);

    // String mode + coluna `date`: o valor volta exatamente como entrou,
    // sem conversão para Date nem deslocamento de fuso.
    expect(row?.birthday).toBe("1990-05-10");
  });

  it("rejeita insert sem consultant_id (NOT NULL)", async () => {
    await expect(
      ctx.sql`INSERT INTO clients (name, whatsapp) VALUES ('Ana', '11999999999')`,
    ).rejects.toThrow();
  });

  it("rejeita insert sem name (NOT NULL)", async () => {
    const consultant = await insertConsultant(ctx, "noname@example.com");

    await expect(
      ctx.sql`INSERT INTO clients (consultant_id, whatsapp) VALUES (${consultant.id}, '11999999999')`,
    ).rejects.toThrow();
  });

  it("rejeita insert sem whatsapp (NOT NULL)", async () => {
    const consultant = await insertConsultant(ctx, "nowhats@example.com");

    await expect(
      ctx.sql`INSERT INTO clients (consultant_id, name) VALUES (${consultant.id}, 'Ana')`,
    ).rejects.toThrow();
  });

  it("rejeita consultant_id inexistente (FK)", async () => {
    const orphanId = "00000000-0000-7000-8000-000000000000";

    await expect(
      ctx.db.insert(clients).values({
        consultantId: orphanId,
        name: "Órfã",
        whatsapp: "11922222222",
      }),
    ).rejects.toThrow();
  });

  it("remove clientes ao excluir a consultora (FK ON DELETE CASCADE)", async () => {
    const consultant = await insertConsultant(ctx, "cascade@example.com");

    await ctx.db.insert(clients).values({
      consultantId: consultant.id,
      name: "Cliente da Consultora",
      whatsapp: "11933333333",
    });

    await ctx.db.delete(consultants).where(eq(consultants.id, consultant.id));

    const remaining = await ctx.db
      .select()
      .from(clients)
      .where(eq(clients.consultantId, consultant.id));

    expect(remaining).toHaveLength(0);
  });

  it("mantém índice explícito na FK consultant_id", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'clients'
        AND indexname = 'clients_consultant_id_idx'
    `;

    expect(rows).toHaveLength(1);
  });
});
