# Prompt für Claude Code: Temperatur-Dashboard (Phase 1)

**Vorbereitung durch Max:**
1. Neues GitHub-Repo `seefisch-temperaturen` anlegen, **public**, damit GitHub Pages kostenlos läuft. Lokal klonen nach `Claud Projekte/Temperatur Dashboard/`.
2. Den Ordner `ruuvi-haccp/tablet-dashboard/` (Vorlage + Bluetooth-Test) dorthin **verschieben**. Das Pi-Repo bleibt so unberührt.
3. Claude Code in `Claud Projekte/Temperatur Dashboard/` starten und den Block unten einfügen.

```
Baue die echte Tablet-App „Temperaturen“ für Seefisch-Feinkost (Phase 1: Anzeige).
Das Frontend ist fertig entworfen – deine Aufgabe ist, es als echte PWA umzusetzen
und an die vorhandene Supabase-Datenbank anzubinden. Es gibt KEINEN eigenen Server:
Supabase (PostgREST) ist das Backend.

LIES ZUERST (in dieser Reihenfolge):
1. vorlage/VORLAGE.md – alle Regeln, Entscheidungen, Datenabfragen (Abschnitt 7)
2. vorlage/index.html + vorlage/screens/*.png – verbindliche Vorlage (Prototyp
   mit Beispieldaten; Prototyp-Leiste oben, Szenarien und Datengenerator gehören
   NICHT in die App)
3. ../Seefisch Designsystem/DESIGNSYSTEM.md
4. Nur lesen, nichts ändern: ../Temperatur Überwachung/ruuvi-haccp/ –
   CLAUDE.md (Abschnitte „Grafana: …“, „Export-Tool“, „Primärschlüssel“,
   „Timestamps“), db/schema.sql, export/bericht.html (dort ist die Einrichtung
   URL + anon-Key und der REST-Zugriff schon gelöst – übernehmen).

HARTE GRENZEN
- Am Raspberry-Pi-Projekt (ruuvi-haccp), am Collector, an Grafana, an export/ und
  an webui/ NICHTS ändern. Keine Datei in diesem Ordner schreiben.
- Supabase NUR lesen, mit dem anon/publishable Key. Niemals postgres_url,
  service_role- oder sb_secret-Key in den Client oder ins Repo.
- SQL-Änderungen nicht selbst ausführen: als Datei db/migration_dashboard.sql
  schreiben, mir zeigen, ich führe sie im Supabase-SQL-Editor aus.

DATENBANK (Migration, nur additiv, berührt den Collector nicht)
- View letzte_werte und View tageswerte wie in VORLAGE.md Abschnitt 7
  (security_invoker = true, grant select to anon, tageswerte nach
  Europe/Berlin-Tag gruppiert).
- sensor_gruppen um zwei NULL-erlaubte Spalten ergänzen:
  art text ('fahrzeug' | 'fest') und mac text (für Phase 2, jetzt nur anlegen).
  Prüfe vorher in ruuvi-haccp/webui/server.py, dass alle Zugriffe auf
  sensor_gruppen mit expliziten Spaltenlisten arbeiten (dann bricht nichts).
- Zum Schluss einen Prüf-Block mit SELECTs, mit dem ich nach dem Ausführen
  kontrollieren kann, dass Views und anon-Lesezugriff funktionieren.

APP
- Alles aus der Vorlage, Stand v0.3, außer „Am Wagen auslesen“ (das ist Phase 2,
  siehe unten): Übersicht mit Standort-Gruppen, Statuskarten, Standortwahl,
  Detail mit Zeitraum-Kacheln + Zeitraum-Blatt (Vorlagen + eigener Zeitraum),
  Einstellungen, Sonderzustände (leer, lädt, ohne Netz, Fehler, Zeitraum ohne Daten).
- Statusregel genau wie VORLAGE.md Abschnitt 2, als eigenes Modul status.js
  (eine Konstante REGEL). Grenze, grau_nach_minuten, rot_nach_minuten je Sensor aus
  sensor_gruppen. Fehlt die Grenztemperatur: Karte zeigt Wert + „keine Grenze
  hinterlegt“ in Grau, nie still „OK“.
- Sensoren aus messwerte, die in sensor_gruppen fehlen → Gruppe „Ohne Zuordnung“.
- Zeiten: DB ist UTC (timestamptz), Anzeige immer Europe/Berlin.
- Referenzgrößen 640×1072 (hoch), 1072×640 (quer), Smartphone 390×844, PC ≥ 1200.
  Keine waagerechte Scrollleiste. Tippflächen ≥ 56 px, Text ≥ 16 px.

DATENVOLUMEN (Tablet hat 1 GB/Monat mobil – wichtig)
- Erstes Laden: sensor_gruppen + letzte_werte + letzte 6 Std (nur Spalten
  sensor, zeit, temperatur_c). Danach alle 5 Minuten NUR neuere Zeilen
  (zeit=gt.<letzter bekannter Zeitstempel>).
- Nur laden, solange die App sichtbar ist (visibilitychange); beim Zurückkehren
  einmal nachladen.
- Detail: bis 8 Tage Rohwerte des einen Sensors (paginiert, max. 1000/Antwort),
  darüber nur tageswerte + Zeilen über der Grenze (temperatur_c=gt.<grenze>).
- App-Dateien und Schriften per Service Worker cachen; die letzten Daten im
  Cache/IndexedDB für den Offline-Start.
- Zähle die übertragenen Bytes mit und zeige sie in Einstellungen → Info
  („Daten diesen Monat: x MB“), damit wir den Verbrauch im Test sehen.

TECHNIK
- PWA, HTML/CSS/JS mit ES-Modulen, kein Framework, kein Build-Schritt.
  seefisch.css + schriften/ unverändert einbinden, App-Regeln in temperatur.css.
- Service Worker mit Versionsnummer (auch in Einstellungen → Info sichtbar).
- Hosting GitHub Pages über .github/workflows/pages.yml – nimm
  ../Bestell Software 2.0/.github/workflows/pages.yml als Vorbild (nur lesen).
- Einrichtung pro Gerät wie export/bericht.html: Projekt-URL + anon-Key einmal
  eintragen, in localStorage. Optional per Einrichtungslink (#einrichtung=…).
- Einstellungen pro Gerät in localStorage: Startansicht, „Tablet gehört zu“
  (Wagen oder keiner – wird erst in Phase 2 wirksam, Auswahl schon anlegen).
- Tests (Node, ohne Framework reicht): status.js – genau 15 Min, Lücke > 10 Min,
  Grenze + 3 °C, negativer Grenzwert (−18 °C), Tageswechsel/Monatswechsel in
  Europe/Berlin, Sommer-/Winterzeit-Umstellung (25.10.2026!).

VORGEHEN
1. Erst lesen, dann mir einen kurzen Plan (Dateien, Module, Abfragen) zeigen und
   auf mein OK warten.
2. Migration schreiben → ich führe sie aus → du prüfst per REST mit dem anon-Key.
3. App bauen, mit echten Daten testen.
4. Screenshots hoch, quer, Smartphone mit echten Daten neben vorlage/screens/
   legen und Abweichungen zur Vorlage auflisten.
5. README.md (Einrichtung auf dem Tablet, NextDNS/AppLock-Freigaben:
   <projekt>.supabase.co und <name>.github.io) und CLAUDE.md für das neue Repo.

Wenn etwas in Vorlage oder VORLAGE.md nicht abgedeckt ist: frag nach, statt zu raten.
```

---

## Phase 2 (später, erst nach dem Bluetooth-Test): „Am Wagen auslesen“

Erst starten, wenn `bluetooth-test/` auf dem Tablet erfolgreich war. Das Protokoll des Tests mitgeben.

```
Phase 2: „Am Wagen auslesen“ wie in vorlage/VORLAGE.md (Abschnitt „Neu in v0.3“)
und vorlage/screens/20–26. Bluetooth-Code aus bluetooth-test/index.html übernehmen
(Protokoll ist dort getestet). Werte nur im Arbeitsspeicher, nie speichern oder
hochladen; Verwerfen/Neuladen löscht sie. Zuordnung Sensor ↔ Gerät über
sensor_gruppen.mac (Bluetooth-Name „Ruuvi XXXX“ = letzte 4 Zeichen der MAC).
Testprotokoll vom Tablet: <hier einfügen>
```
