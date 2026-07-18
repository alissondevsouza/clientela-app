import { describe, expect, it } from "vitest";
import { buildProductMessage, featuredCatalog } from "./products";

describe("buildProductMessage", () => {
  it("inclui o nome do produto na mensagem", () => {
    const message = buildProductMessage("Sérum facial hidratante (exemplo)");

    expect(message).toContain("Sérum facial hidratante (exemplo)");
  });

  it("gera texto em pt-BR pedindo o produto", () => {
    const message = buildProductMessage("Batom matte");

    expect(message).toBe("Olá! Quero pedir o produto Batom matte.");
  });

  it("inclui o nome de cada produto do catálogo na respectiva mensagem", () => {
    for (const product of featuredCatalog.products) {
      expect(buildProductMessage(product.name)).toContain(product.name);
    }
  });
});
