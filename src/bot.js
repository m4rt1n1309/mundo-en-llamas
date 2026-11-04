// Bot: decide la próxima acción de un jugador automático. Es una función pura: recibe el estado
// y devuelve UNA acción del motor; quien lo usa la aplica y vuelve a preguntar hasta que pasa el turno.
//
// Estrategia:
// - Valora cada territorio según su objetivo secreto (continentes que le piden, jugador a destruir)
//   y según qué tan cerca está de completar cada continente.
// - Junta todos los refuerzos en un solo territorio de frontera, el que mejor puede atacar.
// - Ataca solo con ventaja (al menos 2 ejércitos más que el defensor), salvo para conseguir la
//   tarjeta del turno. Prioriza completar continentes y eliminar jugadores.
// - Al final lleva los ejércitos del interior hacia la frontera.

import { isValidTrade, territoriesOf, ownedBy } from './engine/index.js';

export function decidirBot(map, e, pid) {
  const T = e.territories;
  const yo = e.players.find((p) => p.id === pid);
  const mios = ownedBy(e, pid);
  const vecinos = (t) => map.territories[t].neighbors;
  const enemigos = (t) => vecinos(t).filter((n) => T[n].owner !== pid);
  const valor = valorTerritorios(map, e, pid);

  // Dónde poner refuerzos: el territorio propio que mejor ataca algo valioso y débil.
  const mejorBase = () => {
    const frontera = mios.filter((t) => enemigos(t).length);
    const lista = frontera.length ? frontera : mios;
    let mejor = lista[0];
    let mejorPuntaje = -Infinity;
    for (const t of lista) {
      const blancos = enemigos(t).map((n) => valor[n] * 3 - T[n].armies * 0.4);
      const puntaje = (blancos.length ? Math.max(...blancos) : 0) + T[t].armies * 0.1;
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = t;
      }
    }
    return mejor;
  };

  if (e.phase === 'setup') return { type: 'place', territory: mejorBase(), count: e.setup.remaining };

  const turno = e.turn;
  if (turno.pendingMove) {
    const { from, to, min, max } = turno.pendingMove;
    // si el origen queda sin enemigos alrededor, que pase todo lo que pueda
    const n = enemigos(from).length === 0 ? max : enemigos(to).length ? Math.ceil((min + max) / 2) : min;
    return { type: 'moveIn', count: n };
  }

  if (turno.step === 'reinforce') {
    const canje = buscarCanje(e, pid, yo.cards);
    if (canje) return { type: 'trade', cards: canje };
    if (turno.reinforcements > 0) return { type: 'place', territory: mejorBase(), count: turno.reinforcements };
    return { type: 'endPhase' };
  }

  if (turno.step === 'attack') {
    const ataque = mejorAtaque(map, e, pid, valor, mios);
    return ataque ? { type: 'attack', ...ataque } : { type: 'endPhase' };
  }

  const movida = mejorMovida(map, e, pid, mios, enemigos);
  return movida ? { type: 'move', ...movida } : { type: 'endTurn' };
}

/** Cuánto le interesa al bot cada territorio. */
function valorTerritorios(map, e, pid) {
  const T = e.territories;
  const obj = e.players.find((p) => p.id === pid).objective;
  const valor = {};
  for (const [cid] of Object.entries(map.continents)) {
    const ts = territoriesOf(map, cid);
    const fraccion = ts.filter((t) => T[t].owner === pid).length / ts.length;
    let peso = 1 + 2 * fraccion; // lo que ya domina vale más: está cerca del bonus
    if (obj?.type === 'conquest') {
      if (obj.continents.includes(cid)) peso += 2;
      if (obj.partial[cid]) peso += 1;
    }
    for (const t of ts) valor[t] = peso;
  }
  for (const p of e.players) {
    if (!p.alive || p.id === pid) continue;
    const suyos = ownedBy(e, p.id);
    const extra = (obj?.type === 'destroy' && obj.target === p.id ? 2.5 : 0) + (suyos.length <= 3 ? 1 : 0);
    for (const t of suyos) valor[t] += extra;
  }
  return valor;
}

function mejorAtaque(map, e, pid, valor, mios) {
  const T = e.territories;
  let mejor = null;
  for (const from of mios) {
    const a = T[from].armies;
    if (a < 2) continue;
    for (const to of map.territories[from].neighbors) {
      if (T[to].owner === pid) continue;
      const d = T[to].armies;
      const conVentaja = a >= d + 2;
      const porTarjeta = e.turn.conquests === 0 && a >= 3 && a > d;
      if (!conVentaja && !porTarjeta) continue;
      let puntaje = valor[to] * 2 + (a - d) * 0.3;
      const continente = map.territories[to].continent;
      const faltan = territoriesOf(map, continente).filter((t) => T[t].owner !== pid);
      if (faltan.length === 1) puntaje += 5 + map.continents[continente].bonus; // lo completa
      if (ownedBy(e, T[to].owner).length === 1) puntaje += 4; // elimina a un jugador
      if (!mejor || puntaje > mejor.puntaje) mejor = { from, to, puntaje };
    }
  }
  return mejor && { from: mejor.from, to: mejor.to };
}

/** Lleva ejércitos del interior hacia el territorio propio más cercano a la frontera. */
function mejorMovida(map, e, pid, mios, enemigos) {
  const T = e.territories;
  const distancia = {};
  const cola = mios.filter((t) => enemigos(t).length);
  for (const t of cola) distancia[t] = 0;
  while (cola.length) {
    const t = cola.shift();
    for (const n of map.territories[t].neighbors) {
      if (T[n].owner === pid && distancia[n] === undefined) {
        distancia[n] = distancia[t] + 1;
        cola.push(n);
      }
    }
  }
  let mejor = null;
  for (const from of mios) {
    if (!distancia[from]) continue; // frontera (0) o sin camino a ella
    const disponibles = T[from].armies - 1 - (e.turn.regroupLocked[from] ?? 0);
    if (disponibles < 1) continue;
    const to = map.territories[from].neighbors
      .filter((n) => T[n].owner === pid && distancia[n] !== undefined && distancia[n] < distancia[from])
      .sort((x, y) => distancia[x] - distancia[y])[0];
    if (to && (!mejor || disponibles > mejor.count)) mejor = { from, to, count: disponibles };
  }
  return mejor;
}

/** Algún canje válido, mejor si incluye una tarjeta de un territorio propio (+2 ahí). */
function buscarCanje(e, pid, cartas) {
  let mejor = null;
  for (let i = 0; i < cartas.length; i++) {
    for (let j = i + 1; j < cartas.length; j++) {
      for (let k = j + 1; k < cartas.length; k++) {
        const tres = [cartas[i], cartas[j], cartas[k]];
        if (!isValidTrade(tres)) continue;
        const propia = tres.some((c) => c.territory && e.territories[c.territory].owner === pid);
        if (!mejor || (propia && !mejor.propia)) mejor = { ids: tres.map((c) => c.id), propia };
      }
    }
  }
  return mejor?.ids ?? null;
}

const NOMBRES = ['Halcón', 'Puma', 'Cóndor', 'Yaguareté', 'Lobo', 'Zorro', 'Águila', 'Tiburón'];
/** Un nombre de bot que no esté usado. */
export function nombreBot(usados) {
  const libres = NOMBRES.filter((n) => !usados.includes(`Bot ${n}`));
  return `Bot ${libres[Math.floor(Math.random() * libres.length)] ?? 'Extra'}`;
}
