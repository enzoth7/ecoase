/** Rendimiento inicial por recurso para cualquier pallet vinculado a un cliente. */
export const PALLET_PRODUCTION_DEFAULTS = [
  { resourceId: "blanc", normal: 250, maximum: 350 },
  { resourceId: "sandro_raul", normal: 200, maximum: 240 },
  { resourceId: "enzo", normal: 120, maximum: 140 },
  { resourceId: "lito", normal: 80, maximum: 120 },
] as const;

/** Cifras de las filas de fábrica para cada modelo de pallet. */
export const PALLET_MODEL_PRODUCTION_DEFAULTS = {
  mercosur: [
    { resourceId: "fabrica_john", normal: 550, maximum: 600 },
    { resourceId: "fabrica_omar", normal: 140, maximum: 160 },
  ],
  citrus: [
    { resourceId: "fabrica_john", normal: 450, maximum: 550 },
  ],
} as const;

export function palletProductionDefaults(model?: string) {
  const normalized = model?.trim().toLocaleLowerCase("es") ?? "";
  const specific = normalized.startsWith("mercosur")
    ? PALLET_MODEL_PRODUCTION_DEFAULTS.mercosur
    : normalized === "citrus" ? PALLET_MODEL_PRODUCTION_DEFAULTS.citrus : [];
  return [...PALLET_PRODUCTION_DEFAULTS, ...specific];
}

export const PALLET_RULE_START_DATE = "2026-01-01";
