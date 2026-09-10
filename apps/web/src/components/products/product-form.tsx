"use client";

import {
  type CreateProductInput,
  createProductSchema,
} from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import type { ProductActionResult } from "@/app/(crm)/crm/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToReaisInput, formatBRL, parseBRLToCents } from "@/lib/format";
import {
  buildProductPricingPreview,
  composeProductFinancialPayload,
  formatMarginPercentage,
  OTHER_DISCOUNT_SELECTION,
  type ProductPricingDraft,
  PURCHASE_DISCOUNT_PRESETS,
  purchaseDiscountDraftFromBasisPoints,
} from "@/lib/product-pricing";
import { cn } from "@/lib/utils";

const NAME_ID = "product-name";
const BRAND_CODE_ID = "product-brand-code";
const PRICE_ID = "product-price";
const COST_MODE_HELP_ID = "product-cost-mode-help";
const DISCOUNT_HELP_ID = "product-discount-help";
const CUSTOM_DISCOUNT_ID = "product-custom-discount";
const MANUAL_COST_ID = "product-manual-cost";
const STOCK_QTY_ID = "product-stock-qty";
const LOW_STOCK_ID = "product-low-stock-threshold";

const NAME_LABEL = "Nome";
const BRAND_CODE_LABEL = "Código Mary Kay";
const PRICE_LABEL = "Preço sugerido (R$)";
const MANUAL_COST_LABEL = "Custo (R$)";
const STOCK_QTY_LABEL = "Estoque";
const LOW_STOCK_LABEL = "Alerta de estoque baixo";

const DISCOUNT_MODE = "discount";
const MANUAL_MODE = "manual";
const DISCOUNT_MODE_LABEL = "Desconto da consultora";
const MANUAL_MODE_LABEL = "Informar custo diretamente";
const COST_MODE_LEGEND = "Como deseja informar o custo?";
const COST_MODE_HELP =
  "Escolha o desconto recebido na compra ou informe o valor pago diretamente.";
const DISCOUNT_LEGEND = "Qual é o desconto de compra?";
const DISCOUNT_HELP =
  "Escolha uma opção. Em Outro, informe um percentual de 0% a 100%.";
const CUSTOM_DISCOUNT_LABEL = "Percentual personalizado (%)";
const CUSTOM_DISCOUNT_HELP = "Use até duas casas decimais, por exemplo 37,5%.";
const DISCOUNT_REQUIRED_MESSAGE = "Escolha o desconto de compra";
const DISCOUNT_INVALID_MESSAGE =
  "Informe um desconto entre 0% e 100% com até duas casas decimais";

const OPTIONAL_HINT = "(opcional)";
const SUBMITTING_LABEL = "Salvando...";
const MONEY_PLACEHOLDER = "0,00";
const PERCENTAGE_PLACEHOLDER = "37,5";
const LOW_STOCK_HELP =
  "O produto é marcado como estoque baixo quando a quantidade em mãos for menor ou igual a este valor.";
const PREVIEW_LABEL = "Prévia financeira";
const COST_PREVIEW_LABEL = "Você paga";
const MARGIN_PREVIEW_LABEL = "Margem bruta estimada";
const MARGIN_DISCLAIMER =
  "Estimativa bruta sobre o preço sugerido; não representa lucro líquido.";

const COST_INVALID_MESSAGE = "Custo inválido — use o formato 12,34";
const PRICE_INVALID_MESSAGE = "Preço inválido — use o formato 12,34";

type PricingMode = typeof DISCOUNT_MODE | typeof MANUAL_MODE;

const emptyToUndefined = (value: string): string | null | undefined =>
  value.trim().length === 0 ? undefined : value;

const reaisToCents = (
  invalidMessage: string,
  contractField: typeof createProductSchema.shape.priceCents,
) =>
  z
    .string()
    .transform((value, context) => {
      const cents = parseBRLToCents(value);
      if (cents === null) {
        context.addIssue({ code: "custom", message: invalidMessage });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(contractField);

const stringToInt = (value: string): number =>
  value.trim().length === 0 ? Number.NaN : Number(value);

const discountSelectionSchema = z
  .enum(["3000", "3500", "4000", OTHER_DISCOUNT_SELECTION])
  .nullable();

const manualCostSchema = createProductSchema.shape.costCents.unwrap();

const productFormSchema = z
  .object({
    name: createProductSchema.shape.name,
    brandCode: z
      .string()
      .transform(emptyToUndefined)
      .pipe(createProductSchema.shape.brandCode),
    priceCents: reaisToCents(
      PRICE_INVALID_MESSAGE,
      createProductSchema.shape.priceCents,
    ),
    pricingMode: z.enum([DISCOUNT_MODE, MANUAL_MODE]),
    costCents: z.string(),
    discountSelection: discountSelectionSchema,
    customDiscountInput: z.string(),
    stockQty: z
      .string()
      .transform(stringToInt)
      .pipe(createProductSchema.shape.stockQty.unwrap()),
    lowStockThreshold: z
      .string()
      .transform(stringToInt)
      .pipe(createProductSchema.shape.lowStockThreshold.unwrap()),
  })
  .superRefine((values, context) => {
    if (values.pricingMode === MANUAL_MODE) {
      const costCents = parseBRLToCents(values.costCents);
      if (costCents === null) {
        context.addIssue({
          code: "custom",
          path: ["costCents"],
          message: COST_INVALID_MESSAGE,
        });
        return;
      }

      const parsedCost = manualCostSchema.safeParse(costCents);
      if (!parsedCost.success) {
        context.addIssue({
          code: "custom",
          path: ["costCents"],
          message:
            parsedCost.error.issues.at(0)?.message ?? COST_INVALID_MESSAGE,
        });
      }
      return;
    }

    const financialPayload = composeProductFinancialPayload({
      mode: DISCOUNT_MODE,
      discountSelection: values.discountSelection,
      customDiscountInput: values.customDiscountInput,
    });
    if (financialPayload !== null) {
      return;
    }

    const isCustom = values.discountSelection === OTHER_DISCOUNT_SELECTION;
    context.addIssue({
      code: "custom",
      path: [isCustom ? "customDiscountInput" : "discountSelection"],
      message: isCustom ? DISCOUNT_INVALID_MESSAGE : DISCOUNT_REQUIRED_MESSAGE,
    });
  });

type ProductFormFieldValues = z.input<typeof productFormSchema>;
type ProductFormValues = z.output<typeof productFormSchema>;

const EMPTY_VALUES: ProductFormFieldValues = {
  name: "",
  brandCode: "",
  priceCents: "",
  pricingMode: DISCOUNT_MODE,
  costCents: "",
  discountSelection: null,
  customDiscountInput: "",
  stockQty: "0",
  lowStockThreshold: "1",
};

export type ProductFormMode = "create" | "edit";

export type ProductFormProps = {
  mode: ProductFormMode;
  submitLabel: string;
  onSubmit: (values: CreateProductInput) => Promise<ProductActionResult>;
  defaultValues?: Partial<ProductFormFieldValues>;
  purchaseDiscountBps?: number | null;
};

const toPricingDraft = (
  values: Pick<
    ProductFormFieldValues,
    "pricingMode" | "costCents" | "discountSelection" | "customDiscountInput"
  >,
): ProductPricingDraft =>
  values.pricingMode === MANUAL_MODE
    ? { mode: MANUAL_MODE, costInput: values.costCents }
    : {
        mode: DISCOUNT_MODE,
        discountSelection: values.discountSelection,
        customDiscountInput: values.customDiscountInput,
      };

const buildPayload = (
  mode: ProductFormMode,
  values: ProductFormValues,
): CreateProductInput | null => {
  const financialPayload = composeProductFinancialPayload(
    toPricingDraft(values),
  );
  if (financialPayload === null) {
    return null;
  }

  const base = {
    name: values.name,
    priceCents: values.priceCents,
    stockQty: values.stockQty,
    lowStockThreshold: values.lowStockThreshold,
    ...financialPayload,
  };
  if (mode === "edit") {
    return { ...base, brandCode: values.brandCode ?? null };
  }
  return { ...base, brandCode: values.brandCode };
};

export function ProductForm({
  mode,
  submitLabel,
  onSubmit,
  defaultValues,
  purchaseDiscountBps,
}: ProductFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialDiscountDraft = purchaseDiscountDraftFromBasisPoints(
    purchaseDiscountBps ?? null,
  );
  const initialPricingMode: PricingMode =
    purchaseDiscountBps !== undefined && purchaseDiscountBps !== null
      ? DISCOUNT_MODE
      : mode === "edit"
        ? MANUAL_MODE
        : DISCOUNT_MODE;
  const persistedCostInput = defaultValues?.costCents ?? "";
  const persistedCostInputRef = useRef(persistedCostInput);
  const hasManualDraftRef = useRef(initialPricingMode === MANUAL_MODE);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ProductFormFieldValues, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      ...EMPTY_VALUES,
      ...defaultValues,
      pricingMode: initialPricingMode,
      costCents: initialPricingMode === MANUAL_MODE ? persistedCostInput : "",
      discountSelection: initialDiscountDraft.selection,
      customDiscountInput: initialDiscountDraft.customPercentage,
    },
  });

  const [
    pricingMode,
    priceInput,
    costInput,
    discountSelection,
    customDiscountInput,
  ] = useWatch({
    control,
    name: [
      "pricingMode",
      "priceCents",
      "costCents",
      "discountSelection",
      "customDiscountInput",
    ],
  });

  const pricingDraft = toPricingDraft({
    pricingMode,
    costCents: costInput,
    discountSelection,
    customDiscountInput,
  });
  const preview = buildProductPricingPreview(priceInput, pricingDraft);

  const pricingModeRegistration = register("pricingMode");
  const handlePricingModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (
      event.currentTarget.value === MANUAL_MODE &&
      !hasManualDraftRef.current
    ) {
      const nextManualCost =
        preview !== null
          ? centsToReaisInput(preview.costCents)
          : persistedCostInputRef.current;
      setValue("costCents", nextManualCost, { shouldDirty: true });
      hasManualDraftRef.current = true;
    }

    clearErrors(["costCents", "discountSelection", "customDiscountInput"]);
    void pricingModeRegistration.onChange(event);
  };

  const submit = (values: ProductFormValues) => {
    const payload = buildPayload(mode, values);
    if (payload === null) {
      const isManual = values.pricingMode === MANUAL_MODE;
      const isCustom = values.discountSelection === OTHER_DISCOUNT_SELECTION;
      setError(
        isManual
          ? "costCents"
          : isCustom
            ? "customDiscountInput"
            : "discountSelection",
        {
          type: "manual",
          message: isManual
            ? COST_INVALID_MESSAGE
            : isCustom
              ? DISCOUNT_INVALID_MESSAGE
              : DISCOUNT_REQUIRED_MESSAGE,
        },
      );
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      const result = await onSubmit(payload);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    });
  };

  const nameError = errors.name?.message;
  const brandCodeError = errors.brandCode?.message;
  const priceError = errors.priceCents?.message;
  const costError = errors.costCents?.message;
  const discountSelectionError = errors.discountSelection?.message;
  const customDiscountError = errors.customDiscountInput?.message;
  const stockQtyError = errors.stockQty?.message;
  const lowStockError = errors.lowStockThreshold?.message;

  const discountDescription = `${DISCOUNT_HELP_ID}${
    discountSelectionError ? ` ${DISCOUNT_HELP_ID}-error` : ""
  }`;
  const customDiscountDescription = `${CUSTOM_DISCOUNT_ID}-help${
    customDiscountError ? ` ${CUSTOM_DISCOUNT_ID}-error` : ""
  }`;

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-5"
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

      <fieldset
        aria-describedby={COST_MODE_HELP_ID}
        className="flex flex-col gap-2"
      >
        <legend className="text-sm font-medium">{COST_MODE_LEGEND}</legend>
        <p id={COST_MODE_HELP_ID} className="text-xs text-muted-foreground">
          {COST_MODE_HELP}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label
            htmlFor="product-cost-mode-discount"
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
              "transition-colors focus-within:ring-3 focus-within:ring-ring/50",
              pricingMode === DISCOUNT_MODE
                ? "border-primary bg-primary/5"
                : "border-input bg-background hover:bg-muted",
            )}
          >
            <input
              id="product-cost-mode-discount"
              type="radio"
              value={DISCOUNT_MODE}
              className="size-5 shrink-0 accent-primary"
              {...pricingModeRegistration}
              onChange={handlePricingModeChange}
            />
            <span className="font-medium">{DISCOUNT_MODE_LABEL}</span>
          </label>
          <label
            htmlFor="product-cost-mode-manual"
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
              "transition-colors focus-within:ring-3 focus-within:ring-ring/50",
              pricingMode === MANUAL_MODE
                ? "border-primary bg-primary/5"
                : "border-input bg-background hover:bg-muted",
            )}
          >
            <input
              id="product-cost-mode-manual"
              type="radio"
              value={MANUAL_MODE}
              className="size-5 shrink-0 accent-primary"
              {...pricingModeRegistration}
              onChange={handlePricingModeChange}
            />
            <span className="font-medium">{MANUAL_MODE_LABEL}</span>
          </label>
        </div>
      </fieldset>

      {pricingMode === DISCOUNT_MODE ? (
        <fieldset
          aria-invalid={discountSelectionError ? true : undefined}
          aria-describedby={discountDescription}
          className="flex flex-col gap-2"
        >
          <legend className="text-sm font-medium">{DISCOUNT_LEGEND}</legend>
          <p id={DISCOUNT_HELP_ID} className="text-xs text-muted-foreground">
            {DISCOUNT_HELP}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PURCHASE_DISCOUNT_PRESETS.map((preset) => {
              const inputId = `product-discount-${preset.selection}`;
              return (
                <label
                  key={preset.selection}
                  htmlFor={inputId}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    "transition-colors focus-within:ring-3 focus-within:ring-ring/50",
                    discountSelection === preset.selection
                      ? "border-primary bg-primary/5"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  <input
                    id={inputId}
                    type="radio"
                    value={preset.selection}
                    className="size-5 shrink-0 accent-primary"
                    aria-describedby={discountDescription}
                    {...register("discountSelection")}
                  />
                  <span className="font-medium">{preset.label}</span>
                </label>
              );
            })}
            <label
              htmlFor="product-discount-other"
              className={cn(
                "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm",
                "transition-colors focus-within:ring-3 focus-within:ring-ring/50",
                discountSelection === OTHER_DISCOUNT_SELECTION
                  ? "border-primary bg-primary/5"
                  : "border-input bg-background hover:bg-muted",
              )}
            >
              <input
                id="product-discount-other"
                type="radio"
                value={OTHER_DISCOUNT_SELECTION}
                className="size-5 shrink-0 accent-primary"
                aria-describedby={discountDescription}
                {...register("discountSelection")}
              />
              <span className="font-medium">Outro</span>
            </label>
          </div>
          {discountSelectionError ? (
            <p
              id={`${DISCOUNT_HELP_ID}-error`}
              className="text-sm text-destructive"
            >
              {discountSelectionError}
            </p>
          ) : null}

          {discountSelection === OTHER_DISCOUNT_SELECTION ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <Label htmlFor={CUSTOM_DISCOUNT_ID}>
                {CUSTOM_DISCOUNT_LABEL}
              </Label>
              <Input
                id={CUSTOM_DISCOUNT_ID}
                type="text"
                inputMode="decimal"
                placeholder={PERCENTAGE_PLACEHOLDER}
                className="h-11 md:h-9"
                aria-invalid={customDiscountError ? true : undefined}
                aria-describedby={customDiscountDescription}
                {...register("customDiscountInput")}
              />
              <p
                id={`${CUSTOM_DISCOUNT_ID}-help`}
                className="text-xs text-muted-foreground"
              >
                {CUSTOM_DISCOUNT_HELP}
              </p>
              {customDiscountError ? (
                <p
                  id={`${CUSTOM_DISCOUNT_ID}-error`}
                  className="text-sm text-destructive"
                >
                  {customDiscountError}
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={MANUAL_COST_ID}>{MANUAL_COST_LABEL}</Label>
          <Input
            id={MANUAL_COST_ID}
            type="text"
            inputMode="decimal"
            placeholder={MONEY_PLACEHOLDER}
            className="h-11 md:h-9"
            aria-invalid={costError ? true : undefined}
            aria-describedby={costError ? `${MANUAL_COST_ID}-error` : undefined}
            {...register("costCents")}
          />
          {costError ? (
            <p
              id={`${MANUAL_COST_ID}-error`}
              className="text-sm text-destructive"
            >
              {costError}
            </p>
          ) : null}
        </div>
      )}

      {preview !== null ? (
        <section
          aria-label={PREVIEW_LABEL}
          aria-live="polite"
          className="rounded-xl bg-muted/60 p-4 ring-1 ring-foreground/10"
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{COST_PREVIEW_LABEL}</dt>
              <dd className="text-base font-semibold">
                {formatBRL(preview.costCents)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{MARGIN_PREVIEW_LABEL}</dt>
              <dd className="text-base font-semibold">
                {formatBRL(preview.marginCents)} (
                {formatMarginPercentage(preview.marginBps)})
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {MARGIN_DISCLAIMER}
          </p>
        </section>
      ) : null}

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
