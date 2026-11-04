// Dados 3D (los mismos de La Generala: dice-box-threejs con sus sonidos).
//
// Hay dos cajas: a la izquierda los dados del atacante con su color y a la derecha los del
// defensor con el suyo. Los números los decide el motor: la librería hace caer los dados en
// esos valores, así todos los dispositivos ven la misma tirada.

import DiceBox from '@3d-dice/dice-box-threejs';

const tamano = (caja) => Math.round(Math.min(110, Math.max(36, Math.min(caja.clientWidth, caja.clientHeight) * 0.24)));

export function crearDados(overlay) {
  const cajaAtaque = overlay.querySelector('#dados-ataque');
  const cajaDefensa = overlay.querySelector('#dados-defensa');
  const resultado = overlay.querySelector('.dados-resultado');
  let cajas = null;
  let silencio = false;

  const nueva = async (caja) => {
    const box = new DiceBox(`#${caja.id}`, {
      assetPath: import.meta.env.BASE_URL,
      sounds: true,
      theme_surface: 'green-felt',
      theme_material: 'plastic',
      baseScale: tamano(caja),
      strength: 1.3,
      shadows: true,
    });
    await box.initialize();
    return box;
  };

  const pintar = (box, hex) => box.updateConfig({
    theme_customColorset: {
      name: `jugador-${hex.slice(1)}`,
      foreground: '#ffffff',
      background: hex,
      outline: '#000000',
      texture: 'none',
      material: 'plastic',
    },
  });

  const pip = (valores) => `${valores.length}dpip@${valores.join(',')}`;

  let ocultar = null;
  let corriendo = false;
  let pendiente = null;
  const alTerminar = [];

  // Si llegan varias tiradas mientras ruedan los dados (ataques seguidos), se muestra solo la
  // última: el registro igual anota todas.
  async function correr() {
    corriendo = true;
    while (pendiente) {
      const t = pendiente;
      pendiente = null;
      try {
        await tirar(t);
      } catch (err) {
        console.error('Dados 3D:', err);
        overlay.hidden = true;
      }
    }
    corriendo = false;
    alTerminar.splice(0).forEach((f) => f());
  }

  async function tirar({ ataque, defensa, colorAtaque, colorDefensa, texto }) {
    clearTimeout(ocultar);
    overlay.hidden = false;
    resultado.textContent = '';
    cajas ??= await Promise.all([nueva(cajaAtaque), nueva(cajaDefensa)]);
    for (const box of cajas) box.volume = silencio ? 0 : 100;
    await Promise.all([pintar(cajas[0], colorAtaque), pintar(cajas[1], colorDefensa)]);
    await Promise.all([cajas[0].roll(pip(ataque)), cajas[1].roll(pip(defensa))]);
    resultado.textContent = texto;
    ocultar = setTimeout(() => (overlay.hidden = true), 1600);
  }

  overlay.addEventListener('click', () => {
    clearTimeout(ocultar);
    overlay.hidden = true;
  });

  return {
    mostrar(tirada) {
      pendiente = tirada;
      if (!corriendo) correr();
    },
    ocupado: () => corriendo,
    /** Se resuelve cuando los dados terminan de rodar. */
    libre: () => (corriendo ? new Promise((r) => alTerminar.push(r)) : Promise.resolve()),
    silenciar(valor) {
      silencio = valor;
      for (const box of cajas ?? []) box.volume = valor ? 0 : 100;
    },
  };
}
