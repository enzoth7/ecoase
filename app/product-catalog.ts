import source from "./product-catalog-source.json";
import { buildProductName, productKey, requiresHeatTreatment } from "./classification";
import type { Product } from "./data";

type SourceProductRow = {
  sourceRow: number;
  measure: string;
  client: string;
  modelo?: string;
  taco?: string;
  refuerzo?: string;
  identificacion?: string;
  corteEsquina?: string;
  terminacion?: string;
  tratamiento?: string;
};

export const productSourceRows = source.rows as SourceProductRow[];

/** Conserva exactamente los valores de las ocho columnas de «Productos del árbol». */
export function sourceAttributes(row: SourceProductRow): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (row.modelo) attributes.modelo = row.modelo;
  if (row.taco) attributes.taco = row.taco;
  if (row.refuerzo) attributes.refuerzo = row.refuerzo;
  if (row.identificacion) attributes.identificacion = row.identificacion;
  if (row.corteEsquina) attributes["corte-esquina"] = row.corteEsquina;
  if (row.terminacion) attributes.terminacion = row.terminacion;
  if (row.tratamiento) attributes.tratamiento = row.tratamiento;
  return attributes;
}

export type CatalogEntry = { product: Product; sourceRows: number[] };

/** Un producto por combinación de niveles; las filas repetidas aportan clientes. */
export const catalogEntries: CatalogEntry[] = (() => {
  const byKey = new Map<string, CatalogEntry>();
  for (const row of productSourceRows) {
    const attributes = sourceAttributes(row);
    const shape = { kind: "Pallet" as const, measure: row.measure, attributes, requiresTreatment: requiresHeatTreatment(attributes.tratamiento) };
    const key = productKey(shape);
    const previous = byKey.get(key);
    if (previous) {
      previous.sourceRows.push(row.sourceRow);
      if (row.client !== "Sin identificar" && !previous.product.clientNames?.includes(row.client)) previous.product.clientNames?.push(row.client);
      continue;
    }
    const code = String(byKey.size + 1);
    const product: Product = {
      id: `catalogo-${code}`,
      ...shape,
      treatment: shape.requiresTreatment ? "Marcado" : undefined,
      stockName: buildProductName(shape),
      sourceCatalog: "Manual",
      sourceCode: code,
      zetaCode: code,
      stockActive: true,
      clientNames: row.client === "Sin identificar" ? [] : [row.client],
    };
    byKey.set(key, { product, sourceRows: [row.sourceRow] });
  }
  return [...byKey.values()];
})();

export const catalogProducts = catalogEntries.map((entry) => entry.product);
export const catalogClients = [...new Set(productSourceRows.map((row) => row.client).filter((client) => client !== "Sin identificar"))];
