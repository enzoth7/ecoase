import type { Product, ProductKind } from "./data";

/**
 * Los productos se identifican por niveles: la Medida va primero y el resto es una lista editable
 * (modelo, taco, refuerzo, identificación, corte, terminación, tratamiento). Cada nivel tiene opciones conocidas, pero el valor
 * de un producto se guarda tal cual lo dice el cliente: la nomenclatura no se convierte.
 * El cliente no es un nivel: es una relación con el producto.
 */

export type ProductLevel = { id: string; label: string; options: string[]; system: boolean };
export type ProductAttributes = Record<string, string>;

export const MEASURE_LEVEL = "medida";
export const TREATMENT_LEVEL = "tratamiento";
export const LOGO_LEVEL = "logo-propio";

export const kindOptions: Array<{ value: ProductKind; label: string; enabled: boolean }> = [
  { value: "Pallet", label: "Pallet", enabled: true },
  { value: "Bin", label: "Bin (pendiente)", enabled: false },
  { value: "Piso", label: "Parrilla (pendiente)", enabled: false },
];

export const kindNames: Record<ProductKind, string> = { Pallet: "Pallet", Bin: "Bin", Piso: "Parrilla" };

/** Niveles de la planilla PRODUCTOS. La migración 20261104165453 carga los mismos. */
export const defaultProductLevels: ProductLevel[] = [
  {
    id: MEASURE_LEVEL, label: "Medida", system: true,
    options: ["100 x 80", "100 x 100", "100 x 120", "106 x 106", "113 x 113", "115 x 115", "116 x 116", "116,5 x 114", "119 x 106", "120 x 80", "120 x 90", "120 x 100", "120 x 112", "120 x 120", "120 x 130", "121 x 103", "122 x 102", "140 x 120", "145 x 80", "145 x 100", "160 x 110", "216 x 110"],
  },
  { id: "modelo", label: "Modelo", system: false, options: ["Mercosur", "Simple entrada", "Doble entrada", "Cerrado", "Citrus", "Adium", "Mercosur 20 mm", "Doble entrada · Cerrado"] },
  { id: "taco", label: "Taco", system: false, options: ["5 tacos", "Taco corrido", "Con taco"] },
  { id: "refuerzo", label: "Refuerzo", system: false, options: ["Liviano", "Reforzado", "7 tablas", "Reforzado Celsius"] },
  { id: "identificacion", label: "Identificación", system: false, options: ["N° 1", "N° 3", "N° 6", "Punto Azul", "Punto Rojo", "Punto Negro", "N° 3 Punto Azul"] },
  { id: "corte-esquina", label: "Corte esquina", system: false, options: ["Con corte", "Sin corte", "Con corte en maquina"] },
  { id: "terminacion", label: "Terminación", system: false, options: ["Cepillado", "Rebaje en todas las tablas del piso", "Rústico"] },
  { id: TREATMENT_LEVEL, label: "Tratamiento", system: true, options: ["Sin HT", "Con HT"] },
  { id: LOGO_LEVEL, label: "Logo propio", system: false, options: ["A", "Crufi", "MSJ"] },
];

export const requiresHeatTreatment = (value?: string) => Boolean(value?.trim().startsWith("Con HT"));

/** Presentación de nombres históricos: el atributo del catálogo se llama HT. */
export function canonicalProductName(value: string) {
  return value
    .replace(/\bSin marcado\b/giu, "Sin HT")
    .replace(/\bCon marcado\b/giu, "Con HT")
    .replace(/\bMarcado\b/giu, "Con HT");
}

export function productHeatTreatmentLabel(value: string): "Con HT" | "Sin HT" | "" {
  const name = canonicalProductName(value);
  if (/\bSin HT\b/iu.test(name)) return "Sin HT";
  if (/\bCon HT\b/iu.test(name)) return "Con HT";
  return "";
}

/** Se queda con los valores de texto no vacíos. */
export function cleanAttributes(raw: unknown): ProductAttributes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: ProductAttributes = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) clean[key] = value.trim();
  }
  return clean;
}

/** "120 x 100", "120x100" y "120 × 100" son la misma medida; "100 x 120" es otra (en Pamer cambia el sentido de las tablas). */
export function normalizeMeasure(value?: string) {
  return (value ?? "").toLocaleLowerCase("es").replace(/×/g, "x").replace(/,/g, ".").replace(/\s+/g, "");
}

/** Tratamiento efectivo: un nivel vacío queda vacío; sólo los productos viejos usan el tilde. */
export function treatmentOf(product: Pick<Product, "attributes" | "requiresTreatment">) {
  if (product.attributes) return product.attributes[TREATMENT_LEVEL]?.trim() ?? "";
  return product.requiresTreatment ? "Con HT" : "Sin HT";
}

export function hasClassification(product: Pick<Product, "attributes">) {
  return product.attributes !== undefined;
}

/** Mantiene los atributos introducidos sin inferir niveles ausentes de la planilla. */
export function applyLevelRules(attributes: ProductAttributes): ProductAttributes {
  return { ...attributes };
}

/** Valor de un producto en un nivel (la medida y el tratamiento viven en campos propios o se deducen). */
export function levelValue(product: Pick<Product, "measure" | "attributes" | "requiresTreatment">, levelId: string) {
  if (levelId === MEASURE_LEVEL) return product.measure?.trim() ?? "";
  if (levelId === TREATMENT_LEVEL) return treatmentOf(product);
  return product.attributes?.[levelId]?.trim() ?? "";
}

type NameShape = Pick<Product, "kind" | "measure" | "attributes" | "requiresTreatment">;

/** Tipo · medida · un valor por nivel, en el orden de los niveles. */
export function buildProductName(product: NameShape, levels: ProductLevel[] = defaultProductLevels, options: { fallbackHeat?: boolean } = {}) {
  const parts: Array<string | undefined> = [product.kind, product.measure?.trim()];
  for (const level of levels) {
    if (level.id === MEASURE_LEVEL) continue;
    parts.push(level.id === TREATMENT_LEVEL && options.fallbackHeat === false ? product.attributes?.[TREATMENT_LEVEL]?.trim() : levelValue(product, level.id));
  }
  return parts.filter(Boolean).join(" · ");
}

/** Identidad del producto: tipo, medida y todos sus valores, sin el cliente. La base calcula la misma clave. */
export function productKey(product: NameShape) {
  const attributes = cleanAttributes(product.attributes);
  const treatment = treatmentOf(product);
  if (treatment) attributes[TREATMENT_LEVEL] = treatment;
  const pairs = Object.entries(attributes).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, value]) => `${key}=${value.toLowerCase()}`);
  return [product.kind.toLowerCase(), normalizeMeasure(product.measure), ...pairs].join("|");
}

/** Productos anteriores a la planilla, mostrados con los niveles actuales mientras se migra la base. */
export function attributesFromLegacy(legacy: { model?: string | null; reinforcement?: string | null; board_count?: number | null; quality?: string | null; finish?: string | null; heat_treatment?: string | null; requires_treatment?: boolean }): ProductAttributes {
  const attributes: ProductAttributes = {};
  const set = (key: string, value?: string | null) => { if (value?.trim()) attributes[key] = value.trim(); };
  const model = legacy.model?.trim() ?? "";
  if (model === "Mercosur · Adium") { set("modelo", "Mercosur"); set("identificacion", "Adium"); }
  else if (model === "Simple entrada · 5 tacos") { set("modelo", "Simple entrada"); set("taco", "5 tacos"); }
  else if (model === "Con taco") set("taco", "Con taco");
  else if (model === "Mercosur 20 mm") set("modelo", "Mercosur 20 mm");
  else set("modelo", model);
  const boards = legacy.board_count ? `${legacy.board_count} tablas` : "";
  set("refuerzo", [legacy.reinforcement?.trim(), boards].filter(Boolean).join(" · "));
  set("identificacion", legacy.quality);
  const finish = legacy.finish?.trim().toLocaleLowerCase("es") ?? "";
  if (finish.includes("Con corte")) set("corte-esquina", "Con corte");
  else if (finish.includes("Sin corte")) set("corte-esquina", "Sin corte");
  if (finish.includes("cepillado")) set("terminacion", "Cepillado");
  else if (finish.includes("rebaje en todas las tablas")) set("terminacion", "Rebaje en todas las tablas del piso");
  const heat = legacy.heat_treatment?.trim() || (legacy.requires_treatment ? "Con HT" : "Sin HT");
  if (heat === "Con HT · exportación") set(TREATMENT_LEVEL, "Con HT");
  else set(TREATMENT_LEVEL, heat);
  return attributes;
}

/** Siguiente código numérico libre. */
export function suggestNextZetaCode(products: Array<Pick<Product, "zetaCode">>) {
  let highest = 0;
  for (const product of products) {
    const match = product.zetaCode?.match(/(\d+)\s*$/);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return String(highest + 1);
}

/** Id de nivel a partir del nombre: "Cantidad de tablas" → "cantidad-de-tablas". */
export function levelSlug(label: string, taken: Set<string>) {
  const base = label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "nivel";
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
}

/** Quita vacíos y repetidos (sin distinguir mayúsculas), respetando el orden. */
export function cleanOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const option of options) {
    if (typeof option !== "string") continue;
    const value = option.trim();
    const key = value.toLocaleLowerCase("es");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    clean.push(value);
  }
  return clean;
}
