// Pantalla de la partida. La usan igual el modo local (todos en esta compu) y el online
// (cada uno en su dispositivo): lo único que cambia es quién puede jugar y cómo se envía la acción.

import { crearMapa } from './mapa.js';
import { crearDados } from './dados.js';
import { MAPA, hexDe } from '../partida.js';
import { describeObjective, isValidTrade, tradeValue, areAdjacent, ownedBy } from '../engine/index.js';
import { decidirBot } from '../bot.js';

const SIMBOLO = { tanque: '🛡️', avion: '✈️', barco: '⚓', comodin: '⭐' };
const NOMBRE_SIMBOLO = { tanque: 'Tanque', avion: 'Avión', barco: 'Barco', comodin: 'Comodín' };
const PASO = { reinforce: 'Incorporar', attack: 'Atacar', regroup: 'Reagrupar' };
const nombreT = (tid) => MAPA.territories[tid].name;

const pref = {
  leer(clave, def) {
    try {
      const v = localStorage.getItem(`mel-${clave}`);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  guardar(clave, v) {
    try {
      localStorage.setItem(`mel-${clave}`, JSON.stringify(v));
    } catch { /* sin almacenamiento: no pasa nada */ }
  },
};

// Cuánto esperan los bots entre jugada y jugada (ms). La de ataque se cuenta desde que
// terminan de rodar los dados, así se alcanza a leer el resultado.
const VELOCIDADES = {
  lenta: { nombre: '🐢 Bots: lentos', turno: 2200, ataque: 2400, otro: 1400 },
  normal: { nombre: '🤖 Bots: velocidad normal', turno: 1400, ataque: 1500, otro: 850 },
  rapida: { nombre: '🐇 Bots: rápidos', turno: 400, ataque: 350, otro: 300 },
};

const html = (strings, ...vals) => strings.reduce((s, str, i) => s + str + (i < vals.length ? vals[i] : ''), '');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * modo: 'local' | 'online'
 * miId: en online, el uid de este dispositivo
 * enviar(pid, accion): aplica la acción (puede ser async); lanza error si no vale
 * onSalir(): volver al inicio
 * controlaBots: si este dispositivo mueve a los bots (local: siempre; online: el anfitrión)
 * esHost, onReemplazar(pid): online, el anfitrión puede sacar a un jugador (lo reemplaza un bot)
 */
export function crearJuego(raiz, { modo, miId = null, enviar, onSalir, controlaBots = false, esHost = false, onReemplazar = null }) {
  raiz.innerHTML = html`
    <header class="barra">
      <button class="btn-icono" data-accion="menu" aria-label="Menú">☰</button>
      <div class="jugadores"></div>
    </header>
    <div class="mapa"></div>
    <div class="zoom">
      <button class="btn-icono" data-accion="acercar" aria-label="Acercar">+</button>
      <button class="btn-icono" data-accion="alejar" aria-label="Alejar">−</button>
      <button class="btn-icono" data-accion="continentes" aria-label="Ver continentes" title="Ver continentes">🌍</button>
    </div>
    <section class="panel">
      <div class="panel-estado"></div>
      <div class="panel-texto"></div>
      <div class="panel-cantidad">
        <span>De a:</span>
        <button data-cantidad="1">1</button><button data-cantidad="5">5</button><button data-cantidad="todo">Todos</button>
      </div>
      <div class="panel-botones"></div>
      <ol class="registro"></ol>
    </section>
    <div class="dados" hidden>
      <div class="dados-titulo"></div>
      <div class="cajas-dados"><div id="dados-ataque" class="caja-dados"></div><div id="dados-defensa" class="caja-dados"></div></div>
      <div class="dados-resultado"></div>
    </div>
    <dialog class="modal"></dialog>
    <div class="telon" hidden></div>
    <div class="aviso" hidden></div>
  `;
  const $ = (s) => raiz.querySelector(s);
  const modal = $('.modal');
  const dados = crearDados($('.dados'));
  const mapa = crearMapa($('.mapa'), { onTocar: tocar });

  let partida = null;
  let sel = null;
  let cantidad = pref.leer('cantidad', '1');
  let continentes = false;
  let ultimoN = null;
  let telonVisto = null;
  let ocupado = false;
  let modalAbierto = null; // qué muestra el modal: 'mover', 'tarjetas', 'objetivo', 'menu', 'fin'
  let esperandoDados = false;
  // Mientras ruedan los dados de un ataque, el mapa, los jugadores y el registro muestran cómo
  // estaba todo antes de la tirada, para no adelantar el resultado.
  let estadoPrevio = null;
  let registroEnEspera = [];
  const registro = [];
  let dados3d = pref.leer('dados3d', true);
  let sonido = pref.leer('sonido', true);
  let velocidad = pref.leer('velocidad', 'normal');
  if (!VELOCIDADES[velocidad]) velocidad = 'normal';
  dados.silenciar(!sonido);
  dados.usar3D(dados3d);

  const estado = () => partida.estado;
  const jugador = (pid) => estado().players.find((p) => p.id === pid);
  const actual = () => estado().turnOrder[estado().current];
  const colores = () => Object.fromEntries(estado().players.map((p) => [p.id, hexDe(p.color)]));
  const humanos = () => estado().players.filter((p) => !p.bot);
  /**
   * Quién está mirando. Online: este dispositivo. En local: el jugador de turno; mientras juega
   * un bot, el único humano si hay uno solo (así ve sus tarjetas), o nadie si son varios.
   */
  const yo = () => {
    if (modo === 'online') return miId;
    if (estado().phase === 'finished') return null;
    if (!jugador(actual()).bot) return actual();
    const h = humanos();
    return h.length === 1 ? h[0].id : null;
  };
  const miTurno = () => estado().phase !== 'finished' && actual() === yo() && !jugador(actual()).bot;
  let conexiones = {};

  // ------------------------------------------------------------------ acciones

  async function hacer(accion) {
    if (ocupado) return;
    ocupado = true;
    try {
      await enviar(yo(), accion);
    } catch (err) {
      avisar(err.message);
    } finally {
      ocupado = false;
    }
  }

  function cuantos(max) {
    if (cantidad === 'todo') return max;
    return Math.min(Number(cantidad), max);
  }

  function tocar(tid) {
    if (!partida) return;
    const e = estado();
    const t = e.territories[tid];
    const mio = t.owner === yo();
    if (!miTurno()) {
      avisar(`${nombreT(tid)}: ${jugador(t.owner).name}, ${t.armies} ejércitos`);
      return;
    }
    if (e.phase === 'setup') {
      if (!mio) return avisar('Ese territorio no es tuyo.');
      return hacer({ type: 'place', territory: tid, count: cuantos(e.setup.remaining) });
    }
    const turno = e.turn;
    if (turno.pendingMove) return;
    if (turno.step === 'reinforce') {
      if (!mio) return avisar('Ese territorio no es tuyo.');
      if (turno.reinforcements === 0) return avisar('Ya incorporaste todo. Tocá "A atacar".');
      return hacer({ type: 'place', territory: tid, count: cuantos(turno.reinforcements) });
    }
    if (turno.step === 'attack') {
      if (mio) {
        if (sel === tid) sel = null;
        else if (t.armies < 2) return avisar('Necesitás al menos 2 ejércitos para atacar desde ahí.');
        else sel = tid;
        return dibujar();
      }
      if (!sel) return avisar('Primero tocá uno de tus territorios para atacar desde ahí.');
      if (!areAdjacent(MAPA, sel, tid)) return avisar(`${nombreT(tid)} no limita con ${nombreT(sel)}.`);
      return hacer({ type: 'attack', from: sel, to: tid });
    }
    // reagrupar
    if (!mio) return;
    if (sel && sel !== tid && areAdjacent(MAPA, sel, tid)) {
      const disponibles = e.territories[sel].armies - 1 - (turno.regroupLocked[sel] ?? 0);
      if (disponibles < 1) return avisar('No quedan ejércitos para mover desde ahí.');
      return hacer({ type: 'move', from: sel, to: tid, count: cuantos(disponibles) });
    }
    sel = sel === tid ? null : tid;
    dibujar();
  }

  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !raiz.contains(b) || modal.contains(b)) return;
    if (b.dataset.cantidad) {
      cantidad = b.dataset.cantidad;
      pref.guardar('cantidad', cantidad);
      return dibujar();
    }
    switch (b.dataset.accion) {
      case 'acercar': return mapa.acercar();
      case 'alejar': return mapa.alejar();
      case 'continentes':
        continentes = !continentes;
        b.classList.toggle('activo', continentes);
        return dibujar();
      case 'menu': return abrirMenu();
      case 'tarjetas': return abrirTarjetas();
      case 'objetivo': return abrirObjetivo();
      case 'a-atacar': return hacer({ type: 'endPhase' });
      case 'a-reagrupar': sel = null; return hacer({ type: 'endPhase' });
      case 'fin-turno': sel = null; return hacer({ type: 'endTurn' });
      default:
    }
  });

  // ------------------------------------------------------------------ dibujo

  function dibujar() {
    const e = estado();
    const yoId = yo();
    const turno = e.turn;

    // la selección deja de valer si el territorio cambió de dueño o ya no puede atacar
    if (sel && (e.territories[sel].owner !== yoId || !miTurno() || e.phase !== 'playing'
      || (turno.step === 'attack' && e.territories[sel].armies < 2) || turno.step === 'reinforce')) sel = null;

    let destinos = new Set();
    if (sel && miTurno()) {
      const vecinos = MAPA.territories[sel].neighbors;
      destinos = new Set(vecinos.filter((n) => (turno.step === 'attack') === (e.territories[n].owner !== yoId)));
    }
    const vista = estadoPrevio ?? e;
    mapa.dibujar(vista, colores(), { seleccionado: sel, destinos, continentes });

    // jugadores
    $('.jugadores').innerHTML = e.turnOrder.map((pid) => {
      const p = vista.players.find((x) => x.id === pid);
      const terr = ownedBy(vista, pid);
      const ejercitos = terr.reduce((n, t) => n + vista.territories[t].armies, 0);
      return html`<div class="chip ${pid === actual() && e.phase !== 'finished' ? 'actual' : ''} ${p.alive ? '' : 'eliminado'}">
        <span class="punto" style="background:${hexDe(p.color)}"></span>
        <b>${esc(p.name)}${p.bot ? ' 🤖' : ''}${modo === 'online' && !p.bot && conexiones[pid] === false ? ' 📴' : ''}</b>
        <small>${terr.length} 🏳 · ${ejercitos} ⚔ · ${p.cards.length} 🃏</small>
      </div>`;
    }).join('');

    // panel
    const quien = jugador(actual());
    const etapa = e.phase === 'setup' ? 'Ubicando ejércitos' : e.phase === 'playing' ? PASO[turno.step] : 'Partida terminada';
    $('.panel-estado').innerHTML = e.phase === 'finished'
      ? html`🏆 Ganó <b>${esc(jugador(e.winner.player).name)}</b>`
      : html`<span class="punto" style="background:${hexDe(quien.color)}"></span><span>Turno de <b>${esc(quien.name)}</b> · ${etapa} · Ronda ${e.round}</span>`;
    $('.panel-texto').textContent = textoAyuda();

    const pideCantidad = miTurno() && (e.phase === 'setup' || turno.step === 'reinforce' || turno.step === 'regroup');
    $('.panel-cantidad').hidden = !pideCantidad;
    raiz.querySelectorAll('[data-cantidad]').forEach((b) => b.classList.toggle('activo', b.dataset.cantidad === cantidad));

    const botones = [];
    if (yoId && jugador(yoId)?.alive !== false && e.phase !== 'finished') {
      botones.push(html`<button data-accion="objetivo">🎯 Objetivo</button>`);
      botones.push(html`<button data-accion="tarjetas">🃏 Tarjetas (${jugador(yoId).cards.length})</button>`);
    }
    if (miTurno() && e.phase === 'playing') {
      if (turno.step === 'reinforce') {
        botones.push(html`<button class="primario" data-accion="a-atacar" ${turno.reinforcements > 0 ? 'disabled' : ''}>A atacar ➜</button>`);
      } else if (turno.step === 'attack') {
        botones.push(html`<button data-accion="a-reagrupar">Reagrupar ➜</button>`);
        botones.push(html`<button class="primario" data-accion="fin-turno">Terminar turno</button>`);
      } else {
        botones.push(html`<button class="primario" data-accion="fin-turno">Terminar turno</button>`);
      }
    }
    $('.panel-botones').innerHTML = botones.join('');

    $('.registro').innerHTML = registro.slice(-4).map((r) => `<li>${r}</li>`).join('');

    revisarModales();
    revisarTelon();
  }

  function textoAyuda() {
    const e = estado();
    if (e.phase === 'finished') return motivo(e.winner.reason);
    if (jugador(actual()).bot) return `Juega ${jugador(actual()).name}…`;
    if (!miTurno()) return modo === 'online' ? 'Esperá tu turno. Podés tocar un territorio para ver de quién es.' : '';
    if (e.phase === 'setup') return `Tocá tus territorios para ubicar ejércitos: te quedan ${e.setup.remaining}.`;
    const turno = e.turn;
    if (turno.step === 'reinforce') {
      if (jugador(yo()).cards.length >= e.config.forcedTradeAt) return 'Tenés 5 tarjetas o más: canjeá antes de incorporar.';
      return turno.reinforcements > 0
        ? `Tocá tus territorios para incorporar ejércitos: te quedan ${turno.reinforcements}.`
        : 'Listo. Tocá "A atacar".';
    }
    if (turno.step === 'attack') {
      return sel
        ? `Atacando desde ${nombreT(sel)} (${e.territories[sel].armies}). Tocá un enemigo marcado.`
        : 'Tocá uno de tus territorios (con 2 o más ejércitos) para atacar desde ahí.';
    }
    return sel
      ? `Moviendo desde ${nombreT(sel)}. Tocá un territorio tuyo marcado.`
      : 'Reagrupá: tocá un territorio tuyo y después uno vecino tuyo.';
  }

  const motivo = (r) => ({
    objective: 'Cumplió su objetivo secreto.',
    common: `Llegó a ${estado().config.commonTerritories} territorios.`,
    lastStanding: 'Eliminó a todos los demás.',
  })[r];

  // ------------------------------------------------------------------ eventos (dados y registro)

  function procesarEvento(anterior) {
    const ev = partida.evento;
    if (ev.n === ultimoN) return;
    const seguido = ultimoN !== null && ev.n === ultimoN + 1;
    ultimoN = ev.n;
    if (!seguido) return; // recién entramos: no repetimos jugadas viejas
    if (anterior && ev.lista.some((e) => e.type === 'attack')) congelarHastaLosDados(anterior);
    for (const e of ev.lista) {
      const linea = describir(e);
      if (linea) (estadoPrevio ? registroEnEspera : registro).push(linea);
      if (e.type === 'attack') {
        const colorAtaque = hexDe(jugador(e.player).color);
        mapa.marcarBatalla(e.from, e.to, colorAtaque);
        // si ataca otro (o un bot), el mapa lo sigue; en los ataques propios ya estás mirando ahí
        if (!(miTurno() && e.player === yo())) mapa.enfocar(e.from, e.to);
        dados.mostrar({
          ataque: e.attackDice,
          defensa: e.defendDice,
          colorAtaque,
          colorDefensa: hexDe(jugador(e.defender).color),
          tituloHtml: tituloBatalla(e),
          texto: resumenAtaque(e),
        });
      }
    }
    if (registro.length > 60) registro.splice(0, registro.length - 60);
  }

  /** Muestra `anterior` en el mapa hasta que terminen de rodar los dados de este ataque. */
  function congelarHastaLosDados(anterior) {
    const yaEsperando = estadoPrevio !== null;
    estadoPrevio = anterior;
    if (yaEsperando) return;
    // se registra antes de dados.mostrar(), pero libre() se resuelve recién cuando termina la cola
    queueMicrotask(() => dados.libre().then(() => {
      estadoPrevio = null;
      registro.push(...registroEnEspera.splice(0));
      if (registro.length > 60) registro.splice(0, registro.length - 60);
      if (partida) dibujar();
    }));
  }

  const nom = (pid) => `<b style="color:${hexDe(jugador(pid).color)}">${esc(jugador(pid).name)}</b>`;
  /** "Argentina ⚔ Brasil" en grande, con el color y el nombre de cada jugador abajo. */
  function tituloBatalla(e) {
    const lado = (tid, pid) => html`<span class="lado">
      <b style="color:${hexDe(jugador(pid).color)}">${esc(nombreT(tid))}</b>
      <small>${esc(jugador(pid).name)}</small></span>`;
    return html`<div class="batalla">${lado(e.from, e.player)}<span class="vs">⚔</span>${lado(e.to, e.defender)}</div>`;
  }
  function resumenAtaque(e) {
    const a = jugador(e.player).name;
    const d = jugador(e.defender).name;
    const partes = [];
    if (e.attackerLosses) partes.push(`${a} pierde ${e.attackerLosses}`);
    if (e.defenderLosses) partes.push(`${d} pierde ${e.defenderLosses}`);
    return `${partes.join(' · ')}${e.conquered ? ` — ¡${a} conquista ${nombreT(e.to)}!` : ''}`;
  }
  function describir(e) {
    switch (e.type) {
      case 'attack':
        return `${nom(e.player)} atacó ${nombreT(e.to)} desde ${nombreT(e.from)}: ${e.attackDice.join('-')} contra ${e.defendDice.join('-')}`
          + `${e.conquered ? ' y lo <b>conquistó</b>' : ` (−${e.attackerLosses} / −${e.defenderLosses})`}`;
      case 'traded':
        return `${nom(e.player)} canjeó tarjetas: +${e.armies}${e.bonusTerritory ? ` y +${e.bonusArmies} en ${nombreT(e.bonusTerritory)}` : ''}`;
      case 'eliminated': return `💀 ${nom(e.by)} eliminó a ${nom(e.player)}`;
      case 'cardDrawn': return `${nom(e.player)} sacó una tarjeta`;
      case 'turnStarted': return `Turno de ${nom(e.player)} (+${e.reinforcements})`;
      case 'victory': return `🏆 ¡Ganó ${nom(e.player)}!`;
      case 'replacedByBot': return `🤖 El anfitrión sacó a ${nom(e.player)}: sigue un bot en su lugar`;
      default: return null;
    }
  }

  // ------------------------------------------------------------------ modales

  function abrir(tipo, contenido) {
    modalAbierto = tipo;
    modal.innerHTML = contenido;
    if (!modal.open) modal.showModal();
  }
  function cerrar() {
    modalAbierto = null;
    if (modal.open) modal.close();
  }
  modal.addEventListener('close', () => (modalAbierto = null));
  modal.addEventListener('click', (ev) => {
    if (ev.target === modal && modalAbierto !== 'mover' && modalAbierto !== 'fin') return cerrar();
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.cerrar !== undefined) return cerrar();
    if (b.dataset.mover) {
      cerrar();
      return hacer({ type: 'moveIn', count: Number(b.dataset.mover) });
    }
    if (b.dataset.tarjeta) {
      b.classList.toggle('elegida');
      return actualizarCanje();
    }
    if (b.dataset.canjear !== undefined) {
      const ids = [...modal.querySelectorAll('.tarjeta.elegida')].map((x) => x.dataset.tarjeta);
      cerrar();
      return hacer({ type: 'trade', cards: ids });
    }
    if (b.dataset.pref) {
      if (b.dataset.pref === 'sonido') {
        sonido = !sonido;
        pref.guardar('sonido', sonido);
        dados.silenciar(!sonido);
      } else if (b.dataset.pref === 'velocidad') {
        const orden = Object.keys(VELOCIDADES);
        velocidad = orden[(orden.indexOf(velocidad) + 1) % orden.length];
        pref.guardar('velocidad', velocidad);
      } else {
        dados3d = !dados3d;
        pref.guardar('dados3d', dados3d);
        dados.usar3D(dados3d);
      }
      return abrirMenu();
    }
    if (b.dataset.reemplazar) {
      // dos toques: el primero pide confirmación
      if (!b.dataset.seguro) {
        b.dataset.seguro = '1';
        b.textContent = `¿Seguro? Tocá de nuevo para sacar a ${jugador(b.dataset.reemplazar).name}`;
        b.classList.add('peligro');
        return;
      }
      cerrar();
      return onReemplazar?.(b.dataset.reemplazar);
    }
    if (b.dataset.salir !== undefined) {
      cerrar();
      return onSalir();
    }
  });

  function revisarModales() {
    const e = estado();
    if (e.phase === 'finished') {
      if (estadoPrevio) return; // el ataque ganador: primero los dados
      if (modalAbierto !== 'fin') abrirFin();
      return;
    }
    const pm = e.turn?.pendingMove;
    if (pm && miTurno()) {
      // primero que terminen de rodar los dados del ataque que conquistó
      if (dados.ocupado()) {
        if (!esperandoDados) {
          esperandoDados = true;
          dados.libre().then(() => {
            esperandoDados = false;
            dibujar();
          });
        }
        return;
      }
      if (modalAbierto !== 'mover') {
        const opciones = [];
        for (let n = pm.min; n <= pm.max; n++) opciones.push(`<button class="primario" data-mover="${n}">${n}</button>`);
        abrir('mover', html`<h2>¡Conquistaste ${nombreT(pm.to)}!</h2>
          <p>¿Cuántos ejércitos pasás desde ${nombreT(pm.from)}?</p>
          <div class="fila">${opciones.join('')}</div>`);
      }
    } else if (modalAbierto === 'mover') {
      cerrar();
    }
  }

  function abrirObjetivo() {
    const e = estado();
    const p = jugador(yo());
    abrir('objetivo', html`<h2>🎯 Tu objetivo secreto</h2>
      <p class="objetivo">${esc(describeObjective(MAPA, e, p.objective))}</p>
      <p class="nota">También ganás si llegás a controlar ${e.config.commonTerritories} territorios (objetivo común).</p>
      <div class="fila"><button data-cerrar>Cerrar</button></div>`);
  }

  function abrirTarjetas() {
    const e = estado();
    const p = jugador(yo());
    const valor = tradeValue(e.config, p.trades);
    const lista = p.cards.length
      ? p.cards.map((c) => {
        const propio = c.territory && e.territories[c.territory].owner === p.id;
        return html`<button class="tarjeta" data-tarjeta="${c.id}">
          <span class="simbolo">${SIMBOLO[c.symbol]}</span>
          <span>${c.territory ? nombreT(c.territory) : 'Comodín'}</span>
          <small>${NOMBRE_SIMBOLO[c.symbol]}${propio ? ' · tuyo (+2)' : ''}</small>
        </button>`;
      }).join('')
      : '<p class="nota">Todavía no tenés tarjetas. Sacás una al final de cada turno en que conquistes algo.</p>';
    abrir('tarjetas', html`<h2>🃏 Tus tarjetas</h2>
      <div class="tarjetas">${lista}</div>
      <p class="nota">Se canjean tres del mismo símbolo o tres distintos (el comodín vale por cualquiera), al incorporar.
      Tu próximo canje da <b>${valor}</b> ejércitos.</p>
      <div class="fila"><button data-cerrar>Cerrar</button><button class="primario" data-canjear disabled>Canjear (+${valor})</button></div>`);
  }

  function actualizarCanje() {
    const p = jugador(yo());
    const ids = [...modal.querySelectorAll('.tarjeta.elegida')].map((x) => x.dataset.tarjeta);
    const cartas = ids.map((id) => p.cards.find((c) => c.id === id));
    const puede = miTurno() && estado().turn?.step === 'reinforce' && cartas.length === 3 && isValidTrade(cartas);
    modal.querySelector('[data-canjear]').disabled = !puede;
  }

  function abrirMenu() {
    // el anfitrión puede sacar a un jugador (por ejemplo, si se fue): lo reemplaza un bot
    const otros = modo === 'online' && esHost && estado().phase !== 'finished'
      ? estado().players.filter((p) => p.id !== miId && !p.bot && p.alive) : [];
    const sacar = otros.length
      ? html`<details><summary>Jugadores</summary><div class="columna">${otros.map((p) => html`
          <button data-reemplazar="${p.id}">${conexiones[p.id] === false ? '📴' : '🟢'} Sacar a ${esc(p.name)} (sigue un bot)</button>`).join('')}
        </div></details>`
      : '';
    abrir('menu', html`<h2>Mundo en Llamas</h2>
      <div class="columna">
        ${sacar}
        <button data-pref="sonido">${sonido ? '🔊 Sonido: sí' : '🔇 Sonido: no'}</button>
        <button data-pref="dados3d">${dados3d ? '🎲 Dados 3D: sí' : '🎲 Dados 3D: no'}</button>
        ${controlaBots && estado().players.some((p) => p.bot)
    ? html`<button data-pref="velocidad">${VELOCIDADES[velocidad].nombre}</button>` : ''}
        <details><summary>Cómo se juega</summary>${reglas()}</details>
        <button data-salir>${modo === 'local' ? 'Salir (la partida queda guardada)' : 'Salir de la partida'}</button>
        <button class="primario" data-cerrar>Volver al juego</button>
      </div>`);
  }

  function abrirFin() {
    const e = estado();
    const filas = e.players.map((p) => html`<li><span class="punto" style="background:${hexDe(p.color)}"></span>
      <b>${esc(p.name)}</b>: ${esc(describeObjective(MAPA, e, p.objective))}</li>`).join('');
    abrir('fin', html`<h2>🏆 ¡Ganó ${esc(jugador(e.winner.player).name)}!</h2>
      <p>${motivo(e.winner.reason)}</p>
      <h3>Los objetivos eran:</h3><ul class="objetivos">${filas}</ul>
      <div class="fila"><button data-cerrar>Ver el mapa</button><button class="primario" data-salir>Volver al inicio</button></div>`);
  }

  // ------------------------------------------------------------------ telón (modo local)
  // Con varios en la misma compu, antes de cada turno se tapa la pantalla para que el que
  // viene no vea los objetivos ni las tarjetas del anterior.
  function revisarTelon() {
    const telon = $('.telon');
    const e = estado();
    const pid = actual();
    // solo hace falta tapar si hay más de un humano y le toca a uno de ellos
    if (modo !== 'local' || e.phase === 'finished' || humanos().length < 2 || jugador(pid).bot) {
      telon.hidden = true;
      return;
    }
    if (telonVisto === pid) return;
    const p = jugador(pid);
    telon.innerHTML = html`<div><span class="punto grande" style="background:${hexDe(p.color)}"></span>
      <h2>Turno de ${esc(p.name)}</h2><p>Pasale la compu y tocá para empezar.</p>
      <button class="primario">Soy ${esc(p.name)}</button></div>`;
    telon.hidden = false;
    telon.querySelector('button').onclick = () => {
      telonVisto = pid;
      telon.hidden = true;
    };
  }

  let ocultarAviso;
  function avisar(texto) {
    const a = $('.aviso');
    a.textContent = texto;
    a.hidden = false;
    clearTimeout(ocultarAviso);
    ocultarAviso = setTimeout(() => (a.hidden = true), 2600);
  }

  // ------------------------------------------------------------------ bots
  // Cuando le toca a un bot, este dispositivo (si es el que los controla) pide su próxima
  // acción y la envía como cualquier otra jugada. Espera a que terminen los dados para que se vea.
  let botProgramado = null;
  function moverBots() {
    const e = estado();
    if (!controlaBots || e.phase === 'finished') return;
    const pid = actual();
    if (!jugador(pid).bot) return;
    const n = partida.evento.n;
    if (botProgramado === n) return;
    botProgramado = n;
    // pausas para poder seguir lo que hace: más largas al empezar su turno y después de cada tirada
    const vel = VELOCIDADES[velocidad];
    const lista = partida.evento.lista;
    const pausa = lista.some((x) => x.type === 'turnStarted') ? vel.turno
      : lista.some((x) => x.type === 'attack') ? vel.ataque
        : e.phase === 'setup' ? vel.otro * 0.6 : vel.otro;
    (async () => {
      await dados.libre();
      await new Promise((r) => setTimeout(r, pausa));
      if (partida.evento.n !== n) return; // mientras esperaba llegó otra jugada
      try {
        await enviar(pid, decidirBot(MAPA, estado(), pid));
      } catch (err) {
        console.error('Bot:', err);
        botProgramado = null;
        setTimeout(moverBots, 2000); // por ejemplo, se cortó la conexión: reintenta
      }
    })();
  }

  return {
    /** Muestra un estado nuevo de la partida (después de cada acción, propia o ajena). */
    mostrar(nueva) {
      const anterior = partida?.estado ?? null;
      partida = nueva;
      procesarEvento(anterior);
      dibujar();
      moverBots();
    },
    /** Online: quién está conectado ({ uid: bool }). */
    conexiones(mapa) {
      conexiones = mapa;
      if (partida) dibujar();
    },
  };
}

export function reglas() {
  return `<ul class="reglas">
    <li><b>Objetivo:</b> cumplir tu objetivo secreto o controlar el 60% del mapa.</li>
    <li><b>Incorporar:</b> recibís la mitad de tus territorios (mínimo 3) más el bonus de cada continente completo.</li>
    <li><b>Atacar:</b> desde un territorio con 2 o más ejércitos a uno enemigo limítrofe (las líneas punteadas son cruces por mar).
      El atacante tira un dado menos que sus ejércitos y el defensor uno por ejército, hasta 3 cada uno.
      Se comparan de mayor a menor y el empate lo gana el defensor.</li>
    <li><b>Conquistar:</b> pasás entre 1 y 3 ejércitos al territorio ganado.</li>
    <li><b>Reagrupar:</b> movés ejércitos entre tus territorios vecinos; los que llegan no se vuelven a mover en ese turno.</li>
    <li><b>Tarjetas:</b> si conquistaste algo en el turno, sacás una. Tres iguales o tres distintas se canjean por ejércitos (4, 6, 9, 12, 15 y de ahí +5).</li>
  </ul>`;
}
