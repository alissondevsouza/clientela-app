import type {
  CreateProduct,
  Paginated,
  Product,
  ProductsListQuery,
  ProductsSummary,
  UpdateProduct,
} from "@clientela/shared";
import { ProductNotFoundError } from "./products.errors";

// Dados de inserção: os campos validados na fronteira mais a consultora da
// sessão (nunca do body — RF-03). O service compõe; o repository persiste.
export type InsertProduct = CreateProduct & { consultantId: string };

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
  ): Promise<Product> => repository.insert({ consultantId, ...input });

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

  // `patch` já vem validado da fronteira (updateProductSchema): chaves ausentes
  // = não alterar; `null` explícito em `brandCode` = limpar. O service apenas
  // repassa — o repository monta o SET (o `null` chega intacto ao banco).
  const update = async (
    consultantId: string,
    id: string,
    patch: UpdateProduct,
  ): Promise<Product> => {
    const updated = await repository.update(consultantId, id, patch);
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
