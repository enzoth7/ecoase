import { useEffect } from "react";

/** Adds the same popover filter to tables whose rows are rendered by different modules. */
export default function NativeTableFilters() {
  useEffect(() => {
    const active = new WeakMap<HTMLTableElement, Map<number, string>>();
    let popup: HTMLDivElement | null = null;
    let trigger: HTMLButtonElement | null = null;
    let frame = 0;

    const close = () => { popup?.remove(); popup = null; trigger?.setAttribute("aria-expanded", "false"); trigger = null; };
    const cellValue = (cell: Element | undefined) => cell ? [cell.textContent ?? "", ...Array.from(cell.querySelectorAll("input, select")).map((input) => input instanceof HTMLInputElement || input instanceof HTMLSelectElement ? input.value : "")].join(" ").toLocaleLowerCase("es") : "";
    const filterRows = (table: HTMLTableElement) => {
      const filters = active.get(table);
      const body = table.tBodies[0];
      if (!body) return;
      for (const row of Array.from(body.rows)) {
        const matches = !filters || [...filters].every(([column, query]) => cellValue(row.cells[column]).includes(query));
        row.style.display = matches ? "" : "none";
      }
    };
    const open = (table: HTMLTableElement, index: number, button: HTMLButtonElement, label: string) => {
      if (trigger === button) { close(); return; }
      close();
      trigger = button;
      button.setAttribute("aria-expanded", "true");
      const panel = document.createElement("div");
      panel.className = "native-column-popover";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", `Filtrar por ${label}`);
      const heading = document.createElement("strong");
      heading.textContent = label;
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Buscar en esta columna";
      input.setAttribute("aria-label", `Buscar en ${label}`);
      input.value = active.get(table)?.get(index) ?? "";
      input.addEventListener("input", () => {
        const filters = active.get(table) ?? new Map<number, string>();
        const query = input.value.trim().toLocaleLowerCase("es");
        if (query) filters.set(index, query); else filters.delete(index);
        active.set(table, filters);
        button.classList.toggle("active", Boolean(query));
        filterRows(table);
      });
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "Limpiar filtro";
      clear.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); });
      panel.append(heading, input, clear);
      document.body.append(panel);
      const rect = button.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 246))}px`;
      panel.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 130)}px`;
      popup = panel;
      input.focus();
    };
    const scan = () => {
      frame = 0;
      for (const table of document.querySelectorAll<HTMLTableElement>("table:has(thead):has(tbody)")) {
        const header = table.tHead?.rows[table.tHead.rows.length - 1];
        if (!header) continue;
        for (const row of Array.from(table.tBodies[0]?.rows ?? [])) Array.from(row.cells).forEach((cell, index) => {
          const column = header.cells[index];
          const label = (column?.querySelector("input")?.value || column?.textContent || "").trim();
          if (label) cell.dataset.columnLabel = label;
        });
        if (table.dataset.columnFilters === "off") continue;
        Array.from(header.cells).forEach((th, index) => {
          if (table.classList.contains("levels-sheet") && th.classList.contains("row-number")) return;
          if (th.dataset.columnFilterReady || th.querySelector(".column-filter")) return;
          const label = (th.querySelector("input")?.value || th.textContent || "").trim();
          if (!label || /^(acción|acciones|detalle)$/i.test(label)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "native-column-filter-trigger";
          button.setAttribute("aria-label", `Filtrar por ${label}`);
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
          button.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          button.addEventListener("click", () => open(table, index, button, label));
          const levelHeading = table.classList.contains("levels-sheet") ? th.querySelector(".level-head") : null;
          (levelHeading ?? th).append(button);
          th.dataset.columnFilterReady = "true";
        });
        filterRows(table);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("root")!, { subtree: true, childList: true });
    const outside = (event: MouseEvent) => { if (popup && !popup.contains(event.target as Node) && trigger !== event.target && !trigger?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const scroll = () => close();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    document.addEventListener("input", schedule);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); close(); document.querySelectorAll<HTMLTableCellElement>("th[data-column-filter-ready]").forEach((th) => { th.querySelector(".native-column-filter-trigger")?.remove(); delete th.dataset.columnFilterReady; }); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key); document.removeEventListener("input", schedule); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", scroll); };
  }, []);
  return null;
}
