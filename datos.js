// Datos de la app: eventos guardados en el móvil, cola de envío, sincronización con el servidor,
// estado actual del bebé y predicción de la próxima siesta. Sin nada de pantalla.
import { derivarNoche } from './derivar.js';
export { derivarNoche };

export const TRAMOS = new Set(['llanto', 'siesta', 'despertar_noche', 'toma']);
export const NOMBRES = {
  despertar: 'Se despertó', a_la_cuna: 'A la cuna', llanto: 'Llanto', dormido: 'Se durmió',
  siesta: 'Siesta', despertar_noche: 'Despertar nocturno', toma: 'Toma',
};
export const LADOS = ['pecho izq', 'pecho dcha', 'biberón'];
export const COMO = ['cuna', 'brazos', 'cochecito', 'coche', 'otro'];

// ---------- utilidades de tiempo ----------
export const pad = (n) => String(n).padStart(2, '0');
export const local = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const fecha = (s) => new Date(s.length === 16 ? s + ':00' : s);
export const hm = (s) => (s ? s.slice(11, 16) : '—');
export const hoyStr = (d = new Date()) => local(d).slice(0, 10);
export const masDias = (dia, n) => { const d = new Date(dia + 'T12:00:00'); d.setDate(d.getDate() + n); return hoyStr(d); };
export const sumarMin = (s, min) => { const d = fecha(s); d.setMinutes(d.getMinutes() + min); return local(d); };
export const minEntre = (a, b) => Math.round((fecha(b) - fecha(a)) / 60000);
export const durTxt = (min) => (min == null || Number.isNaN(min) ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${pad(min % 60)}m`);
export const durCorta = (min) => (min == null ? '—' : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? pad(min % 60) : ''}`);
export const ini = (e) => e.ini ?? e.t;
export const abierto = (e) => TRAMOS.has(e.tipo) && !e.fin;
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const guardarLS = (k, v) => { try { localStorage.setItem('sm.' + k, JSON.stringify(v)); } catch (err) { /* modo privado */ } };
export const leerLS = (k, def) => { try { const v = localStorage.getItem('sm.' + k); return v ? JSON.parse(v) : def; } catch (err) { return def; } };
export const escribirLS = guardarLS;

// ---------- almacén ----------
export const db = {
  cfg: leerLS('cfg', null),
  eventos: new Map(Object.entries(leerLS('eventos', {}))),
  pendientes: new Set(leerLS('pendientes', [])),
  fichas: leerLS('fichas', {}),
  fichasPend: new Set(leerLS('fichasPend', [])),
  sync: { enviando: false, error: null, ultima: leerLS('ultimaSync', null) },
};
let alCambiar = () => {};
export const onCambio = (fn) => { alCambiar = fn; };

export function persistir() {
  guardarLS('eventos', Object.fromEntries(db.eventos));
  guardarLS('pendientes', [...db.pendientes]);
  guardarLS('fichas', db.fichas);
  guardarLS('fichasPend', [...db.fichasPend]);
}
export const vivos = () => [...db.eventos.values()].filter((e) => !e.borrado).sort((a, b) => ini(a).localeCompare(ini(b)));

export function normalizar(e) {
  const o = { ...e };
  if (TRAMOS.has(o.tipo) && o.t && !o.ini) { o.ini = o.t; delete o.t; }
  if (TRAMOS.has(o.tipo) && !o.fin) o.fin = null;
  return o;
}

// Guarda (crea o reemplaza) un evento y lo pone en la cola de envío
export function guardar(e) {
  const ev = normalizar({ autor: db.cfg?.autor || '', ...e, id: e.id || nuevoId() });
  db.eventos.set(ev.id, ev);
  db.pendientes.add(ev.id);
  persistir();
  programarEnvio(300);
  return ev;
}
export const cambiar = (id, cambios) => guardar({ ...db.eventos.get(id), ...cambios });
export function guardarFicha(dia, f) {
  db.fichas[dia] = { ...f, fecha: dia };
  db.fichasPend.add(dia);
  persistir();
  programarEnvio(300);
}

// ---------- estado actual ----------
export function estadoActual() {
  const ev = vivos();
  const ab = (tipo) => ev.filter((e) => abierto(e) && e.tipo === tipo).pop();
  const ultimo = ev.filter((e) => ['despertar', 'dormido', 'a_la_cuna'].includes(e.tipo)).pop();
  const llanto = ab('llanto');
  const fase = ultimo?.tipo === 'dormido' ? 'noche' : ultimo?.tipo === 'a_la_cuna' ? 'acostando' : 'dia';
  if (ab('toma')) return { modo: 'toma', ev: ab('toma'), fase };
  if (ab('despertar_noche')) return { modo: 'despertar_noche', ev: ab('despertar_noche'), fase };
  if (ab('siesta')) return { modo: 'siesta', ev: ab('siesta'), fase: 'dia' };
  if (fase === 'noche') return { modo: 'noche', ev: ultimo, fase };
  if (fase === 'acostando') return { modo: 'acostando', ev: ultimo, llanto, fase };
  const finSiesta = ev.filter((e) => e.tipo === 'siesta' && e.fin).pop();
  const desde = [ultimo?.t, finSiesta?.fin].filter(Boolean).sort().pop();
  return { modo: 'dia', ev: ultimo, desde, fase };
}

// ---------- jornadas y predicción ----------
// Día D: despertar(D), siestas hasta dormirse, dormido(D) y ventanas de vigilia entre medias
export function jornada(D, ev = vivos()) {
  const desp = ev.find((e) => e.tipo === 'despertar' && ini(e).slice(0, 10) === D);
  if (!desp) return null;
  const limite = masDias(D, 1) + 'T04:00:00';
  const dorm = ev.find((e) => e.tipo === 'dormido' && e.t > desp.t && e.t < limite);
  const hasta = dorm ? dorm.t : limite;
  const siestas = ev.filter((e) => e.tipo === 'siesta' && e.ini > desp.t && e.ini < hasta);
  const ventanas = [];
  let desde = desp.t;
  for (const s of siestas) { ventanas.push(minEntre(desde, s.ini)); desde = s.fin || s.ini; }
  return { D, despertar: desp.t, dormido: dorm?.t || null, siestas, ventanas, ultimaVentana: dorm ? minEntre(desde, dorm.t) : null };
}
const mediana = (xs) => { const v = xs.filter((x) => x != null && x > 0).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };

export { mediana };

// ---------- histórico de noches ----------
// Cada noche como objeto con los campos de derivarNoche. Las noches registradas con la app se calculan aquí
// (siempre al día); las demás vienen de la pestaña Nighttime del servidor (p. ej. las importadas del Excel).
const CAB = {
  'Nighttime Date': ['fecha', 't'], 'Night': ['noche_n', 't'], 'Wake-up time (that day)': ['despertar', 't'],
  'Number of naps': ['siestas', 'n'], 'Total daytime sleep': ['sueno_dia_min', 'd'], 'Last Wake Window': ['ultima_vv_min', 'd'],
  'Last nap duration': ['lap_nap_min', 'd'], 'Total 24-hour sleep': ['sueno_24h_min', 'd'], 'Bedtime': ['bedtime', 't'],
  'Asleep at': ['dormido', 't'], 'Total crying duration': ['llanto_min', 'd'], 'Time from bedtime to sleep onset': ['latencia_min', 'd'],
  'Total awake time (to sleep onset)': ['despierto_min', 'd'], 'Wake-up time (next morning)': ['despertar_sig', 't'],
  'Number of feedings': ['tomas', 'n'], 'Bad night? (multiples despertares, early wake, etc)': ['noche_mala', 'b'],
  'Wakings (not counting the feeding ones)': ['despertares', 'n'], 'Total night sleep': ['sueno_noche_min', 'd'],
  'Longest sleep stretch': ['tramo_largo', 't'], 'Duration of longest sleep stretch': ['tramo_largo_min', 'd'], 'Notes': ['notas', 't'], 'Source': ['origen', 't'],
};
const leerDur = (v) => { const s = String(v ?? '').trim(); let m = s.match(/^(\d+):(\d{2})/); if (m) return +m[1] * 60 + +m[2]; m = s.match(/^(\d+)\s*min/); if (m) return +m[1]; return s === '' ? null : (Number.isFinite(+s) ? +s : null); };
export function filaAObj(f) {
  const o = {};
  for (const [cab, [k, tipo]] of Object.entries(CAB)) {
    const v = f[cab];
    if (v == null || v === '') { o[k] = null; continue; }
    o[k] = tipo === 'd' ? leerDur(v) : tipo === 'n' ? Number(v) : tipo === 'b' ? /^(s[ií]|yes|true)/i.test(v) : String(v);
  }
  return o;
}
db.filas = leerLS('filas', []);                                     // filas del servidor (histórico)

// Noches desde «desde» hasta ayer (o hoy), combinando app y servidor. Las noches sin datos se omiten.
export function historico(desde = '2000-01-01', hasta = hoyStr()) {
  const ev = vivos().map((e) => (abierto(e) ? { ...e, fin: local() } : e));
  const conEventos = new Set(ev.filter((e) => e.tipo === 'despertar' || e.tipo === 'dormido').map((e) => ini(e).slice(0, 10)));
  const porFecha = new Map(db.filas.map((f) => { const o = filaAObj(f); return [o.fecha, o]; }));
  const fechas = new Set([...porFecha.keys(), ...conEventos]);
  const out = [];
  for (const D of [...fechas].filter((d) => d && d >= desde && d <= hasta).sort()) {
    const srv = porFecha.get(D);
    if (srv && srv.origen === 'Excel') { out.push({ ...srv, ...fichaSobre(D, srv) }); continue; }
    if (conEventos.has(D)) { out.push({ ...derivarNoche(ev, D, db.fichas), origen: 'app' }); continue; }
    if (srv) out.push(srv);
  }
  return out;
}
const fichaSobre = (D, r) => { const f = db.fichas[D]; return f ? { noche_mala: f.noche_mala ?? r.noche_mala, notas: f.notas ?? r.notas } : {}; };

// Próxima siesta u hora de dormir. Con datos de la app se usan las ventanas reales de cada siesta;
// con el histórico (Excel) se usan el nº de siestas, la última ventana y la media de las demás.
export function prediccion(st) {
  if (st.modo !== 'dia' || !st.desde) return null;
  const hoy = hoyStr();
  const ev = vivos();
  const hoyJ = jornada(hoy, ev);
  if (!hoyJ) return null;
  const noches = historico(masDias(hoy, -7), masDias(hoy, -1)).filter((r) => r.dormido && r.siestas != null);
  const jornadas = [];
  for (let k = 1; k <= 7; k++) { const j = jornada(masDias(hoy, -k), ev); if (j && j.dormido) jornadas.push(j); }
  if (!noches.length && !jornadas.length) return { sinDatos: true };
  const nSiestas = mediana(noches.map((r) => r.siestas)) ?? mediana(jornadas.map((j) => j.siestas.length)) ?? 2;
  const hechas = hoyJ.siestas.filter((s) => s.fin).length;
  const tocaDormir = hechas >= nSiestas;
  let ventana;
  if (tocaDormir) ventana = mediana(noches.map((r) => r.ultima_vv_min)) ?? mediana(jornadas.map((j) => j.ultimaVentana));
  else {
    ventana = mediana(jornadas.map((j) => j.ventanas[hechas]));
    // sin jornadas de la app: ventana media de las demás = (tiempo despierto − última ventana) / nº de siestas
    if (!ventana) ventana = mediana(noches.map((r) => (r.despierto_min != null && r.ultima_vv_min != null && r.siestas ? Math.round((r.despierto_min - r.ultima_vv_min) / r.siestas) : null)));
  }
  if (!ventana) return { sinDatos: true };
  const cuando = sumarMin(st.desde, ventana);
  return { tipo: tocaDormir ? 'dormir' : 'siesta', numero: hechas + 1, cuando, ventana, dias: Math.max(noches.length, jornadas.length) };
}

// ---------- sincronización ----------
let envioTimer = null;
export function programarEnvio(ms = 4000) { clearTimeout(envioTimer); envioTimer = setTimeout(enviar, ms); }

export async function enviar() {
  const { cfg, sync } = db;
  if (!cfg || sync.enviando) return;
  if (cfg.url === 'demo') { db.pendientes.clear(); db.fichasPend.clear(); persistir(); alCambiar(); return; }
  if (!db.pendientes.size && !db.fichasPend.size) return;
  const quitarFinNulo = (e) => { const x = { ...e }; if (x.fin == null) delete x.fin; return x; };
  const ids = [...db.pendientes].filter((id) => db.eventos.has(id));
  const dias = [...db.fichasPend];
  const cuerpo = {
    token: cfg.token,
    eventos: ids.map((id) => quitarFinNulo(db.eventos.get(id))),
    fichas: dias.map((d) => ({ ...db.fichas[d], fecha: d })),
  };
  sync.enviando = true; alCambiar();
  try {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error del servidor');
    // fuera de la cola solo lo que no ha cambiado mientras se enviaba
    ids.forEach((id) => {
      const enviado = cuerpo.eventos.find((e) => e.id === id);
      if (JSON.stringify(quitarFinNulo(db.eventos.get(id))) === JSON.stringify(enviado)) db.pendientes.delete(id);
    });
    dias.forEach((d) => db.fichasPend.delete(d));
    sync.error = null;
    sync.ultima = local(); guardarLS('ultimaSync', sync.ultima);
  } catch (err) {
    sync.error = String(err.message || err);
  } finally {
    sync.enviando = false;
    persistir(); alCambiar();
    if (db.pendientes.size || db.fichasPend.size) programarEnvio(sync.error ? 30000 : 500);
  }
}

export async function recibir() {
  const { cfg, sync } = db;
  if (!cfg || cfg.url === 'demo' || document.hidden) return;
  try {
    const desde = masDias(hoyStr(), -10);
    const r = await fetch(cfg.url + '?' + new URLSearchParams({ token: cfg.token, desde, filas_desde: '2000-01-01' }));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'error del servidor');
    for (const e of j.eventos) if (!db.pendientes.has(e.id)) db.eventos.set(e.id, normalizar(e));
    const enServidor = new Set(j.eventos.map((e) => e.id));
    for (const [id, e] of db.eventos) if (ini(e) >= desde && !enServidor.has(id) && !db.pendientes.has(id)) db.eventos.delete(id);
    for (const [d, f] of Object.entries(j.fichas || {})) if (!db.fichasPend.has(d)) db.fichas[d] = { ...f, fecha: d };
    if (Array.isArray(j.filas)) { db.filas = j.filas; guardarLS('filas', j.filas); }
    sync.error = null;
    sync.ultima = local(); guardarLS('ultimaSync', sync.ultima);
    persistir(); alCambiar();
  } catch (err) {
    sync.error = String(err.message || err);
    alCambiar();
  }
}

export async function probarConexion(c) {
  if (c.url === 'demo') return;
  const r = await fetch(c.url + '?' + new URLSearchParams({ token: c.token, desde: hoyStr() }));
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
}
export function guardarConfig(c) { db.cfg = c; guardarLS('cfg', c); }
export function borrarTodo() { try { Object.keys(localStorage).filter((k) => k.startsWith('sm.')).forEach((k) => localStorage.removeItem(k)); } catch (err) { /* nada */ } }
