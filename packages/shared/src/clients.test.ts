import { describe, expect, it } from "vitest";
import {
  clientsListQuerySchema,
  createClientSchema,
  updateClientSchema,
} from "./clients";

const validMinimal = {
  name: "Maria Silva",
  whatsapp: "(11) 98765-4321",
} as const;

describe("createClientSchema", () => {
  it("aceita o mínimo válido e normaliza o whatsapp para dígitos", () => {
    const result = createClientSchema.parse(validMinimal);
    expect(result.name).toBe("Maria Silva");
    expect(result.whatsapp).toBe("11987654321");
    expect(result.birthday).toBeUndefined();
  });

  it("rejeita nome curto com mensagem pt-BR", () => {
    const result = createClientSchema.safeParse({ ...validMinimal, name: "M" });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Informe o nome da cliente (mínimo 2 caracteres)");
  });

  it("dá mensagem pt-BR quando o nome está ausente (invalid_type)", () => {
    const result = createClientSchema.safeParse({
      whatsapp: "11987654321",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    const message = result.error.issues[0]?.message ?? "";
    expect(message).toBe("Informe o nome da cliente (mínimo 2 caracteres)");
    expect(message).not.toMatch(/invalid input|expected string|received/i);
  });

  it("rejeita whatsapp inválido com mensagem pt-BR", () => {
    const result = createClientSchema.safeParse({
      ...validMinimal,
      whatsapp: "8765-4321",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "Informe um WhatsApp válido com DDD",
    );
  });

  it("rejeita birthday no futuro com mensagem pt-BR", () => {
    const result = createClientSchema.safeParse({
      ...validMinimal,
      birthday: "2999-01-01",
    });
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "A data de nascimento não pode ser futura",
    );
  });

  it("aceita birthday passado", () => {
    const result = createClientSchema.parse({
      ...validMinimal,
      birthday: "1990-05-20",
    });
    expect(result.birthday).toBe("1990-05-20");
  });

  it("aceita birthday null explícito (não informado)", () => {
    const result = createClientSchema.parse({
      ...validMinimal,
      birthday: null,
    });
    expect(result.birthday).toBeNull();
  });
});

describe("updateClientSchema", () => {
  it("rejeita body vazio com mensagem pt-BR", () => {
    const result = updateClientSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("esperava falha de validação");
    }
    expect(result.error.issues[0]?.message).toBe(
      "Informe ao menos um campo para atualizar",
    );
  });

  it("aceita null explícito para limpar e preserva null no output", () => {
    const result = updateClientSchema.parse({ birthday: null });
    expect(result).toEqual({ birthday: null });
    expect(result.birthday).toBeNull();
  });

  it("não injeta chaves para campos ausentes", () => {
    const result = updateClientSchema.parse({ name: "Nova Maria" });
    expect(Object.keys(result)).toEqual(["name"]);
    expect("birthday" in result).toBe(false);
    expect("skinTone" in result).toBe(false);
    expect("notes" in result).toBe(false);
  });
});

describe("clientsListQuerySchema", () => {
  it("aplica defaults de paginação e aceita search opcional", () => {
    const result = clientsListQuerySchema.parse({ search: "mar" });
    expect(result).toEqual({ page: 1, perPage: 20, search: "mar" });
  });

  it("rejeita search acima de 100 caracteres com mensagem pt-BR", () => {
    const result = clientsListQuerySchema.safeParse({
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
