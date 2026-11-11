import { buildProductName, canonicalProductName, hasClassification, productHeatTreatmentLabel, treatmentOf } from "./classification";
import type { Client, Product } from "./data";

export type ClientProductControl = {
  id: number | string;
  clientProductId: number | string;
  title: string;
  detail?: string;
  displayOrder: number;
  active: boolean;
};

export type ClientProductAsset = {
  id: number | string;
  clientProductId: number | string;
  storagePath: string;
  fileName: string;
  assetType: "photo" | "plan";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number;
  altText: string;
  isPrimary: boolean;
  active: boolean;
  createdAt: string;
};

export type ClientProduct = {
  id: number | string;
  clientId: string;
  productId: string;
  zetaCode: string;
  operationalName?: string;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  product: Product;
  controls: ClientProductControl[];
  assets: ClientProductAsset[];
};

export type ClientMaster = Client & {
  active: boolean;
  updatedAt: string;
};

export type ClientDetail = {
  client: ClientMaster;
  products: ClientProduct[];
};

export type ClientProductOption = {
  id: number | string;
  productId: string;
  kind?: Product["kind"];
  label: string;
  zetaCode: string;
  clientAddress?: string;
  treatmentRequired: boolean;
  controlsReady: boolean;
};

export const allowedAssetTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const maximumAssetBytes = 6 * 1024 * 1024;

export function clientProductReady(item: Pick<ClientProduct, "zetaCode" | "controls" | "assets"> & { product?: Pick<Product, "zetaCode"> }) {
  return Boolean((item.product?.zetaCode ?? item.zetaCode).trim());
}

export function productLabel(product: Product, operationalName?: string) {
  if (!operationalName?.trim() && hasClassification(product)) return canonicalProductName(product.stockName?.trim() || buildProductName(product));
  const name = operationalName?.trim();
  if (name) return canonicalProductName(name);
  const base = product.stockName?.trim() || [product.kind, product.measure ?? "Sin medida"].join(" / ");
  const treatment = productHeatTreatmentLabel(base) ? "" : treatmentOf(product);
  return canonicalProductName([base, treatment].filter(Boolean).join(" / "));
}
