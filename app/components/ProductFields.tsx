"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  MEASURE_LEVEL,
  TREATMENT_LEVEL,
  LOGO_LEVEL,
  applyLevelRules,
  buildProductName,
  cleanAttributes,
  kindOptions,
  productKey,
  requiresHeatTreatment,
  suggestNextZetaCode,
  treatmentOf,
  type ProductAttributes,
  type ProductLevel,
} from "../classification";
import type { Product, ProductKind } from "../data";
import { palletDimensionsCm, palletFootprintM2 } from "../logistics";

const OTHER = "__other__";

export type ProductDraft = {
  kind: ProductKind;
  measure: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  attributes: ProductAttributes;
  zetaCode: string;
  stockName: string;
  nameTouched: boolean;
};

export function draftFromProduct(product: Product | undefined, products: Product[], levels: ProductLevel[]): ProductDraft {
  if (!product) {
    return { kind: "Pallet", measure: "", lengthCm: "", widthCm: "", heightCm: "10", attributes: {}, zetaCode: suggestNextZetaCode(products), stockName: "", nameTouched: false };
  }
  const dimensions = palletDimensionsCm(product.measure);
  const draft: ProductDraft = {
    kind: product.kind,
    measure: product.measure ?? "",
    lengthCm: dimensions ? String(dimensions.lengthCm).replace(".", ",") : "",
    widthCm: dimensions ? String(dimensions.widthCm).replace(".", ",") : "",
    heightCm: String(product.heightCm ?? 10).replace(".", ","),
    attributes: { ...cleanAttributes(product.attributes), [TREATMENT_LEVEL]: treatmentOf(product) },
    zetaCode: product.zetaCode ?? "",
    stockName: product.stockName ?? "",
    nameTouched: false,
  };
  // Un nombre distinto del generado (productos viejos o con nombre propio) se respeta tal cual.
  draft.nameTouched = Boolean(draft.stockName) && draft.stockName !== generatedName(draft, levels);
  return draft;
}

function toProductShape(draft: ProductDraft) {
  const attributes = applyLevelRules(cleanAttributes(draft.attributes));
  return { kind: draft.kind, measure: draft.measure.trim() || undefined, attributes, requiresTreatment: requiresHeatTreatment(attributes[TREATMENT_LEVEL]) };
}

export function generatedName(draft: ProductDraft, levels: ProductLevel[]) {
  return buildProductName(toProductShape(draft), levels, { fallbackHeat: false });
}

export function draftName(draft: ProductDraft, levels: ProductLevel[]) {
  return draft.nameTouched ? draft.stockName : generatedName(draft, levels);
}

/** Lo que viaja a la API: medida, un valor por nivel y el nombre final. */
export function draftPayload(draft: ProductDraft, levels: ProductLevel[], clientIds?: string[]) {
  const shape = toProductShape(draft);
  return { kind: shape.kind, measure: shape.measure, heightCm: draft.kind === "Pallet" && draft.heightCm.trim() ? Number(draft.heightCm.trim().replace(",", ".")) : null, attributes: shape.attributes, zetaCode: draft.zetaCode.trim(), stockName: draftName(draft, levels).trim(), ...(clientIds ? { clientIds } : {}) };
}

export function validateDraft(draft: ProductDraft, products: Product[], editingId?: string) {
  if (draft.kind === "Pallet" && (!positiveCentimeters(draft.lengthCm) || !positiveCentimeters(draft.widthCm))) return "Indicá largo y ancho mayores que cero en centímetros.";
  if (draft.kind === "Pallet" && !positiveCentimeters(draft.heightCm)) return "Indicá una altura válida mayor que cero en centímetros.";
  if (!draft.measure.trim()) return "Elegí la medida.";
  if (!/^[1-9]\d*$/.test(draft.zetaCode.trim())) return "Indicá un código numérico.";
  const shape = toProductShape(draft);
  const key = productKey(shape);
  const twin = products.find((product) => product.id !== editingId && productKey(product) === key);
  if (twin) return `Ya existe un producto con esa clasificación (código ${twin.zetaCode ?? twin.id}). Si cambia algo para distinguirlo, completá ese nivel.`;
  const code = draft.zetaCode.trim().toLocaleUpperCase("es");
  const sameCode = products.find((product) => product.id !== editingId && product.zetaCode?.toLocaleUpperCase("es") === code);
  if (sameCode) return `El código ${code} ya lo usa otro producto.`;
  return "";
}

function positiveCentimeters(value: string) {
  return /^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) && Number(value.trim().replace(",", ".")) > 0;
}

const areaFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Desplegable con las opciones conocidas del nivel y "Otro…" para escribir un valor que falte. */
function OptionField({ label, value, options, onChange, placeholder, required = false, allowOther = true, disabled = false, hint }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; placeholder: string; required?: boolean; allowOther?: boolean; disabled?: boolean; hint?: string }) {
  const [other, setOther] = useState(false);
  const known = options.some((option) => option.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"));
  const showOther = other || (Boolean(value) && !known && allowOther);
  const shown = !value ? "" : known ? options.find((option) => option.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"))! : OTHER;
  return (
    <label className="option-field">
      <span>{label}{required && <em aria-hidden="true"> *</em>}</span>
      <select
        value={showOther ? OTHER : shown}
        required={required && !showOther}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === OTHER) { setOther(true); onChange(""); return; }
          setOther(false);
          onChange(event.target.value);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
        {allowOther && <option value={OTHER}>Otro…</option>}
      </select>
      {showOther && <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Escribí ${label.toLocaleLowerCase("es")}`} required={required} aria-label={`${label}, otro valor`} />}
      {hint && <small className="field-help">{hint}</small>}
    </label>
  );
}

export function ProductDraftFields({ draft, setDraft, levels }: { draft: ProductDraft; setDraft: Dispatch<SetStateAction<ProductDraft>>; levels: ProductLevel[] }) {
  const setAttribute = (levelId: string, value: string) => setDraft((current) => {
    const attributes = { ...current.attributes, [levelId]: value };
    if (!value) delete attributes[levelId];
    return { ...current, attributes: applyLevelRules(attributes) };
  });
  const setDimension = (field: "lengthCm" | "widthCm", value: string) => setDraft((current) => {
    const next = { ...current, [field]: value };
    const measure = positiveCentimeters(next.lengthCm) && positiveCentimeters(next.widthCm)
      ? `${Number(next.lengthCm.replace(",", ".")).toString().replace(".", ",")} x ${Number(next.widthCm.replace(",", ".")).toString().replace(".", ",")}` : "";
    return { ...next, measure };
  });
  const areaM2 = draft.kind === "Pallet" ? palletFootprintM2(draft.measure) : undefined;
  return (
    <>
      <fieldset className="sheet-group"><legend>Clasificación</legend>
        <label className="option-field"><span>Tipo</span>
          <select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as ProductKind }))}>
            {kindOptions.map((option) => <option key={option.value} value={option.value} disabled={!option.enabled && option.value !== draft.kind}>{option.label}</option>)}
          </select>
        </label>
        {levels.map((level) => level.id === MEASURE_LEVEL
          ? draft.kind === "Pallet" ? <div key={level.id} className="product-dimensions">
              <label className="option-field"><span>Ancho (cm) <em aria-hidden="true">*</em></span><input type="text" inputMode="decimal" value={draft.widthCm} onChange={(event) => setDimension("widthCm", event.target.value)} required /></label>
              <label className="option-field"><span>Largo (cm) <em aria-hidden="true">*</em></span><input type="text" inputMode="decimal" value={draft.lengthCm} onChange={(event) => setDimension("lengthCm", event.target.value)} required /></label>
              <label className="option-field"><span>Altura (cm) <em aria-hidden="true">*</em></span><input type="text" inputMode="decimal" value={draft.heightCm} onChange={(event) => setDraft((current) => ({ ...current, heightCm: event.target.value }))} required /></label>
              <div className="product-area-result"><span>Superficie de base</span><output aria-label="Superficie de base">{areaM2 === undefined ? "Sin calcular" : `${areaFormatter.format(areaM2)} m²`}</output></div>
            </div> : <OptionField key={level.id} label={level.label} required value={draft.measure} options={level.options} onChange={(value) => setDraft((current) => ({ ...current, measure: value }))} placeholder="Seleccionar medida" hint="Largo x ancho en cm. 120 x 100 y 100 x 120 son medidas distintas." />
          : level.id === TREATMENT_LEVEL
            ? <OptionField key={level.id} label={level.label} allowOther={false} value={draft.attributes[level.id] ?? ""} options={level.options} onChange={(value) => setAttribute(level.id, value)} placeholder=" " hint="Con HT lleva la marca NIMF 15." />
            : level.id === LOGO_LEVEL
              ? <OptionField key={level.id} label={level.label} allowOther={false} value={draft.attributes[level.id] ?? ""} options={level.options} onChange={(value) => setAttribute(level.id, value)} placeholder="Sin especificar" />
            : <OptionField key={level.id} label={level.label} value={draft.attributes[level.id] ?? ""} options={level.options} onChange={(value) => setAttribute(level.id, value)} placeholder="Sin especificar" />)}
      </fieldset>
      <fieldset className="sheet-group"><legend>Identificación</legend>
        <label className="option-field"><span>Código <em aria-hidden="true">*</em></span>
          <input value={draft.zetaCode} onChange={(event) => setDraft((current) => ({ ...current, zetaCode: event.target.value }))} required inputMode="numeric" pattern="[1-9][0-9]*" autoComplete="off" />
        </label>
        <label className="option-field"><span>Nombre</span>
          <input value={draftName(draft, levels)} onChange={(event) => setDraft((current) => ({ ...current, stockName: event.target.value, nameTouched: true }))} placeholder="Se arma con la clasificación" />
          <small className="field-help">{draft.nameTouched ? <button type="button" className="text-button" onClick={() => setDraft((current) => ({ ...current, nameTouched: false }))}>Usar el nombre generado</button> : "Se arma solo con la clasificación."}</small>
        </label>
      </fieldset>
    </>
  );
}
