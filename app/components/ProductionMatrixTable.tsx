"use client";

import { useState, useCallback, useEffect } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import type { Product } from "../data";

export interface MatrixColumn {
  id: string;
  name: string;
  category: "tercerizado" | "propio";
}

export const MATRIX_COLUMNS: MatrixColumn[] = [
  { id: "blanc", name: "Blanc", category: "tercerizado" },
  { id: "mirasol", name: "Mirasol", category: "tercerizado" },
  { id: "sandro_raul", name: "Sandro Raul", category: "propio" },
  { id: "fabrica_john", name: "Fábrica John", category: "propio" },
  { id: "fabrica_omar", name: "Fábrica Omar", category: "propio" },
  { id: "john_esteban", name: "John y Esteban", category: "propio" },
  { id: "enzo", name: "Enzo", category: "propio" },
  { id: "lito", name: "Lito", category: "propio" },
];

export interface MatrixRow {
  id: string;
  productId?: string;
  defaultLabel: string;
  customLabel?: string;
  values: Record<string, string>;
  isCustom?: boolean;
}

export const INITIAL_NORMAL_ROWS: MatrixRow[] = [
  {
    id: "norm-1",
    defaultLabel: "Pallet chico o piso bins exp",
    values: {
      blanc: "250",
      mirasol: "-",
      sandro_raul: "200",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "120",
      lito: "80",
    },
  },
  {
    id: "norm-2",
    defaultLabel: "Pallet grande AFB",
    values: {
      blanc: "100",
      mirasol: "-",
      sandro_raul: "100/120",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "norm-3",
    defaultLabel: "Mercosur fabrica",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "-",
      fabrica_john: "550/600",
      fabrica_omar: "140",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "norm-4",
    defaultLabel: "Citrus fabrica de a CUATRO",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "-",
      fabrica_john: "450/500",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "norm-5",
    defaultLabel: "Bins x3 estructura",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "120",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "120",
      enzo: "60",
      lito: "-",
    },
  },
  {
    id: "norm-6",
    defaultLabel: "Bins x2",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "100",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "100",
      enzo: "50",
      lito: "-",
    },
  },
  {
    id: "norm-7",
    defaultLabel: "Bins chacra",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "60",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "25",
      lito: "-",
    },
  },
  {
    id: "norm-8",
    defaultLabel: "Bins secadero",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "60",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "norm-9",
    defaultLabel: "Bins x 2 arriba y abajo",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "100",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
];

export const INITIAL_MAX_ROWS: MatrixRow[] = [
  {
    id: "max-1",
    defaultLabel: "Pallet chico",
    values: {
      blanc: "350",
      mirasol: "-",
      sandro_raul: "240",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "140",
      lito: "120",
    },
  },
  {
    id: "max-2",
    defaultLabel: "Pallet grande AFB",
    values: {
      blanc: "150",
      mirasol: "-",
      sandro_raul: "140",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "max-3",
    defaultLabel: "Mercosur fabrica",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "-",
      fabrica_john: "600",
      fabrica_omar: "160",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "max-4",
    defaultLabel: "Citrus fabrica de a CUATRO",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "-",
      fabrica_john: "550",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "max-5",
    defaultLabel: "Bins x3",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "160/170",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "160",
      enzo: "70",
      lito: "-",
    },
  },
  {
    id: "max-6",
    defaultLabel: "Bins x2",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "120",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "120",
      enzo: "60",
      lito: "-",
    },
  },
  {
    id: "max-7",
    defaultLabel: "Bins chacra",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "70",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "max-8",
    defaultLabel: "Bins secadero",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "70",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
  {
    id: "max-9",
    defaultLabel: "Bins x 2 arriba y abajo",
    values: {
      blanc: "-",
      mirasol: "-",
      sandro_raul: "120",
      fabrica_john: "-",
      fabrica_omar: "-",
      john_esteban: "-",
      enzo: "-",
      lito: "-",
    },
  },
];

const STORAGE_KEY_NORMAL = "ecoase_production_matrix_normal_v4";
const STORAGE_KEY_MAX = "ecoase_production_matrix_max_v4";

function sanitizeRows(rows: MatrixRow[]): MatrixRow[] {
  return rows.map((row) => {
    const values: Record<string, string> = {};
    for (const col of MATRIX_COLUMNS) {
      const raw = (row.values?.[col.id] ?? "").trim();
      if (!raw || raw === "--" || raw === "—" || raw === "0" || raw.toLowerCase().includes("no hacen")) {
        values[col.id] = "-";
      } else {
        values[col.id] = raw;
      }
    }
    return { ...row, values };
  });
}

function loadSavedRows(key: string, fallback: MatrixRow[]): MatrixRow[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as MatrixRow[];
      if (Array.isArray(parsed) && parsed.length > 0) return sanitizeRows(parsed);
    }
  } catch {
    // ignore
  }
  return fallback;
}

export default function ProductionMatrixTable({
  products = [],
  onSaved,
}: {
  products?: Product[];
  onSaved?: () => Promise<void> | void;
}) {
  const [normalRows, setNormalRows] = useState<MatrixRow[]>(() =>
    loadSavedRows(STORAGE_KEY_NORMAL, INITIAL_NORMAL_ROWS)
  );
  const [maxRows, setMaxRows] = useState<MatrixRow[]>(() =>
    loadSavedRows(STORAGE_KEY_MAX, INITIAL_MAX_ROWS)
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const saveToStorage = useCallback((normal: MatrixRow[], max: MatrixRow[]) => {
    try {
      localStorage.setItem(STORAGE_KEY_NORMAL, JSON.stringify(normal));
      localStorage.setItem(STORAGE_KEY_MAX, JSON.stringify(max));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSavedFeedback(null);
    try {
      saveToStorage(normalRows, maxRows);

      // Obtener reglas y recursos actuales para mapear el ID de recurso y actualizar (PATCH) o crear (POST)
      let currentRules: Array<{ id: string | number; resourceId: string | number; productId: string }> = [];
      let currentResources: Array<{ id: string | number; name: string; providerId?: string }> = [];
      try {
        const capRes = await fetch("/api/capacity?from=2026-01-01&to=2026-01-02");
        if (capRes.ok) {
          const capData = await capRes.json() as { capacity?: { production?: { rules?: Array<{ id: string | number; resourceId: string | number; productId: string }>; resources?: Array<{ id: string | number; name: string; providerId?: string }> } } };
          currentRules = capData.capacity?.production?.rules ?? [];
          currentResources = capData.capacity?.production?.resources ?? [];
        }
      } catch {
        // continuar con arreglos vacíos
      }

      let rulesCount = 0;
      for (const row of normalRows) {
        if (!row.productId) continue;
        const maxMatchingRow = maxRows.find((m) => m.id === row.id || m.productId === row.productId);
        for (const col of MATRIX_COLUMNS) {
          const normVal = (row.values[col.id] ?? "-").trim();
          const maxVal = maxMatchingRow ? (maxMatchingRow.values[col.id] ?? "-").trim() : "-";
          if (normVal === "-" && maxVal === "-") continue;

          const normMatch = normVal.match(/(\d+)/);
          const maxMatch = maxVal.match(/(\d+)/) || normVal.match(/\/(\d+)/);
          if (!normMatch) continue;

          const normalUnits = parseInt(normMatch[1], 10);
          let maxUnits = maxMatch ? parseInt(maxMatch[1], 10) : normalUnits;
          if (maxUnits < normalUnits) maxUnits = normalUnits;

          const matchedResource = currentResources.find((r) => {
            if (String(r.id) === String(col.id)) return true;
            const rName = r.name.toLowerCase();
            if (col.id === "blanc" && (r.providerId === "blanc" || rName.includes("blanc"))) return true;
            if (col.id === "mirasol" && (r.providerId === "mirasol" || rName.includes("mirasol"))) return true;
            if (col.id === "sandro_raul" && rName.includes("sandro")) return true;
            if (col.id === "fabrica_john" && rName.includes("john")) return true;
            if (col.id === "fabrica_omar" && rName.includes("omar")) return true;
            if (col.id === "john_esteban" && rName.includes("esteban")) return true;
            if (col.id === "enzo" && rName.includes("enzo")) return true;
            if (col.id === "lito" && rName.includes("lito")) return true;
            return false;
          });
          const targetResourceId = matchedResource ? matchedResource.id : col.id;

          const existing = currentRules.find(
            (r) => String(r.resourceId) === String(targetResourceId) && r.productId === row.productId
          );

          try {
            await fetch("/api/capacity/rules", {
              method: existing ? "PATCH" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: existing?.id,
                resourceId: targetResourceId,
                productId: row.productId,
                normalUnitsPerDay: normalUnits,
                maximumUnitsPerDay: maxUnits,
                configurationLabel: "Estándar",
                validFrom: "2026-01-01",
                source: "manual",
                note: `Configurado desde planilla (${col.name})`,
              }),
            });
            rulesCount++;
          } catch {
            // Regla con error menor, continuar
          }
        }
      }

      if (onSaved) {
        await onSaved();
      }

      setSavedFeedback(
        rulesCount > 0
          ? `Reglas guardadas: ${rulesCount} regla(s) sincronizada(s) con el sistema.`
          : "Reglas guardadas en la planilla correctamente."
      );

      setTimeout(() => {
        setSavedFeedback(null);
      }, 4000);
    } catch {
      setSavedFeedback("No se pudieron guardar las reglas.");
    }
  }, [normalRows, maxRows, onSaved, saveToStorage]);

  useEffect(() => {
    const onTrigger = () => {
      void handleSave();
    };
    window.addEventListener("ecoase:save-matrix-rules", onTrigger);
    return () => window.removeEventListener("ecoase:save-matrix-rules", onTrigger);
  }, [handleSave]);

  const handleCellChange = (block: "normal" | "max", rowId: string, colId: string, value: string) => {
    if (block === "normal") {
      setNormalRows((prev) => {
        const next = prev.map((row) =>
          row.id === rowId ? { ...row, values: { ...row.values, [colId]: value } } : row
        );
        saveToStorage(next, maxRows);
        return next;
      });
    } else {
      setMaxRows((prev) => {
        const next = prev.map((row) =>
          row.id === rowId ? { ...row, values: { ...row.values, [colId]: value } } : row
        );
        saveToStorage(normalRows, next);
        return next;
      });
    }
  };

  const handleProductSelect = (block: "normal" | "max", rowId: string, productId: string) => {
    if (block === "normal") {
      setNormalRows((prev) => {
        const next = prev.map((row) => (row.id === rowId ? { ...row, productId: productId || undefined } : row));
        saveToStorage(next, maxRows);
        return next;
      });
    } else {
      setMaxRows((prev) => {
        const next = prev.map((row) => (row.id === rowId ? { ...row, productId: productId || undefined } : row));
        saveToStorage(normalRows, next);
        return next;
      });
    }
  };

  const handleCustomLabelChange = (block: "normal" | "max", rowId: string, label: string) => {
    if (block === "normal") {
      setNormalRows((prev) => {
        const next = prev.map((row) => (row.id === rowId ? { ...row, customLabel: label } : row));
        saveToStorage(next, maxRows);
        return next;
      });
    } else {
      setMaxRows((prev) => {
        const next = prev.map((row) => (row.id === rowId ? { ...row, customLabel: label } : row));
        saveToStorage(normalRows, next);
        return next;
      });
    }
  };

  const handleAddRow = (block: "normal" | "max") => {
    const initialVals: Record<string, string> = {};
    MATRIX_COLUMNS.forEach((col) => {
      initialVals[col.id] = "-";
    });

    if (block === "normal") {
      setNormalRows((prev) => {
        const newRow: MatrixRow = {
          id: `custom-norm-${prev.length + 1}`,
          defaultLabel: "Nuevo producto",
          customLabel: "",
          values: initialVals,
          isCustom: true,
        };
        const next = [...prev, newRow];
        saveToStorage(next, maxRows);
        return next;
      });
    } else {
      setMaxRows((prev) => {
        const newRow: MatrixRow = {
          id: `custom-max-${prev.length + 1}`,
          defaultLabel: "Nuevo producto",
          customLabel: "",
          values: initialVals,
          isCustom: true,
        };
        const next = [...prev, newRow];
        saveToStorage(normalRows, next);
        return next;
      });
    }
  };

  const handleDeleteRow = (block: "normal" | "max", rowId: string) => {
    if (block === "normal") {
      setNormalRows((prev) => {
        const next = prev.filter((r) => r.id !== rowId);
        saveToStorage(next, maxRows);
        return next;
      });
    } else {
      setMaxRows((prev) => {
        const next = prev.filter((r) => r.id !== rowId);
        saveToStorage(normalRows, next);
        return next;
      });
    }
  };

  const renderTableBlock = (
    title: "NORMAL" | "CAPACIDAD MAXIMA",
    rows: MatrixRow[],
    block: "normal" | "max"
  ) => {
    return (
      <div className="matrix-table-container">
        <table className="matrix-sheet-table">
          <thead>
            {/* Fila 1 de encabezado: Categorías agrupadas */}
            <tr className="matrix-group-header-row">
              <th className="matrix-block-tag-th">
                <strong>{title}</strong>
              </th>
              <th colSpan={2} className="matrix-resource-cat-th matrix-cat-tercerizado">
                Tercerizados
              </th>
              <th colSpan={6} className="matrix-resource-cat-th matrix-cat-propio">
                Propios
              </th>
            </tr>
            {/* Fila 2 de encabezado: Nombres de recursos */}
            <tr className="matrix-resource-name-row">
              <th className="matrix-col-product-th">
                <span>Producto / Modelo</span>
              </th>
              {MATRIX_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  className={`matrix-col-resource-th ${
                    col.category === "tercerizado"
                      ? "matrix-resource-tercerizado"
                      : "matrix-resource-propio"
                  }`}
                  title={col.name}
                >
                  <div className="matrix-col-resource-name">{col.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.id} className="matrix-data-row">
                  {/* Columna A: Selector de producto */}
                  <td className="matrix-col-product-td">
                    <div className="matrix-product-selector-wrap">
                      <div className="matrix-product-select-row">
                        <select
                          className="matrix-product-select"
                          value={row.productId ?? ""}
                          onChange={(e) => handleProductSelect(block, row.id, e.target.value)}
                          aria-label="Seleccionar producto del catálogo"
                        >
                          <option value="">Seleccionar producto</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.stockName || p.kind} {p.measure ? `(${p.measure})` : ""} {p.zetaCode ? `[${p.zetaCode}]` : ""}
                            </option>
                          ))}
                        </select>
                        {row.isCustom && (
                          <button
                            type="button"
                            className="matrix-row-delete-btn"
                            onClick={() => handleDeleteRow(block, row.id)}
                            title="Eliminar fila personalizada"
                            aria-label="Eliminar fila"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      {row.isCustom && !row.productId && (
                        <input
                          type="text"
                          className="matrix-custom-label-input"
                          placeholder="Nombre personalizado..."
                          value={row.customLabel ?? ""}
                          onChange={(e) => handleCustomLabelChange(block, row.id, e.target.value)}
                        />
                      )}
                    </div>
                  </td>

                  {/* Columnas B a I: Celdas de recursos */}
                  {MATRIX_COLUMNS.map((col) => {
                    const cellVal = row.values[col.id] ?? "-";
                    const isDash = cellVal.trim() === "-" || cellVal.trim() === "0" || cellVal.trim() === "--";
                    return (
                      <td key={col.id} className={`matrix-cell-td ${isDash ? "matrix-cell-never" : "matrix-cell-active"}`}>
                        <input
                          type="text"
                          className={`matrix-cell-input ${isDash ? "matrix-cell-dash" : "matrix-cell-has-rule"}`}
                          value={cellVal}
                          placeholder="-"
                          onChange={(e) => handleCellChange(block, row.id, col.id, e.target.value)}
                          onFocus={(e) => {
                            if (e.target.value === "-") e.target.select();
                          }}
                          onBlur={(e) => {
                            if (!e.target.value.trim() || e.target.value.trim() === "0") {
                              handleCellChange(block, row.id, col.id, "-");
                            }
                          }}
                          aria-label={`${title} ${col.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="matrix-block-footer">
          <button
            type="button"
            className="matrix-add-row-btn"
            onClick={() => handleAddRow(block)}
          >
            <Plus size={14} />
            <span>Agregar fila ({title === "NORMAL" ? "Normal" : "Máxima"})</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="production-matrix-wrapper">
      {savedFeedback && (
        <div className="matrix-feedback-toast" role="status">
          <Check size={16} />
          <span>{savedFeedback}</span>
        </div>
      )}

      {/* Bloque 1: NORMAL */}
      {renderTableBlock("NORMAL", normalRows, "normal")}

      {/* Bloque 2: CAPACIDAD MAXIMA */}
      {renderTableBlock("CAPACIDAD MAXIMA", maxRows, "max")}
    </div>
  );
}
