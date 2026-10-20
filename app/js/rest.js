// Zugriff auf Supabase über die REST-Schnittstelle (PostgREST), nur lesen,
// mit dem öffentlichen anon/publishable Key. Kein postgres_url, kein secret.
// Dazu der Bytezähler für „Daten diesen Monat“ (Tablet hat 1 GB mobil).

import { merk } from './speicher.js';

export const SEITE = 1000;          // Supabase liefert höchstens 1000 Zeilen je Antwort
const ZEITLIMIT_MS = 20000;
const HEADER_BYTES = 700;           // geschätzte Kopfzeilen je Anfrage (HTTP/2, komprimiert)

// ---------- Einrichtung ----------
export function konfig() {
  const k = merk.lies('verbindung', null);
  return k && k.url && k.key ? k : null;
}
export function konfigSpeichern(url, key) { merk.schreib('verbindung', { url, key }); }

// Nimmt, was man aus Supabase kopiert (Projekt-URL, Verbindungs-String oder nur
// die Projekt-Referenz) und macht daraus die Basis-URL. Wie export/bericht.html.
export function normalisiereUrl(eingabe) {
  const wert = (eingabe || '').trim();
  if (!wert) return '';
  let t = wert.match(/([a-z0-9]{10,})\.supabase\.co/i);
  if (t) return 'https://' + t[1].toLowerCase() + '.supabase.co';
  t = wert.match(/postgres\.([a-z0-9]{10,})@/i);
  if (t) return 'https://' + t[1].toLowerCase() + '.supabase.co';
  if (/^[a-z0-9]{10,}$/i.test(wert)) return 'https://' + wert.toLowerCase() + '.supabase.co';
  return wert.replace(/\/+$/, '');
}

export function keyIstGeheim(key) {
  if (/^sb_secret_/i.test(key)) return true;
  // alter JWT-Key: Rolle steht im Mittelteil
  try {
    const teil = key.split('.')[1];
    if (!teil) return false;
    const json = JSON.parse(atob(teil.replace(/-/g, '+').replace(/_/g, '/')));
    return json.role === 'service_role';
  } catch (e) { return false; }
}

// ---------- Fehler ----------
export class RestFehler extends Error {
  constructor(art, text, status) { super(text); this.art = art; this.status = status; }
}
// art: 'netz' (kein Netz / Zeitüberschreitung), 'zugang' (Key falsch), 'server'

// ---------- Bytezähler ----------
function monatKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

export function verbrauch() {
  const v = merk.lies('verbrauch', null);
  return v && v.monat === monatKey() ? v.bytes : 0;
}
export function zaehle(bytes) {
  if (!(bytes > 0)) return;
  const m = monatKey();
  const v = merk.lies('verbrauch', null);
  merk.schreib('verbrauch', { monat: m, bytes: (v && v.monat === m ? v.bytes : 0) + Math.round(bytes) });
}

// Übertragene Größe einer Antwort: echte transferSize, falls der Browser sie
// liefert (bei Supabase meist nicht, fremder Server). Sonst den Inhalt selbst
// gzip-komprimieren – Supabase überträgt gzip, das trifft es gut.
async function uebertragen(url, text) {
  try {
    const e = performance.getEntriesByName(url).pop();
    if (e && e.transferSize > 0) return e.transferSize;
  } catch (x) { /* egal */ }
  try {
    if (typeof CompressionStream === 'function') {
      const strom = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      return (await new Response(strom).arrayBuffer()).byteLength + HEADER_BYTES;
    }
  } catch (x) { /* egal */ }
  return text.length + HEADER_BYTES;
}

// ---------- Anfragen ----------
export async function anfrage(pfad, extra) {
  const k = konfig();
  if (!k) throw new RestFehler('zugang', 'Nicht eingerichtet');
  const url = k.url + '/rest/v1/' + pfad;
  const ab = new AbortController();
  const uhrwerk = setTimeout(() => ab.abort(), ZEITLIMIT_MS);
  let antwort, text;
  try {
    antwort = await fetch(url, {
      headers: Object.assign({ apikey: k.key, Authorization: 'Bearer ' + k.key }, extra || {}),
      signal: ab.signal, cache: 'no-store',
    });
    text = await antwort.text();
  } catch (e) {
    throw new RestFehler('netz', 'Keine Verbindung');
  } finally {
    clearTimeout(uhrwerk);
  }
  uebertragen(url, text).then(zaehle);
  if (antwort.status === 401 || antwort.status === 403) throw new RestFehler('zugang', 'Zugang abgelehnt (HTTP ' + antwort.status + ')', antwort.status);
  if (!antwort.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch (e) { /* Text */ }
    throw new RestFehler('server', 'HTTP ' + antwort.status + ': ' + msg, antwort.status);
  }
  return text ? JSON.parse(text) : [];
}

// Alle Seiten einer Abfrage. Die Abfrage braucht eine eindeutige Sortierung.
// erwartet = geschätzte Zeilenzahl → so viele Seiten parallel (je 4), dann
// weiter, solange Seiten voll sind. fortschritt(n) meldet geladene Zeilen.
export async function alleSeiten(pfad, erwartet, fortschritt) {
  const geschaetzt = Math.max(1, Math.ceil((erwartet || 0) / SEITE));
  const seiten = [];
  let naechste = 0, fertig = false, geladen = 0;
  const hole = async (nr) => {
    const a = nr * SEITE;
    const zeilen = await anfrage(pfad, { 'Range-Unit': 'items', Range: a + '-' + (a + SEITE - 1) });
    seiten[nr] = zeilen;
    geladen += zeilen.length;
    if (fortschritt) fortschritt(geladen);
    if (zeilen.length < SEITE) fertig = true;
  };
  while (!fertig) {
    const bis = Math.max(naechste + 1, Math.min(naechste + 4, geschaetzt));
    const welle = [];
    for (let nr = naechste; nr < bis; nr++) welle.push(hole(nr));
    await Promise.all(welle);
    naechste = bis;
    if (seiten[naechste - 1] && seiten[naechste - 1].length < SEITE) fertig = true;
  }
  const alle = [];
  for (const s of seiten) if (s) for (const z of s) alle.push(z);
  return alle;
}

export const enc = encodeURIComponent;
export const macListe = (macs) => 'in.(' + macs.map((m) => '"' + m + '"').join(',') + ')';
