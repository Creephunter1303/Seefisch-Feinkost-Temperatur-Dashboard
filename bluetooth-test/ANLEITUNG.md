# Bluetooth-Test: Kann das Tablet die RuuviTags selbst auslesen?

`index.html` ist eine einzelne Seite ohne Server. Sie liest einen RuuviTag per Bluetooth aus und misst, wie lange das dauert. Sie **liest nur**: Es wird nichts gespeichert, nichts an Supabase geschickt, und am Sensor wird nichts verändert.

## 1. Seite ins Netz stellen (einmalig, ca. 5 Min)

Web Bluetooth funktioniert nur über `https://`, nicht als Datei direkt auf dem Tablet. Am einfachsten geht es mit GitHub Pages, wie bei der Bestell-App:

1. Auf github.com → **New repository** → Name z. B. `ruuvi-test` → **Public** → Create.
2. Im neuen Repo auf **„uploading an existing file“** klicken, `index.html` hochladen und **Commit** drücken.
3. **Settings → Pages** → Source „Deploy from a branch“ → Branch `main`, Ordner `/ (root)` → Save.
4. Nach ca. 1 Minute läuft die Seite unter `https://<dein-github-name>.github.io/ruuvi-test/`.

Die Seite enthält keine Geheimnisse (keine Schlüssel, keine Adressen). Öffentlich ist deshalb unkritisch.

## 2. Auf dem Tablet testen

1. Bluetooth **und** Standort einschalten.
2. Die Adresse in **Chrome** öffnen (nicht im Samsung-Browser). Bei AppLock/NextDNS ggf. `github.io` freigeben.
3. Oben müssen „HTTPS: ja“ und „Web Bluetooth: ja“ grün sein.
4. **Sensor suchen und auslesen** → im Fenster einen „Ruuvi …“ wählen → „Geräte in der Nähe“ erlauben.
5. Warten, bis die Karte grün ist. Danach:
   - mit **Nochmal auslesen** prüfen, ob es ohne Auswahlfenster geht
   - einen zweiten Sensor auslesen
   - **Seite neu laden**: Erscheint „Gemerkte Sensoren“?
6. **Protokoll kopieren** und an Claude schicken.

## Was wir damit herausfinden

| Frage | Woran man es sieht |
|---|---|
| Klappt die Verbindung überhaupt? | Karte wird grün, „Verbinden“ in Sekunden |
| Wie schnell? | Verbinden + Laden; Ziel unter 30 s pro Sensor |
| Kommen alle Werte? | „Abdeckung“, z. B. 72 / 72 bei 6 Std |
| Muss man jedes Mal im Fenster wählen? | „Gemerkte Sensoren“ nach dem Neuladen |

## Hinweise

- **Test in der Firma:** Ist der Pi gerade mit demselben Sensor verbunden, schlägt das Auslesen fehl. Einfach nach einer Minute wiederholen. Dem Pi schadet das nicht, er holt fehlende Werte selbst nach.
- **Test am Markt:** Dort gibt es keine Konkurrenz durch den Pi. Das ist der eigentliche Praxistest.
- **Weiterer Test:** Ein Tiefkühler-Sensor ist interessant, weil er negative Werte liefert. Die Seite liest sie vorzeichenrichtig.
