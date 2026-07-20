import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type PgTestContext,
  startPgContainer,
} from "../../test/helpers/pg-container";
import { clients, consultants, leads } from "./schema";

const CONTAINER_STARTUP_TIMEOUT_MS = 120_000;
const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONEXISTENT_UUID = "00000000-0000-7000-8000-000000000000";

describe("tabela leads (integração)", () => {
  let ctx: PgTestContext;

  beforeAll(async () => {
    ctx = await startPgContainer();
  }, CONTAINER_STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    await ctx?.stop();
  });

  const insertConsultant = async (): Promise<string> => {
    const [consultant] = await ctx.db
      .insert(consultants)
      .values({
        name: "Consultora Teste",
        email: `consultora-${crypto.randomUUID()}@example.com`,
        passwordHash: "hash",
        whatsapp: "11900000000",
      })
      .returning();

    if (!consultant) {
      throw new Error("Falha ao inserir consultora de teste");
    }

    return consultant.id;
  };

  const insertClient = async (consultantId: string): Promise<string> => {
    const [client] = await ctx.db
      .insert(clients)
      .values({
        consultantId,
        name: "Cliente Teste",
        whatsapp: "11988887777",
      })
      .returning();

    if (!client) {
      throw new Error("Falha ao inserir cliente de teste");
    }

    return client.id;
  };

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

  it("aceita client_id ausente (coluna nullable)", async () => {
    const [inserted] = await ctx.db
      .insert(leads)
      .values({
        name: "Carla Dias",
        whatsapp: "11955554444",
        consentAt: new Date(),
      })
      .returning();

    expect(inserted?.clientId).toBeNull();
  });

  it("vincula lead a uma cliente válida (FK)", async () => {
    const consultantId = await insertConsultant();
    const clientId = await insertClient(consultantId);

    const [inserted] = await ctx.db
      .insert(leads)
      .values({
        name: "Bianca Reis",
        whatsapp: "11966665555",
        consentAt: new Date(),
        status: "converted",
        clientId,
      })
      .returning();

    expect(inserted?.clientId).toBe(clientId);
  });

  it("rejeita client_id inexistente (FK)", async () => {
    await expect(
      ctx.db.insert(leads).values({
        name: "Fabiana Luz",
        whatsapp: "11944443333",
        consentAt: new Date(),
        clientId: NONEXISTENT_UUID,
      }),
    ).rejects.toThrow();
  });

  it("SET NULL: excluir a cliente vinculada mantém o lead com client_id null e demais colunas intactas", async () => {
    const consentAt = new Date("2026-07-17T09:30:00.000Z");
    const consultantId = await insertConsultant();
    const clientId = await insertClient(consultantId);

    const [inserted] = await ctx.db
      .insert(leads)
      .values({
        name: "Débora Nunes",
        whatsapp: "11933332222",
        interest: "Batom matte",
        consentAt,
        status: "converted",
        clientId,
      })
      .returning();

    expect(inserted?.clientId).toBe(clientId);

    await ctx.db.delete(clients).where(eq(clients.id, clientId));

    const [afterDelete] = await ctx.db
      .select()
      .from(leads)
      .where(eq(leads.id, inserted?.id ?? NONEXISTENT_UUID));

    expect(afterDelete).toBeDefined();
    expect(afterDelete?.clientId).toBeNull();
    // Lead é histórico de captação: sobrevive à exclusão da cliente com os
    // demais dados intactos (só o vínculo se desfaz).
    expect(afterDelete?.status).toBe("converted");
    expect(afterDelete?.name).toBe("Débora Nunes");
    expect(afterDelete?.whatsapp).toBe("11933332222");
    expect(afterDelete?.interest).toBe("Batom matte");
    expect(afterDelete?.consentAt).toEqual(consentAt);
  });

  it("cria o índice leads_client_id_idx", async () => {
    const rows = await ctx.sql<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'leads'
        AND indexname = 'leads_client_id_idx'
    `;

    expect(rows).toHaveLength(1);
  });
});
