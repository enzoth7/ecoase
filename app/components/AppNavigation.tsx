"use client";

import { Archive, Boxes, CalendarDays, ClipboardList, Factory, Menu, Package, Truck, Users, X, type LucideIcon } from "lucide-react";
import type { DashboardSection } from "../Dashboard";

type NavigationItem = { section: Exclude<DashboardSection, "plan">; href: string; label: string; icon: LucideIcon };
const groups: Array<{ label: string; items: NavigationItem[] }> = [
  { label: "Inicio", items: [{ section: "calendario" as const, href: "/calendario", label: "Calendario", icon: CalendarDays }] },
  { label: "Operación", items: [
    { section: "pedidos" as const, href: "/pedidos", label: "Pedidos", icon: ClipboardList },
    { section: "produccion" as const, href: "/produccion", label: "Producción", icon: Factory },
    { section: "logistica" as const, href: "/logistica", label: "Logística", icon: Truck },
    { section: "stock" as const, href: "/stock", label: "Stock", icon: Boxes },
  ] },
  { label: "Gestión", items: [
    { section: "clientes" as const, href: "/clientes", label: "Clientes", icon: Users },
    { section: "productos" as const, href: "/productos", label: "Productos", icon: Package },
    { section: "proveedores" as const, href: "/proveedores", label: "Proveedores", icon: Factory },
  ] },
  { label: "Auditoría", items: [{ section: "historial" as const, href: "/historial", label: "Historial", icon: Archive }] },
];

export function MobileNavigationButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" className="mobile-nav-button" aria-expanded={open} aria-controls="app-navigation" onClick={onClick}>{open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}<span>{open ? "Cerrar menú" : "Menú"}</span></button>;
}

export default function AppNavigation({ section, completed, open, onClose }: { section: DashboardSection; completed: number; open: boolean; onClose: () => void }) {
  return <><button type="button" className={`mobile-nav-backdrop ${open ? "visible" : ""}`} aria-label="Cerrar menú" tabIndex={open ? 0 : -1} onClick={onClose} /><aside id="app-navigation" className={`app-sidebar ${open ? "open" : ""}`} aria-label="Navegación principal"><div className="sidebar-brand-row"><div className="brand sidebar-brand-title"><strong>Control de operaciones</strong></div><button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar navegación"><X size={20} aria-hidden="true" /></button></div><nav aria-label="Secciones de la aplicación">{groups.map((group) => <div className="sidebar-section" key={group.label}><p>{group.label}</p><div>{group.items.map((item) => { const Icon = item.icon; const active = item.section === section; return <a key={item.label} className={active ? "active" : ""} href={item.href} aria-current={active ? "page" : undefined} onClick={onClose}><Icon size={17} aria-hidden="true" /><span>{item.label}</span>{item.section === "historial" && <b>{completed}</b>}</a>; })}</div></div>)}</nav></aside></>;
}
