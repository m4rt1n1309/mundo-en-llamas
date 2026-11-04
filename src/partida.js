// La partida tal como se guarda (en memoria, en localStorage o en Firebase):
//
//   { estado, evento: { n, por, lista }, turno }
//
// estado  estado del motor (src/engine)
// evento  lo que pasó en la última acción, para que todos los dispositivos animen lo mismo
// turno   id de quien tiene que jugar (las reglas de Firebase lo usan para dejarlo escribir)

import { createGame, applyAction, currentPlayerId } from './engine/index.js';
import { MUNDO } from './map/mundo.js';

export const MAPA = MUNDO;

export const COLORES = [
  { id: 'rojo', nombre: 'Rojo', hex: '#d7263d' },
  { id: 'azul', nombre: 'Azul', hex: '#1f6fd6' },
  { id: 'verde', nombre: 'Verde', hex: '#2c9f4b' },
  { id: 'amarillo', nombre: 'Amarillo', hex: '#e8b923' },
  { id: 'violeta', nombre: 'Violeta', hex: '#8a3fc7' },
  { id: 'naranja', nombre: 'Naranja', hex: '#ee7a1c' },
];
export const hexDe = (color) => COLORES.find((c) => c.id === color)?.hex ?? '#888';

/** jugadores: [{ id, name, color }] */
export function nuevaPartida(jugadores, seed = Math.floor(Math.random() * 2 ** 32)) {
  const estado = createGame({ map: MAPA, players: jugadores, seed });
  return { estado, evento: { n: 0, por: null, lista: [] }, turno: currentPlayerId(estado) };
}

/** Aplica una acción. Lanza GameError si no vale. */
export function jugarAccion(partida, pid, accion) {
  const { state, events } = applyAction(MAPA, partida.estado, pid, accion);
  return {
    estado: state,
    evento: { n: partida.evento.n + 1, por: pid, lista: events },
    turno: currentPlayerId(state),
  };
}

/**
 * Firebase no guarda listas vacías ni valores null: los devuelve como "no existe".
 * Esto repone todo lo que el motor espera encontrar.
 */
export function normalizar(p) {
  const e = p.estado;
  e.deck ??= [];
  e.discard ??= [];
  e.setup ??= null;
  e.winner ??= null;
  e.turn ??= null;
  if (e.turn) {
    e.turn.pendingMove ??= null;
    e.turn.regroupLocked ??= {};
  }
  for (const j of e.players) {
    j.cards ??= [];
    j.eliminatedBy ??= null;
    j.objective ??= null;
    if (j.objective?.type === 'conquest') {
      j.objective.continents ??= [];
      j.objective.partial ??= {};
      j.objective.minTerritories ??= 0;
    }
    for (const c of j.cards) c.territory ??= null;
  }
  for (const c of [...e.deck, ...e.discard]) c.territory ??= null;
  p.evento ??= { n: 0, por: null, lista: [] };
  p.evento.lista ??= [];
  p.evento.por ??= null;
  return p;
}
