import type { LeadCaptureRequest } from "@clientela/shared";
import { describe, expect, it } from "vitest";
import { createLeadsService, type LeadsRepositoryPort } from "./leads.service";

type InsertedLead = Parameters<LeadsRepositoryPort["insert"]>[0];

const REPO_ID = "11111111-1111-7111-8111-111111111111";
const SYNTHETIC_ID = "99999999-9999-7999-8999-999999999999";
const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");

const createFakeRepository = () => {
  const calls: InsertedLead[] = [];
  const repository: LeadsRepositoryPort = {
    insert: async (lead) => {
      calls.push(lead);
      return { id: REPO_ID };
    },
  };
  return { repository, calls };
};

const buildService = (repository: LeadsRepositoryPort) =>
  createLeadsService({
    repository,
    clock: () => FIXED_NOW,
    generateId: () => SYNTHETIC_ID,
  });

const validInput = (
  overrides: Partial<LeadCaptureRequest> = {},
): LeadCaptureRequest => ({
  name: "Maria Silva",
  whatsapp: "11987654321",
  consent: true,
  ...overrides,
});

describe("leadsService.capture", () => {
  it("persiste lead válido com consent_at do clock e retorna o id do repositório", async () => {
    const { repository, calls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(
      validInput({ interest: "Base líquida" }),
    );

    expect(result).toEqual({ id: REPO_ID });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      name: "Maria Silva",
      whatsapp: "11987654321",
      interest: "Base líquida",
      consentAt: FIXED_NOW,
    });
  });

  it("trata website não-vazio como bot: id sintético e nada persistido", async () => {
    const { repository, calls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(
      validInput({ website: "http://spam.example" }),
    );

    expect(result).toEqual({ id: SYNTHETIC_ID });
    expect(calls).toHaveLength(0);
  });

  it("persiste quando website é string vazia (campo hidden do humano)", async () => {
    const { repository, calls } = createFakeRepository();
    const service = buildService(repository);

    const result = await service.capture(validInput({ website: "" }));

    expect(result).toEqual({ id: REPO_ID });
    expect(calls).toHaveLength(1);
  });

  it("persiste quando website está ausente", async () => {
    const { repository, calls } = createFakeRepository();
    const service = buildService(repository);

    await service.capture(validInput());

    expect(calls).toHaveLength(1);
  });

  it("propaga erro do repositório", async () => {
    const failing: LeadsRepositoryPort = {
      insert: async () => {
        throw new Error("db indisponível");
      },
    };
    const service = buildService(failing);

    await expect(service.capture(validInput())).rejects.toThrow(
      "db indisponível",
    );
  });
});
