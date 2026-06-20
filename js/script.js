"use strict";

/* ===========================================================================
   1. CONFIGURACIÓN E INVENTARIO
   40 Bufandas, 20 Billeteras, 20 Giftcards (80 en total).
   =========================================================================== */
const INVENTARIO_INICIAL = { bufanda: 40, billetera: 20, giftcard: 20 };

// Colores de gajo derivados de la paleta de marca.
// Interior de la ruleta en el azul oscuro de marca (uniforme).
// El premio no se distingue por color: se revela en el modal al ganar.
const PREMIOS = {
  bufanda:   { etiqueta: "Bufanda",   color: "#051C2C" },
  billetera: { etiqueta: "Billetera", color: "#051C2C" },
  giftcard:  { etiqueta: "Giftcard de $40.000", color: "#051C2C" }
};

/* Cada unidad de premio es un gajo individual: así la probabilidad queda
   ligada al stock (count/total) y se recalcula sola al descontar. */
function construirGajos() {
  const lista = [];
  for (const tipo in INVENTARIO_INICIAL) {
    for (let i = 0; i < INVENTARIO_INICIAL[tipo]; i++) lista.push(tipo);
  }
  return mezclarFisherYates(lista);
}

// Fisher-Yates: reparte e intercala los premios aleatoriamente.
function mezclarFisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------------------------------------------------------------------
   PERSISTENCIA (localStorage)
   El inventario sobrevive a recargas y a cerrar/abrir el archivo.
   Nota: es por navegador y por dispositivo. Para un kiosco (un solo equipo)
   funciona perfecto; para varios dispositivos compartiendo stock se necesita
   un servidor.
   --------------------------------------------------------------------------- */
const CLAVE_STOCK = "newman_ruleta_stock_v1";

function guardarStock() {
  try {
    localStorage.setItem(CLAVE_STOCK, JSON.stringify(gajos));
  } catch (e) { /* almacenamiento no disponible: seguimos solo en memoria */ }
}

function cargarStock() {
  try {
    const crudo = localStorage.getItem(CLAVE_STOCK);
    if (crudo === null) return null;            // no hay nada guardado todavía
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos)) return null;     // dato corrupto -> ignorar
    // Validamos que solo contenga tipos conocidos
    const ok = datos.every(t => t in INVENTARIO_INICIAL);
    return ok ? datos : null;
  } catch (e) { return null; }
}

// Si la URL trae ?reset (o #reset), empezamos de cero ignorando lo guardado.
const PIDE_RESET = /(?:[?&]|#)reset\b/i.test(location.search + location.hash);

// Inventario activo: lo guardado, o uno nuevo si no existe / se pidió reset.
let gajos = (!PIDE_RESET && cargarStock()) || construirGajos();
guardarStock();

/* ===========================================================================
   2. DIBUJO DE LA RULETA
   =========================================================================== */
const canvas = document.getElementById("ruleta");
const ctx = canvas.getContext("2d");

const TAM = 460, CENTRO = TAM / 2, RADIO = 214, BEZEL = 5, TAU = Math.PI * 2;

(function configurarAltaResolucion() {
  // El tamaño visible lo controla el CSS (100% del envoltorio responsivo).
  // Aquí solo fijamos la resolución interna para que se vea nítido.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = TAM * dpr;
  canvas.height = TAM * dpr;
  ctx.scale(dpr, dpr);
})();

let rotacionActual = 0;

function dibujarRuleta(rotacion) {
  ctx.clearRect(0, 0, TAM, TAM);

  // Aro/borde de la ruleta en color sólido #d6d2c6 (fijo)
  ctx.beginPath();
  ctx.arc(CENTRO, CENTRO, RADIO + BEZEL, 0, TAU);
  ctx.fillStyle = "#d6d2c6";
  ctx.fill();

  const n = gajos.length;
  if (n === 0) {
    ctx.beginPath();
    ctx.arc(CENTRO, CENTRO, RADIO, 0, TAU);
    ctx.fillStyle = "#051C2C";
    ctx.fill();
    return;
  }

  const seg = TAU / n; // tamaño de cada gajo (se recalcula solo con el stock)

  ctx.save();
  ctx.translate(CENTRO, CENTRO);
  ctx.rotate(rotacion);

  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * seg;  // -PI/2 => origen a las 12 en punto
    const a1 = a0 + seg;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, RADIO, a0, a1);
    ctx.closePath();

    ctx.fillStyle = PREMIOS[gajos[i]].color;
    ctx.fill();

    // Separador greige fino: marca cada gajo y hace visible el giro.
    ctx.strokeStyle = "rgba(214, 210, 198, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // Filo fino que separa los gajos del aro metálico
  ctx.beginPath();
  ctx.arc(CENTRO, CENTRO, RADIO, 0, TAU);
  ctx.strokeStyle = "rgba(5,28,44,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* ===========================================================================
   AUDIO (Web Audio API, todo sintetizado, sin archivos externos)
   - tic(): clic mecánico de la ruleta al pasar cada gajo.
   - ganar(): pequeño arpegio de celebración.
   El contexto se "despierta" con el clic del botón (gesto del usuario), como
   exigen los navegadores para reproducir sonido.
   =========================================================================== */
const Sonido = (function () {
  let ctx = null;

  function asegurar() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tic() {
    const c = asegurar(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1150 + Math.random() * 200, t); // leve variación
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.002);      // ataque rápido
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);    // caída corta
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.06);
  }

  function ganar() {
    const c = asegurar(); if (!c) return;
    const t0 = c.currentTime;
    const notas = [523.25, 659.25, 783.99, 1046.50]; // Do-Mi-Sol-Do (arpegio)
    notas.forEach((f, i) => {
      const t = t0 + i * 0.11;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.26, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.55);
    });
  }

  return { asegurar, tic, ganar };
})();

/* ===========================================================================
   3. FÍSICA Y CONTROL DEL GIRO
   12 a 16 vueltas + Quintic Ease-Out + alineación exacta con la flecha.
   =========================================================================== */
let girando = false;
const botonGirar = document.getElementById("botonGirar");
const TEXTO_AGOTADO = "SE HAN ACABO LOS PREMIOS";

botonGirar.addEventListener("click", girar);

function girar() {
  if (girando || gajos.length === 0) return;
  girando = true;
  botonGirar.disabled = true;
  Sonido.asegurar();          // habilita el audio dentro del gesto del usuario

  const n = gajos.length;
  const seg = TAU / n;

  const indiceGanador = Math.floor(Math.random() * n);
  const tipoGanador = gajos[indiceGanador];

  const vueltas = 12 + Math.floor(Math.random() * 5); // 12..16

  // Rotación que deja el centro del gajo ganador bajo la flecha superior.
  const objetivoMod = (((-(indiceGanador + 0.5) * seg) % TAU) + TAU) % TAU;
  const inicio = rotacionActual;
  const actualMod = ((inicio % TAU) + TAU) % TAU;
  const avanceFino = (objetivoMod - actualMod + TAU) % TAU;
  const avanceTotal = vueltas * TAU + avanceFino;

  const duracion = 6500;
  const t0 = performance.now();

  // Control de "tics": uno por cada gajo que cruza la flecha, con una
  // separación mínima para que al inicio (muy rápido) no suene a zumbido.
  let ultimoIndiceTic = Math.floor(inicio / seg);
  let ultimoTicMs = 0;
  const SEPARACION_TIC = 28; // ms

  function animar(ahora) {
    let t = (ahora - t0) / duracion;
    if (t > 1) t = 1;
    const e = 1 - Math.pow(1 - t, 5); // Quintic Ease-Out
    rotacionActual = inicio + avanceTotal * e;
    dibujarRuleta(rotacionActual);

    // ¿Cruzó uno o más límites de gajo desde el último cuadro?
    const indiceTic = Math.floor(rotacionActual / seg);
    if (indiceTic !== ultimoIndiceTic) {
      if (ahora - ultimoTicMs >= SEPARACION_TIC) {
        Sonido.tic();
        ultimoTicMs = ahora;
      }
      ultimoIndiceTic = indiceTic;
    }

    if (t < 1) {
      requestAnimationFrame(animar);
    } else {
      rotacionActual = (inicio + avanceTotal) % TAU;
      finalizarGiro(indiceGanador, tipoGanador);
    }
  }
  requestAnimationFrame(animar);
}

function finalizarGiro(indice, tipo) {
  gajos.splice(indice, 1);   // descuento del stock global
  guardarStock();            // persistimos el nuevo inventario
  actualizarStock();         // refrescamos la pantalla de stock
  dibujarRuleta(rotacionActual);
  Sonido.ganar();            // arpegio de celebración
  mostrarModal(tipo);
}

/* ===========================================================================
   4. MODAL DE RESULTADO
   =========================================================================== */
const modalFondo = document.getElementById("modalFondo");
const mensajeModal = document.getElementById("mensajeModal");
const botonAceptar = document.getElementById("botonAceptar");

function mostrarModal(tipo) {
  const etiqueta = PREMIOS[tipo].etiqueta;
  mensajeModal.innerHTML =
    "¡Felicidades, ganaste una <strong>" + etiqueta + "</strong>!";
  modalFondo.classList.add("visible");
  modalFondo.setAttribute("aria-hidden", "false");
  botonAceptar.focus();
}

botonAceptar.addEventListener("click", cerrarModal);

function cerrarModal() {
  modalFondo.classList.remove("visible");
  modalFondo.setAttribute("aria-hidden", "true");
  girando = false;

  if (gajos.length === 0) {
    botonGirar.textContent = TEXTO_AGOTADO;
    botonGirar.disabled = true;
  } else {
    botonGirar.disabled = false;
    botonGirar.focus();
  }
}

/* ===========================================================================
   PANTALLA DE STOCK (táctil)
   Muestra el total restante siempre visible; al tocarla despliega el detalle
   por tipo. No usa teclado: funciona con toque en tablet.
   =========================================================================== */
const pantallaStock = document.getElementById("pantallaStock");
const psNum = document.getElementById("psNum");
const psSuf = document.getElementById("psSuf");
const psBuf = document.getElementById("psBuf");
const psBil = document.getElementById("psBil");
const psGif = document.getElementById("psGif");

function contarStock() {
  const c = { bufanda: 0, billetera: 0, giftcard: 0 };
  for (const t of gajos) c[t]++;
  return c;
}

function actualizarStock() {
  const c = contarStock();
  psNum.textContent = gajos.length;
  psSuf.textContent = (gajos.length === 1) ? "premio restante" : "premios restantes";
  psBuf.textContent = c.bufanda;
  psBil.textContent = c.billetera;
  psGif.textContent = c.giftcard;
}

// Toque: alterna el detalle desplegado.
pantallaStock.addEventListener("click", function () {
  const abierta = pantallaStock.classList.toggle("abierta");
  pantallaStock.setAttribute("aria-expanded", abierta ? "true" : "false");
});

/* ===========================================================================
   REINICIO MANUAL DEL INVENTARIO (protegido)
   Dos formas, ambas pensadas para que nadie lo borre por accidente:
     1. Abrir el archivo con  ?reset  en la URL  (ej: ...ruleta-newman.html?reset)
     2. Atajo de teclado  Ctrl + Alt + R  (pide confirmación)
   =========================================================================== */
function reiniciarInventario() {
  gajos = construirGajos();
  guardarStock();
  rotacionActual = 0;
  girando = false;
  dibujarRuleta(rotacionActual);

  modalFondo.classList.remove("visible");
  modalFondo.setAttribute("aria-hidden", "true");
  botonGirar.textContent = "Girar";
  botonGirar.disabled = false;
  actualizarStock();
}

document.addEventListener("keydown", function (e) {
  if (e.ctrlKey && e.altKey && (e.key === "r" || e.key === "R")) {
    e.preventDefault();
    if (confirm("¿Reiniciar el inventario a 80 premios? Esta acción no se puede deshacer.")) {
      reiniciarInventario();
    }
  }
});

/* ===========================================================================
   ARRANQUE
   =========================================================================== */
dibujarRuleta(rotacionActual);
actualizarStock();

// Si lo guardado ya estaba agotado, dejamos el botón bloqueado desde el inicio.
if (gajos.length === 0) {
  botonGirar.textContent = TEXTO_AGOTADO;
  botonGirar.disabled = true;
}

