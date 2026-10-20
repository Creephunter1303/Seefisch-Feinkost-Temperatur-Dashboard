#!/usr/bin/env python3
"""Screenshots der App mit echten Daten in den Referenzgrößen (wie vorlage/screens/,
doppelte Pixeldichte). Steuert Google Chrome über das DevTools-Protokoll und wartet,
bis die Daten wirklich angezeigt werden (kein „Lädt …“ mehr).

Braucht: lokalen Server auf Port 8765 (Ordner app/) und .lokal/einrichtung.txt
(Einrichtungs-Token, nicht im Repo). Nur Python-Standardbibliothek.
Aufruf: python3 werkzeuge/screenshots.py [zielordner]
"""
import base64, json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, sys.argv[1] if len(sys.argv) > 1 else 'vergleich/echt')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
BASIS = 'http://127.0.0.1:8765/'
PORT = 9333
KH = 'E2:0B:37:BE:AD:CC'  # Kühlhaus

BILDER = [
    ('00-alles-hoch', 640, 1072, ''),
    ('00-smartphone', 390, 844, ''),
    ('00-smartphone-detail', 390, 844, '?seite=detail&sensor=' + KH),
    ('02-uebersicht-quer', 1072, 640, ''),
    ('05-detail-hoch', 640, 1072, '?seite=detail&sensor=' + KH),
    ('06-detail-quer', 1072, 640, '?seite=detail&sensor=' + KH),
    ('07-detail-7tage-hoch', 640, 1072, '?seite=detail&sensor=' + KH + '&zeitraum=7t'),
    ('08-zeitraum-blatt-hoch', 640, 1072, '?seite=detail&sensor=' + KH + '&blatt=zeitraum'),
    ('09-detail-3monate-hoch', 640, 1072, '?seite=detail&sensor=' + KH + '&zeitraum=3m'),
    ('10-detail-letzter-monat-quer', 1072, 640, '?seite=detail&sensor=' + KH + '&zeitraum=letzterMonat'),
    ('11-detail-eigen-hoch', 640, 1072, '?seite=detail&sensor=' + KH + '&von=2026-10-10&bis=2026-10-16'),
    ('12-detail-letztes-jahr-hoch', 640, 1072, '?seite=detail&sensor=' + KH + '&zeitraum=letztesJahr'),
    ('13-einstellungen-hoch', 640, 1072, '?seite=einstellungen'),
    ('15-standortwahl-hoch', 640, 1072, '?blatt=filter'),
    ('17-handy-gefiltert', 390, 844, '?filter=Halle'),
    ('18-desktop', 1280, 900, ''),
    ('19-handy-zeitraum', 390, 844, '?seite=detail&sensor=' + KH + '&blatt=zeitraum'),
    ('30-admin-anmelden-hoch', 640, 1072, '?seite=admin'),
]


class WS:
    """Minimaler WebSocket-Client (nur was DevTools braucht)."""
    def __init__(self, url):
        rest = url.split('://', 1)[1]
        hostport, pfad = rest.split('/', 1)
        host, port = hostport.split(':')
        self.s = socket.create_connection((host, int(port)))
        schl = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(('GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n' % (pfad, hostport, schl)).encode())
        antwort = b''
        while b'\r\n\r\n' not in antwort:
            antwort += self.s.recv(1)
        self.n = 0

    def _lies(self, n):
        b = b''
        while len(b) < n:
            t = self.s.recv(n - len(b))
            if not t:
                raise IOError('Verbindung zu')
            b += t
        return b

    def senden(self, methode, **params):
        self.n += 1
        daten = json.dumps({'id': self.n, 'method': methode, 'params': params}).encode()
        maske = os.urandom(4)
        kopf = bytearray([0x81])
        l = len(daten)
        if l < 126: kopf.append(0x80 | l)
        elif l < 65536: kopf += bytes([0x80 | 126]) + l.to_bytes(2, 'big')
        else: kopf += bytes([0x80 | 127]) + l.to_bytes(8, 'big')
        self.s.sendall(bytes(kopf) + maske + bytes(b ^ maske[i % 4] for i, b in enumerate(daten)))
        ziel = self.n
        while True:
            nachricht = self.empfangen()
            if nachricht.get('id') == ziel:
                if 'error' in nachricht:
                    raise RuntimeError(nachricht['error'])
                return nachricht.get('result', {})

    def empfangen(self):
        teile = b''
        while True:
            b1, b2 = self._lies(2)
            l = b2 & 0x7F
            if l == 126: l = int.from_bytes(self._lies(2), 'big')
            elif l == 127: l = int.from_bytes(self._lies(8), 'big')
            teile += self._lies(l)
            if b1 & 0x80:
                return json.loads(teile.decode())


def main():
    os.makedirs(ZIEL, exist_ok=True)
    token = open(os.path.join(WURZEL, '.lokal/einrichtung.txt')).read().strip()
    profil = tempfile.mkdtemp()
    chrome = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                               '--remote-debugging-port=%d' % PORT, '--user-data-dir=' + profil, 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                urllib.request.urlopen('http://127.0.0.1:%d/json/version' % PORT, timeout=1); break
            except Exception:
                time.sleep(0.2)
        seite = [t for t in json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % PORT)) if t['type'] == 'page'][0]
        ws = WS(seite['webSocketDebuggerUrl'])
        ws.senden('Page.enable'); ws.senden('Runtime.enable'); ws.senden('Network.enable')
        # einmal einrichten (Token in den localStorage dieses Profils)
        ws.senden('Page.navigate', url=BASIS + '#einrichtung=' + token)
        time.sleep(4)
        for name, w, h, query in BILDER:
            ws.senden('Emulation.setDeviceMetricsOverride', width=w, height=h, deviceScaleFactor=2, mobile=w < 700)
            ws.senden('Page.navigate', url=BASIS + query)
            fertig = False
            for _ in range(120):  # bis 30 s
                time.sleep(0.25)
                r = ws.senden('Runtime.evaluate', expression="document.readyState==='complete' && !!document.querySelector('.kopf') && !document.querySelector('.dreher')", returnByValue=True)
                if r.get('result', {}).get('value'):
                    fertig = True; break
            time.sleep(0.8)  # Diagramm/Schriften
            pruef = ws.senden('Runtime.evaluate', returnByValue=True, expression=(
                "(() => { const zuBreit = document.documentElement.scrollWidth > innerWidth;"
                " const klein = [...document.querySelectorAll('button, input, textarea')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height < 56 && !e.closest('.hinweisband'); })"
                ".map((e) => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height));"
                " const text = [...document.querySelectorAll('body *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.className || e.tagName);"
                " return { zuBreit, klein: [...new Set(klein)], text: [...new Set(text)] }; })()"))['result']['value']
            if pruef['zuBreit'] or pruef['klein'] or pruef['text']:
                print('    PRÜFEN', name, pruef)
            bild = ws.senden('Page.captureScreenshot', format='png')
            with open(os.path.join(ZIEL, name + '.png'), 'wb') as f:
                f.write(base64.b64decode(bild['data']))
            print(('  ' if fertig else '  (nicht fertig geladen) ') + os.path.relpath(os.path.join(ZIEL, name + '.png'), WURZEL))
        # Ohne Netz: Service Worker einschalten (?sw=1), dann Netz trennen und neu starten
        ws.senden('Emulation.setDeviceMetricsOverride', width=640, height=1072, deviceScaleFactor=2, mobile=True)
        ws.senden('Page.navigate', url=BASIS + '?sw=1'); time.sleep(6)
        ws.senden('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
        ws.senden('Page.navigate', url=BASIS + '?sw=1'); time.sleep(5)
        bild = ws.senden('Page.captureScreenshot', format='png')
        with open(os.path.join(ZIEL, '14-ohne-netz-hoch.png'), 'wb') as f:
            f.write(base64.b64decode(bild['data']))
        print('  ' + os.path.relpath(os.path.join(ZIEL, '14-ohne-netz-hoch.png'), WURZEL))
    finally:
        chrome.terminate()
        try: chrome.wait(5)
        except Exception: chrome.kill()
        shutil.rmtree(profil, ignore_errors=True)


if __name__ == '__main__':
    main()
