/** Error de regla del juego. El mensaje está pensado para mostrárselo al jugador. */
export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
  }
}
