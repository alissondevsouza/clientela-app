"use client";

import {
  type CreateSaleInput,
  createSaleSchema,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  paymentMethodValues,
} from "@clientela/shared";
import { X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetError,
  type UseFormSetValue,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import type {
  ClientSearchItem,
  ProductSearchItem,
  SalesActionResult,
} from "@/app/(crm)/crm/sales/actions";
import {
  createSaleAction,
  searchClientsAction,
  searchProductsAction,
} from "@/app/(crm)/crm/sales/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToReaisInput, formatBRL, parseBRLToCents } from "@/lib/format";
import {
  installmentAmountPreviewCents,
  lineSubtotalCents,
  totalCents,
} from "@/lib/sale-total";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constantes de UI (sem magic strings — core.md)
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LEN = 2;
const CREDIT_METHOD: PaymentMethod = "credit";
const INSTALLMENTS_MIN = 1;
const INSTALLMENTS_MAX = 24;

const CLIENT_SECTION_LABEL = "Cliente";
const CLIENT_OPTIONAL_HINT = "(opcional)";
const CLIENT_SEARCH_PLACEHOLDER = "Buscar cliente pelo nome";
const CLIENT_CLEAR_LABEL = "Remover cliente";
const NO_CLIENT_HINT = "Venda sem cliente identificada";

const ITEMS_SECTION_LABEL = "Itens";
const PRODUCT_SEARCH_PLACEHOLDER = "Buscar produto";
const PRODUCT_CHANGE_LABEL = "Trocar produto";
const PRICE_LABEL = "Preço unitário (R$)";
const QTY_LABEL = "Quantidade";
const SUBTOTAL_LABEL = "Subtotal";
const STOCK_AVAILABLE_LABEL = "Estoque disponível";
const REMOVE_ITEM_LABEL = "Remover item";
const ADD_ITEM_LABEL = "Adicionar item";
const NO_VALUE_TEXT = "—";

const TOTAL_LABEL = "Total";
const TOTAL_HINT = "Valor confirmado no servidor";

const PAYMENT_SECTION_LABEL = "Forma de pagamento";
const INSTALLMENTS_LABEL = "Número de parcelas";
const FIRST_DUE_DATE_LABEL = "Primeiro vencimento";

const SEARCHING_TEXT = "Buscando...";
const SEARCH_ERROR_TEXT = "Não foi possível buscar agora. Tente novamente.";
const NO_RESULTS_TEXT = "Nenhum resultado encontrado.";

const SUBMIT_LABEL = "Registrar venda";
const SUBMITTING_LABEL = "Registrando...";
const MONEY_PLACEHOLDER = "0,00";

const PRODUCT_REQUIRED_MESSAGE = "Selecione um produto";
const PRICE_INVALID_MESSAGE = "Preço inválido — use o formato 12,34";
const REVIEW_MESSAGE =
  "Revise os campos destacados antes de registrar a venda.";

// ---------------------------------------------------------------------------
// Valores do formulário (strings nos inputs controlados; conversão p/ o contrato
// em centavos/números acontece no submit — a fonte única de validação numérica
// permanece em `packages/shared`).
// ---------------------------------------------------------------------------

type ItemFieldValues = {
  productId: string;
  productName: string;
  stockQty: number | null;
  price: string;
  qty: string;
};

type SaleFormValues = {
  clientId: string | null;
  clientName: string;
  items: ItemFieldValues[];
  paymentMethod: PaymentMethod;
  installments: string;
  firstDueDate: string;
};

const EMPTY_ITEM: ItemFieldValues = {
  productId: "",
  productName: "",
  stockQty: null,
  price: "",
  qty: "1",
};

const EMPTY_VALUES: SaleFormValues = {
  clientId: null,
  clientName: "",
  items: [EMPTY_ITEM],
  paymentMethod: "cash",
  installments: "1",
  firstDueDate: "",
};

// Preço em reais → centavos, ou `undefined` quando o formato pt-BR não casa
// (`parseBRLToCents` retorna `null`). `undefined` no payload sinaliza "sem preço
// válido" — o form marca o erro de campo antes de enviar.
const parseBRLOrUndefined = (input: string): number | undefined => {
  const cents = parseBRLToCents(input);
  return cents === null ? undefined : cents;
};

// ---------------------------------------------------------------------------
// Busca assíncrona debounced (reusa as Server Actions finas — o browser nunca
// fala com a API direto, ADR-0008). Fetchers em nível de módulo = referências
// estáveis (não re-disparam o efeito).
// ---------------------------------------------------------------------------

type AsyncSearchState<T> = {
  status: "idle" | "loading" | "error";
  items: T[];
};

const fetchClients = async (
  term: string,
): Promise<{ ok: true; items: ClientSearchItem[] } | { ok: false }> => {
  const result = await searchClientsAction(term);
  return result.ok ? { ok: true, items: result.clients } : { ok: false };
};

const fetchProducts = async (
  term: string,
): Promise<{ ok: true; items: ProductSearchItem[] } | { ok: false }> => {
  const result = await searchProductsAction(term);
  return result.ok ? { ok: true, items: result.products } : { ok: false };
};

function useAsyncSearch<T>(
  fetcher: (term: string) => Promise<{ ok: true; items: T[] } | { ok: false }>,
): {
  term: string;
  setTerm: (value: string) => void;
  state: AsyncSearchState<T>;
} {
  const [term, setTerm] = useState("");
  const [state, setState] = useState<AsyncSearchState<T>>({
    status: "idle",
    items: [],
  });

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_SEARCH_LEN) {
      setState({ status: "idle", items: [] });
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, status: "loading" }));
    const timer = setTimeout(async () => {
      const result = await fetcher(trimmed);
      if (!active) {
        return;
      }
      setState(
        result.ok
          ? { status: "idle", items: result.items }
          : { status: "error", items: [] },
      );
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, fetcher]);

  return { term, setTerm, state };
}

// Lista de resultados abaixo do input de busca: estados obrigatórios (carregando,
// erro, vazio — web.md). Opções são botões reais (navegáveis por teclado, alvo
// de toque amplo). Só renderiza quando há termo digitado (≥ mínimo).
function SearchResults<T extends { id: string }>({
  state,
  hasTerm,
  renderOption,
  onSelect,
}: {
  state: AsyncSearchState<T>;
  hasTerm: boolean;
  renderOption: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;
}) {
  if (!hasTerm) {
    return null;
  }
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">{SEARCHING_TEXT}</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {SEARCH_ERROR_TEXT}
      </p>
    );
  }
  if (state.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{NO_RESULTS_TEXT}</p>;
  }
  return (
    <ul className="flex flex-col gap-1 rounded-lg bg-muted/40 p-1">
      {state.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            {renderOption(item)}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Seletor de cliente (opcional)
// ---------------------------------------------------------------------------

function ClientSelector({
  clientId,
  clientName,
  onSelect,
  onClear,
}: {
  clientId: string | null;
  clientName: string;
  onSelect: (client: ClientSearchItem) => void;
  onClear: () => void;
}) {
  const { term, setTerm, state } = useAsyncSearch(fetchClients);

  const handleSelect = (client: ClientSearchItem) => {
    setTerm("");
    onSelect(client);
  };

  if (clientId !== null && clientId.length > 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {clientName}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="shrink-0"
        >
          <X className="size-4" aria-hidden />
          {CLIENT_CLEAR_LABEL}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="text"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={CLIENT_SEARCH_PLACEHOLDER}
        aria-label={CLIENT_SEARCH_PLACEHOLDER}
        className="h-11 md:h-9"
      />
      <SearchResults
        state={state}
        hasTerm={term.trim().length >= MIN_SEARCH_LEN}
        onSelect={handleSelect}
        renderOption={(client) => (
          <span className="flex flex-col">
            <span className="font-medium">{client.name}</span>
            <span className="text-xs text-muted-foreground">
              {client.whatsapp}
            </span>
          </span>
        )}
      />
      <p className="text-xs text-muted-foreground">{NO_CLIENT_HINT}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha de item (produto + preço + quantidade + subtotal)
// ---------------------------------------------------------------------------

const itemProductIdName = (index: number): `items.${number}.productId` =>
  `items.${index}.productId`;
const itemPriceName = (index: number): `items.${number}.price` =>
  `items.${index}.price`;
const itemQtyName = (index: number): `items.${number}.qty` =>
  `items.${index}.qty`;

function ItemRow({
  index,
  control,
  register,
  setValue,
  errors,
  canRemove,
  onRemove,
}: {
  index: number;
  control: Control<SaleFormValues>;
  register: UseFormRegister<SaleFormValues>;
  setValue: UseFormSetValue<SaleFormValues>;
  errors: FieldErrors<SaleFormValues>;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { term, setTerm, state } = useAsyncSearch(fetchProducts);

  const productId = useWatch({ control, name: itemProductIdName(index) });
  const productName = useWatch({
    control,
    name: `items.${index}.productName`,
  });
  const stockQty = useWatch({ control, name: `items.${index}.stockQty` });
  const price = useWatch({ control, name: itemPriceName(index) });
  const qty = useWatch({ control, name: itemQtyName(index) });

  const priceId = `item-${index}-price`;
  const qtyId = `item-${index}-qty`;

  const itemErrors = errors.items?.[index];
  const productError = itemErrors?.productId?.message;
  const priceError = itemErrors?.price?.message;
  const qtyError = itemErrors?.qty?.message;

  const subtotal = lineSubtotalCents(price ?? "", qty ?? "");
  const subtotalText = subtotal === null ? NO_VALUE_TEXT : formatBRL(subtotal);

  const handleSelectProduct = (product: ProductSearchItem) => {
    setTerm("");
    setValue(itemProductIdName(index), product.id, { shouldValidate: false });
    setValue(`items.${index}.productName`, product.name);
    setValue(`items.${index}.stockQty`, product.stockQty);
    setValue(itemPriceName(index), centsToReaisInput(product.priceCents));
  };

  const handleClearProduct = () => {
    setValue(itemProductIdName(index), "");
    setValue(`items.${index}.productName`, "");
    setValue(`items.${index}.stockQty`, null);
    setValue(itemPriceName(index), "");
  };

  const hasProduct = productId !== undefined && productId.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      {hasProduct ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{productName}</span>
            <span className="text-xs text-muted-foreground">
              {STOCK_AVAILABLE_LABEL}: {stockQty ?? NO_VALUE_TEXT}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearProduct}
            className="shrink-0"
          >
            {PRODUCT_CHANGE_LABEL}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={PRODUCT_SEARCH_PLACEHOLDER}
            aria-label={PRODUCT_SEARCH_PLACEHOLDER}
            aria-invalid={productError ? true : undefined}
            className="h-11 md:h-9"
          />
          <SearchResults
            state={state}
            hasTerm={term.trim().length >= MIN_SEARCH_LEN}
            onSelect={handleSelectProduct}
            renderOption={(product) => (
              <span className="flex flex-col">
                <span className="font-medium">{product.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBRL(product.priceCents)} · {STOCK_AVAILABLE_LABEL}:{" "}
                  {product.stockQty}
                </span>
              </span>
            )}
          />
          {productError ? (
            <p className="text-sm text-destructive">{productError}</p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={priceId}>{PRICE_LABEL}</Label>
          <Input
            id={priceId}
            type="text"
            inputMode="decimal"
            placeholder={MONEY_PLACEHOLDER}
            className="h-11 md:h-9"
            aria-invalid={priceError ? true : undefined}
            aria-describedby={priceError ? `${priceId}-error` : undefined}
            {...register(itemPriceName(index))}
          />
          {priceError ? (
            <p id={`${priceId}-error`} className="text-sm text-destructive">
              {priceError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={qtyId}>{QTY_LABEL}</Label>
          <Input
            id={qtyId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="h-11 md:h-9"
            aria-invalid={qtyError ? true : undefined}
            aria-describedby={qtyError ? `${qtyId}-error` : undefined}
            {...register(itemQtyName(index))}
          />
          {qtyError ? (
            <p id={`${qtyId}-error`} className="text-sm text-destructive">
              {qtyError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{SUBTOTAL_LABEL}:</span>{" "}
          {subtotalText}
        </p>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive"
          >
            <X className="size-4" aria-hidden />
            {REMOVE_ITEM_LABEL}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapeamento de issues do contrato → campos do formulário (reusa as mensagens
// pt-BR de `packages/shared`; sem duplicar contrato). Caminhos desconhecidos
// caem na mensagem geral de revisão.
// ---------------------------------------------------------------------------

const applyContractIssues = (
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  setError: UseFormSetError<SaleFormValues>,
): void => {
  for (const issue of issues) {
    const [first, second, third] = issue.path;
    if (first === "items" && typeof second === "number") {
      if (third === "qty") {
        setError(itemQtyName(second), { message: issue.message });
        continue;
      }
      if (third === "unitPriceCents") {
        setError(itemPriceName(second), { message: issue.message });
        continue;
      }
      if (third === "productId") {
        setError(itemProductIdName(second), { message: issue.message });
        continue;
      }
    }
    if (first === "installments") {
      setError("installments", { message: issue.message });
      continue;
    }
    if (first === "firstDueDate") {
      setError("firstDueDate", { message: issue.message });
      continue;
    }
    if (first === "clientId") {
      setError("clientId", { message: issue.message });
    }
  }
};

// Monta o payload do contrato a partir dos valores do form (strings → centavos/
// números). Preço inválido vira `undefined` (o contrato o trata como "usar preço
// atual", mas o preço inválido já é sinalizado ANTES via `PRICE_INVALID_MESSAGE`);
// qty vazia vira `NaN` para cair na mensagem pt-BR do contrato.
const buildPayload = (values: SaleFormValues): CreateSaleInput => {
  const items = values.items.map((item) => {
    const cents = parseBRLOrUndefined(item.price);
    const parsedQty = Number(item.qty.trim());
    return {
      productId: item.productId,
      qty: item.qty.trim().length === 0 ? Number.NaN : parsedQty,
      ...(cents === undefined ? {} : { unitPriceCents: cents }),
    };
  });

  const base: CreateSaleInput = {
    clientId: values.clientId ?? undefined,
    items,
    paymentMethod: values.paymentMethod,
  };

  if (values.paymentMethod !== CREDIT_METHOD) {
    return base;
  }

  const installments = Number(values.installments.trim());
  return {
    ...base,
    installments:
      values.installments.trim().length === 0 ? Number.NaN : installments,
    firstDueDate:
      values.firstDueDate.length === 0 ? undefined : values.firstDueDate,
  };
};

// ---------------------------------------------------------------------------
// Form de venda (Client Component — RF-09). Cliente opcional por busca, itens
// dinâmicos (useFieldArray) com preço editável e subtotal/total ao vivo, forma de
// pagamento com campos condicionais de parcelamento. Submit valida contra o
// contrato compartilhado (mensagens pt-BR por campo), chama a Server Action e
// desabilita o botão durante o envio (anti duplo-clique — plan).
// ---------------------------------------------------------------------------

export function SaleForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<SaleFormValues>({
    defaultValues: EMPTY_VALUES,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const clientId = useWatch({ control, name: "clientId" });
  const clientName = useWatch({ control, name: "clientName" });
  const paymentMethod = useWatch({ control, name: "paymentMethod" });
  const installmentsRaw = useWatch({ control, name: "installments" });
  const watchedItems = useWatch({ control, name: "items" });

  const currentTotal = totalCents(
    (watchedItems ?? []).map((item) => ({
      price: item.price ?? "",
      qty: item.qty ?? "",
    })),
  );

  const isCredit = paymentMethod === CREDIT_METHOD;
  const installmentCount = Number((installmentsRaw ?? "").trim());
  const installmentPreview = isCredit
    ? installmentAmountPreviewCents(currentTotal, installmentCount)
    : null;

  const selectClient = useCallback(
    (client: ClientSearchItem) => {
      setValue("clientId", client.id);
      setValue("clientName", client.name);
    },
    [setValue],
  );

  const clearClient = useCallback(() => {
    setValue("clientId", null);
    setValue("clientName", "");
  }, [setValue]);

  const submit = (values: SaleFormValues) => {
    setFormError(null);
    clearErrors();

    let hasFieldError = false;

    // Erros de UI que o contrato não expressa: produto não escolhido e preço fora
    // do formato pt-BR (o contrato só vê centavos).
    values.items.forEach((item, index) => {
      if (item.productId.length === 0) {
        setError(itemProductIdName(index), {
          message: PRODUCT_REQUIRED_MESSAGE,
        });
        hasFieldError = true;
      }
      if (parseBRLOrUndefined(item.price) === undefined) {
        setError(itemPriceName(index), { message: PRICE_INVALID_MESSAGE });
        hasFieldError = true;
      }
    });

    const parsed = createSaleSchema.safeParse(buildPayload(values));
    if (!parsed.success) {
      applyContractIssues(parsed.error.issues, setError);
      hasFieldError = true;
    }

    if (hasFieldError || !parsed.success) {
      setFormError(REVIEW_MESSAGE);
      return;
    }

    startTransition(async () => {
      const result: SalesActionResult = await createSaleAction(parsed.data);
      // Sucesso ⇒ a action redireciona (a promise não resolve com valor).
      if (!result.ok) {
        setFormError(result.message);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex flex-col gap-6"
    >
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {CLIENT_SECTION_LABEL}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {CLIENT_OPTIONAL_HINT}
          </span>
        </h2>
        <ClientSelector
          clientId={clientId ?? null}
          clientName={clientName ?? ""}
          onSelect={selectClient}
          onClear={clearClient}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          {ITEMS_SECTION_LABEL}
        </h2>
        {fields.map((field, index) => (
          <ItemRow
            key={field.id}
            index={index}
            control={control}
            register={register}
            setValue={setValue}
            errors={errors}
            canRemove={fields.length > 1}
            onRemove={() => remove(index)}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => append(EMPTY_ITEM)}
          className="h-11 w-full md:w-auto md:self-start"
        >
          {ADD_ITEM_LABEL}
        </Button>
      </section>

      <section className="flex flex-col gap-1 rounded-xl bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">{TOTAL_LABEL}</p>
        <p className="font-heading text-2xl font-semibold">
          {formatBRL(currentTotal)}
        </p>
        <p className="text-xs text-muted-foreground">{TOTAL_HINT}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">
          {PAYMENT_SECTION_LABEL}
        </h2>
        <fieldset
          className="flex flex-col gap-2"
          aria-label={PAYMENT_SECTION_LABEL}
        >
          {paymentMethodValues.map((method) => (
            <label
              key={method}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-foreground/10",
                paymentMethod === method && "ring-2 ring-primary",
              )}
            >
              <input
                type="radio"
                value={method}
                className="size-4"
                {...register("paymentMethod")}
              />
              <span className="text-sm font-medium">
                {PAYMENT_METHOD_LABELS[method]}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      {isCredit ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-installments">{INSTALLMENTS_LABEL}</Label>
            <Input
              id="sale-installments"
              type="number"
              inputMode="numeric"
              min={INSTALLMENTS_MIN}
              max={INSTALLMENTS_MAX}
              step={1}
              className="h-11 md:h-9"
              aria-invalid={errors.installments ? true : undefined}
              aria-describedby={
                errors.installments ? "sale-installments-error" : undefined
              }
              {...register("installments")}
            />
            {errors.installments?.message ? (
              <p
                id="sale-installments-error"
                className="text-sm text-destructive"
              >
                {errors.installments.message}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-first-due-date">{FIRST_DUE_DATE_LABEL}</Label>
            <Input
              id="sale-first-due-date"
              type="date"
              className="h-11 md:h-9"
              aria-invalid={errors.firstDueDate ? true : undefined}
              aria-describedby={
                errors.firstDueDate ? "sale-first-due-date-error" : undefined
              }
              {...register("firstDueDate")}
            />
            {errors.firstDueDate?.message ? (
              <p
                id="sale-first-due-date-error"
                className="text-sm text-destructive"
              >
                {errors.firstDueDate.message}
              </p>
            ) : null}
          </div>

          {installmentPreview !== null ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {installmentCount}x de ~{formatBRL(installmentPreview)}
            </p>
          ) : null}
        </section>
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="h-11 w-full text-base md:w-auto md:self-start md:px-6"
      >
        {isPending ? SUBMITTING_LABEL : SUBMIT_LABEL}
      </Button>
    </form>
  );
}
