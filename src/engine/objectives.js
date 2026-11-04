import { GameError } from './errors.js';
import { territoriesOf } from './map-utils.js';

/** Reparte un objetivo secreto a cada jugador: de conquista (del mapa) o de destrucción. */
export function dealObjectives(map, state, rng) {
  const pool = (map.objectives ?? []).map((o) => ({
    type: 'conquest',
    id: o.id,
    continents: o.continents ?? [],
    partial: o.partial ?? {},
    minTerritories: o.minTerritories ?? 0,
  }));
  if (state.config.destroyObjectives) {
    state.players.forEach((_, i) => pool.push({ type: 'destroy', id: `destroy-${i}` }));
  }
  if (pool.length < state.players.length) {
    throw new GameError('El mapa no tiene suficientes objetivos para esta cantidad de jugadores.');
  }
  rng.shuffle(pool);
  state.turnOrder.forEach((pid, i) => {
    const objective = pool[i];
    if (objective.type === 'destroy') {
      const others = state.turnOrder.filter((id) => id !== pid);
      objective.target = others[rng.int(others.length)];
    }
    state.players.find((p) => p.id === pid).objective = objective;
  });
}

export function meetsObjective(map, state, pid, objective) {
  if (!objective) return false;
  if (objective.type === 'destroy') {
    const target = state.players.find((p) => p.id === objective.target);
    return !!target && !target.alive && target.eliminatedBy === pid;
  }
  if (objective.type !== 'conquest') return false;
  const owns = (tid) => state.territories[tid].owner === pid;
  for (const c of objective.continents) {
    if (!territoriesOf(map, c).every(owns)) return false;
  }
  for (const [c, n] of Object.entries(objective.partial)) {
    if (territoriesOf(map, c).filter(owns).length < n) return false;
  }
  const total = Object.keys(state.territories).filter(owns).length;
  return total >= objective.minTerritories;
}

/**
 * Si alguien que no eras vos destruyó a tu objetivo, pasás a tener que destruir
 * al siguiente jugador vivo en el orden de turnos. Si no queda nadie, solo te
 * queda el objetivo común.
 */
export function reassignDestroyObjectives(state, eliminatedId, killerId, events) {
  const order = state.turnOrder;
  const start = order.indexOf(eliminatedId);
  for (const p of state.players) {
    const o = p.objective;
    if (!p.alive || p.id === killerId || o?.type !== 'destroy' || o.target !== eliminatedId) continue;
    let next = null;
    for (let i = 1; i < order.length; i++) {
      const id = order[(start + i) % order.length];
      if (id !== p.id && state.players.find((q) => q.id === id).alive) {
        next = id;
        break;
      }
    }
    p.objective = next ? { ...o, target: next } : { type: 'common', id: 'common' };
    events.push({ type: 'objectiveChanged', player: p.id });
  }
}

export function describeObjective(map, state, objective) {
  if (!objective) return '';
  if (objective.type === 'destroy') {
    const target = state.players.find((p) => p.id === objective.target);
    return `Destruir a ${target?.name ?? '?'}. Si otro jugador lo destruye antes, tu objetivo pasa a ser el siguiente.`;
  }
  if (objective.type === 'common') {
    return `Controlar ${state.config.commonTerritories} territorios.`;
  }
  const parts = [];
  const names = objective.continents.map((c) => map.continents[c].name);
  if (names.length) parts.push(`conquistar ${joinList(names)}`);
  for (const [c, n] of Object.entries(objective.partial)) {
    parts.push(`tener ${n} territorios de ${map.continents[c].name}`);
  }
  if (objective.minTerritories) parts.push(`controlar al menos ${objective.minTerritories} territorios en total`);
  const text = joinList(parts);
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
