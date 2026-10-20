// Speicher pro Gerät.
// - localStorage: Einrichtung (Projekt-URL + anon-Key) und Einstellungen.
// - IndexedDB: der letzte geladene Datenstand, damit die App auch ohne Netz
//   sofort etwas zeigt (Offline-Start).

const PRAEFIX = 'sf-temp-';

export const merk = {
  lies(k, d) {
    try { const v = localStorage.getItem(PRAEFIX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  schreib(k, v) {
    try { localStorage.setItem(PRAEFIX + k, JSON.stringify(v)); } catch (e) { /* voll oder gesperrt – egal */ }
  },
  weg(k) { try { localStorage.removeItem(PRAEFIX + k); } catch (e) { /* egal */ } },
};

// ---------- IndexedDB: ein Schlüssel-Wert-Speicher ----------
const DB_NAME = 'sf-temperaturen', DB_STORE = 'daten';
let dbVersprechen = null;

function db() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((ok, fehler) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DB_STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehler(r.error);
    });
  }
  return dbVersprechen;
}

export async function ablegen(schluessel, wert) {
  try {
    const d = await db();
    await new Promise((ok, fehler) => {
      const tx = d.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(wert, schluessel);
      tx.oncomplete = ok; tx.onerror = () => fehler(tx.error);
    });
  } catch (e) { /* ohne IndexedDB gibt es eben keinen Offline-Start */ }
}

export async function holen(schluessel) {
  try {
    const d = await db();
    return await new Promise((ok, fehler) => {
      const r = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(schluessel);
      r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error);
    });
  } catch (e) { return undefined; }
}
