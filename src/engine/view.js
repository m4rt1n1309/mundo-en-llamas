/**
 * Lo que puede ver un jugador: sin objetivos ni tarjetas ajenas, sin el mazo
 * ni la semilla. Cuando la partida termina se revelan los objetivos.
 */
export function viewFor(state, viewerId) {
  const { rng, deck, discard, ...rest } = state;
  const reveal = state.phase === 'finished';
  return {
    ...structuredClone(rest),
    deckCount: deck.length,
    discardCount: discard.length,
    players: state.players.map((p) => {
      const own = p.id === viewerId;
      return {
        ...structuredClone(p),
        cardCount: p.cards.length,
        cards: own ? structuredClone(p.cards) : null,
        objective: own || reveal ? structuredClone(p.objective) : null,
      };
    }),
  };
}

/** Oculta a los demás la tarjeta que sacó cada jugador. */
export function eventsFor(events, viewerId) {
  return events.map((e) => (e.type === 'cardDrawn' && e.player !== viewerId ? { ...e, card: null } : e));
}
