# 🔥 Mundo en Llamas

Juego de estrategia y conquista de territorios para el navegador, de 2 a 6 jugadores. Se juega en una sola compu (pasándose el turno) u **online**, cada uno desde su celular o compu, con **bots** para completar la mesa. Los dados 3D son los mismos de La Generala.

**Jugar:** https://m4rt1n1309.github.io/mundo-en-llamas/

## Bots y anfitrión

- **En esta compu:** al armar la partida, cada lugar se marca 👤 persona o 🤖 bot. Si hay un solo humano no aparece el telón entre turnos.
- **Online:** el anfitrión agrega bots con "+ 🤖 Bot" en la sala de espera y saca a quien quiera con ✕. Los bots juegan desde el dispositivo del anfitrión: si el anfitrión cierra la página, los bots esperan a que vuelva.
- **Sacar a alguien en plena partida** (☰ → Jugadores): su lugar lo sigue jugando un bot, así no se traba la partida si alguien se fue. Esa persona ya no puede volver a entrar.
- El bot (`src/bot.js`) junta los refuerzos en su mejor frontera, ataca con ventaja, apunta a su objetivo secreto y a completar continentes, canjea tarjetas apenas puede y lleva los ejércitos del interior a la frontera.

## Cómo funciona

No tiene servidor propio, igual que La Generala:

- **GitHub Pages** publica la página. Se actualiza sola en cada push a `main` (`.github/workflows/pages.yml`).
- **Firebase Realtime Database** (plan gratis) guarda cada sala: jugadores y estado de la partida.
- El jugador de turno aplica su jugada con el motor de reglas (`src/engine`) y guarda el resultado. Las reglas de Firebase solo dejan escribir la partida a quien tiene el turno (y al anfitrión, para empezarla).
- Las salas que pasan **24 horas sin actividad** se borran solas cuando alguien crea una sala nueva.

Como en La Generala, los dados los tira el dispositivo del jugador de turno: entre amigos no importa, pero alguien que sepa programar podría hacer trampa en su propio turno o espiar los objetivos ajenos.

## Configurar Firebase (una sola vez)

1. En [console.firebase.google.com](https://console.firebase.google.com): **Agregar proyecto** (sin Google Analytics).
2. **Compilación → Authentication → Comenzar →** habilitar el proveedor **Anónimo**.
3. **Compilación → Realtime Database → Crear base de datos** (en modo bloqueado). Después, en la pestaña **Reglas**, pegar el contenido de `database.rules.json` y **Publicar**.
4. **Configuración del proyecto → Tus apps → Web (`</>`)**: registrar la app y copiar los datos de `firebaseConfig` en `src/firebase-config.js`. No son secretos: lo que protege los datos son las reglas.
5. Crear `.firebaserc` con `{ "projects": { "default": "<id-del-proyecto>" } }` (para `npm run deploy-rules`).
6. Subir los cambios a GitHub.

## Publicar en GitHub Pages (una sola vez)

En el repo de GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Desarrollo

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # reglas, mapa y partidas simuladas
npm run build:map    # regenera el dibujo del mapa (después de tocar src/map/mundo.js)
```

Modo online en la compu sin tocar el Firebase real: `npm run emuladores` (necesita Java; la versión 10 de firebase-tools anda con Java 8) y abrir http://localhost:5173/?emulador. Mientras `src/firebase-config.js` diga `PEGAR`, en localhost se usa el emulador solo. Agregando `&otro` a la dirección, esa pestaña entra como otro jugador.

## Reglas

- **Objetivo:** cumplir tu objetivo secreto (conquistar continentes o destruir a un jugador) o controlar el 60% del mapa.
- **Inicio:** territorios repartidos al azar; dos rondas para ubicar 5 y 3 ejércitos.
- **Turno:** incorporar → atacar → reagrupar.
- **Incorporar:** la mitad de tus territorios (mínimo 3) más el bonus de cada continente completo.
- **Atacar:** el atacante tira un dado menos que sus ejércitos y el defensor uno por ejército, hasta 3 cada uno. Se comparan de mayor a menor; el empate lo gana el defensor. Al conquistar se pasan de 1 a 3 ejércitos.
- **Reagrupar:** entre territorios propios vecinos; lo que llega no se vuelve a mover en ese turno.
- **Tarjetas:** una por turno si conquistaste algo. Tres iguales o tres distintas (el comodín vale por cualquiera) se canjean por 4, 6, 9, 12, 15 y de ahí +5, sin tope. Con 5 tarjetas el canje es obligatorio.

Valores ajustables en `DEFAULT_CONFIG` (`src/engine/game.js`).

## Estructura

- `src/engine/`: reglas puras (sin navegador ni red), con tests.
- `src/map/mundo.js`: los 49 territorios, continentes, fronteras y objetivos. `mundo-geo.json` es el dibujo generado por `scripts/build-map.js` a partir de Natural Earth.
- `src/partida.js`: la partida tal como se guarda (estado + último evento + de quién es el turno).
- `src/bot.js`: el bot.
- `src/red.js`: Firebase (salas, presencia, jugadas).
- `src/ui/`: mapa SVG, dados 3D y pantalla de juego. `src/main.js`: pantallas de inicio y sala.
- `database.rules.json`: reglas de seguridad de Firebase.
