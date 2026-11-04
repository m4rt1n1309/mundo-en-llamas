/** El atacante tira un dado menos que sus ejércitos (uno se queda cuidando), máximo 3. */
export function attackerDiceCount(armies) {
  return Math.max(0, Math.min(3, armies - 1));
}

/** El defensor tira tantos dados como ejércitos tenga, máximo 3. */
export function defenderDiceCount(armies) {
  return Math.max(0, Math.min(3, armies));
}

/**
 * Ordena ambos lados de mayor a menor y compara de a pares (tantos pares como
 * dados tenga el lado que tiró menos). En empate gana el defensor.
 */
export function resolveCombat(attackDice, defendDice) {
  const attack = [...attackDice].sort((x, y) => y - x);
  const defend = [...defendDice].sort((x, y) => y - x);
  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attack.length, defend.length);
  for (let i = 0; i < pairs; i++) {
    if (attack[i] > defend[i]) defenderLosses++;
    else attackerLosses++;
  }
  return { attack, defend, attackerLosses, defenderLosses };
}
