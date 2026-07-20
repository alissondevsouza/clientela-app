import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  productsListQuerySchema,
  updateProductSchema,
} from "./products";

const validMinimal = {
  name: "Base Líquida",
  costCents: 3550,
  priceCents: 5990,
} as const;

const firstMessage = (
  result: ReturnType<typeof createProductSchema.safeParse>,
): string => {
  if (result.success) {
    throw new Error("esperava falha de validação");
  }
  return result.error.issues[0]?.message ?? "";
};

describe("createProductSchema", () => {
  it("aceita o mínimo válido e aplica defaults de estoque e limiar", () => {
    const result = createProductSchema.parse(validMinimal);
    expect(result.name).toBe("Base Líquida");
    expect(result.costCents).toBe(3550);
    expect(result.priceCents).toBe(5990);
    expect(result.stockQty).toBe(0);
    expect(result.lowStockThreshold).toBe(1);
    expect(result.brandCode).toBeUndefined();
  });

  it("rejeita custo não-inteiro com mensagem pt-BR de centavos", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      costCents: 12.34,
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe o custo em centavos (número inteiro)");
    expect(message).not.toMatch(/invalid input|expected|received/i);
  });

  it("rejeita preço não-inteiro com mensagem pt-BR de centavos", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      priceCents: 59.9,
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o preço em centavos (número inteiro)",
    );
  });

  it("rejeita custo negativo com mensagem pt-BR", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      costCents: -1,
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("O custo não pode ser negativo");
  });

  it("rejeita valor acima do teto com mensagem pt-BR de limite", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      priceCents: 100_000_001,
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("O preço deve ser no máximo R$ 1.000.000,00");
    expect(message).not.toMatch(/less than|expected|received/i);
  });

  it("dá mensagem pt-BR quando o custo está ausente (invalid_type)", () => {
    const result = createProductSchema.safeParse({
      name: "Base Líquida",
      priceCents: 5990,
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe o custo em centavos (número inteiro)");
    expect(message).not.toMatch(/expected number|received undefined/i);
  });

  it("dá mensagem pt-BR quando o nome está ausente (invalid_type)", () => {
    const result = createProductSchema.safeParse({
      costCents: 3550,
      priceCents: 5990,
    });
    expect(result.success).toBe(false);
    const message = firstMessage(result);
    expect(message).toBe("Informe o nome do produto (mínimo 2 caracteres)");
    expect(message).not.toMatch(/expected string|received undefined/i);
  });

  it("rejeita quantidade em estoque negativa com mensagem pt-BR", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      stockQty: -3,
    });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "A quantidade em estoque não pode ser negativa",
    );
  });

  it("aceita brandCode válido e o normaliza (trim)", () => {
    const result = createProductSchema.parse({
      ...validMinimal,
      brandCode: "  MK-123  ",
    });
    expect(result.brandCode).toBe("MK-123");
  });
});

describe("updateProductSchema", () => {
  it("rejeita body vazio com mensagem pt-BR", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "Informe ao menos um campo para atualizar",
    );
  });

  it("aceita brandCode null explícito para limpar e preserva null", () => {
    const result = updateProductSchema.parse({ brandCode: null });
    expect(result).toEqual({ brandCode: null });
    expect(result.brandCode).toBeNull();
  });

  it("não aplica defaults nem injeta chaves ausentes", () => {
    const result = updateProductSchema.parse({ name: "Novo Nome" });
    expect(Object.keys(result)).toEqual(["name"]);
    expect("stockQty" in result).toBe(false);
    expect("lowStockThreshold" in result).toBe(false);
  });

  it("rejeita null para campo não-nulável (costCents)", () => {
    const result = updateProductSchema.safeParse({ costCents: null });
    expect(result.success).toBe(false);
  });
});

describe("productsListQuerySchema", () => {
  it("aplica defaults de paginação e aceita search opcional", () => {
    const result = productsListQuerySchema.parse({ search: "base" });
    expect(result).toEqual({ page: 1, perPage: 20, search: "base" });
  });

  it("coage lowStock 'true' da query string para boolean", () => {
    const result = productsListQuerySchema.parse({ lowStock: "true" });
    expect(result.lowStock).toBe(true);
  });

  it("coage lowStock 'false' da query string para boolean", () => {
    const result = productsListQuerySchema.parse({ lowStock: "false" });
    expect(result.lowStock).toBe(false);
  });

  it("omite lowStock quando ausente", () => {
    const result = productsListQuerySchema.parse({});
    expect("lowStock" in result).toBe(false);
  });

  it("rejeita search acima de 100 caracteres com mensagem pt-BR", () => {
    const result = productsListQuerySchema.safeParse({
      search: "a".repeat(101),
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "A busca deve ter no máximo 100 caracteres",
    );
  });
});
