"use client";

import { Boxes, ClipboardList, Factory, Flame, House, Menu, Package, Plus, Truck, X, type LucideIcon } from "lucide-react";
import { findArea, navigationAreas, type NavigationIcon } from "../navigation";
import { AppLink } from "../navigation-client";

const icons: Record<NavigationIcon, LucideIcon> = {
  home: House, orders: ClipboardList, products: Package,
  production: Factory, stock: Boxes, drying: Flame, logistics: Truck,
};

export function MobileNavigationButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return <button type="button" className="mobile-nav-button" aria-expanded={open} aria-controls="app-navigation" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={onClick}>{open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>;
}

export default function AppNavigation({ activeHref, open, onClose, onNewOrder }: { activeHref: string; open: boolean; onClose: () => void; onNewOrder: () => void }) {
  const area = findArea(activeHref);

  return <>
    <button type="button" className={`mobile-nav-backdrop ${open ? "visible" : ""}`} aria-label="Cerrar menú" tabIndex={open ? 0 : -1} onClick={onClose} />
    <aside id="app-navigation" className={`area-rail control-sidebar double-sidebar ${open ? "open" : ""}`} aria-label="Navegación principal">
      <div className="control-primary-panel">
        <div className="control-brand-row">
          <AppLink className="control-brand" href="/" aria-label="Operaciones, inicio" onClick={onClose}>
            <img src="/operaciones-mark.svg" width="42" height="42" alt="" aria-hidden="true" />
            <strong>Operaciones</strong>
          </AppLink>
        </div>
        <nav className="rail-links" aria-label="Áreas">
          {navigationAreas.map((item) => {
            const Icon = icons[item.icon];
            const selected = item.id === area.id;
            return <AppLink key={item.id} href={item.pages[0].href} className={`control-area-link ${selected ? "selected" : ""}`} aria-label={item.name} aria-current={activeHref === item.pages[0].href ? "page" : undefined} title={item.name} onClick={onClose}>
              <Icon size={21} strokeWidth={selected ? 2 : 1.8} aria-hidden="true" />
              <span className="control-area-name">{item.name}</span>
            </AppLink>;
          })}
        </nav>
        <div className="control-primary-footer">
          <button type="button" className="control-new-order" aria-label="Nuevo pedido" title="Nuevo pedido" onClick={() => { onNewOrder(); onClose(); }}><Plus size={19} aria-hidden="true" /><span>Nuevo pedido</span></button>
        </div>
      </div>
      <div className="control-secondary-panel">
        <div className="control-secondary-heading">
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Cerrar menú"><X size={19} aria-hidden="true" /></button>
        </div>
        <nav className="control-section-links" aria-label={`Secciones de ${area.name}`}>
          {area.pages.map((page) => {
            const active = page.href === activeHref;
            return <AppLink key={page.href} href={page.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={onClose}>
              <span>{page.label}</span>
            </AppLink>;
          })}
        </nav>
      </div>
    </aside>
  </>;
}
