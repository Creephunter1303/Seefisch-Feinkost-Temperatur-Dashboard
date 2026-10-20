# Temperaturen · Seefisch-Feinkost

Tablet-App (PWA), die die Kühltemperaturen der RuuviTag-Sensoren anzeigt: Übersicht je
Standort, Verlauf je Sensor, Einstellungen pro Gerät. Die Daten kommen **nur lesend** aus
Supabase (dieselbe Datenbank, in die der Raspberry Pi schreibt). Es gibt keinen eigenen Server.

- **App:** https://creephunter1303.github.io/Seefisch-Feinkost-Temperatur-Dashboard/
- **Vorlage:** `vorlage/` (Prototyp v0.3, verbindlich), Abweichungen: `vergleich/ABWEICHUNGEN.md`
- **Technik und Regeln für Änderungen:** `CLAUDE.md`

---

## Einmalig: Veröffentlichung einschalten (GitHub)

1. Repository auf GitHub öffnen → **Settings → Pages**.
2. Bei **Source** „**GitHub Actions**“ wählen.
3. Fertig. Jede Änderung im Ordner `app/` auf `main` wird automatisch veröffentlicht
   (Reiter **Actions** zeigt den Lauf, dauert etwa 1 Minute).

## Tablet einrichten

### 1. Freigaben in NextDNS / AppLock

Damit das Tablet die App und die Daten erreicht, müssen diese Adressen erlaubt sein:

| Adresse | Wofür |
|---|---|
| `creephunter1303.github.io` | die App selbst |
| `iqxexsdxsiyxvlxuolfc.supabase.co` (oder `*.supabase.co`) | die Messwerte |
| `cdn.jsdelivr.net` | **nur** für den Admin-Bereich (Anmeldung). Auf reinen Anzeige-Tablets nicht nötig. |

In AppLock muss außerdem **Chrome** erlaubt sein (bzw. die installierte App „Temperaturen“).

### 2. App öffnen und verbinden

**Am einfachsten mit dem Einrichtungslink:**
1. Auf einem Gerät, auf dem die App schon läuft: **Einstellungen → Info → „Einrichtungslink kopieren“**.
2. Den Link auf das Tablet schicken und dort **in Chrome** öffnen. Fertig, die Werte erscheinen.
   (Der Link enthält den Lese-Schlüssel – nur an eigene Geräte weitergeben.)

**Oder von Hand:**
1. Auf dem Tablet in Chrome die App-Adresse öffnen (siehe oben).
2. Es erscheint „Einrichtung“. Eintragen:
   - **Projekt-URL:** `https://iqxexsdxsiyxvlxuolfc.supabase.co` (es reicht auch `iqxexsdxsiyxvlxuolfc`)
   - **Schlüssel:** in Supabase unter **Project Settings → API Keys** den **Publishable key**
     (`sb_publishable_…`) kopieren – oder unter „Legacy API Keys“ den **anon**-Key.
     **Nie** den „secret“- oder „service_role“-Schlüssel nehmen (die App lehnt ihn ab).
3. **Verbinden** tippen. Die App prüft die Verbindung und zeigt dann die Übersicht.

### 3. Auf den Startbildschirm legen

Chrome-Menü (⋮) → **„Zum Startbildschirm hinzufügen“** bzw. **„App installieren“**. Danach
startet die App ohne Adressleiste und funktioniert auch ohne Netz (zeigt dann den letzten Stand).

### 4. Einstellungen auf dem Tablet

**Einstellungen** (Zahnrad oben rechts):
- **Startansicht:** welcher Standort beim Öffnen gezeigt wird (z. B. der eigene Wagen).
- **Tablet gehört zu:** der eigene Wagen. Wird erst mit „Am Wagen auslesen“ (Phase 2) wirksam.

Beides gilt nur für dieses Gerät.

## Admin-Bereich (Sensoren verwalten)

**Einstellungen → Admin-Bereich → Öffnen.** Nach der Anmeldung (E-Mail + Passwort, Supabase-Konto)
lassen sich Namen, Standort, Grenztemperatur, „Offline nach“/„Meldet nicht nach“, Reihenfolge und
Notiz ändern, neue Sensoren anlegen (mit MAC-Adresse) und alte ausmustern. Unten steht das
Änderungsprotokoll. Gelöscht wird nie.

- Das Anmeldekonto legt das Pi-Projekt an (PLAN-STAMMDATEN.md, Phase 4).
- Die Anzeige übernimmt Änderungen sofort. Der Pi übernimmt sie nach ≤ 10 Min, sobald dort die
  Übernahme aus Supabase eingeschaltet ist (Phase 3).
- „Meldet nicht nach“ ab 240 Minuten bei allen Sensoren eines Standorts → der Standort gilt als
  Wagen (Wagen-Symbol, Zusatz „unterwegs“).

## Datenvolumen

Das Tablet hat 1 GB mobil im Monat. Die App lädt sparsam:
- Start: Sensorliste + Werte seit Mitternacht bzw. der letzten 6 Std (komprimiert ca. 10–20 KB).
- Danach alle 5 Minuten nur die neuen/nachgetragenen Werte (ca. 1 KB je Abruf), nur solange die
  App sichtbar ist.
- Verlauf eines Sensors nur beim Öffnen; 7 Tage ≈ 15 KB, 3 Monate ≈ 120 KB.
- Die App selbst (≈ 350 KB) wird einmal geladen und bleibt im Zwischenspeicher.

Erwartet: **ca. 10–30 MB im Monat**. Der Zähler steht unter **Einstellungen → Info →
„Daten diesen Monat“** (geschätzt, eher zu hoch als zu niedrig).

## Neue Version veröffentlichen

1. Änderungen in `app/` machen.
2. **Versionsnummer erhöhen** an zwei Stellen: `app/sw.js` (`VERSION`) und `app/js/version.js`
   (`APP_VERSION`). Sonst behalten die Tablets die alte Version.
3. Committen und auf `main` pushen. Die Tablets laden die neue Version beim nächsten Öffnen.

## Entwickeln und testen (am Mac)

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory app
```
Dann `http://127.0.0.1:8765/` öffnen. Lokal ist der Service Worker aus (sonst sieht man alte
Dateien); mit `?sw=1` in der Adresse wird er eingeschaltet.

**Tests** der Statusregel und der Zeitrechnung (Europe/Berlin, Sommer-/Winterzeit):
```bash
node tests/status.test.mjs
```
Ohne Node: den Projektordner ausliefern (`python3 -m http.server 8766`) und
`http://127.0.0.1:8766/tests/index.html` öffnen.

**Screenshots** mit echten Daten (braucht `.lokal/einrichtung.txt`, siehe CLAUDE.md):
```bash
python3 werkzeuge/screenshots.py
```
