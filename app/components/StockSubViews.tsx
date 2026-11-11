import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import type { StockDetail, StockSummaryRow } from "../stock";
import { canonicalProductName } from "../classification";
import { LoadingState } from "./ui";

const number = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Montevideo" });
const movementNames: Record<string, string> = {
  opening_balance: "Saldo inicial", internal_production: "Producción interna", supplier_receipt: "Recepción de proveedor",
  production_receipt: "Producción confirmada", treatment_out: "Sale a HT", treatment_in: "HT realizado",
  dispatch: "Despacho", return: "Devolución", waste: "Merma", adjustment: "Ajuste", reversal: "Reversión",
};

function name(row: StockSummaryRow) {
  return canonicalProductName(row.product.stockName ?? [row.product.kind, row.product.measure].filter(Boolean).join(" "));
}

function useProductDetail(productId: string, revision: number) {
  const key = `${productId}:${revision}`;
  const [result, setResult] = useState<{ key: string; detail?: StockDetail; error?: string } | null>(null);
  useEffect(() => {
    if (!productId) return;
    let active = true;
    fetch(`/api/stock/${encodeURIComponent(productId)}`)
      .then(async (response) => {
        const payload = await response.json() as { stock?: StockDetail; error?: string };
        if (!response.ok || !payload.stock) throw new Error(payload.error ?? "No se pudo cargar el producto.");
        return payload.stock;
      })
      .then((stock) => { if (active) setResult({ key, detail: stock }); })
      .catch((caught: unknown) => { if (active) setResult({ key, error: caught instanceof Error ? caught.message : "No se pudo cargar el producto." }); });
    return () => { active = false; };
  }, [productId, key]);
  const current = result?.key === key ? result : null;
  return { detail: current?.detail ?? null, loading: Boolean(productId && !current), error: current?.error ?? "" };
}

function ProductPicker({ rows, query, onQuery, selectedId, onSelect }: { rows: StockSummaryRow[]; query: string; onQuery: (value: string) => void; selectedId: string; onSelect: (id: string) => void }) {
  const visible = useMemo(() => rows.filter((row) => `${name(row)} ${row.product.zetaCode ?? row.product.sourceCode ?? ""}`.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))), [rows, query]);
  return <div className="stock-subview-picker">
    <label className="search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar producto</span><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Buscar producto o código" /></label>
    <div className="stock-subview-product-list" aria-label="Productos de stock">
      {visible.map((row) => <button type="button" key={row.product.id} className={selectedId === row.product.id ? "active" : ""} aria-pressed={selectedId === row.product.id} onClick={() => onSelect(row.product.id)}><span>{name(row)}</span><small>{number.format(row.available)} disponibles</small></button>)}
      {!visible.length && <p>No hay productos para esa búsqueda.</p>}
    </div>
  </div>;
}

export function StockMovementsView({ rows, initialProductId, onEntry, revision }: { rows: StockSummaryRow[]; initialProductId?: string; onEntry: () => void; revision: number }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialProductId ?? "");
  const { detail, loading, error } = useProductDetail(selectedId, revision);
  const row = rows.find((item) => item.product.id === selectedId);
  return <section className="stock-subview" aria-labelledby="stock-movements-title">
    <header className="stock-subview-heading"><div><h2 id="stock-movements-title">Movimientos</h2><p>Revisá qué entró y qué salió del stock. Registrá entradas y ajustes desde acá.</p></div><button type="button" className="primary-button" onClick={onEntry}>Registrar entrada</button></header>
    <div className="stock-subview-layout">
      <ProductPicker rows={rows} query={query} onQuery={setQuery} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="stock-subview-detail">
        {!selectedId ? <div className="stock-subview-prompt"><CalendarDays size={24} aria-hidden="true" /><h3>Elegí un producto</h3><p>Vas a ver sus movimientos recientes.</p></div>
        : error ? <p role="alert">{error}</p>
        : loading || !detail ? <LoadingState label="Cargando movimientos" rows={4} />
        : <>
          <div className="stock-subview-detail-header"><div><h3>{row ? name(row) : name(detail.summary)}</h3><p>{number.format(detail.summary.physical)} unidades físicas</p></div></div>
          {detail.movements.length ? <div className="stock-subview-movements">{detail.movements.map((movement) => <article key={movement.id}><span className={movement.quantity < 0 ? "negative" : "positive"}>{movement.quantity > 0 ? "+" : ""}{number.format(movement.quantity)}</span><div><strong>{movementNames[movement.movementType] ?? movement.movementType}</strong><small>{dateTime.format(new Date(movement.performedAt))}, {movement.responsible}</small>{movement.note && <p>{movement.note}</p>}</div></article>)}</div> : <p className="stock-subview-empty">Este producto no tiene movimientos recientes.</p>}
        </>}
      </div>
    </div>
  </section>;
}
