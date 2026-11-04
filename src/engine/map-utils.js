/**
 * Formato de mapa:
 * {
 *   id, name,
 *   continents:  { [id]: { name, bonus } },
 *   territories: { [id]: { name, continent, neighbors: [ids], symbol? } },
 *   objectives:  [ { id, continents?: [ids], partial?: { [continentId]: n }, minTerritories? } ]
 * }
 */
export function validateMap(map) {
  const problems = [];
  const territories = map.territories ?? {};
  const continents = map.continents ?? {};
  for (const [tid, t] of Object.entries(territories)) {
    if (!continents[t.continent]) problems.push(`${tid}: continente inexistente "${t.continent}"`);
    for (const n of t.neighbors ?? []) {
      if (n === tid) problems.push(`${tid}: es limítrofe de sí mismo`);
      else if (!territories[n]) problems.push(`${tid}: limítrofe inexistente "${n}"`);
      else if (!territories[n].neighbors?.includes(tid)) problems.push(`${tid} -> ${n}: frontera no recíproca`);
    }
  }
  for (const o of map.objectives ?? []) {
    for (const c of [...(o.continents ?? []), ...Object.keys(o.partial ?? {})]) {
      if (!continents[c]) problems.push(`objetivo ${o.id}: continente inexistente "${c}"`);
    }
  }
  if (problems.length) throw new Error(`Mapa inválido:\n- ${problems.join('\n- ')}`);
}

export function territoriesOf(map, continentId) {
  return Object.keys(map.territories).filter((tid) => map.territories[tid].continent === continentId);
}

export function areAdjacent(map, a, b) {
  return map.territories[a]?.neighbors.includes(b) ?? false;
}
