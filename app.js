// Pantalla de la app de registro de sueño. La lógica de datos está en datos.js.
import {
  TRAMOS, NOMBRES, COMO, mediana, historico, filaAObj, pad, local, fecha, hm, hoyStr, masDias, sumarMin, minEntre, durTxt, durCorta,
  ini, abierto, leerLS, escribirLS, db, onCambio, vivos, guardar, cambiar, guardarFicha, estadoActual, jornada,
  prediccion, derivarNoche, enviar, recibir, probarConexion, guardarConfig, borrarTodo,
} from './datos.js';
import { pintarHistorial } from './historial.js';

const $ = (s, raiz = document) => raiz.querySelector(s);
const vibrar = (ms = 12) => { try { navigator.vibrate?.(ms); } catch (e) { /* sin vibración */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- iconos (trazo, 24×24) ----------
const P = {
  sol: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  luna: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/>',
  siesta: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 10 4.25 4.25 0 0 0 7 18.5z"/><path d="M15 3.5h3l-3 3h3"/>',
  toma: '<path d="M9.5 2.8h5M10.5 2.8v2.6L8.2 8.6v10.6a2 2 0 0 0 2 2h3.6a2 2 0 0 0 2-2V8.6l-2.3-3.2V2.8"/><path d="M8.2 12.5h7.6M8.2 16h4"/>',
  cuna: '<path d="M3.5 6v14M20.5 6v14M3.5 10.5h17M3.5 17h17M7.5 10.5V17M11.5 10.5V17M15.5 10.5V17"/>',
  llanto: '<path d="M12 3.2s5.8 6.3 5.8 10.5a5.8 5.8 0 0 1-11.6 0C6.2 9.5 12 3.2 12 3.2z"/>',
  calma: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 10h.01M15 10h.01"/>',
  rayo: '<path d="M13.2 2.5 5 13.5h6l-1.2 8 8.2-11h-6z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19.5 7"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  puntos: '<circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>',
  compartir: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.6M4 5v4h4M4 13a8 8 0 0 0 14.3 4.6M20 19v-4h-4"/>',
  salir: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16.5 14.5 12 10 7.5M14.5 12H4"/>',
  nota: '<path d="M5 4h10l4 4v12H5z"/><path d="M8.5 12h7M8.5 16h5"/>',
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n]}</svg>`;
const ICO_TIPO = { despertar: 'sol', a_la_cuna: 'cuna', llanto: 'llanto', dormido: 'luna', siesta: 'siesta', despertar_noche: 'rayo', toma: 'toma' };
const COLOR_TIPO = { despertar: 'var(--despierto)', a_la_cuna: 'var(--cuna)', llanto: 'var(--llanto)', dormido: 'var(--noche)', siesta: 'var(--siesta)', despertar_noche: 'var(--despierto)', toma: 'var(--toma)' };


// ---------- intervalos de sueño (para el reloj y las líneas) ----------
// Devuelve [{cls, a, b, ev}] con a/b en texto de fecha local; los abiertos acaban «ahora»
function intervalos(ahora = local()) {
  const ev = vivos();
  const out = [];
  for (const e of ev) {
    if (e.tipo === 'siesta') out.push({ cls: 'siesta', a: e.ini, b: e.fin || ahora, ev: e, vivo: !e.fin });
    if (e.tipo === 'despertar_noche') out.push({ cls: 'desp', a: e.ini, b: e.fin || ahora, ev: e, vivo: !e.fin });
    if (e.tipo === 'llanto') out.push({ cls: 'llanto', a: e.ini, b: e.fin || ahora, ev: e, vivo: !e.fin });
    if (e.tipo === 'toma') out.push({ cls: 'toma', a: e.ini, b: e.fin || ahora, ev: e, vivo: !e.fin });
    if (e.tipo === 'dormido') {
      const fin = ev.find((x) => x.tipo === 'despertar' && x.t > e.t);
      out.push({ cls: 'noche', a: e.t, b: fin ? fin.t : ahora, ev: e, vivo: !fin });
    }
    if (e.tipo === 'a_la_cuna') {
      const dorm = ev.find((x) => x.tipo === 'dormido' && x.t >= e.t);
      if (!dorm || minEntre(e.t, dorm.t) < 240) out.push({ cls: 'cuna', a: e.t, b: dorm ? dorm.t : ahora, ev: e, vivo: !dorm });
    }
  }
  return out;
}

// ---------- reloj de 24 h ----------
const C = 170, R = 128;
const angulo = (s) => { const d = fecha(s); return ((d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60) / 1440) * 2 * Math.PI - Math.PI / 2; };
const punto = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
function arco(r, a, b) {
  const min = Math.max(0, (fecha(b) - fecha(a)) / 60000);
  if (min < 1) return '';
  const barrido = Math.min(min, 1439.5) / 1440 * 2 * Math.PI;
  const a1 = angulo(a), a2 = a1 + barrido;
  const [x1, y1] = punto(r, a1), [x2, y2] = punto(r, a2);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${barrido > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

// ---------- jornadas: la noche desde que se duerme + el día siguiente hasta volver a dormirse ----------
// La jornada «D» empieza con el dormido de la tarde/noche de D−1 y acaba con el dormido de la tarde de D.
// Su sueño total es el «Total 24-hour sleep» del Excel (noche anterior + siestas del día).
function dormidoEntre(a, b) { return vivos().filter((e) => e.tipo === 'dormido' && e.t > a && e.t < b).pop(); }
function jornadaActual(st) {
  if (st.fase === 'noche') {                       // dormido (o despierto/tomando) por la noche: ya es la jornada siguiente
    const dorm = vivos().filter((e) => e.tipo === 'dormido').pop();
    if (dorm) { const d = dorm.t.slice(0, 10); return Number(dorm.t.slice(11, 13)) < 12 ? d : masDias(d, 1); }
  }
  return hoyStr();
}
function ventanaJornada(D, actual) {
  const ini = dormidoEntre(masDias(D, -1) + 'T12:00:00', D + 'T12:00:00');
  const fin = dormidoEntre(D + 'T12:00:00', masDias(D, 1) + 'T12:00:00');
  const desde = ini ? ini.t : masDias(D, -1) + 'T21:00:00';
  const hasta = fin ? fin.t : actual ? local() : masDias(D, 1) + 'T04:00:00';
  return { D, actual, desde, hasta, conInicio: !!ini, cerrada: !!fin };
}

function pintarDial(win, pred) {
  const ahora = local();
  const { desde, actual } = win;
  const hasta = actual ? ahora : win.hasta;
  const clip = (x) => ({ ...x, a: x.a < desde ? desde : x.a, b: x.b > hasta ? hasta : x.b });
  // la cuna y el llanto de antes del inicio son del acostar de la jornada anterior: fuera
  const ivs = intervalos(ahora).filter((x) => x.b > desde && x.a < hasta && !((x.cls === 'cuna' || x.cls === 'llanto') && x.a < desde)).map(clip);
  let s = `<circle class="pista" cx="${C}" cy="${C}" r="${R}"/>`;
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    const mayor = h % 6 === 0;
    const [x1, y1] = punto(R + 17, a), [x2, y2] = punto(R + (mayor ? 25 : 21), a);
    s += `<line class="marca${mayor ? '' : ' menor'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    if (mayor) { const [tx, ty] = punto(R + 36, a); s += `<text class="hora" x="${tx}" y="${ty}">${pad(h)}</text>`; }
  }
  if (pred && !pred.sinDatos && pred.cuando > ahora) {
    const dur = pred.tipo === 'dormir' ? 90 : 50;
    // franja suave (no es un registro) + bordes punteados + etiqueta por dentro del anillo
    const fin = sumarMin(pred.cuando, dur);
    s += `<path class="arco prevista" d="${arco(R, pred.cuando, fin)}"/>`;
    s += `<path class="prevista-borde" d="${arco(R + 13, pred.cuando, fin)}"/><path class="prevista-borde" d="${arco(R - 13, pred.cuando, fin)}"/>`;
    const medio = angulo(sumarMin(pred.cuando, dur / 2));
    const [lx, ly] = punto(R - 31, medio);
    s += `<text class="prevista-t" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${pred.tipo === 'dormir' ? 'dormir' : 'siesta'} ≈ ${hm(pred.cuando)}</text>`;
  }
  const dibujar = (cls, r, filtro) => ivs.filter(filtro).forEach((x) => {
    const d = arco(r, x.a, x.b);
    if (d) s += `<path class="arco ${cls}${x.vivo && actual ? ' vivo' : ''}" data-id="${x.ev.id}" d="${d}"/>`;
  });
  dibujar('noche', R, (x) => x.cls === 'noche');
  dibujar('siesta', R, (x) => x.cls === 'siesta');
  dibujar('despierto-noche', R, (x) => x.cls === 'desp');
  dibujar('cuna', R - 24, (x) => x.cls === 'cuna');
  dibujar('llanto', R - 24, (x) => x.cls === 'llanto');
  ivs.filter((x) => x.cls === 'toma').forEach((x) => { const [px, py] = punto(R, angulo(x.a)); s += `<circle class="toma" data-id="${x.ev.id}" cx="${px}" cy="${py}" r="6.5"/>`; });
  if (win.conInicio) {                              // marca de inicio de la jornada (se durmió)
    const [ix, iy] = punto(R, angulo(desde));
    s += `<circle class="inicio" cx="${ix}" cy="${iy}" r="9"/><path class="inicio-luna" transform="translate(${ix - 6} ${iy - 6}) scale(.5)" d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/>`;
  }
  if (actual) {
    const [nx, ny] = punto(R, angulo(ahora));
    s += `<circle class="ahora-halo" cx="${nx}" cy="${ny}" r="5"/><circle class="ahora" cx="${nx}" cy="${ny}" r="5"/>`;
  }
  if (!ivs.length) s += `<text class="vacio-dial" x="${C}" y="${C + 70}">sin registros con hora</text>`;
  $('#dial').innerHTML = s;
}
$('#dial').addEventListener('click', (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (id && db.eventos.get(id)) { vibrar(); abrirEditor(db.eventos.get(id)); }
});

// ---------- centro del reloj ----------
const reloj = (seg) => {
  seg = Math.max(0, Math.floor(seg));
  if (seg < 3600) return `${pad(Math.floor(seg / 60))}:${pad(seg % 60)}`;
  return `${Math.floor(seg / 3600)}h ${pad(Math.floor((seg % 3600) / 60))}m`;
};
let modoAnterior = null;
function pintarCentro(st) {
  const desde = (s) => (Date.now() - fecha(s).getTime()) / 1000;
  let et = '', t = '', sub = '';
  switch (st.modo) {
    case 'siesta': et = 'Siesta'; t = reloj(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    case 'acostando': {
      const llantoSeg = vivos().filter((e) => e.tipo === 'llanto' && e.ini >= st.ev.t)
        .reduce((a, e) => a + ((e.fin ? fecha(e.fin) : new Date()) - fecha(e.ini)) / 1000, 0);
      et = st.llanto ? 'Llorando' : 'En la cuna';
      t = reloj(desde(st.ev.t));
      sub = `llanto <b>${reloj(llantoSeg)}</b>`;
      break;
    }
    case 'noche': et = 'Durmiendo'; t = reloj(desde(st.ev.t)); sub = 'desde las ' + hm(st.ev.t); break;
    case 'despertar_noche': et = 'Despierto'; t = reloj(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    case 'toma': et = 'Toma'; t =reloj(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    default:
      if (st.desde) { et = 'Despierto'; t = reloj(desde(st.desde)); sub = 'desde las ' + hm(st.desde); }
      else { et = 'Hola'; t = '—'; sub = 'Pulsa «Se despertó» para empezar'; }
  }
  $('#c-etiqueta').textContent = et;
  $('#c-tiempo').textContent = t;
  $('#c-tiempo').classList.remove('total');
  $('#c-sub').innerHTML = sub;
  const clave = st.modo + (st.llanto ? '+' : '');
  if (modoAnterior && modoAnterior !== clave) { const c = $('#centro'); c.classList.remove('cambio'); void c.offsetWidth; c.classList.add('cambio'); }
  modoAnterior = clave;
  document.body.className = 'fase-' + (st.modo === 'siesta' ? 'dia' : st.fase);
}

// ---------- acciones ----------
function registrar(e, texto, campo) { const ev = guardar(e); vibrar(18); pintar(); aviso(texto, ev, campo); }
function cerrarEv(ev, cuando, texto) { const e = guardar({ ...ev, fin: cuando }); vibrar(18); pintar(); aviso(texto, e, 'fin'); }
// Cada acción recibe la hora real («cuando»): ahora, o la que se elija en el panel si se pulsó tarde
const ACC = {
  despertar: (st, cuando) => {
    vivos().filter(abierto).forEach((e) => guardar({ ...e, fin: e.ini > cuando ? e.ini : cuando }));
    registrar({ tipo: 'despertar', t: cuando }, 'Buenos días', 't');
  },
  siesta: (st, cuando) => registrar({ tipo: 'siesta', ini: cuando, como: 'cuna' }, 'Siesta empezada', 'ini'),
  finSiesta: (st, cuando) => cerrarEv(st.ev, cuando, 'Siesta terminada'),
  cuna: (st, cuando) => registrar({ tipo: 'a_la_cuna', t: cuando }, 'A la cuna', 't'),
  llora: (st, cuando) => registrar({ tipo: 'llanto', ini: cuando }, 'Llorando', 'ini'),
  para: (st, cuando) => cerrarEv(st.llanto, cuando, 'Ha parado de llorar'),
  dormido: (st, cuando) => {
    if (st.llanto) guardar({ ...st.llanto, fin: st.llanto.ini > cuando ? st.llanto.ini : cuando });
    registrar({ tipo: 'dormido', t: cuando }, 'Dormido', 't');
  },
  despiertaNoche: (st, cuando) => registrar({ tipo: 'despertar_noche', ini: cuando }, 'Despertar nocturno', 'ini'),
  vuelveDormir: (st, cuando) => cerrarEv(st.ev, cuando, 'Vuelve a dormir'),
  toma: (st, cuando) => {
    if (st.modo === 'despertar_noche') guardar({ ...st.ev, fin: st.ev.ini > cuando ? st.ev.ini : cuando });
    registrar({ tipo: 'toma', ini: cuando }, 'Toma empezada', 'ini');
  },
  finToma: (st, cuando) => cerrarEv(st.ev, cuando, 'Toma terminada'),
};
// Llorar / parar se registran al momento (la rapidez importa); el resto abre el panel de hora
const RAPIDAS = new Set(['llora', 'para']);
// hora mínima válida para cada acción (no puede acabar algo antes de que empezara)
function minimoAccion(accion, st) {
  if (['finSiesta', 'vuelveDormir', 'finToma'].includes(accion)) return st.ev.ini;
  if (accion === 'dormido' && st.modo === 'acostando') return st.ev.t;
  return null;
}
function pulsar(b) {
  const st = estadoActual();
  if (RAPIDAS.has(b.accion)) { ACC[b.accion](st, local()); return; }
  vibrar(8);
  panelHora(b, st);
}

// Panel «¿cuándo?»: botón grande «Ahora» y atajos «hace X min» u otra hora
function panelHora(b, st) {
  const min = minimoAccion(b.accion, st);
  const ahora = local();
  const opciones = [5, 10, 15, 20, 30, 45].map((m) => ({ m, t: sumarMin(ahora, -m) })).filter((o) => !min || o.t >= min);
  abrirHoja(`<h3><span class="r-ico" style="--c:${b.c || 'var(--acento)'}">${ico(b.icono)}</span>${esc(b.texto)}</h3>
    <button type="button" class="ahora-btn" id="ph-ahora">${ico('check')}<span>Ahora <small>${hm(ahora)}</small></span></button>
    ${opciones.length ? `<div class="sub-titulo">Ya pasó hace…</div>
    <div class="hace">${opciones.map((o) => `<button type="button" data-t="${o.t}"><b>${o.m} min</b><small>${hm(o.t)}</small></button>`).join('')}</div>` : ''}
    <details class="otra-hora"><summary>Otra hora</summary>
      ${campoHora('cuando', 'Fue a las', sumarMin(ahora, -5))}
      <button type="button" class="btn primario" id="ph-otra">Guardar</button>
    </details>`, (cont) => {
    montarCampoHora(cont);
    const hecho = (t) => {
      if (t > local()) { alert('La hora no puede ser futura.'); return; }
      if (min && t < min) { alert('No puede ser antes de las ' + hm(min) + '.'); return; }
      cerrarHoja();
      ACC[b.accion](estadoActual(), t);
    };
    $('#ph-ahora', cont).onclick = () => hecho(local());
    cont.querySelectorAll('.hace [data-t]').forEach((x) => { x.onclick = () => hecho(x.dataset.t); });
    $('#ph-otra', cont).onclick = () => hecho(leerCampoHora(cont.querySelector('[data-campo=cuando]')));
  });
}

function botones(st) {
  const h = new Date().getHours();
  const B = (accion, texto, icono, extra = {}) => ({ accion, texto, icono, ...extra });
  switch (st.modo) {
    case 'siesta': return { p: [B('finSiesta', 'Se ha despertado', 'sol')], s: [] };
    case 'acostando': return {
      p: [st.llanto ? B('para', 'Ha parado de llorar', 'calma', { cls: 'llanto activo' }) : B('llora', 'Llora', 'llanto', { cls: 'llanto' }),
        B('dormido', 'Se ha dormido', 'luna')],
      s: [B('toma', 'Toma', 'toma', { c: 'var(--toma)' })],
    };
    case 'noche': return h >= 5 && h < 12
      ? { p: [B('despertar', 'Buenos días', 'sol')], s: [B('despiertaNoche', 'Despertar', 'rayo', { c: 'var(--despierto)' }), B('toma', 'Toma', 'toma', { c: 'var(--toma)' })] }
      : { p: [B('despiertaNoche', 'Se ha despertado', 'rayo')], s: [B('toma', 'Toma', 'toma', { c: 'var(--toma)' }), B('despertar', 'Buenos días', 'sol', { c: 'var(--despierto)' })] };
    case 'despertar_noche': return { p: [B('vuelveDormir', 'Vuelve a dormirse', 'luna')], s: [B('toma', 'Toma', 'toma', { c: 'var(--toma)' }), B('despertar', 'Buenos días', 'sol', { c: 'var(--despierto)' })] };
    case 'toma': return { p: [B('finToma', 'Fin de la toma', 'check')], s: [] };
    default: {
      const tarde = h >= 18 || h < 5;
      const siesta = B('siesta', 'Siesta', 'siesta', { c: 'var(--siesta)' });
      const cuna = B('cuna', 'A la cuna', 'cuna', { c: 'var(--cuna)' });
      const dormido = B('dormido', 'Dormido', 'luna', { c: 'var(--noche)' });
      // sin registros todavía: según la hora, se empieza por la mañana o por la noche
      if (!st.ev) return tarde
        ? { p: [cuna], s: [dormido, B('despertar', 'Se despertó', 'sol', { c: 'var(--despierto)' })] }
        : { p: [B('despertar', 'Se despertó', 'sol')], s: [siesta, cuna] };
      return { p: [tarde ? cuna : siesta], s: [tarde ? siesta : cuna, dormido] };
    }
  }
}

function onda(el, ev) {
  const r = el.getBoundingClientRect();
  const o = document.createElement('span');
  const t = Math.max(r.width, r.height) / 2;
  o.className = 'onda';
  Object.assign(o.style, { width: t + 'px', height: t + 'px', left: ev.clientX - r.left - t / 2 + 'px', top: ev.clientY - r.top - t / 2 + 'px' });
  el.append(o);
  setTimeout(() => o.remove(), 650);
}

function pintarAcciones(st) {
  const cont = $('#acciones');
  const { p, s } = botones(st);
  cont.replaceChildren();
  for (const b of p) {
    const el = document.createElement('button');
    el.className = 'principal-btn ' + (b.cls || '');
    el.innerHTML = ico(b.icono) + `<span>${esc(b.texto)}</span>`;
    el.addEventListener('pointerdown', (e) => onda(el, e));
    el.onclick = () => pulsar(b);
    cont.append(el);
  }
  if (s.length) {
    const fila = document.createElement('div');
    fila.className = 'secundarias';
    for (const b of s) {
      const el = document.createElement('button');
      el.className = 'sec-btn';
      el.style.setProperty('--c', b.c);
      el.innerHTML = `<span class="burbuja">${ico(b.icono)}</span><span>${esc(b.texto)}</span>`;
      el.onclick = () => pulsar(b);
      fila.append(el);
    }
    cont.append(fila);
  }
}

// ---------- tarjetas ----------
const cifra = (v, t, cls = '') => `<div class="cifra ${cls}"><b>${v}</b><span>${t}</span></div>`;
const paraDerivar = () => { const a = local(); return vivos().map((e) => (abierto(e) ? { ...e, fin: a } : e)); };

function pintarProximo(st, pred) {
  const el = $('#proximo');
  if (st.modo !== 'dia' || !pred) { el.hidden = true; return; }
  el.hidden = false;
  if (pred.sinDatos) {
    el.innerHTML = `<div class="p-icono">${ico('siesta')}</div><div class="p-txt"><div class="p-det">Con unos días de registros te diré a qué hora toca la siguiente siesta y la hora de dormir.</div></div>`;
    return;
  }
  const lleva = minEntre(st.desde, local());
  const pct = Math.min(100, Math.round((lleva / pred.ventana) * 100));
  const titulo = pred.tipo === 'dormir' ? 'Hora de dormir' : `Siesta ${pred.numero}`;
  el.innerHTML = `<div class="p-icono">${ico(pred.tipo === 'dormir' ? 'luna' : 'siesta')}</div>
    <div class="p-txt"><h2>${titulo}</h2>
      <div class="p-hora">≈ ${hm(pred.cuando)}</div>
      <div class="p-det">ventana típica ${durTxt(pred.ventana)} · lleva ${durTxt(lleva)}</div>
      <div class="barra-prog${lleva > pred.ventana ? ' pasada' : ''}"><i style="width:${pct}%"></i></div>
    </div>`;
}

// Ventanas de vigilia del día D (la última, en curso si está despierto) comparadas con las típicas de la semana
function ventanasDia(D, st, actual) {
  const j = jornada(D);
  if (!j) return [];
  const out = j.ventanas.map((v, i) => ({ min: v, n: i + 1 }));
  if (j.dormido) out.push({ min: j.ultimaVentana, n: out.length + 1, ultima: true });
  else if (actual && st.modo === 'dia' && st.desde) out.push({ min: minEntre(st.desde, local()), n: out.length + 1, enCurso: true });
  const previas = [];
  for (let k = 1; k <= 7; k++) { const p = jornada(masDias(D, -k)); if (p && p.dormido) previas.push(p); }
  for (const v of out) v.tipica = v.ultima ? mediana(previas.map((p) => p.ultimaVentana)) : mediana(previas.map((p) => p.ventanas[v.n - 1]));
  const pred = actual ? prediccion(st) : null;
  const curso = out.find((v) => v.enCurso);
  if (curso && pred && !pred.sinDatos) curso.tipica = pred.ventana;     // la que toca ahora (siesta u hora de dormir)
  return out;
}

// Datos de la jornada D: la noche (fila D−1 del Excel/Hoja) + el día D, con el total en vivo si es la actual
function datosJornada(win, st) {
  const { D, actual, desde } = win;
  const filas = new Map(historico(masDias(D, -1), D).map((r) => [r.fecha, r]));
  const noche = filas.get(masDias(D, -1)) || {};
  const dia = filas.get(D) || {};
  let nocheMin = noche.sueno_noche_min ?? null;
  let nocheEnCurso = false;
  if (nocheMin == null && actual && st.fase === 'noche' && win.conInicio) {
    // la noche aún no ha acabado: lo dormido hasta ahora (menos los despertares)
    const ahora = local();
    const desp = vivos().filter((e) => e.tipo === 'despertar_noche' && e.ini >= desde)
      .reduce((a, e) => a + minEntre(e.ini, e.fin || ahora), 0);
    nocheMin = minEntre(desde, ahora) - desp;
    nocheEnCurso = true;
  }
  const diaMin = dia.despertar ? dia.sueno_dia_min ?? 0 : null;
  const total = nocheMin == null && diaMin == null ? null : (nocheMin || 0) + (diaMin || 0);
  // despertares de esa noche: todos los registrados; los que acaban en toma se cuentan aparte (el Excel no los cuenta)
  const finNoche = dia.despertar ? D + 'T' + dia.despertar : local();
  const todos = win.conInicio ? vivos().filter((e) => e.tipo === 'despertar_noche' && e.ini >= desde && e.ini <= finNoche + ':59').length : null;
  return { noche, dia, nocheMin, nocheEnCurso, diaMin, total, todos };
}

function pintarJornada(win, st) {
  const { D, actual } = win;
  const j = datosJornada(win, st);
  const { noche: n, dia: d } = j;
  const nombreD = (x) => new Date(x + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  // total de la jornada frente al típico (mediana de los 7 «sueño 24 h» anteriores)
  const previos = historico(masDias(D, -8), masDias(D, -1)).map((r) => r.sueno_24h_min).filter((x) => x != null);
  const tipico = mediana(previos);
  const pct = j.total != null && tipico ? Math.min(100, Math.round((j.total / tipico) * 100)) : 0;
  $('#total-jornada').innerHTML = `
    <div class="tarjeta-cab"><h2>Sueño total de la jornada</h2><span class="suave">${actual ? 'hasta ahora' : ''}</span></div>
    <div class="total-grande">${durTxt(j.total)}</div>
    <div class="reparto">
      <span style="--c:var(--noche)">noche ${durTxt(j.nocheMin)}${j.nocheEnCurso ? ' (en curso)' : ''}</span>
      <span style="--c:var(--siesta)">siestas ${durTxt(j.diaMin)}</span>
    </div>
    ${tipico ? `<div class="barra-prog"><i style="width:${pct}%"></i></div><p class="suave">típico de la última semana: ${durTxt(tipico)}</p>` : ''}`;

  // ---- noche (empieza la tarde de D−1) ----
  const dN = masDias(D, -1);
  const f = db.fichas[dN] || {};
  const conToma = j.todos != null && n.despertares != null ? Math.max(0, j.todos - n.despertares) : 0;
  const empezada = n.dormido || win.conInicio;
  $('#anoche').innerHTML = `<div class="tarjeta-cab"><h2>Noche · ${nombreD(dN)} → ${nombreD(D).split(' ').pop()}${(f.noche_mala ?? n.noche_mala) ? '<span class="etiqueta-mala">noche mala</span>' : ''}</h2></div>
    ${empezada ? `<div class="cifras">
      ${cifra(n.dormido || '—', 'se durmió')}
      ${cifra(durTxt(n.latencia_min), 'latencia')}
      ${cifra(durTxt(n.llanto_min), 'llanto')}
      ${cifra(durTxt(j.nocheMin), j.nocheEnCurso ? 'sueño nocturno, hasta ahora' : 'sueño nocturno', 'destacada')}
      ${cifra(durTxt(n.tramo_largo_min), 'tramo más largo')}
      ${cifra(n.despertar_sig || '—', 'despertar')}
      ${cifra(n.tomas ?? '—', 'tomas')}
      ${cifra(durTxt(n.tomas_min), 'tiempo de tomas')}
      ${cifra(j.todos ?? n.despertares ?? '—', conToma ? `despertares · ${conToma} con toma` : 'despertares')}
    </div>
    ${(f.notas ?? n.notas) ? `<p class="suave">“${esc(f.notas ?? n.notas)}”</p>` : ''}
    ${n.origen === 'Excel' ? '<p class="suave">Noche del Excel: solo hay totales.</p>' : `<button class="enlace" id="abrir-ficha">${f.noche_mala || f.notas ? 'Editar ficha de la noche' : 'Noche mala, notas o datos a mano'} →</button>`}`
    : '<p class="vacio">La noche de esta jornada aún no ha empezado.</p>'}`;
  const bf = $('#abrir-ficha');
  if (bf) bf.onclick = () => abrirFicha(dN);

  // ---- día D ----
  const dj = jornada(D);
  const despierto = dj ? minEntre(dj.despertar, dj.dormido || (actual ? local() : dj.despertar)) - (d.sueno_dia_min || 0) : d.despierto_min ?? null;
  const vv = ventanasDia(D, st, actual);
  const chips = vv.map((v) => `<div class="vv${v.enCurso ? ' curso' : ''}">
      <span class="vv-n">${v.enCurso ? 'ahora' : v.ultima ? 'antes de dormir' : 'ventana ' + v.n}</span>
      <b>${durTxt(v.min)}</b>
      <span class="vv-t">${v.tipica ? 'típica ' + durTxt(v.tipica) : '&nbsp;'}</span></div>`).join('');
  const siestas = dj ? dj.siestas.map((s, i) => `<li><span>Siesta ${i + 1}</span><b>${hm(s.ini)}–${s.fin ? hm(s.fin) : (actual ? 'ahora' : '…')}</b><span>${durTxt(minEntre(s.ini, s.fin || local()))}</span></li>`).join('') : '';
  $('#hoy').innerHTML = `<div class="tarjeta-cab"><h2>Día · ${nombreD(D)}</h2></div>
    ${d.despertar || dj ? `<div class="cifras">
      ${cifra(d.despertar || '—', 'se despertó')}
      ${cifra(durTxt(d.sueno_dia_min), 'sueño de día', 'destacada')}
      ${cifra(durTxt(despierto), actual && !dj?.dormido ? 'despierto, hasta ahora' : 'despierto en total')}
    </div>
    ${siestas ? `<ul class="lista-siestas">${siestas}</ul>` : d.siestas != null ? `<p class="suave">${d.siestas} siesta${d.siestas === 1 ? '' : 's'} (el Excel no guarda las horas).</p>` : ''}
    ${vv.length ? `<div class="sub-titulo">Ventanas de vigilia</div><div class="ventanas">${chips}</div>` : ''}`
    : '<p class="vacio">El día de esta jornada aún no ha empezado.</p>'}`;
}

// Cabecera de la jornada y navegación (flechas, deslizar el reloj, volver a hoy)
function pintarCabJornada(win) {
  const { D, actual } = win;
  const largo = new Date(D + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#j-titulo').textContent = actual ? 'Jornada de hoy' : largo.charAt(0).toUpperCase() + largo.slice(1);
  $('#j-sub').textContent = actual ? largo : 'noche del ' + new Date(masDias(D, -1) + 'T12:00:00').getDate() + ' + siestas del ' + new Date(D + 'T12:00:00').getDate();
  $('#j-next').disabled = actual;
}

function pintarTendencia() {
  const hoy = hoyStr();
  const hist = new Map(historico(masDias(hoy, -7), masDias(hoy, -1)).map((r) => [r.fecha, r]));
  const noches = [];
  for (let k = 7; k >= 1; k--) {
    const D = masDias(hoy, -k);
    const r = hist.get(D) || {};
    noches.push({ D, noche: r.sueno_noche_min ?? null, dia: r.sueno_dia_min ?? null, mala: r.noche_mala });
  }
  const con = noches.filter((x) => x.noche != null);
  if (con.length < 2) {
    $('#tendencia').innerHTML = `<div class="tarjeta-cab"><h2>Últimas noches</h2></div><p class="vacio">El gráfico se irá llenando con las noches registradas.</p>`;
    return;
  }
  const W = 320, H = 150, base = 120, maxMin = Math.max(14 * 60, ...noches.map((x) => (x.noche || 0) + (x.dia || 0)));
  const esc_ = (m) => (m / maxMin) * 100;
  const ancho = W / 7;
  const media = Math.round(con.reduce((a, x) => a + x.noche, 0) / con.length);
  let s = `<line class="ref" x1="0" x2="${W}" y1="${base - esc_(media)}" y2="${base - esc_(media)}"/>`;
  noches.forEach((x, i) => {
    const cx = i * ancho + ancho / 2, w = ancho * .52;
    const dia = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'][new Date(x.D + 'T12:00:00').getDay()];
    if (x.noche != null) {
      const hN = esc_(x.noche), hD = esc_(x.dia || 0);
      s += `<rect class="barra-n${x.mala ? ' mala' : ''}" x="${cx - w / 2}" y="${base - hN}" width="${w}" height="${hN}" rx="6"/>`;
      if (hD) s += `<rect class="barra-d" x="${cx - w / 2}" y="${base - hN - hD - 2}" width="${w}" height="${hD}" rx="5"/>`;
      s += `<text class="valor" x="${cx}" y="${base - hN - hD - 8}">${durCorta(x.noche)}</text>`;
    }
    s += `<text x="${cx}" y="${base + 16}">${dia}</text><text x="${cx}" y="${base + 28}">${x.D.slice(8)}</text>`;
  });
  $('#tendencia').innerHTML = `<div class="tarjeta-cab"><h2>Últimas noches</h2><span class="suave">media ${durTxt(media)}</span></div>
    <svg class="grafico" viewBox="0 0 ${W} ${H}">${s}</svg>
    <div class="leyenda"><span style="--c:var(--noche)">sueño nocturno</span><span style="--c:var(--siesta)">siestas del día</span><span style="--c:var(--llanto)">noche mala</span></div>`;
}

function pintarRegistro() {
  const ul = $('#registro');
  ul.replaceChildren();
  const limite = local(new Date(Date.now() - 48 * 3600e3));
  const ev = vivos().filter((e) => ini(e) >= limite).reverse();
  let dia = null;
  for (const e of ev) {
    const d = ini(e).slice(0, 10);
    if (d !== dia) {
      dia = d;
      const sep = document.createElement('li');
      sep.className = 'dia-sep';
      sep.textContent = d === hoyStr() ? 'Hoy' : d === masDias(hoyStr(), -1) ? 'Ayer' : new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
      ul.append(sep);
    }
    const li = document.createElement('li');
    li.style.setProperty('--c', COLOR_TIPO[e.tipo]);
    const dur = e.fin ? durTxt(minEntre(e.ini, e.fin)) : TRAMOS.has(e.tipo) ? 'en curso' : '';
    const det = [dur, e.tipo === 'siesta' && e.como && e.como !== 'cuna' ? e.como : null, e.autor].filter(Boolean).join(' · ');
    li.innerHTML = `<span class="r-ico">${ico(ICO_TIPO[e.tipo])}</span>
      <span class="r-que">${esc(NOMBRES[e.tipo])}${db.pendientes.has(e.id) ? '<span class="pend">· sin enviar</span>' : ''}<small>${esc(det)}</small></span>
      <span class="r-hora">${hm(ini(e))}${e.fin ? '–' + hm(e.fin) : ''}</span>`;
    li.onclick = () => abrirEditor(e);
    ul.append(li);
  }
  if (!ev.length) ul.innerHTML = '<li class="dia-sep">Aún no hay registros</li>';
}

function pintarSync() {
  const b = $('#sync');
  const n = db.pendientes.size + db.fichasPend.size;
  b.className = 'sync' + (db.sync.error ? ' mal' : n || db.sync.enviando ? ' pend' : '');
  b.textContent = db.cfg?.url === 'demo' ? 'demo' : db.sync.enviando ? 'enviando' : n ? `${n} sin enviar` : db.sync.error ? 'sin conexión' : 'al día';
  $('#pie').textContent = db.sync.ultima ? 'Última sincronización: ' + db.sync.ultima.replace('T', ' ').slice(0, 16) : '';
}

// ---------- pestañas Ahora / Historial ----------
let vista = 'ahora';
function mostrarVista(v) {
  vista = v;
  $('#vista-ahora').hidden = v !== 'ahora';
  $('#vista-historial').hidden = v !== 'historial';
  document.querySelectorAll('#pestanas button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  window.scrollTo({ top: 0 });
  pintar();
}
document.querySelectorAll('#pestanas button').forEach((b) => { b.onclick = () => { vibrar(8); mostrarVista(b.dataset.v); }; });

function abrirNoche(D, r) {
  if (!r) return;
  const dia = new Date(D + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const origen = r.origen === 'Excel' ? 'del Excel (antes de la app)' : 'registrada con la app';
  abrirHoja(`<h3><span class="r-ico" style="--c:var(--noche)">${ico('luna')}</span>Noche del ${dia}</h3>
    <p class="suave">${esc(r.noche_n || '')} · ${origen}${r.noche_mala ? ' · <b style="color:var(--llanto)">noche mala</b>' : ''}</p>
    <div class="cifras">
      ${cifra(r.despertar || '—', 'se despertó')}${cifra(r.siestas ?? '—', 'siestas')}${cifra(durTxt(r.sueno_dia_min), 'sueño de día')}
      ${cifra(durTxt(r.ultima_vv_min), 'última ventana')}${cifra(r.dormido || '—', 'se durmió')}${cifra(durTxt(r.latencia_min), 'latencia')}
      ${cifra(durTxt(r.llanto_min), 'llanto')}${cifra(durTxt(r.sueno_noche_min), 'sueño nocturno', 'destacada')}${cifra(durTxt(r.tramo_largo_min), 'tramo más largo')}
      ${cifra(r.despertar_sig || '—', 'despertar')}${cifra(r.tomas ?? '—', 'tomas')}${cifra(r.despertares ?? '—', 'despertares sin toma')}
    </div>
    ${r.notas ? `<p class="suave">“${esc(r.notas)}”</p>` : ''}
    ${r.origen === 'Excel' ? '' : '<div class="fila-botones"><button type="button" class="btn" id="no-ficha">Noche mala, notas o datos a mano</button></div>'}`, (cont) => {
    const b = $('#no-ficha', cont);
    if (b) b.onclick = () => { cerrarHoja(); abrirFicha(D); };
  });
}

// Jornada que se está viendo: null = la actual; si no, la fecha «D» de otra jornada
let jornadaVista = null;
function verJornada(D) {
  const actual = jornadaActual(estadoActual());
  jornadaVista = !D || D >= actual ? null : D;
  const c = $('#centro'); c.classList.remove('cambio'); void c.offsetWidth; c.classList.add('cambio');
  pintar();
}
function ventanaVista(st) {
  const actualD = jornadaActual(st);
  const D = jornadaVista || actualD;
  return ventanaJornada(D, D === actualD);
}

// centro del reloj cuando se mira una jornada pasada: su sueño total
function pintarCentroPasado(win, st) {
  const j = datosJornada(win, st);
  $('#c-etiqueta').textContent = 'Sueño total';
  $('#c-tiempo').textContent = durTxt(j.total);
  $('#c-tiempo').classList.add('total');
  $('#c-sub').innerHTML = `noche ${durTxt(j.nocheMin)} · siestas ${durTxt(j.diaMin)}`;
  document.body.className = 'fase-noche';
}

function pintar() {
  if (!db.cfg || $('#principal').hidden) return;
  if (vista === 'historial') { pintarHistorial($('#vista-historial'), { abrirNoche, abrirJornada: (D) => { mostrarVista('ahora'); verJornada(D); } }); pintarSync(); return; }
  const st = estadoActual();
  const win = ventanaVista(st);
  const pred = win.actual ? prediccion(st) : null;
  $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  pintarCabJornada(win);
  if (win.actual) pintarCentro(st); else pintarCentroPasado(win, st);
  pintarDial(win, pred);
  if (win.actual) pintarAcciones(st);
  else {
    $('#acciones').innerHTML = '<button class="principal-btn" id="volver-hoy"><span>Volver a hoy</span></button>';
    $('#volver-hoy').onclick = () => { vibrar(); verJornada(null); };
  }
  pintarProximo(win.actual ? st : { modo: 'otra' }, pred);
  pintarJornada(win, st);
  pintarTendencia();
  pintarRegistro();
  pintarSync();
}

// navegación entre jornadas: flechas y deslizar el reloj
$('#j-prev').onclick = () => { vibrar(8); verJornada(masDias(ventanaVista(estadoActual()).D, -1)); };
$('#j-next').onclick = () => { vibrar(8); verJornada(masDias(ventanaVista(estadoActual()).D, 1)); };
(() => {
  const zona = $('.reloj-24');
  let x0 = null, y0 = null;
  zona.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  zona.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    vibrar(8);
    const D = ventanaVista(estadoActual()).D;
    verJornada(masDias(D, dx > 0 ? -1 : 1));                 // deslizar a la derecha = jornada anterior
  });
})();
onCambio(() => pintar());

// ---------- aviso con ajuste de hora ----------
let avisoTimer = null;
function aviso(texto, ev, campo) {
  const a = $('#aviso');
  a.hidden = false;
  a.style.animation = 'none'; void a.offsetWidth; a.style.animation = '';
  const txt = () => `${ico('check')}<span>${esc(texto)} · ${hm(db.eventos.get(ev.id)[campo])}</span>`;
  a.innerHTML = `<span class="txt">${txt()}</span>`;
  const cerrar = () => { a.hidden = true; };
  const reiniciar = () => { clearTimeout(avisoTimer); avisoTimer = setTimeout(cerrar, 8000); };
  const ajustar = (min) => {
    const e = db.eventos.get(ev.id);
    const nuevo = sumarMin(e[campo], min);
    if (campo === 'fin' && nuevo < e.ini) return;
    if (campo === 'ini' && e.fin && nuevo > e.fin) return;
    if (nuevo > local()) return;
    vibrar(8);
    cambiar(e.id, { [campo]: nuevo });
    a.querySelector('.txt').innerHTML = txt();
    pintar(); reiniciar();
  };
  const boton = (t, fn, cls = '') => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = fn; a.append(b); };
  boton('−5', () => ajustar(-5)); boton('−1', () => ajustar(-1)); boton('+1', () => ajustar(1));
  boton('Deshacer', () => {
    const e = db.eventos.get(ev.id);
    if (campo === 'fin') guardar({ ...e, fin: null }); else guardar({ ...e, borrado: true });
    vibrar(25); cerrar(); pintar();
  }, 'des');
  reiniciar();
}

// ---------- hoja inferior ----------
const hoja = $('#hoja');
function abrirHoja(html, alMontar) {
  $('#hoja-cont').innerHTML = html;
  hoja.showModal();
  document.activeElement?.blur?.();                 // sin foco automático en el primer campo
  alMontar?.($('#hoja-cont'));
}
const cerrarHoja = () => hoja.close();
hoja.addEventListener('click', (e) => { if (e.target === hoja) cerrarHoja(); });   // toque fuera
(() => {                                                                           // arrastrar hacia abajo para cerrar
  let y0 = null;
  hoja.addEventListener('touchstart', (e) => { if (hoja.scrollTop <= 0 && e.touches[0].clientY - hoja.getBoundingClientRect().top < 60) y0 = e.touches[0].clientY; }, { passive: true });
  hoja.addEventListener('touchmove', (e) => { if (y0 != null) hoja.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - y0)}px)`; }, { passive: true });
  hoja.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null; hoja.style.transform = '';
    if (dy > 90) cerrarHoja();
  });
})();

// Campo de hora: día (hoy/ayer/…) + hora con pasos rápidos
function campoHora(id, etiqueta, valor) {
  const v = valor || local();
  const dia = v.slice(0, 10);
  const opciones = [0, -1, -2].map((k) => masDias(hoyStr(), k));
  if (!opciones.includes(dia)) opciones.push(dia);
  const nombre = (d) => (d === hoyStr() ? 'Hoy' : d === masDias(hoyStr(), -1) ? 'Ayer' : new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }));
  return `<div class="campo-hora" data-campo="${id}">
    <div class="ch-cab"><span>${etiqueta}</span><select class="ch-dia">${opciones.map((d) => `<option value="${d}" ${d === dia ? 'selected' : ''}>${nombre(d)}</option>`).join('')}</select></div>
    <div class="ch-hora"><input type="time" class="ch-t" value="${v.slice(11, 16)}"></div>
    <div class="pasos">${[-15, -5, -1, 1, 5, 15].map((m) => `<button type="button" data-m="${m}">${m > 0 ? '+' : '−'}${Math.abs(m)}</button>`).join('')}</div>
  </div>`;
}
function montarCampoHora(cont) {
  cont.querySelectorAll('.campo-hora').forEach((c) => {
    c.querySelectorAll('.pasos button').forEach((b) => {
      b.onclick = () => {
        vibrar(6);
        const v = leerCampoHora(c);
        const n = sumarMin(v, Number(b.dataset.m));
        c.querySelector('.ch-t').value = n.slice(11, 16);
        const sel = c.querySelector('.ch-dia');
        if (![...sel.options].some((o) => o.value === n.slice(0, 10))) sel.insertAdjacentHTML('beforeend', `<option value="${n.slice(0, 10)}">${n.slice(0, 10)}</option>`);
        sel.value = n.slice(0, 10);
      };
    });
  });
}
const leerCampoHora = (c) => c.querySelector('.ch-dia').value + 'T' + c.querySelector('.ch-t').value + ':00';

function abrirEditor(e, nuevo = false) {
  let tipo = e.tipo;
  const tram = () => TRAMOS.has(tipo);
  const render = () => {
    const enCurso = tram() && !e.fin && !nuevo;
    abrirHoja(`
      <h3><span class="r-ico" style="--c:${COLOR_TIPO[tipo]}">${ico(ICO_TIPO[tipo])}</span>${nuevo ? 'Añadir registro' : esc(NOMBRES[tipo])}</h3>
      ${nuevo ? `<div class="pastillas" id="ed-tipos">${Object.keys(NOMBRES).map((k) => `<button type="button" data-t="${k}" class="${k === tipo ? 'on' : ''}">${NOMBRES[k]}</button>`).join('')}</div>` : ''}
      ${!nuevo && e.autor ? `<p class="suave">Registrado por ${esc(e.autor)}</p>` : ''}
      ${campoHora('ini', tram() ? 'Empieza' : 'Hora', ini(e))}
      ${tram() ? (enCurso ? `<button type="button" class="btn" id="ed-cerrar">Terminar ahora</button>` : campoHora('fin', 'Termina', e.fin || [sumarMin(ini(e), tipo === 'siesta' ? 45 : 10), local()].sort()[0])) : ''}
      ${tipo === 'siesta' ? `<div class="pastillas" id="ed-como">${COMO.map((l) => `<button type="button" data-v="${l}" class="${l === (e.como || 'cuna') ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="fila-botones">
        ${nuevo ? '' : '<button type="button" class="btn peligro" id="ed-borrar">Borrar</button>'}
        <button type="button" class="btn primario" id="ed-guardar">Guardar</button>
      </div>`, (cont) => {
      montarCampoHora(cont);
      cont.querySelectorAll('#ed-tipos button').forEach((b) => { b.onclick = () => { tipo = b.dataset.t; e = { ...e, tipo }; render(); }; });
      const pastillas = (sel) => cont.querySelectorAll(sel + ' button').forEach((b) => { b.onclick = () => { cont.querySelectorAll(sel + ' button').forEach((x) => x.classList.toggle('on', x === b)); vibrar(6); }; });
      pastillas('#ed-como');
      const val = (sel) => cont.querySelector(sel + ' .on')?.dataset.v;
      const recoger = (cerrarAhora = false) => {
        const i = leerCampoHora(cont.querySelector('[data-campo=ini]'));
        const cf = cont.querySelector('[data-campo=fin]');
        const f = cerrarAhora ? local() : cf ? leerCampoHora(cf) : e.fin ?? null;
        if (i > local() || (f && f > local())) { alert('La hora no puede ser futura.'); return null; }
        if (tram() && f && f < i) { alert('El final no puede ser antes del inicio.'); return null; }
        const x = { ...e, tipo };
        delete x.t; delete x.ini; delete x.fin; delete x.como;
        if (tram()) { x.ini = i; x.fin = f; } else x.t = i;
        if (tipo === 'siesta') x.como = val('#ed-como');
        return x;
      };
      $('#ed-guardar', cont).onclick = () => { const x = recoger(); if (!x) return; guardar(x); vibrar(18); cerrarHoja(); pintar(); };
      const c = $('#ed-cerrar', cont);
      if (c) c.onclick = () => { const x = recoger(true); if (!x) return; guardar(x); vibrar(18); cerrarHoja(); pintar(); };
      const b = $('#ed-borrar', cont);
      if (b) b.onclick = () => { if (!confirm('¿Borrar este registro?')) return; guardar({ ...e, borrado: true }); vibrar(25); cerrarHoja(); pintar(); };
    });
  };
  render();
}

function abrirFicha(dia) {
  const f = db.fichas[dia] || {};
  abrirHoja(`
    <h3><span class="r-ico" style="--c:var(--noche)">${ico('nota')}</span>Noche del ${new Date(dia + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}</h3>
    <label class="interruptor">Noche mala <input type="checkbox" id="fi-mala" ${f.noche_mala ? 'checked' : ''}></label>
    <label>Notas <textarea id="fi-notas" rows="3">${esc(f.notas || '')}</textarea></label>
    <p class="suave">Solo si se olvidó el modo acostar (si no, se calculan solos):</p>
    <div class="dos">
      <label>Latencia (min) <input id="fi-lat" type="number" min="0" inputmode="numeric" value="${f.latencia_min ?? ''}"></label>
      <label>Llanto (min) <input id="fi-llanto" type="number" min="0" inputmode="numeric" value="${f.llanto_min ?? ''}"></label>
    </div>
    <div class="fila-botones"><button type="button" class="btn primario" id="fi-guardar">Guardar</button></div>`, (cont) => {
    $('#fi-guardar', cont).onclick = () => {
      const num = (v) => (v === '' ? null : Math.max(0, Math.round(Number(v))));
      guardarFicha(dia, {
        noche_mala: $('#fi-mala', cont).checked, notas: $('#fi-notas', cont).value.trim() || null,
        latencia_min: num($('#fi-lat', cont).value), llanto_min: num($('#fi-llanto', cont).value),
      });
      vibrar(18); cerrarHoja(); pintar();
    };
  });
}

function abrirMenu() {
  abrirHoja(`<h3>Opciones</h3><div class="menu-lista">
      <button data-a="nuevo">${ico('mas')} Añadir un registro olvidado</button>
      <button data-a="compartir">${ico('compartir')} Compartir configuración con la otra persona</button>
      <button data-a="sync">${ico('sync')} Sincronizar ahora</button>
      <button data-a="salir" class="peligro">${ico('salir')} Cerrar sesión en este móvil</button>
    </div>`, (cont) => {
    cont.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => accionMenu(b.dataset.a); });
  });
}
async function accionMenu(a) {
  cerrarHoja();
  if (a === 'nuevo') abrirEditor({ tipo: 'siesta', ini: sumarMin(local(), -30), fin: null }, true);
  if (a === 'sync') { await enviar(); await recibir(); }
  if (a === 'compartir') {
    const url = enlaceConfig();
    const texto = 'Enlace para configurar la app de sueño (no lo compartas con nadie más):';
    if (navigator.share) navigator.share({ title: 'Registro de sueño', text: texto, url }).catch(() => {});
    else { try { await navigator.clipboard.writeText(url); alert('Enlace copiado.'); } catch (err) { prompt('Copia este enlace:', url); } }
  }
  if (a === 'salir' && confirm('Se borrarán los datos guardados en este móvil (no los del servidor). ¿Seguro?')) {
    if (db.pendientes.size && !confirm(`Hay ${db.pendientes.size} registros sin enviar que se perderán. ¿Seguir?`)) return;
    borrarTodo();
    location.reload();
  }
}

// ---------- configuración ----------
function leerEnlaceConfig() {
  const m = location.hash.match(/cfg=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (err) { return null; }
}
function enlaceConfig() {
  const { url, token, bebe } = db.cfg;
  const datos = btoa(unescape(encodeURIComponent(JSON.stringify({ url, token, bebe })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#cfg=' + datos;
}
async function configurar(c) {
  $('#cfg-error').hidden = true;
  try { await probarConexion(c); } catch (err) {
    $('#cfg-error').textContent = 'No se ha podido conectar: ' + (err.message || err);
    $('#cfg-error').hidden = false;
    return;
  }
  guardarConfig(c);
  history.replaceState(null, '', location.pathname);
  arrancar();
}
function pantallaConfig() {
  $('#config').hidden = false;
  $('#principal').hidden = true;
  const enlace = leerEnlaceConfig();
  if (enlace) { $('#cfg-url').value = enlace.url || ''; $('#cfg-token').value = enlace.token || ''; $('#cfg-bebe').value = enlace.bebe || ''; }
  $('#cfg-autor').value = leerLS('autor', '');
  $('#cfg-guardar').onclick = () => {
    const autor = $('#cfg-autor').value.trim();
    escribirLS('autor', autor);
    configurar({ url: $('#cfg-url').value.trim(), token: $('#cfg-token').value.trim(), autor, bebe: $('#cfg-bebe').value.trim() });
  };
  $('#cfg-demo').onclick = () => configurar({ url: 'demo', token: '', autor: $('#cfg-autor').value.trim() || 'demo', bebe: $('#cfg-bebe').value.trim() || 'Bebé' });
}

function arrancar() {
  if (!db.cfg) return pantallaConfig();
  $('#config').hidden = true;
  $('#principal').hidden = false;
  $('#titulo').textContent = db.cfg.bebe || 'Registro';
  document.title = 'Sueño' + (db.cfg.bebe ? ' de ' + db.cfg.bebe : '');
  pintar();
  enviar();
  recibir();
}

// estrellas del fondo
(() => {
  const cont = $('#estrellas');
  for (let i = 0; i < 46; i++) {
    const s = document.createElement('i');
    Object.assign(s.style, { left: Math.random() * 100 + '%', top: Math.random() * 70 + '%', animationDelay: (Math.random() * 4).toFixed(2) + 's', animationDuration: (3 + Math.random() * 3).toFixed(2) + 's' });
    if (Math.random() < .2) { s.style.width = '3px'; s.style.height = '3px'; }
    cont.append(s);
  }
})();

$('#menu-btn').innerHTML = ico('puntos');
$('#menu-btn').onclick = abrirMenu;
$('#nuevo-btn').onclick = () => abrirEditor({ tipo: 'siesta', ini: sumarMin(local(), -30), fin: null }, true);
$('#sync').onclick = async () => { vibrar(); await enviar(); await recibir(); };

let ticks = 0;
setInterval(() => {
  if (!db.cfg || document.hidden || $('#principal').hidden) return;
  const st = estadoActual();
  const win = ventanaVista(st);
  if (!win.actual) return;
  if (jornadaActual(st) !== win.D) return pintar();       // ha empezado otra jornada (se ha dormido)
  pintarCentro(st);
  if (++ticks % 30 === 0) { pintarDial(win, prediccion(st)); pintarProximo(st, prediccion(st)); }
  if (ticks % 60 === 0) pintarJornada(win, st);         // totales y ventana en curso, cada minuto
}, 1000);
setInterval(recibir, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pintar(); enviar(); recibir(); } });
window.addEventListener('online', () => enviar());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

arrancar();
