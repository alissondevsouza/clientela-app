import { describe, expect, it } from "vitest";
import {
  buildProductPricingPreview,
  composeProductFinancialPayload,
  formatMarginPercentage,
  formatPercentage,
  formatPercentageInput,
  OTHER_DISCOUNT_SELECTION,
  PURCHASE_DISCOUNT_PRESETS,
  parsePercentageToBasisPoints,
  purchaseDiscountDraftFromBasisPoints,
  resolvePurchaseDiscountBasisPoints,
} from "./product-pricing";

describe("percentuais de desconto", () => {
  it("expõe os presets de 30%, 35% e 40% em pontos-base", () => {
    expect(PURCHASE_DISCOUNT_PRESETS).toEqual([
      { selection: "3000", basisPoints: 3000, label: "30%" },
      { selection: "3500", basisPoints: 3500, label: "35%" },
      { selection: "4000", basisPoints: 4000, label: "40%" },
    ]);
  });

  it.each([
    ["0", 0],
    ["30", 3000],
    ["35%", 3500],
    ["37,5", 3750],
    ["37,50", 3750],
    [" 40,25 % ", 4025],
    ["100,00", 10000],
    ["00,5", 50],
  ])("converte %s do formato pt-BR para %d pontos-base", (input, expected) => {
    expect(parsePercentageToBasisPoints(input)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "-1",
    "+1",
    "37.5",
    "37,555",
    ",5",
    "1,",
    "100,01",
    "101",
    "35%%",
    "trinta",
  ])("rejeita o percentual inválido %s", (input) => {
    expect(parsePercentageToBasisPoints(input)).toBeNull();
  });

  it.each([
    [0, "0", "0%"],
    [3500, "35", "35%"],
    [3750, "37,5", "37,5%"],
    [4005, "40,05", "40,05%"],
    [10000, "100", "100%"],
    [-125, "-1,25", "-1,25%"],
  ])(
    "formata %d pontos-base com até duas casas",
    (basisPoints, inputValue, displayValue) => {
      expect(formatPercentageInput(basisPoints)).toBe(inputValue);
      expect(formatPercentage(basisPoints)).toBe(displayValue);
    },
  );

  it("apresenta margem sem taxa como não calculável", () => {
    expect(formatMarginPercentage(null)).toBe("Não calculável");
    expect(formatMarginPercentage(-125)).toBe("-1,25%");
  });
});

describe("seleção de desconto", () => {
  it.each([3000, 3500, 4000])(
    "seleciona o preset correspondente para %d pontos-base",
    (basisPoints) => {
      expect(purchaseDiscountDraftFromBasisPoints(basisPoints)).toEqual({
        selection: String(basisPoints),
        customPercentage: "",
      });
    },
  );

  it("seleciona Outro e preenche o percentual personalizado", () => {
    expect(purchaseDiscountDraftFromBasisPoints(3750)).toEqual({
      selection: OTHER_DISCOUNT_SELECTION,
      customPercentage: "37,5",
    });
  });

  it("não assume taxa quando ela não existe ou é inválida", () => {
    expect(purchaseDiscountDraftFromBasisPoints(null)).toEqual({
      selection: null,
      customPercentage: "",
    });
    expect(purchaseDiscountDraftFromBasisPoints(10001)).toEqual({
      selection: null,
      customPercentage: "",
    });
  });

  it("resolve presets sem depender do campo personalizado", () => {
    expect(resolvePurchaseDiscountBasisPoints("3000", "inválido")).toBe(3000);
    expect(resolvePurchaseDiscountBasisPoints("3500", "")).toBe(3500);
    expect(resolvePurchaseDiscountBasisPoints("4000", "999")).toBe(4000);
  });

  it("resolve Outro pelo parser pt-BR e preserva ausência de seleção", () => {
    expect(
      resolvePurchaseDiscountBasisPoints(OTHER_DISCOUNT_SELECTION, "37,5"),
    ).toBe(3750);
    expect(
      resolvePurchaseDiscountBasisPoints(OTHER_DISCOUNT_SELECTION, "37,555"),
    ).toBeNull();
    expect(resolvePurchaseDiscountBasisPoints(null, "35")).toBeNull();
  });
});

describe("prévia financeira", () => {
  it("calcula custo arredondado e margem usando o custo já arredondado", () => {
    expect(
      buildProductPricingPreview("99,90", {
        mode: "discount",
        discountSelection: "3500",
        customDiscountInput: "",
      }),
    ).toEqual({
      priceCents: 9990,
      costCents: 6494,
      marginCents: 3496,
      marginBps: 3499,
    });
  });

  it("calcula a prévia com percentual personalizado", () => {
    expect(
      buildProductPricingPreview("99,90", {
        mode: "discount",
        discountSelection: OTHER_DISCOUNT_SELECTION,
        customDiscountInput: "37,5",
      }),
    ).toEqual({
      priceCents: 9990,
      costCents: 6244,
      marginCents: 3746,
      marginBps: 3750,
    });
  });

  it("mantém a taxa não calculável quando o preço é zero", () => {
    expect(
      buildProductPricingPreview("0,00", {
        mode: "discount",
        discountSelection: "3500",
        customDiscountInput: "",
      }),
    ).toEqual({
      priceCents: 0,
      costCents: 0,
      marginCents: 0,
      marginBps: null,
    });
  });

  it("preserva margem negativa no modo manual", () => {
    expect(
      buildProductPricingPreview("100,00", {
        mode: "manual",
        costInput: "120,00",
      }),
    ).toEqual({
      priceCents: 10000,
      costCents: 12000,
      marginCents: -2000,
      marginBps: -2000,
    });
  });

  it("não produz NaN ou infinito para preço zero e custo positivo", () => {
    expect(
      buildProductPricingPreview("0", {
        mode: "manual",
        costInput: "1,00",
      }),
    ).toEqual({
      priceCents: 0,
      costCents: 100,
      marginCents: -100,
      marginBps: null,
    });
  });

  it("não monta prévia com preço ou campo ativo inválido", () => {
    expect(
      buildProductPricingPreview("", {
        mode: "manual",
        costInput: "10,00",
      }),
    ).toBeNull();
    expect(
      buildProductPricingPreview("10,00", {
        mode: "manual",
        costInput: "inválido",
      }),
    ).toBeNull();
    expect(
      buildProductPricingPreview("10,00", {
        mode: "discount",
        discountSelection: null,
        customDiscountInput: "35",
      }),
    ).toBeNull();
  });
});

describe("payload financeiro", () => {
  it("compõe o modo manual somente com o custo direto", () => {
    const payload = composeProductFinancialPayload({
      mode: "manual",
      costInput: "12,34",
    });

    expect(payload).toEqual({ costCents: 1234 });
    expect(payload).not.toHaveProperty("purchaseDiscountBps");
  });

  it("compõe o modo desconto somente com a taxa do preset", () => {
    const payload = composeProductFinancialPayload({
      mode: "discount",
      discountSelection: "3500",
      customDiscountInput: "99",
    });

    expect(payload).toEqual({ purchaseDiscountBps: 3500 });
    expect(payload).not.toHaveProperty("costCents");
  });

  it("compõe o modo desconto somente com a taxa personalizada", () => {
    expect(
      composeProductFinancialPayload({
        mode: "discount",
        discountSelection: OTHER_DISCOUNT_SELECTION,
        customDiscountInput: "37,5",
      }),
    ).toEqual({ purchaseDiscountBps: 3750 });
  });

  it("rejeita o campo ativo inválido sem usar o rascunho do outro modo", () => {
    expect(
      composeProductFinancialPayload({
        mode: "manual",
        costInput: "",
      }),
    ).toBeNull();
    expect(
      composeProductFinancialPayload({
        mode: "discount",
        discountSelection: OTHER_DISCOUNT_SELECTION,
        customDiscountInput: "100,01",
      }),
    ).toBeNull();
    expect(
      composeProductFinancialPayload({
        mode: "discount",
        discountSelection: null,
        customDiscountInput: "35",
      }),
    ).toBeNull();
  });
});
