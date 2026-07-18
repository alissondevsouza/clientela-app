import { describe, expect, it } from "vitest";
import {
  authConsultantSchema,
  loginRequestSchema,
  loginResponseSchema,
} from "./auth";

describe("loginRequestSchema", () => {
  it("aceita credenciais válidas", () => {
    const result = loginRequestSchema.parse({
      email: "consultora@example.com",
      password: "senha-secreta",
    });
    expect(result.email).toBe("consultora@example.com");
    expect(result.password).toBe("senha-secreta");
  });

  it("rejeita e-mail malformado com mensagem pt-BR", () => {
    const result = loginRequestSchema.safeParse({
      email: "nao-e-email",
      password: "senha-secreta",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Informe um e-mail válido");
    expect(message).not.toMatch(/invalid|expected|received/i);
  });

  it("rejeita senha vazia com mensagem pt-BR", () => {
    const result = loginRequestSchema.safeParse({
      email: "consultora@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const passwordIssue = result.error.issues.find((issue) =>
      issue.path.includes("password"),
    );
    expect(passwordIssue?.message).toBe("Informe sua senha");
  });

  it("dá mensagem pt-BR quando o e-mail está ausente (invalid_type)", () => {
    const result = loginRequestSchema.safeParse({ password: "senha-secreta" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const emailIssue = result.error.issues.find((issue) =>
      issue.path.includes("email"),
    );
    expect(emailIssue?.message).toBe("Informe um e-mail válido");
    expect(emailIssue?.message).not.toMatch(/invalid|expected|received/i);
  });

  it("dá mensagem pt-BR quando a senha está ausente (invalid_type)", () => {
    const result = loginRequestSchema.safeParse({
      email: "consultora@example.com",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const passwordIssue = result.error.issues.find((issue) =>
      issue.path.includes("password"),
    );
    expect(passwordIssue?.message).toBe("Informe sua senha");
    expect(passwordIssue?.message).not.toMatch(/invalid|expected|received/i);
  });

  it("dá mensagens pt-BR para body totalmente ausente ({})", () => {
    const result = loginRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const emailIssue = result.error.issues.find((issue) =>
      issue.path.includes("email"),
    );
    const passwordIssue = result.error.issues.find((issue) =>
      issue.path.includes("password"),
    );
    expect(emailIssue?.message).toBe("Informe um e-mail válido");
    expect(passwordIssue?.message).toBe("Informe sua senha");
    for (const issue of result.error.issues) {
      expect(issue.message).not.toMatch(/invalid|expected|received/i);
    }
  });
});

describe("authConsultantSchema", () => {
  it("aceita dados públicos da consultora", () => {
    const result = authConsultantSchema.parse({
      id: "018f8c1e-7b2a-7e00-9c3a-1b2c3d4e5f60",
      name: "Mary Kay",
      email: "consultora@example.com",
    });
    expect(result.name).toBe("Mary Kay");
  });

  it("rejeita id que não é uuid", () => {
    const result = authConsultantSchema.safeParse({
      id: "123",
      name: "Mary Kay",
      email: "consultora@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("ignora campos extras como password_hash (nunca ecoa segredo)", () => {
    const result = authConsultantSchema.parse({
      id: "018f8c1e-7b2a-7e00-9c3a-1b2c3d4e5f60",
      name: "Mary Kay",
      email: "consultora@example.com",
      password_hash: "hash-secreto",
    });
    expect("password_hash" in result).toBe(false);
  });
});

describe("loginResponseSchema", () => {
  const validConsultant = {
    id: "018f8c1e-7b2a-7e00-9c3a-1b2c3d4e5f60",
    name: "Mary Kay",
    email: "consultora@example.com",
  } as const;

  it("aceita resposta de login válida", () => {
    const result = loginResponseSchema.parse({
      token: "opaque-token",
      expiresAt: "2026-08-16T12:00:00.000Z",
      consultant: validConsultant,
    });
    expect(result.token).toBe("opaque-token");
    expect(result.consultant.email).toBe("consultora@example.com");
  });

  it("rejeita expiresAt que não é ISO 8601", () => {
    const result = loginResponseSchema.safeParse({
      token: "opaque-token",
      expiresAt: "16/08/2026",
      consultant: validConsultant,
    });
    expect(result.success).toBe(false);
  });
});
