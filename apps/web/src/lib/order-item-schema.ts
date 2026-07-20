import { replaceOrderItemsSchema } from "@clientela/shared";

// Schema do item de pedido (productId/qty/unitCostCents), reaproveitado do
// contrato compartilhado — `createOrderSchema.items` e
// `replaceOrderItemsSchema.items` usam exatamente o mesmo item schema
// internamente, então expor via `replaceOrderItemsSchema` (sem `.default`, sem
// precisar de `.unwrap()`) é suficiente para os dois modos do form. Vive em
// `lib/` (função pura, sem diretiva) para poder ser importado tanto por
// Server quanto Client Components (lesson 2026-07-18).
export const orderItemFieldsSchema =
  replaceOrderItemsSchema.shape.items.element;
