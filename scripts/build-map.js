// Genera src/map/mundo-geo.json (el dibujo del mapa) a partir de src/map/mundo.js y Natural Earth.
//
//   npm run build:map            genera el JSON
//   npm run build:map -- --svg   además genera map-preview.svg para mirarlo
//
// Verifica que toda frontera terrestre real entre territorios esté declarada en `neighbors`.
// Los vecinos declarados que no se tocan por tierra son cruces por mar y se dibujan punteados.

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature, merge, neighbors as topoNeighbors } from 'topojson-client';
import { geoNaturalEarth1, geoPath, geoCentroid, geoArea } from 'd3-geo';
import { MUNDO } from '../src/map/mundo.js';
import { validateMap } from '../src/engine/map-utils.js';

const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-110m.json');
const IGNORED = new Set(['Antarctica', 'Fr. S. Antarctic Lands']);
const WIDTH = 1000;
const MARGIN = 6;

validateMap(MUNDO);

// Cada país partido en sus polígonos (islas, exclaves...), para poder filtrar por recuadro.
const countryPolygons = new Map();
for (const g of topo.objects.countries.geometries) {
  const parts = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  countryPolygons.set(
    g.properties.name,
    parts.map((arcs) => {
      const geom = { type: 'Polygon', arcs };
      return { geom, centroid: geoCentroid(feature(topo, geom)), used: false };
    }),
  );
}

const errors = [];
const tids = Object.keys(MUNDO.territories);
const polygonsOf = {};
for (const tid of tids) {
  polygonsOf[tid] = [];
  for (const c of MUNDO.territories[tid].countries) {
    const { name, bbox } = typeof c === 'string' ? { name: c } : c;
    const polys = countryPolygons.get(name);
    if (!polys) {
      errors.push(`${tid}: el país "${name}" no existe en Natural Earth`);
      continue;
    }
    const inside = ([lon, lat]) => !bbox || (lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3]);
    const chosen = polys.filter((p) => inside(p.centroid));
    if (!chosen.length) errors.push(`${tid}: ninguna parte de "${name}" cae en ${JSON.stringify(bbox)}`);
    for (const p of chosen) {
      if (p.used) errors.push(`${tid}: una parte de "${name}" ya está en otro territorio`);
      p.used = true;
      polygonsOf[tid].push(p.geom);
    }
  }
}

const unassigned = [];
for (const [name, polys] of countryPolygons) {
  if (!IGNORED.has(name) && polys.some((p) => !p.used)) unassigned.push(name);
}

// ------------------------------------------------------------------ fronteras terrestres
const flat = tids.flatMap((tid) => polygonsOf[tid].map((geom) => ({ tid, geom })));
const adjacency = topoNeighbors(flat.map((f) => f.geom));
const land = new Set();
adjacency.forEach((list, i) => {
  for (const j of list) {
    const a = flat[i].tid;
    const b = flat[j].tid;
    if (a !== b) land.add([a, b].sort().join('|'));
  }
});
for (const key of land) {
  const [a, b] = key.split('|');
  if (!MUNDO.territories[a].neighbors.includes(b)) errors.push(`${a} y ${b} se tocan por tierra pero no están declarados limítrofes`);
}

if (errors.length) {
  console.error(`Errores en el mapa:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

// ------------------------------------------------------------------ proyección y dibujo
const merged = Object.fromEntries(tids.map((tid) => [tid, merge(topo, polygonsOf[tid])]));
const all = { type: 'FeatureCollection', features: tids.map((tid) => ({ type: 'Feature', geometry: merged[tid] })) };
const projection = geoNaturalEarth1().fitWidth(WIDTH - 2 * MARGIN, all);
const path = geoPath(projection).digits(1);
const [[x0, y0], [, y1]] = path.bounds(all);
const [tx, ty] = projection.translate();
projection.translate([tx - x0 + MARGIN, ty - y0 + MARGIN]);
const HEIGHT = Math.ceil(y1 - y0 + 2 * MARGIN);
const round = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

const territories = {};
for (const tid of tids) {
  const def = MUNDO.territories[tid];
  let label;
  if (def.label) {
    label = projection(def.label);
  } else {
    // Centro del polígono más grande (así una isla lejana no corre el número).
    const polys = merged[tid].type === 'Polygon' ? [merged[tid].coordinates] : merged[tid].coordinates;
    const biggest = polys
      .map((coordinates) => ({ type: 'Polygon', coordinates }))
      .sort((p, q) => geoArea(q) - geoArea(p))[0];
    label = path.centroid(biggest);
  }
  territories[tid] = { d: path(merged[tid]), label: round(label) };
}

const otherPolys = [];
for (const name of unassigned) {
  for (const p of countryPolygons.get(name)) if (!p.used) otherPolys.push(p.geom);
}
const other = otherPolys.length ? path(merge(topo, otherPolys)) : '';

// ------------------------------------------------------------------ cruces por mar
// Se dibujan entre los puntos más cercanos de los dos territorios. Si el camino corto cruza
// el borde del mapa (ej. Alaska–Rusia), se marca `wrap` y se dibuja saliendo por los costados.
function projectedPoints(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.flat(2).map((c) => projection(c)).filter(Boolean);
}
const seaLinks = [];
for (const a of tids) {
  for (const b of MUNDO.territories[a].neighbors) {
    if (a > b || land.has([a, b].sort().join('|'))) continue;
    const pa = projectedPoints(merged[a]);
    const pb = projectedPoints(merged[b]);
    let best = null;
    for (const p of pa) {
      for (const q of pb) {
        const dx = Math.abs(p[0] - q[0]);
        const wrap = WIDTH - dx < dx;
        const d = (wrap ? WIDTH - dx : dx) ** 2 + (p[1] - q[1]) ** 2;
        if (!best || d < best.d) best = { d, from: p, to: q, wrap };
      }
    }
    seaLinks.push({ a, b, from: round(best.from), to: round(best.to), wrap: best.wrap });
  }
}

const out = { width: WIDTH, height: HEIGHT, territories, other, seaLinks };
writeFileSync(new URL('../src/map/mundo-geo.json', import.meta.url), JSON.stringify(out));

console.log(`Mapa: ${tids.length} territorios, ${land.size} fronteras terrestres, ${seaLinks.length} cruces por mar, ${WIDTH}x${HEIGHT}.`);
if (unassigned.length) console.log(`Países sin territorio (se dibujan en gris): ${unassigned.join(', ')}`);

if (process.argv.includes('--svg')) {
  writeFileSync(new URL('../map-preview.svg', import.meta.url), previewSvg(out));
  console.log('Vista previa: map-preview.svg');
}

function previewSvg({ width, height, territories, other, seaLinks }) {
  const color = (tid) => MUNDO.continents[MUNDO.territories[tid].continent].color;
  const links = seaLinks.map(({ from, to, wrap }) => {
    if (!wrap) return `<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"/>`;
    const [l, r] = from[0] < to[0] ? [from, to] : [to, from];
    const mid = (l[1] + r[1]) / 2;
    return `<line x1="${l[0]}" y1="${l[1]}" x2="0" y2="${mid}"/><line x1="${r[0]}" y1="${r[1]}" x2="${width}" y2="${mid}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}">
<rect width="100%" height="100%" fill="#1d3557"/>
<path d="${other}" fill="#6b7280" stroke="#1d3557" stroke-width="0.4"/>
${tids.map((tid) => `<path d="${territories[tid].d}" fill="${color(tid)}" stroke="#1b1b1b" stroke-width="0.6"/>`).join('\n')}
<g stroke="#f1faee" stroke-width="1" stroke-dasharray="3 2" opacity="0.9">${links.join('')}</g>
<g font-family="Segoe UI, Arial" font-size="6.5" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="1.6" paint-order="stroke">
${tids.map((tid) => {
  const [x, y] = territories[tid].label;
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="#fff" stroke="#000" stroke-width="0.6"/><text x="${x}" y="${y + 10}">${MUNDO.territories[tid].name}</text>`;
}).join('\n')}
</g></svg>`;
}
