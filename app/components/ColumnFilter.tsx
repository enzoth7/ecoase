import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type FilterOption = { value: string; label: string };

export default function ColumnFilter({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 320 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const focus = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.column-filter-option[aria-selected="true"]')?.focus());
    const closeOutside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnScroll = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnResize = () => setOpen(false);
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      cancelAnimationFrame(focus);
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>(".column-filter-option") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = root.current?.getBoundingClientRect();
    if (rect) {
      const estimatedHeight = Math.min(320, (options.length + 1) * 34);
      let top = rect.bottom + 2;
      if (window.innerHeight - top < Math.min(180, estimatedHeight) && rect.top > window.innerHeight - top) {
        top = Math.max(8, rect.top - estimatedHeight - 2);
      }
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 218)), top, maxHeight: Math.max(80, Math.min(320, window.innerHeight - top - 8)) });
    }
    setOpen(true);
  };

  return <div className="column-filter" ref={root}>
    <span>{label}</span>
    <button ref={trigger} type="button" className={value ? "column-filter-trigger active" : "column-filter-trigger"} aria-label={`Filtrar por ${label}`} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}><ChevronDown size={14} aria-hidden="true" /></button>
    {open && <div className="column-filter-popover" style={position} role="dialog" aria-label={`Filtrar por ${label}`}>
      <div role="listbox" aria-label={label} tabIndex={-1} onKeyDown={moveFocus}>
        <button type="button" role="option" aria-selected={!value} className="column-filter-option" onClick={() => choose("")}>{label}</button>
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className="column-filter-option" onClick={() => choose(option.value)}>{option.label}</button>)}
      </div>
    </div>}
  </div>;
}
