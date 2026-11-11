"use client";

import { useEffect, useRef } from "react";
import type { LogisticsRun } from "../logistics";
import travelTimes from "../uruguay-travel-times.json";
import "leaflet/dist/leaflet.css";

export const travelBands = [
  { max: 2, label: "Hasta 2 h", color: "#f5d75a" },
  { max: 4, label: "2 a 4 h", color: "#ebbb68" },
  { max: 6, label: "4 a 6 h", color: "#a9c7dc" },
  { max: 8, label: "6 a 8 h", color: "#749bb6" },
  { max: Infinity, label: "Más de 8 h", color: "#486a83" },
];

export { travelTimes };

export const routeColors = ["#d1495b", "#1d6fd1", "#2a9d8f", "#7b2cbf", "#e07a1f", "#26343e"];
export type MapRoute = { run: LogisticsRun; title: string; color: string };

export type ClientTravelPoint = {
  id: string; name: string; address: string; latitude: number; longitude: number;
  distanceKm: number; travelHours: number; precision: "exact" | "city" | "unknown";
};

export function UruguayTravelMap({ clients, selectedClientId, routes, editDestination, onDestinationClick }: {
  clients: ClientTravelPoint[]; selectedClientId?: string; routes: MapRoute[]; editDestination: boolean;
  onDestinationClick: (latitude: number, longitude: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onDestinationClick);
  useEffect(() => { clickRef.current = onDestinationClick; }, [onDestinationClick]);
  useEffect(() => {
    if (!element.current) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("leaflet").then(({ default: L }) => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { scrollWheelZoom: true, zoomControl: true, preferCanvas: true });
      const bounds = L.latLngBounds([[-35.1, -58.55], [-30.0, -53.05]]);
      map.fitBounds(bounds, { padding: [12, 12] });
      map.setMaxBounds(bounds.pad(0.14));
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 17,
      }).addTo(map);
      const canvas = L.canvas({ padding: 0.25 });
      const markerRenderer = L.svg();
      const cellSize = travelTimes.cellSize;
      for (const [longitude, latitude, hours] of travelTimes.cells) {
        const band = travelBands.find((item) => hours <= item.max) ?? travelBands[4];
        L.rectangle([[latitude, longitude], [latitude + cellSize, longitude + cellSize]], {
          renderer: canvas, stroke: false, fillColor: band.color,
          fillOpacity: 0.7, interactive: false,
        }).addTo(map);
      }
      L.geoJSON(travelTimes.boundary as unknown as Parameters<typeof L.geoJSON>[0], {
        style: { color: "#344c5a", weight: 1.2, fillOpacity: 0, interactive: false },
      }).addTo(map);
      const origin: [number, number] = [travelTimes.origin.latitude, travelTimes.origin.longitude];
      L.circleMarker(origin, { radius: 9, color: "#26343e", weight: 3, fillColor: "#ffca08", fillOpacity: 1 })
        .addTo(map).bindTooltip("Paysandú, salida", { direction: "top" });
      const groups = new Map<string, ClientTravelPoint[]>();
      for (const client of clients) {
        const key = `${client.latitude.toFixed(5)},${client.longitude.toFixed(5)}`;
        groups.set(key, [...(groups.get(key) ?? []), client]);
      }
      for (const group of groups.values()) {
        const point = group[0];
        const selected = group.some((client) => client.id === selectedClientId);
        const marker = L.circleMarker([point.latitude, point.longitude], {
          radius: selected ? 8 : group.length > 1 ? 7 : 5.5, color: "#26343e", weight: 2,
          fillColor: selected ? "#ffca08" : point.precision === "exact" ? "#ffffff" : "#fff1bd",
          fillOpacity: 1, bubblingMouseEvents: false, className: "logistics-client-marker", renderer: markerRenderer,
        }).addTo(map);
        const popup = document.createElement("div");
        popup.className = "travel-client-popup";
        for (const client of group) {
          const entry = document.createElement("div");
          entry.className = "travel-client-popup-entry";
          const title = document.createElement("strong");
          title.textContent = client.name;
          const address = document.createElement("div");
          address.textContent = client.address;
          const distance = document.createElement("div");
          distance.textContent = `${client.distanceKm.toLocaleString("es-UY", { maximumFractionDigits: 1 })} km`;
          const hours = document.createElement("strong");
          hours.textContent = `${client.travelHours.toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h de viaje`;
          entry.append(title, address, distance, hours);
          popup.append(entry);
        }
        marker.bindPopup(popup);
        marker.on("mouseover", () => marker.openPopup());
        marker.on("mouseout", () => marker.closePopup());
        if (selected) { map.panTo([point.latitude, point.longitude]); marker.openPopup(); }
      }
      const duration = (seconds: number) => { const total = Math.round(seconds / 60); return total >= 60 ? `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min` : `${total} min`; };
      const time = (iso?: string) => iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
      for (const { run, title, color } of routes) {
        if (run.routeGeometry?.coordinates?.length) {
          const path = run.routeGeometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
          L.polyline(path, { color, weight: 4, opacity: 0.9, interactive: false }).addTo(map);
          const hit = L.polyline(path, { color, weight: 18, opacity: 0, bubblingMouseEvents: false }).addTo(map);
          const card = document.createElement("div");
          card.className = "travel-client-popup travel-route-popup";
          const heading = document.createElement("strong");
          heading.textContent = title;
          card.append(heading);
          const rows: Array<[string, string]> = [];
          if (run.destinationAddress) rows.push(["Destino", run.destinationAddress]);
          if (run.routeDistanceM !== undefined) rows.push(["Distancia, ida y vuelta", `${(run.routeDistanceM / 1000).toLocaleString("es-UY", { maximumFractionDigits: 0 })} km`]);
          if (run.routeDurationS !== undefined) rows.push(["Conducción", duration(run.routeDurationS)]);
          const start = time(run.plannedStartAt), end = time(run.plannedEndAt);
          if (start || end) rows.push(["Salida y regreso", [start, end].filter(Boolean).join(" a ")]);
          for (const [label, value] of rows) {
            const row = document.createElement("div");
            row.className = "travel-route-popup-row";
            const name = document.createElement("span"); name.textContent = label;
            const data = document.createElement("strong"); data.textContent = value;
            row.append(name, data); card.append(row);
          }
          hit.bindPopup(card, { maxWidth: 280 });
        }
        if (run.destinationLatitude !== undefined && run.destinationLongitude !== undefined) {
          const destinationLabel = document.createElement("span");
          destinationLabel.textContent = run.destinationAddress ?? "Destino de la salida";
          L.circleMarker([run.destinationLatitude, run.destinationLongitude], {
            radius: 7, color, weight: 3, fillColor: "#ffffff", fillOpacity: 1,
          }).addTo(map).bindPopup(destinationLabel);
        }
      }
      if (editDestination) map.on("click", (event) => clickRef.current(event.latlng.lat, event.latlng.lng));
      window.setTimeout(() => map.invalidateSize(), 100);
      dispose = () => map.remove();
    });
    return () => { cancelled = true; dispose?.(); };
  }, [clients, selectedClientId, routes, editDestination]);
  return <div className={`logistics-map logistics-uruguay-map ${editDestination ? "is-editing" : ""}`} ref={element}
    role="region" aria-label="Mapa de tiempos de viaje por carretera desde Paysandú en Uruguay" />;
}

