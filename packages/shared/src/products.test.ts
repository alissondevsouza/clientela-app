import { describe, expect, it } from "vitest";
import {
  calculateDiscountedCostCents,
  calculateGrossMargin,
  createProductSchema,
  productSchema,
  productsListQuerySchema,
  updateProductSchema,
} from "./products";

const validMinimal = {
  name: "Base Líquida",
  costCents: 3550,
  priceCents: 5990,
} as const;

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: { message: string }[] } };

const firstMessage = (result: ValidationResult): string => {
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
    expect(result.purchaseDiscountBps).toBeUndefined();
  });

  it("aceita criação manual com taxa explicitamente nula", () => {
    const result = createProductSchema.parse({
      ...validMinimal,
      purchaseDiscountBps: null,
    });

    expect(result.costCents).toBe(3550);
    expect(result.purchaseDiscountBps).toBeNull();
  });

  it.each([0, 3000, 3500, 3750, 4000, 10_000])(
    "aceita criação por desconto de %i pontos-base sem custo enviado",
    (purchaseDiscountBps) => {
      const result = createProductSchema.parse({
        name: "Base Líquida",
        priceCents: 9990,
        purchaseDiscountBps,
      });

      expect(result.costCents).toBeUndefined();
      expect(result.purchaseDiscountBps).toBe(purchaseDiscountBps);
    },
  );

  it("rejeita custo e desconto simultâneos com mensagem pt-BR acionável", () => {
    const result = createProductSchema.safeParse({
      ...validMinimal,
      purchaseDiscountBps: 3500,
    });

    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o custo diretamente ou o desconto de compra, mas não os dois",
    );
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

  it("rejeita desconto fracionário com mensagem pt-BR", () => {
    const result = createProductSchema.safeParse({
      name: "Base Líquida",
      priceCents: 5990,
      purchaseDiscountBps: 3750.5,
    });

    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o desconto de compra em pontos-base (número inteiro)",
    );
  });

  it.each([
    [-1, "O desconto de compra não pode ser negativo"],
    [10_001, "O desconto de compra deve ser no máximo 100%"],
  ])(
    "rejeita desconto fora da faixa: %i",
    (purchaseDiscountBps, expectedMessage) => {
      const result = createProductSchema.safeParse({
        name: "Base Líquida",
        priceCents: 5990,
        purchaseDiscountBps,
      });

      expect(result.success).toBe(false);
      expect(firstMessage(result)).toBe(expectedMessage);
    },
  );

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

  it.each([
    { purchaseDiscountBps: 3750 },
    { purchaseDiscountBps: null },
    { costCents: 4200 },
    { costCents: 4200, purchaseDiscountBps: null },
  ])("aceita PATCH parcial de precificação válido: %o", (patch) => {
    expect(updateProductSchema.parse(patch)).toEqual(patch);
  });

  it("rejeita custo direto com taxa não nula", () => {
    const result = updateProductSchema.safeParse({
      costCents: 4200,
      purchaseDiscountBps: 3500,
    });

    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o custo diretamente ou o desconto de compra, mas não os dois",
    );
  });

  it("rejeita taxa fracionária no PATCH com mensagem pt-BR", () => {
    const result = updateProductSchema.safeParse({
      purchaseDiscountBps: 3000.5,
    });

    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "Informe o desconto de compra em pontos-base (número inteiro)",
    );
  });

  it("rejeita taxa acima de 100% no PATCH com mensagem pt-BR", () => {
    const result = updateProductSchema.safeParse({
      purchaseDiscountBps: 10_001,
    });

    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "O desconto de compra deve ser no máximo 100%",
    );
  });
});

describe("calculateDiscountedCostCents", () => {
  it.each([
    [3000, 7000],
    [3500, 6500],
    [3750, 6250],
    [4000, 6000],
  ])(
    "calcula desconto de %i pontos-base somente com inteiros",
    (purchaseDiscountBps, expectedCostCents) => {
      expect(calculateDiscountedCostCents(10_000, purchaseDiscountBps)).toBe(
        expectedCostCents,
      );
    },
  );

  it("cobre as bordas de 0% e 100%", () => {
    expect(calculateDiscountedCostCents(9990, 0)).toBe(9990);
    expect(calculateDiscountedCostCents(9990, 10_000)).toBe(0);
  });

  it("arredonda meio centavo para cima", () => {
    expect(calculateDiscountedCostCents(9990, 3500)).toBe(6494);
  });
});

describe("calculateGrossMargin", () => {
  it("retorna taxa não calculável quando o preço é zero", () => {
    expect(calculateGrossMargin(0, 125)).toEqual({
      marginCents: -125,
      marginBps: null,
    });
  });

  it("preserva o sinal quando o custo é maior que o preço", () => {
    expect(calculateGrossMargin(5000, 6000)).toEqual({
      marginCents: -1000,
      marginBps: -2000,
    });
  });

  it("arredonda meios para longe de zero nos dois sentidos", () => {
    expect(calculateGrossMargin(4000, 3999).marginBps).toBe(3);
    expect(calculateGrossMargin(4000, 4001).marginBps).toBe(-3);
  });

  it("usa o custo já arredondado e mantém precisão de duas casas", () => {
    const costCents = calculateDiscountedCostCents(9990, 3500);

    expect(costCents).toBe(6494);
    expect(calculateGrossMargin(9990, costCents)).toEqual({
      marginCents: 3496,
      marginBps: 3499,
    });
  });
});

describe("productSchema", () => {
  const response = {
    id: "650a1e2d-a2cf-4d8f-8c4d-9e3729fa3ef1",
    name: "Base Líquida",
    brandCode: null,
    costCents: 6494,
    priceCents: 9990,
    stockQty: 2,
    reservedQty: 3,
    availableQty: -1,
    lowStockThreshold: 1,
    lowStock: true,
    createdAt: "2026-09-09T12:00:00.000Z",
    updatedAt: "2026-09-09T12:00:00.000Z",
  } as const;

  it.each([null, 3500])(
    "inclui taxa persistida válida na resposta: %s",
    (purchaseDiscountBps) => {
      expect(productSchema.parse({ ...response, purchaseDiscountBps })).toEqual(
        { ...response, purchaseDiscountBps },
      );
    },
  );

  it("rejeita resposta sem o discriminador de modo de custo", () => {
    expect(productSchema.safeParse(response).success).toBe(false);
  });

  it("rejeita resposta com taxa fora da faixa", () => {
    expect(
      productSchema.safeParse({ ...response, purchaseDiscountBps: 10_001 })
        .success,
    ).toBe(false);
  });

  it("aceita disponibilidade negativa para tornar a reposição necessária explícita", () => {
    const product = productSchema.parse({
      ...response,
      purchaseDiscountBps: null,
    });

    expect(product.stockQty).toBe(2);
    expect(product.reservedQty).toBe(3);
    expect(product.availableQty).toBe(-1);
  });

  it("rejeita reserva negativa", () => {
    expect(
      productSchema.safeParse({
        ...response,
        purchaseDiscountBps: null,
        reservedQty: -1,
      }).success,
    ).toBe(false);
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
