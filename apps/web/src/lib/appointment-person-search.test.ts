import { describe, expect, it } from "vitest";
import { activeSearchHasNoResults } from "./appointment-person-search";

describe("activeSearchHasNoResults", () => {
  it("termo vazio nunca oferece cadastro, mesmo com status idle e zero resultados", () => {
    expect(activeSearchHasNoResults("", "idle", 0)).toBe(false);
  });

  it("termo só com espaços conta como vazio", () => {
    expect(activeSearchHasNoResults("   ", "idle", 0)).toBe(false);
  });

  it("busca em carregamento (loading) não oferece cadastro", () => {
    expect(activeSearchHasNoResults("maria", "loading", 0)).toBe(false);
  });

  it("busca com erro não oferece cadastro", () => {
    expect(activeSearchHasNoResults("maria", "error", 0)).toBe(false);
  });

  it("busca idle com resultados não oferece cadastro", () => {
    expect(activeSearchHasNoResults("maria", "idle", 3)).toBe(false);
  });

  it("busca idle, termo preenchido e zero resultados oferece cadastro", () => {
    expect(activeSearchHasNoResults("maria", "idle", 0)).toBe(true);
  });
});
