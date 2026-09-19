import { createSaleSchema } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import {
  buildSaleFormPayload,
  parseSaleFormPrice,
  type SaleFormPayloadValues,
} from "./sale-form-payload";

const PRODUCT_ID = "018f9c2e-4c6a-7b3d-9e21-0a1b2c3d4e5f";
// Fixo no passado distante (não vira data futura com o tempo — evita teste
// que quebra sozinho anos depois).
const PAST_SOLD_ON = "2020-01-01";

const baseValues: SaleFormPayloadValues = {
  clientId: null,
  items: [{ productId: PRODUCT_ID, price: "10,00", qty: "1" }],
  paymentMethod: "cash",
  deliveryStatus: "delivered",
  paymentCondition: "received",
  cardType: "credit",
  installments: "1",
  firstDueDate: "",
  soldOn: PAST_SOLD_ON,
};

describe("buildSaleFormPayload", () => {
  it("inclui soldOn explícito no payload", () => {
    const payload = buildSaleFormPayload(baseValues);
    expect(payload.soldOn).toBe(PAST_SOLD_ON);
  });

  // Lesson 2026-07-17: chave fora do schema é stripada silenciosamente. O
  // formulário NÃO usa `zodResolver` — valida com `safeParse` manual — então a
  // prova de que `soldOn` sobrevive precisa passar pelo `safeParse`, não só
  // pela construção do payload.
  it("soldOn sobrevive a createSaleSchema.safeParse e chega em parsed.data", () => {
    const parsed = createSaleSchema.safeParse(buildSaleFormPayload(baseValues));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.soldOn).toBe(PAST_SOLD_ON);
    }
  });

  it("omite unitPriceCents quando o preço não casa o formato pt-BR", () => {
    const payload = buildSaleFormPayload({
      ...baseValues,
      items: [{ productId: PRODUCT_ID, price: "abc", qty: "1" }],
    });
    expect(payload.items[0]).not.toHaveProperty("unitPriceCents");
  });

  it("qty vazia vira NaN (cai na mensagem pt-BR do contrato, não é omitida)", () => {
    const payload = buildSaleFormPayload({
      ...baseValues,
      items: [{ productId: PRODUCT_ID, price: "10,00", qty: "" }],
    });
    expect(Number.isNaN(payload.items[0]?.qty)).toBe(true);
  });

  it("só inclui cardType quando o método é card", () => {
    const cash = buildSaleFormPayload(baseValues);
    expect(cash).not.toHaveProperty("cardType");

    const card = buildSaleFormPayload({ ...baseValues, paymentMethod: "card" });
    expect(card.cardType).toBe("credit");
  });

  it("só inclui firstDueDate em parcelamento com data preenchida", () => {
    const received = buildSaleFormPayload(baseValues);
    expect(received).not.toHaveProperty("firstDueDate");

    const installments = buildSaleFormPayload({
      ...baseValues,
      paymentCondition: "installments",
      firstDueDate: "2020-02-01",
    });
    expect(installments.firstDueDate).toBe("2020-02-01");
  });
});

describe("parseSaleFormPrice", () => {
  it("converte reais pt-BR em centavos", () => {
    expect(parseSaleFormPrice("10,00")).toBe(1000);
  });

  it("retorna undefined para formato inválido", () => {
    expect(parseSaleFormPrice("abc")).toBeUndefined();
  });
});
