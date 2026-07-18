import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const VALID_URL = "postgres://clientela:clientela@localhost:5432/clientela";

describe("loadEnv", () => {
  it("aceita env válida e aplica default de PORT", () => {
    const env = loadEnv({ DATABASE_URL: VALID_URL });

    expect(env.DATABASE_URL).toBe(VALID_URL);
    expect(env.PORT).toBe(3001);
  });

  it("faz coerção de PORT de string para número", () => {
    const env = loadEnv({ DATABASE_URL: VALID_URL, PORT: "8080" });

    expect(env.PORT).toBe(8080);
  });

  it("rejeita DATABASE_URL ausente citando a variável", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejeita DATABASE_URL malformada", () => {
    expect(() => loadEnv({ DATABASE_URL: "não-é-url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejeita DATABASE_URL com esquema não-postgres citando a variável", () => {
    expect(() =>
      loadEnv({ DATABASE_URL: "http://clientela:clientela@localhost:5433/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("aceita esquema postgresql://", () => {
    const url = "postgresql://clientela:clientela@localhost:5433/clientela";
    const env = loadEnv({ DATABASE_URL: url });

    expect(env.DATABASE_URL).toBe(url);
  });

  it("não vaza o valor inválido na mensagem de erro", () => {
    const secret = "supersecret-nao-numerico";
    let message = "";
    try {
      loadEnv({ DATABASE_URL: "invalido", PORT: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain("invalido");
    expect(message).not.toContain(secret);
  });
});
