"use client";

import { useState } from "react";
import TreatmentEntryModal from "./components/TreatmentEntryModal";
import TreatmentResults, { type TreatmentResultTarget } from "./components/TreatmentResults";
import type { OperationOrder, Product } from "./data";
import { shiftDryingDay } from "./drying";

function localDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function TreatmentView({ orders, products, productsRequiringTreatment, initialDate, onOrderChanged }: {
  orders: OperationOrder[];
  products: Product[];
  productsRequiringTreatment: Set<string>;
  initialDate?: string;
  onOrderChanged: (id: string) => Promise<void>;
}) {
  const [date, setDate] = useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) && Number.isFinite(Date.parse(initialDate)) && shiftDryingDay(initialDate, 0) === initialDate ? initialDate : localDateKey());
  const [entry, setEntry] = useState<{ target: TreatmentResultTarget | null } | null>(null);
  const [revision, setRevision] = useState(0);

  const refreshResults = (orderLineId?: string) => {
    setRevision((current) => current + 1);
    const order = orders.find((item) => item.lines.some((line) => line.id === orderLineId));
    if (order) void onOrderChanged(order.id).catch(() => undefined);
  };

  return <section className="treatment-page" aria-labelledby="treatment-results-title">
    <TreatmentResults orders={orders} products={products} productsRequiringTreatment={productsRequiringTreatment} date={date} revision={revision} onDateChange={setDate} onRecord={(target) => setEntry({ target })} onOpenEntry={() => setEntry({ target: null })} />
    {entry && <TreatmentEntryModal target={entry.target} onClose={() => setEntry(null)} onSaved={(lineId) => { setEntry(null); refreshResults(lineId); }} />}
  </section>;
}
