export type NavigationIcon = "home" | "orders" | "products" | "production" | "stock" | "drying" | "logistics";

export type NavigationPage = { href: string; label: string };

export type NavigationArea = {
  id: string;
  icon: NavigationIcon;
  name: string;
  pages: NavigationPage[];
};

/** Áreas en el orden del pedido: productos, producción, stock, secadero y logística. */
export const navigationAreas: NavigationArea[] = [
  { id: "inicio", icon: "home", name: "Inicio", pages: [{ href: "/", label: "Resumen operativo" }, { href: "/calendario", label: "Calendario" }] },
  { id: "pedidos", icon: "orders", name: "Pedidos", pages: [{ href: "/pedidos", label: "Pedidos activos" }, { href: "/historial", label: "Historial" }] },
  { id: "productos", icon: "products", name: "Productos", pages: [{ href: "/productos", label: "Catálogo" }, { href: "/niveles", label: "Niveles" }, { href: "/clientes", label: "Clientes" }, { href: "/proveedores", label: "Proveedores" }] },
  { id: "produccion", icon: "production", name: "Producción", pages: [{ href: "/produccion", label: "Planificación" }, { href: "/produccion-real", label: "Producción real" }, { href: "/recursos", label: "Recursos" }, { href: "/reglas-produccion", label: "Reglas de rendimiento" }] },
  { id: "stock", icon: "stock", name: "Stock", pages: [{ href: "/stock", label: "Stock general" }, { href: "/stock-pamer", label: "Stock Pamer" }, { href: "/movimientos", label: "Movimientos" }] },
  { id: "secadero", icon: "drying", name: "Secadero", pages: [{ href: "/secadero", label: "Programación" }, { href: "/registro-ht", label: "Registro de HT" }, { href: "/reglas-secadero", label: "Reglas" }] },
  { id: "logistica", icon: "logistics", name: "Logística", pages: [{ href: "/viajes", label: "Planificación" }, { href: "/logistica", label: "Transporte real" }, { href: "/mapa-logistica", label: "Mapa" }, { href: "/limites-logistica", label: "Límites" }] },
];

export function findArea(href: string) {
  return navigationAreas.find((area) => area.pages.some((page) => page.href === href)) ?? navigationAreas[0];
}
