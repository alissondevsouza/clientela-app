import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paginated, paginationQuerySchema } from "./pagination";

describe("paginationQuerySchema", () => {
  it("aplica os defaults quando as chaves estão ausentes", () => {
    const result = paginationQuerySchema.parse({});
    expect(result).toEqual({ page: 1, perPage: 20 });
  });

  it("faz coerce da query string para número", () => {
    const result = paginationQuerySchema.parse({ page: "3", perPage: "50" });
    expect(result).toEqual({ page: 3, perPage: 50 });
  });

  it("rejeita perPage acima de 100 com mensagem pt-BR (não clampa)", () => {
    const result = paginationQuerySchema.safeParse({ perPage: 101 });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("O limite por página deve ser no máximo 100");
    expect(message).not.toMatch(/too big|expected|received/i);
  });

  it("rejeita perPage acima de 100 vindo como string", () => {
    const result = paginationQuerySchema.safeParse({ perPage: "101" });
    expect(result.success).toBe(false);
  });

  it("rejeita page menor que 1 com mensagem pt-BR", () => {
    const result = paginationQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "A página deve ser no mínimo 1",
    );
  });
});

describe("paginated", () => {
  const itemSchema = z.object({ id: z.string() });

  it("monta o envelope { data, page, perPage, total } tipado", () => {
    const schema = paginated(itemSchema);
    const result = schema.parse({
      data: [{ id: "a" }, { id: "b" }],
      page: 1,
      perPage: 20,
      total: 2,
    });
    expect(result.data).toHaveLength(2);
    expect(result).toMatchObject({ page: 1, perPage: 20, total: 2 });
  });

  it("valida cada item contra o schema fornecido", () => {
    const schema = paginated(itemSchema);
    const result = schema.safeParse({
      data: [{ id: 123 }],
      page: 1,
      perPage: 20,
      total: 1,
    });
    expect(result.success).toBe(false);
  });
});
