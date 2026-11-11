import { useCallback, useEffect, useState } from "react";
import type { Provider } from "./data";
import type { StockSummaryRow } from "./stock";
import { StockMovementsView } from "./components/StockSubViews";
import { StockEntryModal } from "./StockView";
import { LoadingState } from "./components/ui";

async function requestStockWorkspace() {
  const [stockResponse, providersResponse] = await Promise.all([
    fetch("/api/stock/summary"), fetch("/api/providers"),
  ]);
  const [stockPayload, providersPayload] = await Promise.all([
    stockResponse.json() as Promise<{ stock?: StockSummaryRow[]; error?: string }>,
    providersResponse.json() as Promise<{ providers?: Provider[] }>,
  ]);
  if (!stockResponse.ok || !stockPayload.stock) throw new Error(stockPayload.error ?? "No se pudo cargar Stock.");
  return { rows: stockPayload.stock, providers: providersPayload.providers ?? [] };
}

export default function StockWorkspace({ initialProductId }: { initialProductId?: string }) {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [entry, setEntry] = useState(false);

  const apply = useCallback((payload: Awaited<ReturnType<typeof requestStockWorkspace>>) => {
    setError("");
    setRows(payload.rows);
    setProviders(payload.providers);
    setRevision((current) => current + 1);
    setLoading(false);
  }, []);
  const fail = useCallback((caught: unknown) => {
    setError(caught instanceof Error ? caught.message : "No se pudo cargar Stock.");
    setLoading(false);
  }, []);
  const load = useCallback(() => { void requestStockWorkspace().then(apply).catch(fail); }, [apply, fail]);
  useEffect(() => {
    let active = true;
    void requestStockWorkspace().then((payload) => { if (active) apply(payload); }).catch((caught: unknown) => { if (active) fail(caught); });
    return () => { active = false; };
  }, [apply, fail]);
  const saved = () => { setEntry(false); void load(); };

  return <section className="stock-page">
    {error && <p className="capacity-error" role="alert">{error}</p>}
    {loading && !rows.length ? <LoadingState label="Cargando stock" rows={6} />
      : <StockMovementsView key={initialProductId ?? "movements"} rows={rows} initialProductId={initialProductId} onEntry={() => setEntry(true)} revision={revision} />}
    {entry && <StockEntryModal rows={rows} providers={providers} onClose={() => setEntry(false)} onSaved={saved} />}
  </section>;
}
