// COPIA de app/fase0/derivar.mjs (la hace build.mjs) — no editar aquí
// Calcula la fila «Nighttime» de una fecha D a partir de la lista de eventos.
// Sin dependencias: el mismo código servirá en la app (PWA) y en Apps Script.
//
// Evento: { id, tipo, t } (punto) o { id, tipo, ini, fin } (tramo). Horas en ISO local 'AAAA-MM-DDTHH:MM[:SS]'.
// tipos: despertar, a_la_cuna, llanto, dormido, siesta, despertar_noche, toma
// Ficha de noche (opcional): fichas[D] = { noche_mala, notas, latencia_min, llanto_min }

const N1 = '2026-09-07';                 // primera noche del Excel
const TOMA_TRAS_DESPERTAR_S = 5 * 60;    // un despertar seguido de toma en ≤5 min cuenta como toma

const ts = (s) => Date.parse(s + (s.length === 16 ? ':00' : '') + 'Z') / 1000; // segundos (hora local tratada como UTC)
const dia = (s) => s.slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const hhmm = (sec) => (sec == null ? null : new Date(sec * 1000).toISOString().slice(11, 16));
const mins = (sec) => (sec == null ? null : Math.round(sec / 60));
const ini = (e) => ts(e.ini ?? e.t);
const fin = (e) => ts(e.fin ?? e.t);
const dur = (e) => fin(e) - ini(e) - (e.pausas || []).reduce((a, p) => a + ts(p.fin) - ts(p.ini), 0);

// Fin de la noche que empieza en D: el primer 'despertar' posterior a dormido(D)
function limitesDia(ev, D) {
  const vivos = ev.filter((e) => !e.borrado);
  const despertar = vivos.filter((e) => e.tipo === 'despertar' && dia(e.t) === D).sort((a, b) => ts(a.t) - ts(b.t))[0];
  const dormidos = vivos.filter((e) => e.tipo === 'dormido').sort((a, b) => ts(a.t) - ts(b.t));
  const desde = despertar ? ts(despertar.t) : ts(D + 'T04:00');
  // dormido(D): el primero tras el despertar de D, antes del mediodía de D+1
  const dormido = dormidos.find((e) => ts(e.t) > desde && ts(e.t) < ts(addDays(D, 1) + 'T12:00'));
  return { despertar, dormido };
}

export function derivarNoche(eventos, D, fichas = {}) {
  const ev = eventos.filter((e) => !e.borrado);
  const { despertar, dormido } = limitesDia(ev, D);
  const sig = limitesDia(ev, addDays(D, 1)).despertar;
  const prev = limitesDia(ev, addDays(D, -1));
  const tDesp = despertar ? ts(despertar.t) : null;
  const tDorm = dormido ? ts(dormido.t) : null;
  const tSig = sig ? ts(sig.t) : null;
  const ficha = fichas[D] || {};
  const entre = (tipo, a, b) => ev.filter((e) => e.tipo === tipo && a != null && b != null && ini(e) >= a && ini(e) < b).sort((x, y) => ini(x) - ini(y));

  // --- día D ---
  const siestas = tDesp != null ? entre('siesta', tDesp, tDorm ?? tDesp + 20 * 3600) : [];
  const suenoDia = siestas.length || tDesp != null ? siestas.reduce((a, s) => a + dur(s), 0) : null;
  const ultima = siestas[siestas.length - 1];

  // --- acostar ---
  const cuna = tDorm != null ? ev.filter((e) => e.tipo === 'a_la_cuna' && ts(e.t) <= tDorm && ts(e.t) > tDorm - 3 * 3600).sort((a, b) => ts(b.t) - ts(a.t))[0] : null;
  const tCuna = cuna ? ts(cuna.t) : null;
  const latencia = ficha.latencia_min != null ? ficha.latencia_min * 60 : tCuna != null ? tDorm - tCuna : null;
  const llanto = ficha.llanto_min != null ? ficha.llanto_min * 60
    : tCuna != null ? entre('llanto', tCuna, tDorm + 1).reduce((a, e) => a + Math.min(fin(e), tDorm) - ini(e), 0) : null;

  // --- noche D ---
  const tomas = entre('toma', tDorm, tSig);
  const desps = entre('despertar_noche', tDorm, tSig);
  const despSinToma = desps.filter((d) => !tomas.some((t) => ini(t) >= ini(d) && ini(t) <= fin(d) + TOMA_TRAS_DESPERTAR_S));
  const suenoNoche = (n) => n.tDorm != null && n.tSig != null
    ? n.tSig - n.tDorm - entre('despertar_noche', n.tDorm, n.tSig).reduce((a, d) => a + dur(d), 0) : null;
  const noche = suenoNoche({ tDorm, tSig });

  // tramos de sueño entre interrupciones
  let tramo = null;
  if (tDorm != null && tSig != null) {
    const cortes = [...tomas, ...desps].map((e) => [ini(e), fin(e)]).sort((a, b) => a[0] - b[0]);
    let desde = tDorm;
    for (const [a, b] of [...cortes, [tSig, tSig]]) {
      if (a > desde && (!tramo || a - desde > tramo.d)) tramo = { d: a - desde, a: desde, b: a };
      desde = Math.max(desde, b);
    }
  }

  // 24 h = noche anterior + día D
  const tDormPrev = prev.dormido ? ts(prev.dormido.t) : null;
  const nochePrev = suenoNoche({ tDorm: tDormPrev, tSig: tDesp });
  const s24 = nochePrev != null && suenoDia != null ? nochePrev + suenoDia : null;

  const n = Math.round((Date.parse(D) - Date.parse(N1)) / 864e5) + 1;
  return {
    fecha: D,
    noche_n: 'N' + n,
    despertar: hhmm(tDesp),
    siestas: tDesp != null ? siestas.length : null,
    sueno_dia_min: mins(suenoDia),
    ultima_vv_min: ultima && tDorm != null ? mins(tDorm - fin(ultima)) : null,
    lap_nap_min: ultima ? mins(dur(ultima)) : null,
    sueno_24h_min: mins(s24),
    bedtime: hhmm(tCuna),
    dormido: hhmm(tDorm),
    llanto_min: mins(llanto),
    latencia_min: mins(latencia),
    despierto_min: tDesp != null && tDorm != null ? mins(tDorm - tDesp - suenoDia) : null,
    despertar_sig: hhmm(tSig),
    tomas: tSig != null ? tomas.length : null,
    noche_mala: ficha.noche_mala ?? null,
    despertares: tSig != null ? despSinToma.length : null,
    sueno_noche_min: mins(noche),
    tramo_largo: tramo ? hhmm(tramo.a) + '-' + hhmm(tramo.b) : null,
    tramo_largo_min: tramo ? mins(tramo.d) : null,
    notas: ficha.notas ?? null,
  };
}
