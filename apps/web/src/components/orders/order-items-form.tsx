"use client";

import type { CreateClientInput } from "@clientela/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { z } from "zod";
import type {
  OrderActionResult,
  OrderFormClient,
  OrderItemsPayload,
  QuickCreateClientResult,
  SearchClientsResult,
} from "@/app/(crm)/crm/orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, parseBRLToCents } from "@/lib/format";
import { orderItemFieldsSchema } from "@/lib/order-item-schema";
import {
  orderEstimatedTotalCents,
  orderItemSubtotalCents,
} from "@/lib/order-total";
import { ClientSelect } from "./client-select";
import { QuickClientForm } from "./quick-client-form";

// ---------------------------------------------------------------------------
// Constantes de UI (sem magic strings — core.md)
// ---------------------------------------------------------------------------

const PRODUCT_LABEL = "Produto";
const PRODUCT_PLACEHOLDER_OPTION = "Selecione um produto";
const PRODUCT_REQUIRED_MESSAGE = "Selecione um produto";
const QTY_LABEL = "Quantidade";
const UNIT_COST_LABEL = "Custo unitário (R$)";
const UNIT_COST_HINT = "Vazio usa o custo atual do produto";
const UNIT_COST_INVALID_MESSAGE = "Custo inválido — use o formato 12,34";
const SUBTOTAL_LABEL = "Subtotal";
const REMOVE_ITEM_LABEL = "Remover item";
const ADD_ITEM_LABEL = "Adicionar item";
const NO_VALUE_TEXT = "—";
const MONEY_PLACEHOLDER = "0,00";
const STOCK_LABEL = "Estoque";

const CLIENT_LABEL = "Cliente (opcional)";
const NEW_CLIENT_LABEL = "Nova cliente";

const ITEMS_HEADING = "Itens";
const NO_ITEMS_TEXT =
  "Nenhum item ainda. Adicione produtos manualmente ou pela sugestão de estoque baixo abaixo.";

const LOW_STOCK_HEADING = "Sugestão: estoque baixo";
const LOW_STOCK_HINT =
  "Produtos com estoque baixo. Adicione com um toque (quantidade 1, ajustável depois).";
const LOW_STOCK_ADD_LABEL = "Adicionar";

const TOTAL_LABEL = "Total estimado";
const TOTAL_HINT = "Valor confirmado no servidor";

const SUBMITTING_LABEL = "Salvando...";

const NEW_ITEM_QTY = "1";
const NEW_ITEM_UNIT_COST = "";
const NEW_ITEM_CLIENT_ID = "";

// ---------------------------------------------------------------------------
// Dados recebidos do RSC (server-first — RF-08: filtro de estoque baixo já
// resolvido no servidor, o client component só renderiza).
// ---------------------------------------------------------------------------

export type OrderFormProduct = {
  id: string;
  name: string;
  costCents: number;
  stockQty: number;
};

export type OrderItemFieldDefault = {
  productId: string;
  qty: string;
  unitCost: string;
  clientId: string;
};

export type OrderItemsFormProps = {
  products: OrderFormProduct[];
  lowStockProducts: OrderFormProduct[];
  clients: OrderFormClient[];
  searchClientsAction: (term: string) => Promise<SearchClientsResult>;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
  defaultItems?: OrderItemFieldDefault[];
  onSubmit: (values: OrderItemsPayload) => Promise<OrderActionResult>;
  submitLabel: string;
};

// ---------------------------------------------------------------------------
// Schema de UI local sobre o contrato (padrão `product-form.tsx`): reusa os
// campos de `orderItemFieldsSchema` (mesmo shape de `createOrderSchema`/
// `replaceOrderItemsSchema`, ver `lib/order-item-schema.ts`) — a fonte única de
// validação numérica permanece em `packages/shared`. `clientId` (RF-05) segue
// a mesma lesson do zodResolver: string vazia do `<select>` vira `undefined`
// ANTES de passar pelo schema do contrato (que aceita uuid/null/undefined) —
// a chave sobrevive ao parse porque está declarada no schema.
// ---------------------------------------------------------------------------

const stringToInt = (value: string): number =>
  value.trim().length === 0 ? Number.NaN : Number(value.trim());

// Tipo de retorno inclui `null` (mesmo o transform nunca emitindo `null` na
// prática) só para casar com o tipo de ENTRADA do `.pipe()` seguinte
// (`orderItemFieldsSchema.shape.clientId` aceita uuid/null/undefined) — sem
// isso o `pipe` não tipa (constraint exige o mesmo union).
const emptyStringToUndefined = (value: string): string | null | undefined =>
  value.trim().length === 0 ? undefined : value;

const orderItemFormSchema = z.object({
  productId: z
    .string()
    .min(1, PRODUCT_REQUIRED_MESSAGE)
    .pipe(orderItemFieldsSchema.shape.productId),
  clientId: z
    .string()
    .transform(emptyStringToUndefined)
    .pipe(orderItemFieldsSchema.shape.clientId),
  qty: z.string().transform(stringToInt).pipe(orderItemFieldsSchema.shape.qty),
  unitCost: z
    .string()
    .transform((value, ctx) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return undefined;
      }
      const cents = parseBRLToCents(trimmed);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: UNIT_COST_INVALID_MESSAGE });
        return z.NEVER;
      }
      return cents;
    })
    .pipe(orderItemFieldsSchema.shape.unitCostCents),
});

const orderItemsFormSchema = z.object({
  items: z.array(orderItemFormSchema),
});

type OrderItemsFormFieldValues = z.input<typeof orderItemsFormSchema>;
type OrderItemsFormValues = z.output<typeof orderItemsFormSchema>;

const EMPTY_ITEM: OrderItemsFormFieldValues["items"][number] = {
  productId: "",
  clientId: NEW_ITEM_CLIENT_ID,
  qty: NEW_ITEM_QTY,
  unitCost: NEW_ITEM_UNIT_COST,
};

// ---------------------------------------------------------------------------
// Linha de item (produto + cliente + quantidade + custo opcional + subtotal)
// ---------------------------------------------------------------------------

function OrderItemRow({
  index,
  control,
  register,
  setValue,
  errors,
  products,
  clients,
  searchClientsAction,
  quickCreateClientAction,
  isQuickCreateOpen,
  onOpenQuickCreate,
  onCloseQuickCreate,
  onClientCreated,
  onRemove,
}: {
  index: number;
  control: Control<OrderItemsFormFieldValues, unknown, OrderItemsFormValues>;
  register: UseFormRegister<OrderItemsFormFieldValues>;
  setValue: UseFormSetValue<OrderItemsFormFieldValues>;
  errors: FieldErrors<OrderItemsFormFieldValues>;
  products: OrderFormProduct[];
  clients: OrderFormClient[];
  searchClientsAction: (term: string) => Promise<SearchClientsResult>;
  quickCreateClientAction: (
    values: CreateClientInput,
  ) => Promise<QuickCreateClientResult>;
  isQuickCreateOpen: boolean;
  onOpenQuickCreate: () => void;
  onCloseQuickCreate: () => void;
  onClientCreated: (client: OrderFormClient) => void;
  onRemove: () => void;
}) {
  const productId = useWatch({ control, name: `items.${index}.productId` });
  const clientId =
    useWatch({ control, name: `items.${index}.clientId` }) ??
    NEW_ITEM_CLIENT_ID;
  const qty = useWatch({ control, name: `items.${index}.qty` });
  const unitCost = useWatch({ control, name: `items.${index}.unitCost` });

  const product = products.find((item) => item.id === productId) ?? null;
  const fallbackCents = product?.costCents ?? null;
  const subtotal = orderItemSubtotalCents(
    qty ?? "",
    unitCost ?? "",
    fallbackCents,
  );
  const subtotalText = subtotal === null ? NO_VALUE_TEXT : formatBRL(subtotal);

  const itemErrors = errors.items?.[index];
  const productError = itemErrors?.productId?.message;
  const qtyError = itemErrors?.qty?.message;
  const unitCostError = itemErrors?.unitCost?.message;

  const productFieldId = `item-${index}-product`;
  const qtyId = `item-${index}-qty`;
  const unitCostId = `item-${index}-unit-cost`;
  const clientFieldId = `item-${index}-client`;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={productFieldId}>{PRODUCT_LABEL}</Label>
        <select
          id={productFieldId}
          aria-invalid={productError ? true : undefined}
          aria-describedby={
            productError ? `${productFieldId}-error` : undefined
          }
          className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-9 md:text-sm"
          {...register(`items.${index}.productId`)}
        >
          <option value="">{PRODUCT_PLACEHOLDER_OPTION}</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {product ? (
          <p className="text-xs text-muted-foreground">
            {STOCK_LABEL}: {product.stockQty}
          </p>
        ) : null}
        {productError ? (
          <p
            id={`${productFieldId}-error`}
            className="text-sm text-destructive"
          >
            {productError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <ClientSelect
          id={clientFieldId}
          label={CLIENT_LABEL}
          value={clientId}
          onChange={(nextClientId) =>
            setValue(`items.${index}.clientId`, nextClientId, {
              shouldDirty: true,
            })
          }
          clients={clients}
          searchClientsAction={searchClientsAction}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenQuickCreate}
          className="w-fit gap-1.5"
        >
          <UserPlus className="size-4" aria-hidden />
          {NEW_CLIENT_LABEL}
        </Button>
        {isQuickCreateOpen ? (
          <QuickClientForm
            idPrefix={`item-${index}`}
            onCreated={(client) => {
              onClientCreated(client);
              setValue(`items.${index}.clientId`, client.id, {
                shouldDirty: true,
              });
            }}
            onCancel={onCloseQuickCreate}
            quickCreateClientAction={quickCreateClientAction}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            {...register(`items.${index}.qty`)}
          />
          {qtyError ? (
            <p id={`${qtyId}-error`} className="text-sm text-destructive">
              {qtyError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={unitCostId}>{UNIT_COST_LABEL}</Label>
          <Input
            id={unitCostId}
            type="text"
            inputMode="decimal"
            placeholder={
              product
                ? formatBRL(product.costCents).replace("R$ ", "")
                : MONEY_PLACEHOLDER
            }
            className="h-11 md:h-9"
            aria-invalid={unitCostError ? true : undefined}
            aria-describedby={
              unitCostError
                ? `${unitCostId}-hint ${unitCostId}-error`
                : `${unitCostId}-hint`
            }
            {...register(`items.${index}.unitCost`)}
          />
          <p
            id={`${unitCostId}-hint`}
            className="text-xs text-muted-foreground"
          >
            {UNIT_COST_HINT}
          </p>
          {unitCostError ? (
            <p id={`${unitCostId}-error`} className="text-sm text-destructive">
              {unitCostError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{SUBTOTAL_LABEL}:</span>{" "}
          {subtotalText}
        </p>
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sugestão de estoque baixo (RF-08): lista JÁ FILTRADA pelo RSC — o
// componente só renderiza e delega a inclusão em um toque ao `append` do
// `useFieldArray` do form pai.
// ---------------------------------------------------------------------------

function LowStockSuggestions({
  products,
  onAdd,
}: {
  products: OrderFormProduct[];
  onAdd: (product: OrderFormProduct) => void;
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-muted/40 p-4">
      <h2 className="font-heading text-base font-semibold">
        {LOW_STOCK_HEADING}
      </h2>
      <p className="text-sm text-muted-foreground">{LOW_STOCK_HINT}</p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {products.map((product) => (
          <li
            key={product.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {product.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {STOCK_LABEL}: {product.stockQty}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAdd(product)}
              className="shrink-0 gap-1"
            >
              <Plus className="size-4" aria-hidden />
              {LOW_STOCK_ADD_LABEL}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Form de itens do pedido (Client Component — RF-01/RF-02/RF-05/RF-06/RF-07/
// RF-08). Lista dinâmica (useFieldArray, padrão `sale-form.tsx`), SEM mínimo
// de 1 item (o pedido pode nascer/ficar vazio — RF-01/RF-02); sugestão de
// estoque baixo com inclusão em um toque; total estimado client-side
// (informativo — o total oficial é sempre calculado no servidor). Reusado em
// modo criação (`createOrderAction`) e edição de rascunho
// (`replaceOrderItemsAction` vinculada por `.bind`, mesmo padrão de
// `updateProductAction.bind` — referência DIRETA da Server Action, lesson
// 2026-07-19).
//
// Cliente por item (RF-05/RF-06): `clients` (prop, lista inicial do RSC) é
// mesclada com `extraClients` (clientes recém-criadas pelo cadastro rápido,
// estado deste componente — visíveis em TODAS as linhas, não só na que
// disparou o cadastro) ANTES de descer para cada `ClientSelect`, que soma por
// cima os resultados da busca digitada. Só uma seção de cadastro rápido fica
// aberta por vez (`quickCreateOpenIndex`).
// ---------------------------------------------------------------------------

export function OrderItemsForm({
  products,
  lowStockProducts,
  clients,
  searchClientsAction,
  quickCreateClientAction,
  defaultItems,
  onSubmit,
  submitLabel,
}: OrderItemsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [extraClients, setExtraClients] = useState<OrderFormClient[]>([]);
  const [quickCreateOpenIndex, setQuickCreateOpenIndex] = useState<
    number | null
  >(null);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OrderItemsFormFieldValues, unknown, OrderItemsFormValues>({
    resolver: zodResolver(orderItemsFormSchema),
    defaultValues: { items: defaultItems ?? [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchedItems = useWatch({ control, name: "items" }) ?? [];
  const estimatedTotal = orderEstimatedTotalCents(
    watchedItems.map((item) => ({
      qty: item.qty ?? "",
      unitCost: item.unitCost ?? "",
      fallbackCents:
        products.find((product) => product.id === item.productId)?.costCents ??
        null,
    })),
  );

  const clientOptions = useMemo(
    () => [...extraClients, ...clients],
    [clients, extraClients],
  );

  const handleClientCreated = (client: OrderFormClient) => {
    setExtraClients((previous) => [...previous, client]);
    setQuickCreateOpenIndex(null);
  };

  const addLowStockItem = (product: OrderFormProduct) => {
    append({
      productId: product.id,
      clientId: NEW_ITEM_CLIENT_ID,
      qty: NEW_ITEM_QTY,
      unitCost: NEW_ITEM_UNIT_COST,
    });
  };

  const submit = (values: OrderItemsFormValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSubmit({ items: values.items });
      // Sucesso no modo criação ⇒ a action redireciona (a promise não resolve
      // com valor); no modo edição ⇒ `{ ok: true }` e a página revalida.
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
      <LowStockSuggestions
        products={lowStockProducts}
        onAdd={addLowStockItem}
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">{ITEMS_HEADING}</h2>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">{NO_ITEMS_TEXT}</p>
        ) : null}
        {fields.map((field, index) => (
          <OrderItemRow
            key={field.id}
            index={index}
            control={control}
            register={register}
            setValue={setValue}
            errors={errors}
            products={products}
            clients={clientOptions}
            searchClientsAction={searchClientsAction}
            quickCreateClientAction={quickCreateClientAction}
            isQuickCreateOpen={quickCreateOpenIndex === index}
            onOpenQuickCreate={() => setQuickCreateOpenIndex(index)}
            onCloseQuickCreate={() => setQuickCreateOpenIndex(null)}
            onClientCreated={handleClientCreated}
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
          {formatBRL(estimatedTotal)}
        </p>
        <p className="text-xs text-muted-foreground">{TOTAL_HINT}</p>
      </section>

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
        {isPending ? SUBMITTING_LABEL : submitLabel}
      </Button>
    </form>
  );
}
