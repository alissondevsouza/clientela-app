import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../modules/auth/auth.errors";
import {
  type ConsultantResolverAuthService,
  createConsultantResolver,
  extractBearerToken,
  isUuid,
} from "./route-auth";

describe("extractBearerToken", () => {
  it("retorna null quando o header está ausente", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("retorna null quando o esquema não é Bearer", () => {
    expect(extractBearerToken("Token abc123")).toBeNull();
    expect(extractBearerToken("Basic abc123")).toBeNull();
    expect(extractBearerToken("bearer abc123")).toBeNull();
  });

  it("retorna null quando o token está vazio após o prefixo", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Bearer    ")).toBeNull();
  });

  it("extrai e apara o token de um header válido", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("Bearer   abc123   ")).toBe("abc123");
  });
});

describe("isUuid", () => {
  it("aceita uuid v4 válido", () => {
    expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  });

  it("aceita uuid v7 válido", () => {
    expect(isUuid("018f9e5e-7c2a-7b3d-9f4a-1c2d3e4f5a6b")).toBe(true);
  });

  it("aceita uuid em maiúsculas (case-insensitive)", () => {
    expect(isUuid("F47AC10B-58CC-4372-A567-0E02B2C3D479")).toBe(true);
  });

  it("rejeita strings que não são uuid", () => {
    expect(isUuid("summary")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("123")).toBe(false);
    expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d47")).toBe(false);
    expect(isUuid("f47ac10b58cc4372a5670e02b2c3d479")).toBe(false);
    expect(isUuid("g47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(false);
  });
});

const CONSULTANT_ID = "018f9e5e-7c2a-7b3d-9f4a-1c2d3e4f5a6b";

const fakeAuthService = (
  validate: (token: string) => Promise<{ id: string }>,
): ConsultantResolverAuthService => ({ validateSession: validate });

describe("createConsultantResolver", () => {
  it("resolve o consultantId a partir de um header Bearer válido", async () => {
    const resolve = createConsultantResolver(
      fakeAuthService(async (token) => {
        expect(token).toBe("valid-token");
        return { id: CONSULTANT_ID };
      }),
    );

    await expect(resolve("Bearer valid-token")).resolves.toBe(CONSULTANT_ID);
  });

  it("lança UnauthorizedError quando o header está ausente", async () => {
    const resolve = createConsultantResolver(
      fakeAuthService(async () => {
        throw new Error("não deve validar sem token");
      }),
    );

    await expect(resolve(null)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança UnauthorizedError quando o esquema não é Bearer", async () => {
    const resolve = createConsultantResolver(
      fakeAuthService(async () => {
        throw new Error("não deve validar token malformado");
      }),
    );

    await expect(resolve("Token abc")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("propaga o erro do service quando a sessão é inválida", async () => {
    const resolve = createConsultantResolver(
      fakeAuthService(async () => {
        throw new UnauthorizedError();
      }),
    );

    await expect(resolve("Bearer expired")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
