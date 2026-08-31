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
  return operationalName?.trim() || [product.stockName, product.kind, product.measure ?? "Sin medida", product.requiresTreatment ? "Marcado" : "Sin marcado"].filter(Boolean).join(" · ");
}
