import { crearJuego } from './ui/juego.js';
import { COLORES, hexDe, nuevaPartida, jugarAccion, normalizar, convertirEnBot } from './partida.js';
import { nombreBot } from './bot.js';
import * as red from './red.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const guardado = {
  leer(clave) {
    try {
      return JSON.parse(localStorage.getItem(`mel-${clave}`));
    } catch {
      return null;
    }
  },
  guardar(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(`mel-${clave}`);
      else localStorage.setItem(`mel-${clave}`, JSON.stringify(valor));
    } catch { /* sin almacenamiento */ }
  },
};

function mostrarPantalla(id) {
  for (const p of document.querySelectorAll('.pantalla, #juego')) p.hidden = p.id !== id;
  document.body.classList.toggle('jugando', id === 'juego');
}

function avisar(texto) {
  const a = $('#cargando');
  a.textContent = texto;
  a.hidden = !texto;
  if (texto) setTimeout(() => (a.hidden = true), 3000);
}

// ==================================================================== inicio

function irAlInicio() {
  const params = new URLSearchParams(location.search);
  params.delete('sala'); // se conservan ?emulador y ?otro
  const resto = params.toString().replace(/=(&|$)/g, '$1');
  history.replaceState(null, '', location.pathname + (resto ? `?${resto}` : ''));
  $('#btn-continuar').hidden = !guardado.leer('local');
  $('#nombre').value = guardado.leer('nombre') ?? '';
  $('#online-no').hidden = red.disponible;
  for (const id of ['#btn-crear', '#btn-unirse', '#nombre', '#codigo']) $(id).disabled = !red.disponible;
  mostrarPantalla('inicio');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-volver]')) irAlInicio();
});

// ==================================================================== partida local

let jugadoresLocal = [];

function dibujarListaLocal() {
  $('#lista-local').innerHTML = jugadoresLocal.map((j, i) => `
    <li>
      <button class="color" data-color="${i}" style="background:${hexDe(j.color)}" aria-label="Cambiar color"></button>
      <button class="btn-icono" data-bot="${i}" title="${j.bot ? 'Bot' : 'Persona'}" aria-label="Persona o bot">${j.bot ? '🤖' : '👤'}</button>
      <input data-nombre="${i}" value="${esc(j.name)}" maxlength="16" />
      ${jugadoresLocal.length > 2 ? `<button class="btn-icono" data-quitar="${i}" aria-label="Quitar">✕</button>` : ''}
    </li>`).join('');
  $('#btn-agregar').disabled = jugadoresLocal.length >= 6;
  $('#btn-agregar-bot').disabled = jugadoresLocal.length >= 6;
}

function colorLibre(excepto = -1) {
  const usados = new Set(jugadoresLocal.filter((_, i) => i !== excepto).map((j) => j.color));
  return COLORES.find((c) => !usados.has(c.id)).id;
}

$('#btn-local').onclick = () => {
  jugadoresLocal = [
    { name: 'Jugador 1', color: 'rojo' },
    { name: 'Jugador 2', color: 'azul' },
  ];
  dibujarListaLocal();
  mostrarPantalla('config-local');
};
$('#btn-agregar').onclick = () => {
  jugadoresLocal.push({ name: `Jugador ${jugadoresLocal.length + 1}`, color: colorLibre() });
  dibujarListaLocal();
};
$('#btn-agregar-bot').onclick = () => {
  jugadoresLocal.push({ name: nombreBot(jugadoresLocal.map((j) => j.name)), color: colorLibre(), bot: true });
  dibujarListaLocal();
};
$('#lista-local').addEventListener('input', (e) => {
  const i = e.target.dataset.nombre;
  if (i !== undefined) jugadoresLocal[i].name = e.target.value;
});
$('#lista-local').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.quitar !== undefined) jugadoresLocal.splice(Number(b.dataset.quitar), 1);
  if (b.dataset.bot !== undefined) {
    const j = jugadoresLocal[Number(b.dataset.bot)];
    j.bot = !j.bot;
    // si tenía el nombre automático, le ponemos uno que se note
    if (j.bot && /^Jugador \d+$/.test(j.name)) j.name = nombreBot(jugadoresLocal.map((x) => x.name));
    if (!j.bot && j.name.startsWith('Bot ')) j.name = `Jugador ${Number(b.dataset.bot) + 1}`;
  }
  if (b.dataset.color !== undefined) {
    // pasa al siguiente color que nadie use
    const i = Number(b.dataset.color);
    const usados = new Set(jugadoresLocal.filter((_, k) => k !== i).map((j) => j.color));
    let k = COLORES.findIndex((c) => c.id === jugadoresLocal[i].color);
    do k = (k + 1) % COLORES.length; while (usados.has(COLORES[k].id));
    jugadoresLocal[i].color = COLORES[k].id;
  }
  dibujarListaLocal();
});
$('#btn-empezar-local').onclick = () => {
  const jugadores = jugadoresLocal.map((j, i) => ({
    id: `j${i + 1}`, name: j.name.trim() || `Jugador ${i + 1}`, color: j.color, bot: !!j.bot,
  }));
  jugarLocal(nuevaPartida(jugadores));
};
$('#btn-continuar').onclick = () => {
  const p = guardado.leer('local');
  if (p) jugarLocal(normalizar(p));
};

function jugarLocal(partida) {
  guardado.guardar('local', partida);
  mostrarPantalla('juego');
  const juego = crearJuego($('#juego'), {
    modo: 'local',
    controlaBots: true,
    enviar(pid, accion) {
      partida = jugarAccion(partida, pid, accion);
      guardado.guardar('local', partida.estado.phase === 'finished' ? null : partida);
      juego.mostrar(partida);
    },
    onSalir: irAlInicio,
  });
  juego.mostrar(partida);
}

// ==================================================================== online

let salaActual = null; // { codigo, dejarDeEscuchar, juego, uid }

function nombreOnline() {
  const nombre = $('#nombre').value.trim();
  if (!nombre) {
    $('#nombre').focus();
    avisar('Escribí tu nombre.');
    return null;
  }
  guardado.guardar('nombre', nombre);
  return nombre;
}

$('#btn-crear').onclick = async () => {
  const nombre = nombreOnline();
  if (!nombre) return;
  try {
    avisar('Creando sala…');
    const codigo = await red.crearSala(nombre);
    entrarASala(codigo);
  } catch (err) {
    avisar(err.message);
  }
};

$('#btn-unirse').onclick = async () => {
  const nombre = nombreOnline();
  const codigo = red.normalizarCodigo($('#codigo').value);
  if (!nombre) return;
  if (codigo.length !== 4) return avisar('El código tiene 4 letras.');
  try {
    avisar('Entrando…');
    await red.unirse(codigo, nombre);
    entrarASala(codigo);
  } catch (err) {
    avisar(err.message);
  }
};
$('#codigo').addEventListener('input', (e) => (e.target.value = red.normalizarCodigo(e.target.value)));

async function entrarASala(codigo) {
  avisar('');
  const uid = await red.entrar();
  const params = new URLSearchParams(location.search);
  params.set('sala', codigo);
  history.replaceState(null, '', `?${params.toString().replace(/=(&|$)/g, '$1')}`);
  salaActual?.dejarDeEscuchar();
  salaActual = { codigo, uid, juego: null, dejarDeEscuchar: null };
  $('#sala-codigo').textContent = codigo;
  salaActual.dejarDeEscuchar = red.escucharSala(codigo, (sala) => alCambiarSala(sala));
}

function alCambiarSala(sala) {
  const s = salaActual;
  if (!sala || !sala.jugadores?.[s.uid]) {
    s.dejarDeEscuchar();
    salaActual = null;
    avisar(sala ? 'Ya no estás en la sala.' : 'La sala ya no existe.');
    return irAlInicio();
  }
  const soyHost = sala.host === s.uid;
  s.sala = sala;

  if (sala.partida) {
    if (!s.juego) {
      mostrarPantalla('juego');
      s.juego = crearJuego($('#juego'), {
        modo: 'online',
        miId: s.uid,
        // los bots los mueve el dispositivo del anfitrión
        controlaBots: soyHost,
        esHost: soyHost,
        onReemplazar: (pid) => red.sacarJugador(s.codigo, pid, (p) => convertirEnBot(p, pid)).catch((err) => avisar(err.message)),
        enviar: (pid, accion) => red.jugar(s.codigo, (p) => jugarAccion(p, pid, accion)),
        onSalir: async () => {
          const terminada = s.sala?.partida?.estado?.phase === 'finished';
          if (terminada && s.sala.host === s.uid) return red.volverASala(s.codigo);
          if (!terminada && !confirmar()) return;
          await salirDeSala(false);
        },
      });
    }
    s.juego.conexiones(Object.fromEntries(Object.entries(sala.jugadores).map(([uid, j]) => [uid, !!j.online])));
    s.juego.mostrar(sala.partida);
    return;
  }

  // sala de espera
  s.juego = null;
  mostrarPantalla('sala');
  const lista = Object.entries(sala.jugadores).sort((a, b) => (a[1].unido ?? 0) - (b[1].unido ?? 0));
  $('#sala-jugadores').innerHTML = lista.map(([uid, j], i) => `
    <li>
      <span class="punto" style="background:${COLORES[i]?.hex ?? '#888'}"></span>
      <b>${esc(j.nombre)}</b>${j.bot ? ' 🤖' : ''}${uid === sala.host ? ' 👑' : ''}${uid === s.uid ? ' (vos)' : ''}
      ${j.bot ? '<small>bot</small>' : `<small class="${j.online ? 'online' : 'offline'}">${j.online ? '● conectado' : '○ desconectado'}</small>`}
      ${soyHost && uid !== s.uid ? `<button class="btn-icono" data-sacar="${uid}" aria-label="Sacar de la sala" title="Sacar de la sala">✕</button>` : ''}
    </li>`).join('');
  const n = lista.length;
  $('#btn-bot').hidden = !soyHost;
  $('#btn-bot').disabled = n >= 6;
  $('#btn-bot').onclick = () => red.agregarBot(s.codigo, nombreBot(lista.map(([, j]) => j.nombre))).catch((err) => avisar(err.message));
  $('#btn-empezar-online').hidden = !soyHost;
  $('#btn-empezar-online').disabled = n < 2;
  $('#btn-empezar-online').textContent = `Empezar (${n} jugadores)`;
  $('#sala-espera').textContent = soyHost
    ? (n < 2 ? 'Se necesitan al menos 2 jugadores.' : 'Cuando estén todos, tocá Empezar.')
    : 'Esperando que el anfitrión empiece la partida…';
  $('#btn-empezar-online').onclick = () => {
    const jugadores = lista.slice(0, 6).map(([uid, j], i) => ({ id: uid, name: j.nombre, color: COLORES[i].id, bot: !!j.bot }));
    red.empezar(s.codigo, nuevaPartida(jugadores)).catch((err) => avisar(err.message));
  };
}

// Pregunta antes de abandonar una partida en curso. (confirm es simple y alcanza acá.)
const confirmar = () => window.confirm('¿Salir de la partida? Podés volver a entrar con el mismo link.');

async function salirDeSala(borrarme) {
  const s = salaActual;
  if (!s) return irAlInicio();
  s.dejarDeEscuchar();
  salaActual = null;
  await red.salir(s.codigo, { borrarme }).catch(() => {});
  irAlInicio();
}

$('#btn-salir-sala').onclick = () => salirDeSala(true);
$('#sala-jugadores').addEventListener('click', (e) => {
  const uid = e.target.closest('[data-sacar]')?.dataset.sacar;
  if (uid && salaActual) red.sacarJugador(salaActual.codigo, uid).catch((err) => avisar(err.message));
});
$('#btn-compartir').onclick = async () => {
  const link = `${location.origin}${location.pathname}?sala=${salaActual.codigo}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Mundo en Llamas', text: `Sumate a mi partida (sala ${salaActual.codigo})`, url: link });
    else {
      await navigator.clipboard.writeText(link);
      avisar('Link copiado.');
    }
  } catch { /* canceló */ }
};

// ==================================================================== arranque

async function arrancar() {
  // el código hay que leerlo antes de irAlInicio, que lo saca de la dirección
  const codigo = red.normalizarCodigo(new URLSearchParams(location.search).get('sala'));
  irAlInicio();
  if (!codigo || !red.disponible) return;
  $('#codigo').value = codigo;
  try {
    if (await red.soyMiembro(codigo)) {
      await red.unirse(codigo, guardado.leer('nombre') ?? 'Jugador');
      entrarASala(codigo);
    } else {
      $('#nombre').focus();
    }
  } catch (err) {
    avisar(err.message);
  }
}
arrancar();
