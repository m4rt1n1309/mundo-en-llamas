// Dados 3D (los mismos de La Generala: dice-box-threejs con sus sonidos).
//
// Ruedan sobre la parte de abajo del mapa, con fondo transparente: a la izquierda los del
// atacante con su color y a la derecha los del defensor con el suyo. Arriba va el título de la
// batalla ("Argentina ⚔ Brasil") y abajo el resultado. Los números los decide el motor: la
// librería hace caer los dados en esos valores, así todos los dispositivos ven la misma tirada.
// Sin dados 3D se muestra solo el título con los números.

import DiceBox from '@3d-dice/dice-box-threejs';

const tamano = (caja) => Math.round(Math.min(90, Math.max(30, Math.min(caja.clientWidth, caja.clientHeight) * 0.26)));
const CARAS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function crearDados(overlay) {
  const cajaAtaque = overlay.querySelector('#dados-ataque');
  const cajaDefensa = overlay.querySelector('#dados-defensa');
  const titulo = overlay.querySelector('.dados-titulo');
  const resultado = overlay.querySelector('.dados-resultado');
  let cajas = null;
  let silencio = false;
  let usar3d = true;

  const nueva = async (caja) => {
    const box = new DiceBox(`#${caja.id}`, {
      assetPath: import.meta.env.BASE_URL,
      sounds: true,
      theme_surface: 'green-felt', // solo cambia el sonido: el fondo queda transparente
      theme_material: 'plastic',
      baseScale: tamano(caja),
      strength: 1.2,
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
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  let ocultar = null;
  let corriendo = false;
  let pendiente = null;
  const alTerminar = [];

  async function tirar({ ataque, defensa, colorAtaque, colorDefensa, tituloHtml, texto }) {
    clearTimeout(ocultar);
    overlay.classList.toggle('sin-3d', !usar3d);
    overlay.hidden = false;
    titulo.innerHTML = tituloHtml;
    resultado.textContent = '';
    if (usar3d) {
      cajas ??= await Promise.all([nueva(cajaAtaque), nueva(cajaDefensa)]);
      for (const box of cajas) box.volume = silencio ? 0 : 100;
      await Promise.all([pintar(cajas[0], colorAtaque), pintar(cajas[1], colorDefensa)]);
      await Promise.all([cajas[0].roll(pip(ataque)), cajas[1].roll(pip(defensa))]);
      resultado.textContent = texto;
    } else {
      await esperar(250);
      resultado.textContent = `${ataque.map((n) => CARAS[n]).join(' ')}  contra  ${defensa.map((n) => CARAS[n]).join(' ')} — ${texto}`;
    }
    ocultar = setTimeout(() => {
      overlay.hidden = true;
      for (const box of cajas ?? []) box.clearDice();
    }, 2200);
  }

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
    usar3D(valor) {
      usar3d = valor;
    },
  };
}
