"use client";

import {
  type CreateProductInput,
  createProductSchema,
} from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ProductActionResult } from "@/app/(crm)/crm/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBRLToCents } from "@/lib/format";

const NAME_ID = "product-name";
const BRAND_CODE_ID = "product-brand-code";
const COST_ID = "product-cost";
const PRICE_ID = "product-price";
const STOCK_QTY_ID = "product-stock-qty";
const LOW_STOCK_ID = "product-low-stock-threshold";

const NAME_LABEL = "Nome";
const BRAND_CODE_LABEL = "Código Mary Kay";
const COST_LABEL = "Custo (R$)";
const PRICE_LABEL = "Preço (R$)";
const STOCK_QTY_LABEL = "Estoque";
const LOW_STOCK_LABEL = "Alerta de estoque baixo";

const OPTIONAL_HINT = "(opcional)";
const SUBMITTING_LABEL = "Salvando...";
const MONEY_PLACEHOLDER = "0,00";
const LOW_STOCK_HELP =
  "O produto é marcado como estoque baixo quando a quantidade em mãos for menor ou igual a este valor.";

const COST_INVALID_MESSAGE = "Custo inválido — use o formato 12,34";
const PRICE_INVALID_MESSAGE = "Preço inválido — use o formato 12,34";

// String vazia de campo opcional vira `undefined` ANTES de validar, para não
// falhar a checagem de tamanho de um campo em branco. Retorno tipado com `null`
// (além de `undefined`) só para casar a variância do `.pipe` com o campo
// `nullable` do contrato; em runtime um campo vazio sempre vira `undefined` (o
// mapeamento para `null` no EDIT é feito em `buildPayload`).
const emptyToUndefined = (value: string): string | null | undefined =>
  value.trim().length === 0 ? undefined : value;

// Campo de dinheiro digitado em reais (pt-BR): a string é convertida para
// centavos inteiros por `parseBRLToCents` (aritmética de string, sem float —
// core.md/database.md). Entrada inválida vira issue de campo pt-BR (retorno
// `z.NEVER`); o valor válido segue para o schema do contrato, que aplica o teto
// (R$ 1.000.000,00) com a mensagem pt-BR já definida em `packages/shared`.
const reaisToCents = (
  invalidMessage: string,
  contractField: typeof createProductSchema.shape.costCents,
) =>
  z
    .string()
    .transform((value, ctx) => {
      const cents = parseBRLToCents(value);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: invalidMessage });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(contractField);

// Inteiro digitado em input numérico: string → número (vazio vira `NaN` para
// cair na mensagem pt-BR de "número inteiro" do contrato, em vez de virar 0
// silenciosamente). O schema do contrato aplica inteiro/≥ 0/teto.
const stringToInt = (value: string): number =>
  value.trim().length === 0 ? Number.NaN : Number(value);

const productFormSchema = z.object({
  name: createProductSchema.shape.name,
  brandCode: z
    .string()
    .transform(emptyToUndefined)
    .pipe(createProductSchema.shape.brandCode),
  costCents: reaisToCents(
    COST_INVALID_MESSAGE,
    createProductSchema.shape.costCents,
  ),
  priceCents: reaisToCents(
    PRICE_INVALID_MESSAGE,
    createProductSchema.shape.priceCents,
  ),
  // `.unwrap()` remove o `.default` do campo do contrato: o transform sempre
  // produz um número (nunca `undefined`), então o default do CREATE não se aplica
  // aqui — reusamos apenas a validação inteiro/≥ 0/teto com as mensagens pt-BR.
  stockQty: z
    .string()
    .transform(stringToInt)
    .pipe(createProductSchema.shape.stockQty.unwrap()),
  lowStockThreshold: z
    .string()
    .transform(stringToInt)
    .pipe(createProductSchema.shape.lowStockThreshold.unwrap()),
});

// Input (z.input): todos os campos são `string` (inputs controlados desde o
// primeiro render). Output (z.output): reais viram centavos, inteiros viram
// número e o código opcional vira `string | null | undefined`.
type ProductFormFieldValues = z.input<typeof productFormSchema>;
type ProductFormValues = z.output<typeof productFormSchema>;

const EMPTY_VALUES: ProductFormFieldValues = {
  name: "",
  brandCode: "",
  costCents: "",
  priceCents: "",
  stockQty: "0",
  lowStockThreshold: "1",
};

export type ProductFormMode = "create" | "edit";

export type ProductFormProps = {
  mode: ProductFormMode;
  submitLabel: string;
  onSubmit: (values: CreateProductInput) => Promise<ProductActionResult>;
  defaultValues?: Partial<ProductFormFieldValues>;
};

// Monta o payload enviado à action. No EDIT, o código Mary Kay vazio (undefined)
// vira `null` explícito para LIMPAR o campo no PATCH (decisão do plan); no CREATE
// o vazio permanece `undefined` e é omitido do corpo.
const buildPayload = (
  mode: ProductFormMode,
  values: ProductFormValues,
): CreateProductInput => {
  const base = {
    name: values.name,
    costCents: values.costCents,
    priceCents: values.priceCents,
    stockQty: values.stockQty,
    lowStockThreshold: values.lowStockThreshold,
  };
  if (mode === "edit") {
    return { ...base, brandCode: values.brandCode ?? null };
  }
  return { ...base, brandCode: values.brandCode };
};

// Form de produto (Client Component, folha da árvore): reusado em cadastro e
// edição. RHF + zodResolver com um schema de UI local (reais na tela) que
// converte para o contrato compartilhado em centavos no submit — a fonte única
// de validação numérica permanece em `packages/shared`. Estados de web.md:
// enviando (botão desabilitado + "Salvando...") e erro do servidor (pt-BR em
// `role="alert"`); erros de campo em pt-BR sob cada input.
export function ProductForm({
  mode,
  submitLabel,
  onSubmit,
  defaultValues,
}: ProductFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormFieldValues, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  const submit = (values: ProductFormValues) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await onSubmit(buildPayload(mode, values));
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const nameError = errors.name?.message;
  const brandCodeError = errors.brandCode?.message;
  const costError = errors.costCents?.message;
  const priceError = errors.priceCents?.message;
  const stockQtyError = errors.stockQty?.message;
  const lowStockError = errors.lowStockThreshold?.message;

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={NAME_ID}>{NAME_LABEL}</Label>
        <Input
          id={NAME_ID}
          type="text"
          className="h-11 md:h-9"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${NAME_ID}-error` : undefined}
          {...register("name")}
        />
        {nameError ? (
          <p id={`${NAME_ID}-error`} className="text-sm text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={BRAND_CODE_ID}>
          {BRAND_CODE_LABEL}{" "}
          <span className="text-muted-foreground">{OPTIONAL_HINT}</span>
        </Label>
        <Input
          id={BRAND_CODE_ID}
          type="text"
          className="h-11 md:h-9"
          aria-invalid={brandCodeError ? true : undefined}
          aria-describedby={
            brandCodeError ? `${BRAND_CODE_ID}-error` : undefined
          }
          {...register("brandCode")}
        />
        {brandCodeError ? (
          <p id={`${BRAND_CODE_ID}-error`} className="text-sm text-destructive">
            {brandCodeError}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={COST_ID}>{COST_LABEL}</Label>
          <Input
            id={COST_ID}
            type="text"
            inputMode="decimal"
            placeholder={MONEY_PLACEHOLDER}
            className="h-11 md:h-9"
            aria-invalid={costError ? true : undefined}
            aria-describedby={costError ? `${COST_ID}-error` : undefined}
            {...register("costCents")}
          />
          {costError ? (
            <p id={`${COST_ID}-error`} className="text-sm text-destructive">
              {costError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={PRICE_ID}>{PRICE_LABEL}</Label>
          <Input
            id={PRICE_ID}
            type="text"
            inputMode="decimal"
            placeholder={MONEY_PLACEHOLDER}
            className="h-11 md:h-9"
            aria-invalid={priceError ? true : undefined}
            aria-describedby={priceError ? `${PRICE_ID}-error` : undefined}
            {...register("priceCents")}
          />
          {priceError ? (
            <p id={`${PRICE_ID}-error`} className="text-sm text-destructive">
              {priceError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={STOCK_QTY_ID}>{STOCK_QTY_LABEL}</Label>
          <Input
            id={STOCK_QTY_ID}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="h-11 md:h-9"
            aria-invalid={stockQtyError ? true : undefined}
            aria-describedby={
              stockQtyError ? `${STOCK_QTY_ID}-error` : undefined
            }
            {...register("stockQty")}
          />
          {stockQtyError ? (
            <p
              id={`${STOCK_QTY_ID}-error`}
              className="text-sm text-destructive"
            >
              {stockQtyError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={LOW_STOCK_ID}>{LOW_STOCK_LABEL}</Label>
          <Input
            id={LOW_STOCK_ID}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className="h-11 md:h-9"
            aria-invalid={lowStockError ? true : undefined}
            aria-describedby={`${LOW_STOCK_ID}-help${
              lowStockError ? ` ${LOW_STOCK_ID}-error` : ""
            }`}
            {...register("lowStockThreshold")}
          />
          <p
            id={`${LOW_STOCK_ID}-help`}
            className="text-xs text-muted-foreground"
          >
            {LOW_STOCK_HELP}
          </p>
          {lowStockError ? (
            <p
              id={`${LOW_STOCK_ID}-error`}
              className="text-sm text-destructive"
            >
              {lowStockError}
            </p>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="h-11 w-full text-base md:w-auto md:self-start md:px-6"
      >
        {isPending ? SUBMITTING_LABEL : submitLabel}
      </Button>
    </form>
  );
}
