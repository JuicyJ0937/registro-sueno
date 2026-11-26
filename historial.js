// Pestaña «Historial»: el histórico completo (noches del Excel importadas + noches registradas con la app),
// con resumen frente al periodo anterior, gráfica por noche con media de 7 días, medias semanales,
// ritmo de los últimos días y lista de noches. Mismos datos que el dashboard.
import { historico, hoyStr, masDias, durTxt, pad, leerLS, escribirLS } from './datos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Métricas: clave en la fila, nombre, tipo (dur = minutos, hora = reloj, num) y si «más» es mejor
export const METRICAS = [
  { k: 'sueno_noche_min', n: 'Sueño nocturno', t: 'dur', mejor: 1 },
  { k: 'tramo_largo_min', n: 'Tramo más largo', t: 'dur', mejor: 1 },
  { k: 'sueno_24h_min', n: 'Total 24 h', t: 'dur', mejor: 1 },
  { k: 'sueno_dia_min', n: 'Sueño de día', t: 'dur', mejor: 0 },
  { k: 'dormido', n: 'Se duerme', t: 'hora', mejor: 0 },
  { k: 'despertar_sig', n: 'Se despierta', t: 'hora', mejor: 0 },
  { k: 'latencia_min', n: 'Tarda en dormirse', t: 'dur', mejor: -1 },
  { k: 'llanto_min', n: 'Llanto al acostarse', t: 'dur', mejor: -1 },
  { k: 'ultima_vv_min', n: 'Última ventana', t: 'dur', mejor: 0 },
  { k: 'despierto_min', n: 'Despierto en el día', t: 'dur', mejor: 0 },
  { k: 'despertares', n: 'Despertares sin toma', t: 'num', mejor: -1 },
  { k: 'tomas', n: 'Tomas nocturnas', t: 'num', mejor: -1 },
  { k: 'siestas', n: 'Siestas', t: 'num', mejor: 0 },
];
// una hora del reloj como minutos «desde mediodía», para poder promediar horas alrededor de medianoche
const aMin = (m, v) => {
  if (v == null || v === '') return null;
  if (m.t !== 'hora') return Number(v);
  const [h, mm] = String(v).split(':').map(Number);
  let x = h * 60 + mm;
  if (m.k === 'dormido' && h < 12) x += 1440;
  return x;
};
const fmt = (m, x, corto = false) => {
  if (x == null || Number.isNaN(x)) return '—';
  if (m.t === 'hora') { const v = Math.round(x) % 1440; return pad(Math.floor(v / 60)) + ':' + pad(v % 60); }
  if (m.t === 'num') return (Math.round(x * 10) / 10).toString().replace('.', ',');
  const v = Math.round(x);
  if (corto) return v < 60 ? v + 'm' : Math.floor(v / 60) + 'h' + (v % 60 ? pad(v % 60) : '');
  return durTxt(v);
};
const media = (xs) => { const v = xs.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const diaCorto = (D) => new Date(D + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');

let periodo = leerLS('h.periodo', 14);
let metrica = leerLS('h.metrica', 'sueno_noche_min');
let seleccion = null;
let mesCal = null;                                   // 'AAAA-MM' del calendario

// Calendario: cada día es una jornada (la noche anterior + sus siestas). Punto rojo si esa noche fue mala.
function calendario(todo) {
  const hoy = hoyStr();
  if (!mesCal) mesCal = hoy.slice(0, 7);
  const porFecha = new Map(todo.map((r) => [r.fecha, r]));
  const [y, m] = mesCal.split('-').map(Number);
  const primero = new Date(y, m - 1, 1);
  const dias = new Date(y, m, 0).getDate();
  const hueco = (primero.getDay() + 6) % 7;
  let celdas = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => `<span class="dsem">${d}</span>`).join('') + '<span></span>'.repeat(hueco);
  for (let d = 1; d <= dias; d++) {
    const D = `${mesCal}-${pad(d)}`;
    const conDatos = porFecha.has(D) || porFecha.has(masDias(D, -1));
    const mala = porFecha.get(masDias(D, -1))?.noche_mala;
    celdas += `<button data-j="${D}" class="${conDatos && D <= hoy ? 'con' : ''}${mala ? ' mala' : ''}${D === hoy ? ' hoy' : ''}" ${D > hoy ? 'disabled' : ''}>${d}</button>`;
  }
  const nombre = primero.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return `<section class="tarjeta">
    <div class="cal-cab"><button data-mes="-1">‹</button><b>${nombre}</b><button data-mes="1" ${mesCal >= hoy.slice(0, 7) ? 'disabled' : ''}>›</button></div>
    <div class="cal">${celdas}</div>
    <p class="suave">Toca un día para ver su jornada: la noche anterior + sus siestas.</p></section>`;
}

export function pintarHistorial(cont, { abrirNoche, abrirJornada } = {}) {
  const hoy = hoyStr();
  const todo = historico('2000-01-01', masDias(hoy, -1)).filter((r) => r.sueno_noche_min != null || r.dormido);
  if (!todo.length) { cont.innerHTML = '<section class="tarjeta"><p class="vacio">Aún no hay noches en el histórico.</p></section>'; return; }
  const n = periodo === 0 ? todo.length : periodo;
  const actual = todo.slice(-n);
  const anterior = periodo === 0 ? [] : todo.slice(-2 * n, -n);
  const M = METRICAS.find((m) => m.k === metrica) || METRICAS[0];

  // ---- periodo ----
  const chipsPeriodo = [[7, '7 noches'], [14, '14'], [30, '30'], [0, 'Todo']]
    .map(([v, t]) => `<button data-p="${v}" class="${v === periodo ? 'on' : ''}">${t}</button>`).join('');

  // ---- resumen ----
  const kpis = METRICAS.slice(0, 8).map((m) => {
    const a = media(actual.map((r) => aMin(m, r[m.k])));
    const b = media(anterior.map((r) => aMin(m, r[m.k])));
    let delta = '';
    if (a != null && b != null && periodo !== 0) {
      const d = a - b;
      const txt = m.t === 'num' ? fmt(m, Math.abs(d)) : fmt({ ...m, t: 'dur' }, Math.abs(d), true);
      const bueno = m.mejor === 0 ? '' : (d * m.mejor > 0 ? ' bien' : d * m.mejor < 0 ? ' mal' : '');
      delta = Math.abs(d) < 1 && m.t !== 'num' ? '<span class="delta">igual</span>' : `<span class="delta${bueno}">${d > 0 ? '▲' : '▼'} ${txt}</span>`;
    }
    return `<button class="kpi${m.k === metrica ? ' on' : ''}" data-m="${m.k}"><span class="kpi-n">${m.n}</span><b>${fmt(m, a)}</b>${delta}</button>`;
  }).join('');
  const malas = actual.filter((r) => r.noche_mala).length;

  // ---- gráfica por noche (barras + media móvil de 7 noches) ----
  const W = 340, H = 190, top = 14, base = 150, izq = 34;
  const vals = actual.map((r) => aMin(M, r[M.k]));
  const conValor = vals.filter((v) => v != null);
  let lo = Math.min(...conValor), hi = Math.max(...conValor);
  // escala con marcas «redondas»: cada hora (duraciones largas y horas), cada 10 min o cada unidad
  const paso = M.t === 'num' ? 1 : (hi - lo > 150 || M.t === 'hora' ? 60 : hi - lo > 40 ? 15 : 5);
  lo = Math.floor((M.t === 'num' || M.k === 'latencia_min' || M.k === 'llanto_min' ? Math.min(0, lo) : lo - paso / 2) / paso) * paso;
  hi = Math.ceil((hi + (M.t === 'num' ? .5 : paso / 3)) / paso) * paso;
  const y = (v) => base - ((v - lo) / (hi - lo || 1)) * (base - top);
  const marcas = [];
  for (let v = lo; v <= hi + .001; v += paso * Math.max(1, Math.ceil((hi - lo) / paso / 5))) marcas.push(v);
  const ancho = (W - izq) / actual.length;
  let svg = '';
  const ref = media(conValor);
  for (const v of marcas) svg += `<line class="rejilla" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="eje-y" x="${izq - 5}" y="${y(v) + 3}">${fmt(M, v, true)}</text>`;
  actual.forEach((r, i) => {
    const v = vals[i];
    const cx = izq + i * ancho + ancho / 2;
    const w = Math.max(2, Math.min(18, ancho * .62));
    if (v != null) {
      const cls = `${r.noche_mala ? 'mala' : ''}${r.fecha === seleccion ? ' sel' : ''}`;
      if (M.t === 'hora') svg += `<circle class="punto ${cls}" data-f="${r.fecha}" cx="${cx}" cy="${y(v)}" r="${Math.max(3, Math.min(6, w / 2))}"/>`;
      else svg += `<rect class="barra ${cls}" data-f="${r.fecha}" x="${cx - w / 2}" y="${y(v)}" width="${w}" height="${Math.max(1, base - y(v))}" rx="${Math.min(5, w / 2)}"/>`;
    }
    const cada = Math.ceil(actual.length / 6);
    if ((actual.length - 1 - i) % cada === 0) svg += `<text class="eje" style="text-anchor:${i === actual.length - 1 ? 'end' : 'middle'}" x="${i === actual.length - 1 ? cx + ancho / 2 : cx}" y="${base + 16}">${diaCorto(r.fecha)}</text>`;
    svg += `<rect class="zona" data-f="${r.fecha}" x="${cx - ancho / 2}" y="${top}" width="${ancho}" height="${base - top + 20}"/>`;
  });
  // media móvil de 7 noches sobre todo el histórico, dibujada en el periodo
  const idx0 = todo.length - actual.length;
  const mm = actual.map((_, i) => media(todo.slice(Math.max(0, idx0 + i - 6), idx0 + i + 1).map((r) => aMin(M, r[M.k]))));
  const pts = mm.map((v, i) => (v == null ? null : `${izq + i * ancho + ancho / 2},${y(v)}`)).filter(Boolean);
  if (pts.length > 1) svg += `<polyline class="movil" points="${pts.join(' ')}"/>`;
  const sel = actual.find((r) => r.fecha === seleccion);
  const detalle = sel
    ? `<button class="detalle" data-noche="${sel.fecha}"><b>${new Date(sel.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</b> · ${M.n.toLowerCase()} ${fmt(M, aMin(M, sel[M.k]))}${sel.noche_mala ? ' · noche mala' : ''} <span>ver noche →</span></button>`
    : '<p class="suave detalle-vacio">Toca una noche para ver su valor.</p>';

  // ---- medias semanales (semanas de lunes a domingo) ----
  const semanas = new Map();
  for (const r of todo) {
    const d = new Date(r.fecha + 'T12:00:00');
    const lunes = masDias(r.fecha, -((d.getDay() + 6) % 7));
    if (!semanas.has(lunes)) semanas.set(lunes, []);
    semanas.get(lunes).push(aMin(M, r[M.k]));
  }
  const ultimas = [...semanas.entries()].slice(-10).map(([l, xs]) => ({ l, v: media(xs), n: xs.filter((x) => x != null).length }));
  const vs = ultimas.map((s) => s.v).filter((v) => v != null);
  let lo2 = Math.min(...vs), hi2 = Math.max(...vs);
  if (M.t === 'hora') { lo2 -= 15; hi2 += 15; } else { lo2 = Math.min(0, lo2); hi2 = hi2 * 1.1 || 1; }
  const y2 = (v) => 120 - ((v - lo2) / (hi2 - lo2 || 1)) * 96;
  const aw = W / Math.max(1, ultimas.length);
  let svg2 = '';
  ultimas.forEach((s, i) => {
    const cx = i * aw + aw / 2, w = aw * .55;
    if (s.v != null) {
      svg2 += M.t === 'hora'
        ? `<circle class="punto${i === ultimas.length - 1 ? ' sel' : ''}" cx="${cx}" cy="${y2(s.v)}" r="5"/>`
        : `<rect class="barra${i === ultimas.length - 1 ? ' sel' : ''}" x="${cx - w / 2}" y="${y2(s.v)}" width="${w}" height="${120 - y2(s.v)}" rx="5"/>`;
      svg2 += `<text class="valor" x="${cx}" y="${y2(s.v) - 7}">${fmt(M, s.v, true)}</text>`;
    }
    svg2 += `<text class="eje" x="${cx}" y="136">${Number(s.l.slice(8))}/${Number(s.l.slice(5, 7))}</text>`;
  });

  // ---- lista de noches ----
  const lista = [...actual].reverse().map((r) => `<li data-noche="${r.fecha}">
      <span class="ln-f"><b>${new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}</b><small>${diaCorto(r.fecha).split(' ')[1] || ''}</small></span>
      <span class="ln-d">${r.dormido || '—'} → ${r.despertar_sig || '—'}<small>tramo ${durTxt(r.tramo_largo_min)}${r.despertares ? ' · ' + r.despertares + ' desp.' : ''}${r.notas ? ' · ✎' : ''}</small></span>
      <span class="ln-v${r.noche_mala ? ' mala' : ''}">${durTxt(r.sueno_noche_min)}</span></li>`).join('');

  cont.innerHTML = `
    ${calendario(todo)}
    <div class="periodo">${chipsPeriodo}</div>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Resumen · ${actual.length} noches</h2><span class="suave">${periodo ? 'vs las ' + anterior.length + ' anteriores' : diaCorto(todo[0].fecha) + ' → hoy'}</span></div>
      <div class="kpis">${kpis}</div>
      <p class="suave">${malas} noche${malas === 1 ? '' : 's'} mala${malas === 1 ? '' : 's'} en el periodo · toca un dato para verlo en la gráfica</p>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>${esc(M.n)}</h2><span class="suave">media ${fmt(M, ref)}</span></div>
      <div class="metricas">${METRICAS.map((m) => `<button data-m="${m.k}" class="${m.k === M.k ? 'on' : ''}">${m.n}</button>`).join('')}</div>
      <svg class="grafico-h" viewBox="0 0 ${W} ${H}">${svg}</svg>
      <div class="leyenda"><span style="--c:var(--noche)">noche</span><span style="--c:var(--llanto)">noche mala</span><span style="--c:var(--acento)">media de 7 noches</span></div>
      ${detalle}
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Por semanas</h2><span class="suave">${esc(M.n.toLowerCase())}</span></div>
      <svg class="grafico-s" viewBox="0 0 ${W} 145">${svg2}</svg>
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Noches</h2></div>
      <ul class="lista-noches">${lista}</ul>
    </section>`;

  const repintar = () => pintarHistorial(cont, { abrirNoche, abrirJornada });
  cont.querySelectorAll('[data-mes]').forEach((b) => { b.onclick = () => { const [y, m] = mesCal.split('-').map(Number); const d = new Date(y, m - 1 + Number(b.dataset.mes), 1); mesCal = d.getFullYear() + '-' + pad(d.getMonth() + 1); repintar(); }; });
  cont.querySelectorAll('[data-j]').forEach((b) => { b.onclick = () => abrirJornada?.(b.dataset.j); });
  cont.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { periodo = Number(b.dataset.p); escribirLS('h.periodo', periodo); seleccion = null; repintar(); }; });
  cont.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { metrica = b.dataset.m; escribirLS('h.metrica', metrica); repintar(); }; });
  cont.querySelectorAll('.zona').forEach((z) => { z.onclick = () => { seleccion = z.dataset.f; repintar(); }; });
  cont.querySelectorAll('[data-noche]').forEach((b) => { b.onclick = () => abrirNoche?.(b.dataset.noche, todo.find((r) => r.fecha === b.dataset.noche)); });
}
