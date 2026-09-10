import {
  type CreateProduct,
  calculateDiscountedCostCents,
  type Paginated,
  type Product,
  type ProductsListQuery,
  type ProductsSummary,
  type UpdateProduct,
} from "@clientela/shared";
import { ProductNotFoundError } from "./products.errors";

const INVALID_CREATE_COST_MESSAGE =
  "Informe o custo diretamente ou o desconto de compra.";

type ResolvedCreateProduct = Omit<
  CreateProduct,
  "costCents" | "purchaseDiscountBps"
> & {
  costCents: number;
  purchaseDiscountBps: number | null;
};

// Dados de inserção resolvidos pelo service: o custo é sempre materializado e
// a taxa é sempre normalizada para `number | null` antes de tocar o banco.
export type InsertProduct = ResolvedCreateProduct & { consultantId: string };

export type ProductUpdateResolver = (
  current: Product,
  patch: UpdateProduct,
) => UpdateProduct;

export const resolveProductCreate = (
  input: CreateProduct,
): ResolvedCreateProduct => {
  const purchaseDiscountBps = input.purchaseDiscountBps;
  if (purchaseDiscountBps !== undefined && purchaseDiscountBps !== null) {
    return {
      ...input,
      costCents: calculateDiscountedCostCents(
        input.priceCents,
        purchaseDiscountBps,
      ),
      purchaseDiscountBps,
    };
  }

  if (input.costCents === undefined) {
    // Estado impossível após createProductSchema; mantém a função segura para
    // chamadas internas diretas sem transformar falha de contrato em NaN.
    throw new Error(INVALID_CREATE_COST_MESSAGE);
  }

  return {
    ...input,
    costCents: input.costCents,
    purchaseDiscountBps: null,
  };
};

// Regra financeira pura do PATCH. O retorno contém somente as chaves enviadas
// e as chaves financeiras que precisam ser derivadas para manter a invariante.
// O repository a executa com a versão da linha já bloqueada na transação.
export const resolveProductUpdate: ProductUpdateResolver = (current, patch) => {
  const { costCents, purchaseDiscountBps, ...submittedPatch } = patch;

  if (costCents !== undefined) {
    return {
      ...submittedPatch,
      costCents,
      purchaseDiscountBps: null,
    };
  }

  if (purchaseDiscountBps === null) {
    return {
      ...submittedPatch,
      purchaseDiscountBps: null,
    };
  }

  const effectiveDiscountBps =
    purchaseDiscountBps ?? current.purchaseDiscountBps;
  const pricingChanged =
    purchaseDiscountBps !== undefined || patch.priceCents !== undefined;

  if (effectiveDiscountBps !== null && pricingChanged) {
    const effectivePriceCents = patch.priceCents ?? current.priceCents;
    return {
      ...submittedPatch,
      ...(purchaseDiscountBps === undefined ? {} : { purchaseDiscountBps }),
      costCents: calculateDiscountedCostCents(
        effectivePriceCents,
        effectiveDiscountBps,
      ),
    };
  }

  return submittedPatch;
};

export type ListProductsParams = {
  page: number;
  perPage: number;
  search?: string;
  lowStock?: boolean;
};

// Porta mínima do repositório (api.md: o service não conhece Drizzle nem o
// schema). TODA operação recebe `consultantId` para escopar por consultora.
// `update`/`delete` devolvem undefined/false quando nada casa no escopo — o
// service traduz isso em ProductNotFoundError.
export type ProductsRepositoryPort = {
  insert: (product: InsertProduct) => Promise<Product>;
  findById: (consultantId: string, id: string) => Promise<Product | undefined>;
  update: (
    consultantId: string,
    id: string,
    patch: UpdateProduct,
    resolve: ProductUpdateResolver,
  ) => Promise<Product | undefined>;
  delete: (consultantId: string, id: string) => Promise<boolean>;
  list: (
    consultantId: string,
    params: ListProductsParams,
  ) => Promise<{ rows: Product[]; total: number }>;
  summary: (consultantId: string) => Promise<ProductsSummary>;
};

export type ProductsServiceDeps = {
  repository: ProductsRepositoryPort;
};

export type ProductsService = ReturnType<typeof createProductsService>;

export const createProductsService = ({ repository }: ProductsServiceDeps) => {
  const create = (
    consultantId: string,
    input: CreateProduct,
  ): Promise<Product> =>
    repository.insert({ consultantId, ...resolveProductCreate(input) });

  const getById = async (
    consultantId: string,
    id: string,
  ): Promise<Product> => {
    const product = await repository.findById(consultantId, id);
    if (!product) {
      throw new ProductNotFoundError();
    }
    return product;
  };

  const update = async (
    consultantId: string,
    id: string,
    patch: UpdateProduct,
  ): Promise<Product> => {
    const updated = await repository.update(
      consultantId,
      id,
      patch,
      resolveProductUpdate,
    );
    if (!updated) {
      throw new ProductNotFoundError();
    }
    return updated;
  };

  const remove = async (consultantId: string, id: string): Promise<void> => {
    const deleted = await repository.delete(consultantId, id);
    if (!deleted) {
      throw new ProductNotFoundError();
    }
  };

  const list = async (
    consultantId: string,
    query: ProductsListQuery,
  ): Promise<Paginated<Product>> => {
    const { rows, total } = await repository.list(consultantId, {
      page: query.page,
      perPage: query.perPage,
      search: query.search,
      lowStock: query.lowStock,
    });

    return {
      data: rows,
      page: query.page,
      perPage: query.perPage,
      total,
    };
  };

  const summary = (consultantId: string): Promise<ProductsSummary> =>
    repository.summary(consultantId);

  return { create, getById, update, remove, list, summary };
};
