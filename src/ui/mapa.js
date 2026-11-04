// Mapa SVG: dibuja los territorios con el color de su dueño y la cantidad de ejércitos,
// y se puede acercar y mover (rueda, arrastrar, pellizcar con dos dedos).

import GEO from '../map/mundo-geo.json';
import { MAPA } from '../partida.js';

const NS = 'http://www.w3.org/2000/svg';
const ZOOM_MAX = 7;

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

export function crearMapa(contenedor, { onTocar }) {
  const { width: W, height: H } = GEO;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mapa-svg', preserveAspectRatio: 'xMidYMid meet' });
  contenedor.appendChild(svg);
  el('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, class: 'mar' }, svg);
  const capa = el('g', {}, svg);
  if (GEO.other) el('path', { d: GEO.other, class: 'tierra-neutral' }, capa);

  // cruces por mar (debajo de los territorios)
  const cruces = el('g', { class: 'cruces' }, capa);
  for (const { from, to, wrap } of GEO.seaLinks) {
    if (!wrap) {
      el('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1] }, cruces);
    } else {
      const [l, r] = from[0] < to[0] ? [from, to] : [to, from];
      const mid = (l[1] + r[1]) / 2;
      el('line', { x1: l[0], y1: l[1], x2: 0, y2: mid }, cruces);
      el('line', { x1: r[0], y1: r[1], x2: W, y2: mid }, cruces);
    }
  }

  const paths = {};
  const fichas = {};
  const gTerr = el('g', {}, capa);
  const gFichas = el('g', {}, capa);
  for (const [tid, geo] of Object.entries(GEO.territories)) {
    const p = el('path', { d: geo.d, class: 'territorio', 'data-id': tid }, gTerr);
    el('title', {}, p).textContent = MAPA.territories[tid].name;
    paths[tid] = p;
    const g = el('g', { class: 'ficha', 'data-id': tid, transform: `translate(${geo.label[0]} ${geo.label[1]})` }, gFichas);
    el('circle', { r: 6.6 }, g);
    const t = el('text', { 'text-anchor': 'middle', dy: '0.35em' }, g);
    fichas[tid] = { g, t };
  }

  // ---------------------------------------------------------------- zoom y arrastre
  let vista = { k: 1, x: 0, y: 0 };
  let tocado = false; // si la persona ya movió o acercó el mapa, no le cambiamos la vista sola

  // Qué parte del sistema de coordenadas del mapa se ve en pantalla. Con una pantalla más alta
  // que el mapa (celular vertical) se ve más alto que H; con una más ancha, más ancho que W.
  const visible = () => {
    const w = svg.clientWidth || W;
    const h = svg.clientHeight || H;
    const px = Math.min(w / W, h / H); // píxeles de pantalla por unidad del mapa
    const vw = w / px;
    const vh = h / px;
    return { x0: (W - vw) / 2, y0: (H - vh) / 2, vw, vh, px };
  };
  // si el mapa entra, centrado; si no, que no se pueda sacar de la pantalla
  const encajar = (pos, tam, v0, vtam) => (tam <= vtam ? v0 + (vtam - tam) / 2 : Math.min(v0, Math.max(v0 + vtam - tam, pos)));

  const aplicar = () => {
    const v = visible();
    const k = vista.k;
    vista.x = encajar(vista.x, W * k, v.x0, v.vw);
    vista.y = encajar(vista.y, H * k, v.y0, v.vh);
    capa.setAttribute('transform', `translate(${vista.x} ${vista.y}) scale(${k})`);
    // fichas de unos 10 px de radio en pantalla, para que se lean y se puedan tocar en el celular
    const radioEnPantalla = 6.6 * v.px * k;
    const s = Math.min(1.8, Math.max(0.45, 10 / radioEnPantalla));
    for (const [tid, { g }] of Object.entries(fichas)) {
      const [x, y] = GEO.territories[tid].label;
      g.setAttribute('transform', `translate(${x} ${y}) scale(${s})`);
    }
  };

  // En un celular vertical el mundo entero queda muy chico: arrancamos acercados para que llene
  // el alto, centrados en el medio (se mueve con el dedo y con "−" se ve todo).
  const vistaInicial = () => {
    const v = visible();
    const k = Math.min(3, Math.max(1, (v.vh / H) * 0.9));
    vista = { k, x: v.x0 + (v.vw - W * k) / 2, y: 0 };
    aplicar();
  };
  new ResizeObserver(() => (tocado ? aplicar() : vistaInicial())).observe(svg);
  const aSvg = (cx, cy) => {
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  const zoomEn = (cx, cy, factor) => {
    tocado = true;
    const p = aSvg(cx, cy);
    const k = Math.min(ZOOM_MAX, Math.max(1, vista.k * factor));
    const f = k / vista.k;
    vista = { k, x: p.x - (p.x - vista.x) * f, y: p.y - (p.y - vista.y) * f };
    aplicar();
  };

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomEn(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  const punteros = new Map();
  let arrastre = null; // { x, y, movido }
  let pellizco = null; // { d, k }
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1) arrastre = { x: e.clientX, y: e.clientY, movido: false, objetivo: e.target };
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      arrastre = null;
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!punteros.has(e.pointerId)) return;
    const antes = punteros.get(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pellizco && punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomEn((a.x + b.x) / 2, (a.y + b.y) / 2, d / pellizco.d);
      pellizco.d = d;
      return;
    }
    if (!arrastre) return;
    if (Math.hypot(e.clientX - arrastre.x, e.clientY - arrastre.y) > 6) arrastre.movido = true;
    if (arrastre.movido) {
      tocado = true;
      const p0 = aSvg(antes.x, antes.y);
      const p1 = aSvg(e.clientX, e.clientY);
      vista.x += p1.x - p0.x;
      vista.y += p1.y - p0.y;
      aplicar();
    }
  });
  const soltar = (e) => {
    if (!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    if (punteros.size < 2) pellizco = null;
    if (arrastre && !arrastre.movido && e.type === 'pointerup') {
      const tid = arrastre.objetivo.closest?.('[data-id]')?.getAttribute('data-id');
      if (tid) onTocar(tid);
    }
    if (punteros.size === 0) arrastre = null;
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);

  aplicar();

  return {
    acercar: () => {
      const r = svg.getBoundingClientRect();
      zoomEn(r.left + r.width / 2, r.top + r.height / 2, 1.5);
    },
    alejar: () => {
      const r = svg.getBoundingClientRect();
      zoomEn(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.5);
    },
    /**
     * estado: estado del motor; colores: { pid: hex }
     * marcas: { seleccionado, destinos: Set, continentes: bool }
     */
    dibujar(estado, colores, { seleccionado = null, destinos = new Set(), continentes = false } = {}) {
      for (const [tid, t] of Object.entries(estado.territories)) {
        const color = continentes ? MAPA.continents[MAPA.territories[tid].continent].color : colores[t.owner];
        const p = paths[tid];
        p.style.fill = color;
        p.classList.toggle('seleccionado', tid === seleccionado);
        p.classList.toggle('destino', destinos.has(tid));
        p.classList.toggle('apagado', !!seleccionado && tid !== seleccionado && !destinos.has(tid));
        const f = fichas[tid];
        f.g.querySelector('circle').style.fill = colores[t.owner];
        f.t.textContent = t.armies;
        f.g.classList.toggle('grande', t.armies >= 100);
      }
    },
  };
}
