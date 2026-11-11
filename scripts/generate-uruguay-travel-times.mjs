import { writeFileSync } from "node:fs";

const boundaryUrl = "https://sit.mvot.gub.uy/arcgis/rest/services/07_EXTERNO/LIMITES_ADMINISTRATIVOS/MapServer/3/query?where=1%3D1&outFields=DEPTO&returnGeometry=true&outSR=4326&f=geojson";
const citiesUrl = "https://sit.mvot.gub.uy/arcgis/rest/services/06_PROY/Sistema_Urbano_Nacional/MapServer/9/query?where=pob_2011%3E%3D2000&outFields=nombloc,nombdepto,pob_2011&returnGeometry=true&outSR=4326&f=geojson";
const output = new URL("../app/uruguay-travel-times.json", import.meta.url);

async function json(url) {
  const response = await fetch(url, { headers: { "User-Agent": "EcoaseOperations/1.0 (local map data preparation)" }, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inPolygon(point, polygon) {
  return inRing(point, polygon[0]) && !polygon.slice(1).some((ring) => inRing(point, ring));
}
function inUruguay(point, features) {
  return features.some(({ geometry }) => {
    const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
    return polygons.some((polygon) => inPolygon(point, polygon));
  });
}
function simplify(points, tolerance = 0.003) {
  if (points.length < 5) return points;
  const square = tolerance * tolerance;
  function segment(first, last) {
    let index = -1, best = square;
    const a = points[first], b = points[last];
    for (let i = first + 1; i < last; i++) {
      const p = points[i], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (distance > best) { best = distance; index = i; }
    }
    return index < 0 ? [a, b] : [...segment(first, index).slice(0, -1), ...segment(index, last)];
  }
  return segment(0, points.length - 1).map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]);
}

const [departments, localities] = await Promise.all([json(boundaryUrl), json(citiesUrl)]);
if (!departments.features?.length || !localities.features?.length) throw new Error("No se encontraron capas oficiales de Uruguay.");
const cities = localities.features.flatMap(({ properties, geometry }) => {
  const point = geometry?.coordinates?.[0];
  return Array.isArray(point) && point.length === 2 ? [{
    name: properties.nombloc, department: properties.nombdepto, population: Number(properties.pob_2011),
    longitude: point[0], latitude: point[1],
  }] : [];
}).filter((city) => city.name && Number.isFinite(city.longitude)).sort((a, b) => b.population - a.population);
const paysandu = cities.find((city) => city.name.toUpperCase() === "PAYSANDU" || city.name.toUpperCase() === "PAYSANDÚ");
if (!paysandu) throw new Error("No se encontró Paysandú en la capa oficial.");
const origin = { name: "Paysandú", latitude: paysandu.latitude, longitude: paysandu.longitude };
const samples = [{ ...origin, population: paysandu.population, department: "Paysandú" }];
for (const city of cities) if (city.name !== paysandu.name) samples.push(city);

for (let index = 0; index < samples.length; index += 60) {
  const chunk = samples.slice(index, index + 60);
  const coordinates = [origin, ...chunk].map((point) => `${point.longitude},${point.latitude}`).join(";");
  const result = await json(`https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=0&annotations=duration`);
  if (result.code !== "Ok" || result.durations?.[0]?.length !== chunk.length + 1) throw new Error(`Matriz de rutas incompleta en el bloque ${index}.`);
  chunk.forEach((point, offset) => { point.hours = result.durations[0][offset + 1] === null ? null : Number((result.durations[0][offset + 1] / 3600).toFixed(2)); });
  process.stdout.write(`Calculadas ${Math.min(index + 60, samples.length)} de ${samples.length} ubicaciones\n`);
  if (index + 60 < samples.length) await new Promise((resolve) => setTimeout(resolve, 1200));
}
const usable = samples.filter((point) => point.hours !== null);
for (const city of cities) {
  city.hours = samples.find((sample) => sample.name === city.name && sample.department === city.department)?.hours ?? null;
}
function estimate(longitude, latitude) {
  const close = usable.map((point) => {
    const dx = (point.longitude - longitude) * Math.cos(latitude * Math.PI / 180);
    const dy = point.latitude - latitude;
    return { point, distance: dx * dx + dy * dy };
  }).sort((a, b) => a.distance - b.distance).slice(0, 6);
  if (close[0].distance < 0.00001) return close[0].point.hours;
  let total = 0, weights = 0;
  for (const { point, distance } of close) { const weight = 1 / Math.max(distance, 0.0001); total += point.hours * weight; weights += weight; }
  return total / weights;
}
const cellSize = 0.07;
const cells = [];
for (let latitude = -35.1; latitude <= -30.0; latitude += cellSize) {
  for (let longitude = -58.55; longitude <= -53.1; longitude += cellSize) {
    const midpoint = [longitude + cellSize / 2, latitude + cellSize / 2];
    if (!inUruguay(midpoint, departments.features)) continue;
    cells.push([Number(longitude.toFixed(3)), Number(latitude.toFixed(3)), Number(estimate(...midpoint).toFixed(2))]);
  }
}
const boundary = departments.features.map(({ geometry, properties }) => ({
  type: "Feature", properties: { name: properties.DEPTO },
  geometry: { type: geometry.type, coordinates: geometry.type === "MultiPolygon"
    ? geometry.coordinates.map((polygon) => polygon.map((ring) => simplify(ring)))
    : geometry.coordinates.map((ring) => simplify(ring)) },
}));
const data = { origin, calculatedAt: new Date().toISOString(), cellSize, cells, cities: cities.map(({ name, department, population, longitude, latitude, hours }) => ({ name, department, population, longitude, latitude, hours })), boundary: { type: "FeatureCollection", features: boundary }, sources: { geometry: boundaryUrl, localities: citiesUrl, routing: "https://router.project-osrm.org" } };
writeFileSync(output, `${JSON.stringify(data)}\n`);
process.stdout.write(`Guardadas ${cells.length} celdas, ${cities.length} localidades y ${boundary.length} polígonos oficiales.\n`);
