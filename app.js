// App de registro del sueño del bebé. Sin dependencias: HTML + este módulo + derivar.js (copia de fase0/derivar.mjs).
// Guarda primero en el móvil (funciona sin conexión) y envía al servidor (Apps Script) por detrás.
import { derivarNoche } from './derivar.js';

const TRAMOS = new Set(['llanto', 'siesta', 'despertar_noche', 'toma']);
const NOMBRES = {
  despertar: 'Se despertó', a_la_cuna: 'A la cuna', llanto: 'Llanto', dormido: 'Dormido',
  siesta: 'Siesta', despertar_noche: 'Despertar nocturno', toma: 'Toma',
};
const ICONOS = { despertar: '☀️', a_la_cuna: '🛏️', llanto: '😢', dormido: '🌙', siesta: '☁️', despertar_noche: '⚡', toma: '🍼' };
const LADOS = ['pecho izq', 'pecho dcha', 'biberón'];
const COMO = ['cuna', 'brazos', 'cochecito', 'coche', 'otro'];

// ---------- utilidades ----------
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');
const local = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fecha = (s) => new Date(s.length === 16 ? s + ':00' : s);          // 'AAAA-MM-DDTHH:MM[:SS]' en hora local
const hm = (s) => s.slice(11, 16);
const hoyStr = (d = new Date()) => local(d).slice(0, 10);
const masDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return hoyStr(d); };
const durTxt = (min) => (min == null ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${pad(min % 60)}m`);
const relojTxt = (seg) => {
  seg = Math.max(0, Math.floor(seg));
  if (seg < 3600) return `${pad(Math.floor(seg / 60))}:${pad(seg % 60)}`;
  return `${Math.floor(seg / 3600)}h ${pad(Math.floor((seg % 3600) / 60))}m`;
};
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const ini = (e) => e.ini ?? e.t;
const abierto = (e) => TRAMOS.has(e.tipo) && !e.fin;
const guardarLS = (k, v) => { try { localStorage.setItem('sm.' + k, JSON.stringify(v)); } catch (err) { /* modo privado */ } };
const leerLS = (k, def) => { try { const v = localStorage.getItem('sm.' + k); return v ? JSON.parse(v) : def; } catch (err) { return def; } };

// ---------- estado ----------
let cfg = leerLS('cfg', null);
let eventos = new Map(Object.entries(leerLS('eventos', {})));     // id → evento
let pendientes = new Set(leerLS('pendientes', []));               // ids aún no enviados
let fichas = leerLS('fichas', {});                                // fecha → ficha
let fichasPend = new Set(leerLS('fichasPend', []));
let syncEstado = { enviando: false, error: null, ultima: leerLS('ultimaSync', null) };
let lado = leerLS('lado', LADOS[0]);

const persistir = () => {
  guardarLS('eventos', Object.fromEntries(eventos));
  guardarLS('pendientes', [...pendientes]);
  guardarLS('fichas', fichas);
  guardarLS('fichasPend', [...fichasPend]);
};
const vivos = () => [...eventos.values()].filter((e) => !e.borrado).sort((a, b) => ini(a).localeCompare(ini(b)));

// Normaliza lo que llega del servidor: un tramo sin fin vuelve como {t}; aquí es {ini, fin: null}
function normalizar(e) {
  const o = { ...e };
  if (TRAMOS.has(o.tipo) && o.t && !o.ini) { o.ini = o.t; delete o.t; }
  if (TRAMOS.has(o.tipo) && !o.fin) o.fin = null;
  return o;
}

// ---------- estado actual del bebé ----------
function estadoActual() {
  const ev = vivos();
  const abiertos = ev.filter(abierto);
  const ab = (tipo) => abiertos.filter((e) => e.tipo === tipo).pop();
  const ultimo = ev.filter((e) => ['despertar', 'dormido', 'a_la_cuna'].includes(e.tipo)).pop();
  const llanto = ab('llanto');
  if (ab('toma')) return { modo: 'toma', ev: ab('toma'), base: ultimo };
  if (ab('despertar_noche')) return { modo: 'despertar_noche', ev: ab('despertar_noche') };
  if (ab('siesta')) return { modo: 'siesta', ev: ab('siesta') };
  if (ultimo?.tipo === 'dormido') return { modo: 'noche', ev: ultimo };
  if (ultimo?.tipo === 'a_la_cuna') return { modo: 'acostando', ev: ultimo, llanto };
  const finSiesta = ev.filter((e) => e.tipo === 'siesta' && e.fin).pop();
  const desde = [ultimo?.t, finSiesta?.fin].filter(Boolean).sort().pop();
  return { modo: 'dia', ev: ultimo, desde };
}

// ---------- acciones ----------
function registrar(e) {
  const ev = normalizar({ id: nuevoId(), autor: cfg?.autor || '', ...e });
  eventos.set(ev.id, ev);
  pendientes.add(ev.id);
  persistir();
  return ev;
}
function cerrar(ev, cuando) {
  const e = { ...ev, fin: cuando };
  eventos.set(e.id, e);
  pendientes.add(e.id);
  persistir();
  return e;
}
function hecho(texto, ev, campo) {
  pintar();
  aviso(texto, ev, campo);
  enviar();
}

const ACCIONES = {
  siesta: () => { const e = registrar({ tipo: 'siesta', ini: local(), como: 'cuna' }); hecho('Siesta empezada', e, 'ini'); },
  finSiesta: (st) => { const e = cerrar(st.ev, local()); hecho('Siesta terminada', e, 'fin'); },
  cuna: () => { const e = registrar({ tipo: 'a_la_cuna', t: local() }); hecho('A la cuna', e, 't'); },
  llora: () => { const e = registrar({ tipo: 'llanto', ini: local() }); hecho('Llorando', e, 'ini'); },
  para: (st) => { const e = cerrar(st.llanto, local()); hecho('Ha parado de llorar', e, 'fin'); },
  dormido: (st) => {
    const ahora = local();
    if (st.llanto) cerrar(st.llanto, ahora);
    const e = registrar({ tipo: 'dormido', t: ahora });
    hecho('Dormido', e, 't');
  },
  despiertaNoche: () => { const e = registrar({ tipo: 'despertar_noche', ini: local() }); hecho('Despertar nocturno', e, 'ini'); },
  vuelveDormir: (st) => { const e = cerrar(st.ev, local()); hecho('Vuelve a dormir', e, 'fin'); },
  toma: (st) => {
    const ahora = local();
    if (st.modo === 'despertar_noche') cerrar(st.ev, ahora);       // el despertar acaba al empezar la toma
    const e = registrar({ tipo: 'toma', ini: ahora, tipo_toma: lado });
    hecho('Toma empezada', e, 'ini');
  },
  finToma: (st) => { const e = cerrar(st.ev, local()); hecho('Toma terminada', e, 'fin'); },
  despertar: (st) => {
    const ahora = local();
    vivos().filter(abierto).forEach((e) => cerrar(e, ahora));
    const e = registrar({ tipo: 'despertar', t: ahora });
    hecho('Buenos días', e, 't');
  },
};

function botones(st) {
  const B = (accion, texto, ico, clase = '') => ({ accion, texto, ico, clase });
  const manana = new Date().getHours() >= 5 && new Date().getHours() < 12;
  switch (st.modo) {
    case 'siesta': return [B('finSiesta', 'Fin de la siesta', '☀️', 'grande principal'), B('toma', 'Toma', '🍼', 'toma')];
    case 'acostando': return [
      st.llanto ? B('para', 'Ha parado de llorar', '🤫', 'grande llanto') : B('llora', 'Llora', '😢', 'grande llanto'),
      B('dormido', 'Dormido', '🌙', 'grande principal'),
    ];
    case 'noche': return manana
      ? [B('despertar', 'Se ha despertado (mañana)', '☀️', 'grande principal'), B('despiertaNoche', 'Despertar nocturno', '⚡', 'noche'), B('toma', 'Toma', '🍼', 'toma')]
      : [B('despiertaNoche', 'Se ha despertado', '⚡', 'grande noche'), B('toma', 'Toma', '🍼', 'toma'), B('despertar', 'Despertar de la mañana', '☀️', 'dia')];
    case 'despertar_noche': return [B('vuelveDormir', 'Vuelve a dormirse', '🌙', 'grande principal'), B('toma', 'Toma', '🍼', 'toma'), B('despertar', 'Despertar de la mañana', '☀️', 'dia')];
    case 'toma': return [B('finToma', 'Fin de la toma', '✓', 'grande principal')];
    default: return [
      B('siesta', 'Siesta', '☁️', 'noche'), B('cuna', 'A la cuna', '🛏️', 'noche'),
      B('toma', 'Toma', '🍼', 'toma'), B('dormido', 'Dormido (sin modo acostar)', '🌙', ''),
      ...(st.ev ? [] : [B('despertar', 'Se despertó', '☀️', 'grande dia')]),
    ];
  }
}

// ---------- pintado ----------
function pintarEstado() {
  const st = estadoActual();
  const ahora = Date.now();
  const caja = $('#estado');
  let etiqueta = '', reloj = '', sub = '', clase = st.modo;
  const desde = (s) => (ahora - fecha(s).getTime()) / 1000;
  switch (st.modo) {
    case 'siesta': etiqueta = 'Siesta en curso'; reloj = relojTxt(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    case 'acostando': {
      etiqueta = st.llanto ? 'Llorando' : 'En la cuna, despierto';
      if (st.llanto) clase = 'llorando';
      reloj = relojTxt(desde(st.ev.t));
      const llantoSeg = vivos().filter((e) => e.tipo === 'llanto' && ini(e) >= st.ev.t)
        .reduce((a, e) => a + ((e.fin ? fecha(e.fin) : new Date()) - fecha(e.ini)) / 1000, 0);
      sub = `a la cuna a las ${hm(st.ev.t)} · llanto ${relojTxt(llantoSeg)}`;
      break;
    }
    case 'noche': etiqueta = 'Durmiendo'; reloj = relojTxt(desde(st.ev.t)); sub = 'dormido desde las ' + hm(st.ev.t); break;
    case 'despertar_noche': etiqueta = 'Despierto (noche)'; reloj = relojTxt(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    case 'toma': etiqueta = 'Toma · ' + (st.ev.tipo_toma || ''); reloj = relojTxt(desde(st.ev.ini)); sub = 'desde las ' + hm(st.ev.ini); break;
    default:
      if (st.desde) { etiqueta = 'Despierto'; reloj = relojTxt(desde(st.desde)); sub = 'desde las ' + hm(st.desde); }
      else { etiqueta = 'Sin registros todavía'; reloj = '—'; sub = 'Empieza con «Se despertó»'; }
  }
  caja.className = 'estado ' + clase;
  $('#estado-etiqueta').textContent = etiqueta;
  $('#estado-reloj').textContent = reloj;
  $('#estado-sub').textContent = sub;
  return st;
}

function pintarAcciones(st) {
  const cont = $('#acciones');
  cont.replaceChildren();
  const lista = botones(st);
  const pequenos = lista.filter((b) => !b.clase.includes('grande'));
  if (pequenos.length % 2) pequenos[pequenos.length - 1].clase += ' ancho';   // sin huecos en la rejilla
  for (const b of lista) {
    const el = document.createElement('button');
    el.className = 'accion ' + b.clase;
    el.innerHTML = `<span class="ico">${b.ico}</span><span></span>`;
    el.lastChild.textContent = b.texto;
    el.onclick = () => ACCIONES[b.accion](estadoActual());
    cont.append(el);
  }
  if (st.modo === 'toma' || botones(st).some((b) => b.accion === 'toma')) {
    const fila = document.createElement('div');
    fila.className = 'lados';
    for (const l of LADOS) {
      const actual = st.modo === 'toma' ? st.ev.tipo_toma : lado;
      const b = document.createElement('button');
      b.textContent = l;
      b.className = l === actual ? 'on' : '';
      b.onclick = () => {
        lado = l; guardarLS('lado', l);
        if (st.modo === 'toma') { eventos.set(st.ev.id, { ...st.ev, tipo_toma: l }); pendientes.add(st.ev.id); persistir(); enviar(); }
        pintar();
      };
      fila.append(b);
    }
    cont.append(fila);
  }
}

// Eventos para derivar: los tramos abiertos se cierran «ahora» para poder calcular
const paraDerivar = () => vivos().map((e) => (abierto(e) ? { ...e, fin: local() } : e));
const cifra = (valor, texto) => `<div class="cifra"><b>${valor}</b><span>${texto}</span></div>`;

function pintarResumen() {
  const ev = paraDerivar();
  const hoy = hoyStr();
  const d = derivarNoche(ev, hoy, fichas);
  $('#hoy').innerHTML = `<h2>Hoy</h2><div class="cifras">
    ${cifra(d.despertar || '—', 'se despertó')}
    ${cifra(d.siestas ?? '—', 'siestas')}
    ${cifra(durTxt(d.sueno_dia_min), 'sueño de día')}
  </div>`;
  const ayer = masDias(hoy, -1);
  const n = derivarNoche(ev, ayer, fichas);
  const f = fichas[ayer] || {};
  $('#anoche').innerHTML = `<h2>Anoche (${ayer.slice(8, 10)}/${ayer.slice(5, 7)})${f.noche_mala ? ' · noche mala' : ''}</h2>
    <div class="cifras">
      ${cifra(n.dormido || '—', 'se durmió')}
      ${cifra(durTxt(n.latencia_min), 'latencia')}
      ${cifra(durTxt(n.llanto_min), 'llanto')}
      ${cifra(durTxt(n.sueno_noche_min), 'sueño nocturno')}
      ${cifra(n.tomas ?? '—', 'tomas')}
      ${cifra(n.despertares ?? '—', 'despertares')}
      ${cifra(durTxt(n.tramo_largo_min), 'tramo más largo')}
      ${cifra(n.despertar_sig || '—', 'despertar')}
      ${cifra(durTxt(n.sueno_24h_min), 'sueño 24 h')}
    </div>
    <button class="enlace" id="abrir-ficha">Noche mala, notas o datos a mano →</button>`;
  $('#abrir-ficha').onclick = () => abrirFicha(ayer);
}

function pintarRegistro() {
  const ul = $('#registro');
  ul.replaceChildren();
  const limite = local(new Date(Date.now() - 36 * 3600e3));
  const ev = vivos().filter((e) => ini(e) >= limite).reverse();
  let diaActual = null;
  for (const e of ev) {
    const dia = ini(e).slice(0, 10);
    if (dia !== diaActual) {
      diaActual = dia;
      const sep = document.createElement('li');
      sep.className = 'dia-sep';
      sep.textContent = dia === hoyStr() ? 'Hoy' : dia === masDias(hoyStr(), -1) ? 'Ayer' : dia;
      ul.append(sep);
    }
    const li = document.createElement('li');
    const det = [e.tipo_toma, e.tipo === 'siesta' && e.como !== 'cuna' ? e.como : null, e.autor].filter(Boolean).join(' · ');
    const dur = e.fin ? durTxt(Math.round((fecha(e.fin) - fecha(e.ini)) / 60000)) : TRAMOS.has(e.tipo) ? 'en curso' : '';
    li.innerHTML = `<span class="ico">${ICONOS[e.tipo]}</span><span class="que"><span></span><small></small></span><span class="hora"></span>`;
    li.querySelector('.que span').textContent = NOMBRES[e.tipo] + (pendientes.has(e.id) ? ' ' : '');
    if (pendientes.has(e.id)) li.querySelector('.que span').insertAdjacentHTML('beforeend', '<span class="pend">· sin enviar</span>');
    li.querySelector('small').textContent = [dur, det].filter(Boolean).join(' · ');
    li.querySelector('.hora').textContent = hm(ini(e)) + (e.fin ? '–' + hm(e.fin) : '');
    li.onclick = () => abrirEditor(e);
    ul.append(li);
  }
  if (!ev.length) ul.innerHTML = '<li class="dia-sep">Aún no hay registros en las últimas 36 horas.</li>';
}

function pintarSync() {
  const b = $('#sync');
  const n = pendientes.size + fichasPend.size;
  b.classList.toggle('mal', !!syncEstado.error);
  b.textContent = cfg?.url === 'demo' ? 'demo' : syncEstado.enviando ? 'enviando…' : n ? `${n} sin enviar` : syncEstado.error ? 'sin conexión' : 'al día ✓';
  b.title = syncEstado.error || (syncEstado.ultima ? 'Última sincronización ' + syncEstado.ultima.replace('T', ' ') : '');
}

function pintar() {
  if (!cfg) return;
  const st = pintarEstado();
  pintarAcciones(st);
  pintarResumen();
  pintarRegistro();
  pintarSync();
}

// ---------- aviso con ajuste de hora ----------
let avisoTimer = null;
function aviso(texto, ev, campo) {
  const a = $('#aviso');
  a.hidden = false;
  a.innerHTML = '<span class="txt"></span>';
  const pintarTxt = () => { a.querySelector('.txt').textContent = `${texto} · ${hm(eventos.get(ev.id)[campo])}`; };
  pintarTxt();
  const ajustar = (min) => {
    const e = eventos.get(ev.id);
    const d = fecha(e[campo]); d.setMinutes(d.getMinutes() + min);
    const nuevo = local(d);
    if (campo === 'fin' && nuevo < e.ini) return;
    if (campo === 'ini' && e.fin && nuevo > e.fin) return;
    eventos.set(e.id, { ...e, [campo]: nuevo }); pendientes.add(e.id); persistir();
    pintarTxt(); pintar(); programarEnvio(); reiniciar();
  };
  const boton = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; a.append(b); };
  boton('−5', () => ajustar(-5)); boton('−1', () => ajustar(-1)); boton('+1', () => ajustar(1));
  boton('Deshacer', () => {
    const e = eventos.get(ev.id);
    // si la acción cerró un tramo, deshacer lo reabre; si lo creó, lo borra
    if (campo === 'fin') eventos.set(e.id, { ...e, fin: null }); else eventos.set(e.id, { ...e, borrado: true });
    pendientes.add(e.id); persistir(); a.hidden = true; pintar(); enviar();
  });
  const reiniciar = () => { clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { a.hidden = true; }, 9000); };
  reiniciar();
}

// ---------- editor de un registro ----------
function abrirEditor(e, nuevo = false) {
  const dlg = $('#editor');
  $('#editor-titulo').textContent = nuevo ? 'Añadir registro' : NOMBRES[e.tipo];
  const campos = $('#editor-campos');
  const dt = (v) => (v ? v.slice(0, 16) : '');
  campos.innerHTML = '';
  const add = (html) => campos.insertAdjacentHTML('beforeend', html);
  if (nuevo) add(`<label>Tipo <select id="ed-tipo">${Object.entries(NOMBRES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>`);
  add(`<label id="ed-l-ini">Hora <input id="ed-ini" type="datetime-local" value="${dt(ini(e))}"></label>`);
  add(`<label id="ed-l-fin">Fin <input id="ed-fin" type="datetime-local" value="${dt(e.fin)}"></label>`);
  add(`<label id="ed-l-lado">Tipo de toma <select id="ed-lado">${LADOS.map((l) => `<option ${l === e.tipo_toma ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`);
  add(`<label id="ed-l-como">Dónde durmió <select id="ed-como">${COMO.map((l) => `<option ${l === (e.como || 'cuna') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`);
  const ajustarVisibles = () => {
    const tipo = nuevo ? $('#ed-tipo').value : e.tipo;
    $('#ed-l-fin').hidden = !TRAMOS.has(tipo);
    $('#ed-l-ini').firstChild.textContent = TRAMOS.has(tipo) ? 'Inicio ' : 'Hora ';
    $('#ed-l-lado').hidden = tipo !== 'toma';
    $('#ed-l-como').hidden = tipo !== 'siesta';
  };
  if (nuevo) $('#ed-tipo').onchange = ajustarVisibles;
  ajustarVisibles();
  $('#editor-borrar').hidden = nuevo;
  dlg.returnValue = '';
  dlg.onclose = () => {
    const r = dlg.returnValue;
    if (r === 'borrar') {
      if (!confirm('¿Borrar este registro?')) return;
      eventos.set(e.id, { ...e, borrado: true });
    } else if (r === 'guardar') {
      const tipo = nuevo ? $('#ed-tipo').value : e.tipo;
      const i = $('#ed-ini').value, f = $('#ed-fin').value;
      if (!i) return;
      const x = { ...e, tipo };
      delete x.t; delete x.ini; delete x.fin;
      if (TRAMOS.has(tipo)) {
        if (f && f < i) { alert('El fin no puede ser anterior al inicio.'); return; }
        x.ini = i + ':00'; x.fin = f ? f + ':00' : null;
      } else x.t = i + ':00';
      if (tipo === 'toma') x.tipo_toma = $('#ed-lado').value; else delete x.tipo_toma;
      if (tipo === 'siesta') x.como = $('#ed-como').value; else delete x.como;
      if (nuevo) { x.id = nuevoId(); x.autor = cfg.autor || ''; }
      eventos.set(x.id, x);
      pendientes.add(x.id);
    } else return;
    pendientes.add(e.id || '');
    pendientes.delete('');
    persistir(); pintar(); enviar();
  };
  dlg.showModal();
}

function abrirFicha(dia) {
  const dlg = $('#ficha');
  const f = fichas[dia] || {};
  $('#ficha-titulo').textContent = `Noche del ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  $('#ficha-mala').checked = !!f.noche_mala;
  $('#ficha-notas').value = f.notas || '';
  $('#ficha-latencia').value = f.latencia_min ?? '';
  $('#ficha-llanto').value = f.llanto_min ?? '';
  dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue !== 'guardar') return;
    const num = (v) => (v === '' ? null : Math.max(0, Math.round(Number(v))));
    fichas[dia] = {
      fecha: dia, noche_mala: $('#ficha-mala').checked, notas: $('#ficha-notas').value.trim() || null,
      latencia_min: num($('#ficha-latencia').value), llanto_min: num($('#ficha-llanto').value),
    };
    fichasPend.add(dia);
    persistir(); pintar(); enviar();
  };
  dlg.showModal();
}

// ---------- sincronización ----------
let envioTimer = null;
const programarEnvio = () => { clearTimeout(envioTimer); envioTimer = setTimeout(enviar, 4000); };

async function enviar() {
  if (!cfg || syncEstado.enviando) return;
  if (cfg.url === 'demo') { pendientes.clear(); fichasPend.clear(); persistir(); pintar(); return; }
  if (!pendientes.size && !fichasPend.size) return;
  const ids = [...pendientes].filter((id) => eventos.has(id));
  const dias = [...fichasPend];
  const cuerpo = {
    token: cfg.token,
    eventos: ids.map((id) => { const e = { ...eventos.get(id) }; if (e.fin == null) delete e.fin; return e; }),
    fichas: dias.map((d) => ({ ...fichas[d], fecha: d })),
  };
  syncEstado.enviando = true; pintarSync();
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error del servidor');
    // solo se quitan de la cola los que no han cambiado mientras tanto
    ids.forEach((id) => { const enviado = cuerpo.eventos.find((e) => e.id === id); const ahora = { ...eventos.get(id) }; if (ahora.fin == null) delete ahora.fin; if (JSON.stringify(ahora) === JSON.stringify(enviado)) pendientes.delete(id); });
    dias.forEach((d) => fichasPend.delete(d));
    syncEstado.error = null;
    syncEstado.ultima = local(); guardarLS('ultimaSync', syncEstado.ultima);
  } catch (err) {
    syncEstado.error = String(err.message || err);
  } finally {
    syncEstado.enviando = false;
    persistir(); pintar();
    if (pendientes.size || fichasPend.size) setTimeout(enviar, syncEstado.error ? 30000 : 500);
  }
}

async function recibir() {
  if (!cfg || cfg.url === 'demo' || document.hidden) return;
  try {
    const desde = masDias(hoyStr(), -3);
    const r = await fetch(cfg.url + '?' + new URLSearchParams({ token: cfg.token, desde }));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error del servidor');
    for (const e of j.eventos) if (!pendientes.has(e.id)) eventos.set(e.id, normalizar(e));
    // lo que hay en el móvil de esos días y el servidor no tiene (y no está pendiente) lo borró otra persona → fuera
    const enServidor = new Set(j.eventos.map((e) => e.id));
    for (const [id, e] of eventos) if (ini(e) >= desde && !enServidor.has(id) && !pendientes.has(id)) eventos.delete(id);
    for (const [d, f] of Object.entries(j.fichas || {})) if (!fichasPend.has(d)) fichas[d] = { ...f, fecha: d };
    syncEstado.error = null;
    syncEstado.ultima = local(); guardarLS('ultimaSync', syncEstado.ultima);
    persistir(); pintar();
  } catch (err) {
    syncEstado.error = String(err.message || err);
    pintarSync();
  }
}

// ---------- configuración ----------
function leerEnlaceConfig() {
  const m = location.hash.match(/cfg=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (err) { return null; }
}
function enlaceConfig() {
  const datos = btoa(unescape(encodeURIComponent(JSON.stringify({ url: cfg.url, token: cfg.token, bebe: cfg.bebe }))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#cfg=' + datos;
}

async function guardarConfig(nueva) {
  $('#cfg-error').hidden = true;
  if (nueva.url !== 'demo') {
    try {
      const r = await fetch(nueva.url + '?' + new URLSearchParams({ token: nueva.token, desde: hoyStr() }));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
    } catch (err) {
      $('#cfg-error').textContent = 'No se ha podido conectar: ' + (err.message || err);
      $('#cfg-error').hidden = false;
      return;
    }
  }
  cfg = nueva;
  guardarLS('cfg', cfg);
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
    guardarLS('autor', autor);
    guardarConfig({ url: $('#cfg-url').value.trim(), token: $('#cfg-token').value.trim(), autor, bebe: $('#cfg-bebe').value.trim() });
  };
  $('#cfg-demo').onclick = () => guardarConfig({ url: 'demo', token: '', autor: $('#cfg-autor').value.trim() || 'demo', bebe: $('#cfg-bebe').value.trim() || 'Bebé' });
}

function arrancar() {
  if (!cfg) return pantallaConfig();
  $('#config').hidden = true;
  $('#principal').hidden = false;
  $('#titulo').textContent = cfg.bebe || 'Registro';
  document.title = 'Sueño' + (cfg.bebe ? ' de ' + cfg.bebe : '');
  pintar();
  enviar();
  recibir();
}

$('#menu-btn').onclick = () => { const d = $('#menu'); d.returnValue = ''; d.showModal(); };
$('#menu').onclose = async () => {
  const r = $('#menu').returnValue;
  if (r === 'nuevo') abrirEditor({ tipo: 'siesta', ini: local(), fin: null }, true);
  if (r === 'sync') { await enviar(); await recibir(); }
  if (r === 'compartir') {
    const url = enlaceConfig();
    const texto = 'Enlace para configurar la app de sueño (no lo compartas con nadie más):';
    if (navigator.share) navigator.share({ title: 'Registro de sueño', text: texto, url }).catch(() => {});
    else { try { await navigator.clipboard.writeText(url); alert('Enlace copiado.'); } catch (err) { prompt('Copia este enlace:', url); } }
  }
  if (r === 'salir' && confirm('Se borrarán los datos guardados en este móvil (no los del servidor). ¿Seguro?')) {
    if (pendientes.size && !confirm(`Hay ${pendientes.size} registros sin enviar que se perderán. ¿Seguir?`)) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('sm.')).forEach((k) => localStorage.removeItem(k)); } catch (err) { /* nada */ }
    location.reload();
  }
};
$('#sync').onclick = async () => { await enviar(); await recibir(); };

setInterval(() => { if (cfg && !document.hidden) pintarEstado(); }, 1000);
setInterval(recibir, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pintar(); enviar(); recibir(); } });
window.addEventListener('online', () => enviar());
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

arrancar();
