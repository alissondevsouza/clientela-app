import {
  BASIS_POINTS_PER_PERCENT,
  calculateDiscountedCostCents,
  calculateGrossMargin,
  MONEY_MAX_CENTS,
  purchaseDiscountBpsSchema,
} from "@clientela/shared";
import { parseBRLToCents } from "./format";

const PERCENT_SUFFIX = "%";
const DECIMAL_SEPARATOR = ",";
const PERCENTAGE_INPUT = /^\d+(?:,\d{1,2})?$/;

export const OTHER_DISCOUNT_SELECTION = "other";

export const PURCHASE_DISCOUNT_PRESETS = [
  { selection: "3000", basisPoints: 3000, label: "30%" },
  { selection: "3500", basisPoints: 3500, label: "35%" },
  { selection: "4000", basisPoints: 4000, label: "40%" },
] as const;

export type PurchaseDiscountSelection =
  | (typeof PURCHASE_DISCOUNT_PRESETS)[number]["selection"]
  | typeof OTHER_DISCOUNT_SELECTION;

export type PurchaseDiscountDraft = {
  selection: PurchaseDiscountSelection | null;
  customPercentage: string;
};

export type ProductPricingDraft =
  | { mode: "manual"; costInput: string }
  | {
      mode: "discount";
      discountSelection: PurchaseDiscountSelection | null;
      customDiscountInput: string;
    };

export type ProductFinancialPayload =
  | { costCents: number; purchaseDiscountBps?: never }
  | { purchaseDiscountBps: number; costCents?: never };

export type ProductPricingPreview = {
  priceCents: number;
  costCents: number;
  marginCents: number;
  marginBps: number | null;
};

const parseContractMoney = (input: string): number | null => {
  const cents = parseBRLToCents(input);
  if (
    cents === null ||
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    cents > MONEY_MAX_CENTS
  ) {
    return null;
  }
  return cents;
};

export const parsePercentageToBasisPoints = (input: string): number | null => {
  const trimmed = input.trim();
  const percentage = trimmed.endsWith(PERCENT_SUFFIX)
    ? trimmed.slice(0, -PERCENT_SUFFIX.length).trim()
    : trimmed;

  if (!PERCENTAGE_INPUT.test(percentage)) {
    return null;
  }

  const separatorIndex = percentage.indexOf(DECIMAL_SEPARATOR);
  const integerPart =
    separatorIndex === -1 ? percentage : percentage.slice(0, separatorIndex);
  const decimalPart =
    separatorIndex === -1 ? "" : percentage.slice(separatorIndex + 1);
  const basisPoints =
    Number(integerPart) * BASIS_POINTS_PER_PERCENT +
    Number(decimalPart.padEnd(2, "0"));
  const parsed = purchaseDiscountBpsSchema.safeParse(basisPoints);

  return parsed.success ? parsed.data : null;
};

export const formatPercentageInput = (basisPoints: number): string => {
  const sign = basisPoints < 0 ? "-" : "";
  const absoluteBasisPoints = Math.abs(basisPoints);
  const integerPart = Math.floor(
    absoluteBasisPoints / BASIS_POINTS_PER_PERCENT,
  );
  const decimalPart = absoluteBasisPoints % BASIS_POINTS_PER_PERCENT;

  if (decimalPart === 0) {
    return `${sign}${integerPart}`;
  }

  const paddedDecimal = String(decimalPart).padStart(2, "0");
  const trimmedDecimal = paddedDecimal.endsWith("0")
    ? paddedDecimal.slice(0, -1)
    : paddedDecimal;
  return `${sign}${integerPart}${DECIMAL_SEPARATOR}${trimmedDecimal}`;
};

export const formatPercentage = (basisPoints: number): string =>
  `${formatPercentageInput(basisPoints)}${PERCENT_SUFFIX}`;

export const formatMarginPercentage = (
  marginBasisPoints: number | null,
): string =>
  marginBasisPoints === null
    ? "Não calculável"
    : formatPercentage(marginBasisPoints);

export const purchaseDiscountDraftFromBasisPoints = (
  basisPoints: number | null,
): PurchaseDiscountDraft => {
  if (basisPoints === null) {
    return { selection: null, customPercentage: "" };
  }

  const parsed = purchaseDiscountBpsSchema.safeParse(basisPoints);
  if (!parsed.success) {
    return { selection: null, customPercentage: "" };
  }

  if (parsed.data === 3000) {
    return { selection: "3000", customPercentage: "" };
  }
  if (parsed.data === 3500) {
    return { selection: "3500", customPercentage: "" };
  }
  if (parsed.data === 4000) {
    return { selection: "4000", customPercentage: "" };
  }

  return {
    selection: OTHER_DISCOUNT_SELECTION,
    customPercentage: formatPercentageInput(parsed.data),
  };
};

export const resolvePurchaseDiscountBasisPoints = (
  selection: PurchaseDiscountSelection | null,
  customPercentage: string,
): number | null => {
  if (selection === "3000") {
    return 3000;
  }
  if (selection === "3500") {
    return 3500;
  }
  if (selection === "4000") {
    return 4000;
  }
  if (selection === OTHER_DISCOUNT_SELECTION) {
    return parsePercentageToBasisPoints(customPercentage);
  }
  return null;
};

const resolveCostCents = (
  priceCents: number,
  draft: ProductPricingDraft,
): number | null => {
  if (draft.mode === "manual") {
    return parseContractMoney(draft.costInput);
  }

  const purchaseDiscountBps = resolvePurchaseDiscountBasisPoints(
    draft.discountSelection,
    draft.customDiscountInput,
  );
  if (purchaseDiscountBps === null) {
    return null;
  }

  return calculateDiscountedCostCents(priceCents, purchaseDiscountBps);
};

export const buildProductPricingPreview = (
  priceInput: string,
  draft: ProductPricingDraft,
): ProductPricingPreview | null => {
  const priceCents = parseContractMoney(priceInput);
  if (priceCents === null) {
    return null;
  }

  const costCents = resolveCostCents(priceCents, draft);
  if (costCents === null) {
    return null;
  }

  return {
    priceCents,
    costCents,
    ...calculateGrossMargin(priceCents, costCents),
  };
};

export const composeProductFinancialPayload = (
  draft: ProductPricingDraft,
): ProductFinancialPayload | null => {
  if (draft.mode === "manual") {
    const costCents = parseContractMoney(draft.costInput);
    return costCents === null ? null : { costCents };
  }

  const purchaseDiscountBps = resolvePurchaseDiscountBasisPoints(
    draft.discountSelection,
    draft.customDiscountInput,
  );
  return purchaseDiscountBps === null ? null : { purchaseDiscountBps };
};
