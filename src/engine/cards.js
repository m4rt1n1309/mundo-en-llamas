export const SYMBOLS = ['tanque', 'avion', 'barco'];
export const WILD = 'comodin';

/** Una tarjeta por territorio (símbolo del mapa o rotativo) más los comodines. */
export function buildDeck(map, config) {
  const cards = Object.keys(map.territories).map((tid, i) => ({
    id: `c-${tid}`,
    territory: tid,
    symbol: map.territories[tid].symbol ?? SYMBOLS[i % SYMBOLS.length],
  }));
  for (let i = 0; i < config.wildCards; i++) {
    cards.push({ id: `c-wild-${i}`, territory: null, symbol: WILD });
  }
  return cards;
}

/** Tres del mismo símbolo o tres distintos. El comodín reemplaza a cualquiera. */
export function isValidTrade(cards) {
  if (cards.length !== 3) return false;
  const symbols = cards.map((c) => c.symbol).filter((s) => s !== WILD);
  if (symbols.length < 3) return true;
  const distinct = new Set(symbols).size;
  return distinct === 1 || distinct === 3;
}

/** Ejércitos que da el canje número `n` (0 = primero) de un jugador. */
export function tradeValue(config, n) {
  const values = config.tradeValues;
  if (n < values.length) return values[n];
  return values[values.length - 1] + (n - values.length + 1) * config.tradeIncrement;
}
