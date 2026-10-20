// Leichter Blick auf die Admin-Anmeldung, ohne die Supabase-Bibliothek zu laden
// (die kommt erst beim Öffnen des Admin-Bereichs, damit die Anzeige-Tablets
// sie nie herunterladen müssen).
import { konfig } from '../rest.js';

export function sitzungsSchluessel() {
  const k = konfig();
  const ref = k && /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(k.url);
  return ref ? 'sb-' + ref[1] + '-auth-token' : null;
}

// E-Mail der gespeicherten Anmeldung oder null
export function adminAngemeldet() {
  try {
    const s = sitzungsSchluessel();
    const roh = s && localStorage.getItem(s);
    const j = roh && JSON.parse(roh);
    return (j && j.user && j.user.email) || null;
  } catch (e) { return null; }
}
