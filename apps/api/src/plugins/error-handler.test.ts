import { Elysia } from "elysia";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorHandler } from "./error-handler";

const SECRET_INTERNAL_DETAIL = "detalhe interno com segredo do servidor";

const buildTestApp = () =>
  new Elysia()
    .use(errorHandler)
    .post("/echo", ({ body }) => body, {
      body: z.object({
        name: z.string().min(2, "Informe um nome com ao menos 2 caracteres"),
      }),
    })
    .get("/boom", () => {
      throw new Error(SECRET_INTERNAL_DETAIL);
    });

const postJson = (
  app: ReturnType<typeof buildTestApp>,
  path: string,
  body: unknown,
) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("errorHandler", () => {
  it("mapeia erro de validação para 422 com a primeira mensagem Zod", async () => {
    const app = buildTestApp();

    const response = await postJson(app, "/echo", { name: "a" });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Informe um nome com ao menos 2 caracteres",
      },
    });
  });

  it("mapeia erro inesperado para 500 sem vazar internals no body", async () => {
    const app = buildTestApp();

    const response = await app.handle(new Request("http://localhost/boom"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocorreu um erro inesperado. Tente novamente em instantes.",
      },
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_INTERNAL_DETAIL);
  });

  it("mapeia JSON malformado (PARSE) para 400 INVALID_BODY sem cair no 500", async () => {
    const app = buildTestApp();

    const response = await app.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not valid json",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: "INVALID_BODY",
        message: "Corpo da requisição inválido.",
      },
    });
  });

  it("mapeia rota inexistente para 404 com envelope", async () => {
    const app = buildTestApp();

    const response = await app.handle(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Recurso não encontrado." },
    });
  });
});
