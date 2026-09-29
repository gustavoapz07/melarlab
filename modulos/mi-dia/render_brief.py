#!/usr/bin/env python3
"""Brief mañanero · renderer v2 (blanco y negro, grotesca, amanecer con datos).
Uso: python3 render_brief.py datos.json salida.html
Solo librería estándar. Las fuentes se bajan de npm (@fontsource) y se incrustan en base64;
si no hay red, cae a fuentes del sistema sin romper la página."""
import base64, datetime as dt, html, json, math, os, shutil, subprocess, sys, tarfile, tempfile

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
E = lambda s: html.escape(str(s or ""), quote=True)

# Ubicación de ejemplo si el JSON no trae "ubicacion" (la real va en los datos, que no se suben al repositorio).
UBICACION_EJEMPLO = {"nombre": "Tegucigalpa", "lat": 14.11, "lon": -87.20, "tz": -6}

# ---------- fuentes ----------
FONTS = [("Archivo", "archivo", 400), ("Archivo", "archivo", 600), ("Archivo", "archivo", 700),
         ("Plex Mono", "ibm-plex-mono", 400)]

def font_css():
    cache = os.path.expanduser("~/.cache/brief-fonts"); os.makedirs(cache, exist_ok=True)
    css = []
    # En Windows el ejecutable es npm.cmd y subprocess no lo encuentra con "npm" a secas.
    # Si npm no existe, se deja "npm" para que falle igual que antes y salga el aviso.
    npm = shutil.which("npm") or "npm"
    for fam, pkg, w in FONTS:
        name = f"{pkg}-latin-{w}-normal.woff2"
        fn = os.path.join(cache, name)
        if not os.path.exists(fn):
            try:
                tmp = tempfile.mkdtemp()
                r = subprocess.run([npm, "pack", f"@fontsource/{pkg}", "--silent"], cwd=tmp,
                                   capture_output=True, text=True, timeout=120)
                tgz = r.stdout.strip().splitlines()[-1]
                with tarfile.open(os.path.join(tmp, tgz)) as t:
                    for m in t.getmembers():
                        base = os.path.basename(m.name)
                        if base.startswith(f"{pkg}-latin-") and base.endswith("-normal.woff2") and "ext" not in base:
                            with open(os.path.join(cache, base), "wb") as f:
                                f.write(t.extractfile(m).read())
            except Exception as ex:
                print("aviso: sin fuente", name, ex, file=sys.stderr)
        if os.path.exists(fn):
            b = base64.b64encode(open(fn, "rb").read()).decode()
            css.append(f'@font-face{{font-family:"{fam}";font-style:normal;font-weight:{w};font-display:block;'
                       f'src:url(data:font/woff2;base64,{b}) format("woff2")}}')
    return "".join(css)

# ---------- astronomía ----------
def sun_times(d, lat, lon, tz):
    """Calculadora solar NOAA. Devuelve (salida, mediodía, puesta) en minutos locales."""
    y, m = d.year, d.month
    if m <= 2: y -= 1; m += 12
    A = y // 100; B = 2 - A + A // 4
    J = int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d.day + B - 1524.5 + 0.5 - tz / 24
    T = (J - 2451545) / 36525
    L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
    M = math.radians(357.52911 + T * (35999.05029 - 0.0001537 * T))
    e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
    C = math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + math.sin(2 * M) * (0.019993 - 0.000101 * T) + math.sin(3 * M) * 0.000289
    om = math.radians(125.04 - 1934.136 * T)
    lam = math.radians(L0 + C - 0.00569 - 0.00478 * math.sin(om))
    eps = math.radians(23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * math.cos(om))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    yy = math.tan(eps / 2) ** 2; L = math.radians(L0)
    eqt = 4 * math.degrees(yy * math.sin(2 * L) - 2 * e * math.sin(M) + 4 * e * yy * math.sin(M) * math.cos(2 * L)
                           - 0.5 * yy * yy * math.sin(4 * L) - 1.25 * e * e * math.sin(2 * M))
    ha = math.degrees(math.acos(math.cos(math.radians(90.833)) / (math.cos(math.radians(lat)) * math.cos(dec))
                                - math.tan(math.radians(lat)) * math.tan(dec)))
    noon = 720 - 4 * lon - eqt + tz * 60
    return noon - 4 * ha, noon, noon + 4 * ha

def moon(d):
    """Edad lunar (días), fracción iluminada y nombre de la fase (aprox. mes sinódico medio)."""
    P = 29.530588853
    age = ((dt.datetime(d.year, d.month, d.day, 12) - dt.datetime(2000, 1, 6, 18, 14)).total_seconds() / 86400) % P
    k = (1 - math.cos(2 * math.pi * age / P)) / 2
    names = [(1.0, "Luna nueva"), (6.4, "Luna creciente"), (8.4, "Cuarto creciente"), (13.8, "Gibosa creciente"),
             (15.8, "Luna llena"), (21.1, "Gibosa menguante"), (23.1, "Cuarto menguante"), (28.5, "Luna menguante"), (P, "Luna nueva")]
    return age, k, next(n for lim, n in names if age < lim)

def hm(mins):
    mins = int(mins) % 1440; h, m = divmod(mins, 60)
    suf = "AM" if h < 12 else "PM"; h12 = h % 12 or 12
    return f"{h12}:{m:02d} {suf}" if m else f"{h12} {suf}"

def rango(a, b):
    a, b = to_min(a), to_min(b)
    if (a < 720) == (b % 1440 < 720): return f"{hm(a).rsplit(' ', 1)[0]} – {hm(b)}"
    return f"{hm(a)} – {hm(b)}"

def to_min(s):
    h, m = s.split(":"); return int(h) * 60 + int(m)

# ---------- ilustración ----------
def art(d, loc, events, variant):
    wide = variant == "wide"
    has_ev = any(e.get("inicio") for e in events)
    W, H = (840, 250 if has_ev else 218) if wide else (400, 228 if has_ev else 196)
    Y = 168 if wide else 150            # horizonte
    TOP = 36 if wide else 30            # cénit del arco
    R = 38 if wide else 28              # radio del sol
    PAD = 16
    sr, noon, ss = sun_times(d, loc["lat"], loc["lon"], loc["tz"])
    t0 = min(4 * 60, int(sr / 60 - 1.2) * 60)
    t1 = max(23 * 60, math.ceil(ss / 60 + 0.75) * 60)
    for ev in events:
        if ev.get("inicio") and ev.get("fin"):
            t0 = min(t0, to_min(ev["inicio"]) // 60 * 60); t1 = max(t1, math.ceil(to_min(ev["fin"]) / 60) * 60)
    t1 = min(t1, 24 * 60)
    X = lambda t: PAD + (t - t0) / (t1 - t0) * (W - 2 * PAD)
    uid = variant
    o = [f'<svg class="art art-{variant}" viewBox="0 0 {W} {H}" aria-hidden="true" focusable="false">',
         f'<defs><pattern id="hatch-{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
         f'<line x1="0" y1="0" x2="0" y2="6" class="s4" stroke-width="1"/></pattern>'
         f'<clipPath id="sky-{uid}"><rect x="0" y="0" width="{W}" height="{Y}"/></clipPath></defs>']
    # noche: antes de la salida y después de la puesta
    o.append(f'<rect x="{PAD}" y="8" width="{max(0, X(sr) - PAD):.1f}" height="{Y - 8}" fill="url(#hatch-{uid})"/>')
    o.append(f'<rect x="{X(ss):.1f}" y="8" width="{W - PAD - X(ss):.1f}" height="{Y - 8}" fill="url(#hatch-{uid})"/>')
    # arco del sol (punteado), sin tocar el disco
    xs, xn, xe = X(sr), X(noon), X(ss)
    pts = []
    n = 90
    for i in range(n + 1):
        t = sr + (ss - sr) * i / n
        x = X(t); y = Y - (Y - TOP) * math.sin(math.pi * (t - sr) / (ss - sr))
        if math.hypot(x - xs, y - Y) > R + (26 if wide else 20) and math.hypot(x - xe, y - Y) > 16: pts.append(f"{x:.1f},{y:.1f}")
    o.append(f'<polyline points="{" ".join(pts)}" fill="none" class="s3" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 7"/>')
    # mediodía solar: marca discreta en el cénit
    o.append(f'<line x1="{xn:.1f}" y1="{TOP - 9}" x2="{xn:.1f}" y2="{TOP - 3}" class="s3" stroke-width="1.5"/>')
    # sol naciente: disco rayado en horizontal, más grueso cerca del horizonte
    o.append(f'<g clip-path="url(#sky-{uid})"><circle cx="{xs:.1f}" cy="{Y}" r="{R + 5}" class="fbg"/>')
    step = 4 if wide else 3.5
    yy = Y - R + 2
    while yy < Y - 1:
        half = math.sqrt(max(0, R * R - (Y - yy) ** 2))
        w = 1.0 + 1.6 * (1 - (Y - yy) / R)
        o.append(f'<line x1="{xs - half:.1f}" y1="{yy:.1f}" x2="{xs + half:.1f}" y2="{yy:.1f}" class="s1" stroke-width="{w:.2f}"/>')
        yy += step
    o.append(f'<circle cx="{xs:.1f}" cy="{Y}" r="{R}" fill="none" class="s1" stroke-width="1.5"/></g>')
    g1, g2 = R + (7 if wide else 5), R + (17 if wide else 12)
    for i in range(1, 8):
        a = math.pi * i / 8
        o.append(f'<line x1="{xs + g1 * math.cos(a):.1f}" y1="{Y - g1 * math.sin(a):.1f}" x2="{xs + g2 * math.cos(a):.1f}" '
                 f'y2="{Y - g2 * math.sin(a):.1f}" class="s1" stroke-width="1.5" stroke-linecap="round"/>')
    # sol poniente: medio círculo hueco
    o.append(f'<path d="M{xe - 9:.1f} {Y} A9 9 0 0 1 {xe + 9:.1f} {Y}" fill="none" class="s3" stroke-width="1.5"/>')
    # luna con su fase real, en el centro de la noche
    age, k, _ = moon(d)
    mx = (X(ss) + W - PAD) / 2; my = TOP + (26 if wide else 18); mr = 11 if wide else 8
    if (W - PAD - X(ss)) > mr * 4:
        o.append(f'<circle cx="{mx:.1f}" cy="{my}" r="{mr + 4}" class="fbg"/>')
        o.append(f'<circle cx="{mx:.1f}" cy="{my}" r="{mr}" class="f1"/>')
        if k > 0.97:
            o.append(f'<circle cx="{mx:.1f}" cy="{my}" r="{mr}" class="fbg"/>')
        elif k > 0.03:
            waxing = age < 29.530588853 / 2; gib = k > 0.5; rx = mr * abs(1 - 2 * k)
            s1 = 1 if waxing else 0
            s2 = (1 if gib else 0) if waxing else (0 if gib else 1)
            o.append(f'<path d="M{mx:.1f} {my - mr} A{mr} {mr} 0 0 {s1} {mx:.1f} {my + mr} A{rx:.2f} {mr} 0 0 {s2} {mx:.1f} {my - mr}Z" class="fbg"/>')
        o.append(f'<circle cx="{mx:.1f}" cy="{my}" r="{mr}" fill="none" class="s1" stroke-width="1.2"/>')
    # horizonte
    o.append(f'<line x1="{PAD}" y1="{Y}" x2="{W - PAD}" y2="{Y}" class="s1" stroke-width="1.5"/>')
    # eventos: barras bajo el horizonte, dos carriles si se cruzan
    rows = []
    for ev in sorted([e for e in events if e.get("inicio") and e.get("fin")], key=lambda e: to_min(e["inicio"])):
        a, b = to_min(ev["inicio"]), to_min(ev["fin"])
        lane = next((i for i, end in enumerate(rows) if end <= a), None)
        if lane is None: rows.append(b); lane = len(rows) - 1
        else: rows[lane] = b
        lane = min(lane, 1)
        y = Y + 7 + lane * 15
        cls = 'class="fbg s1" stroke-width="1.2"' if ev.get("tentativo") else 'class="f1"'
        o.append(f'<rect x="{X(a) + 0.5:.1f}" y="{y}" width="{max(3, X(b) - X(a) - 1):.1f}" height="10" {cls}/>')
    # escala de horas
    ty = Y + (44 if any(e.get("inicio") for e in events) else 12)
    for h in range(t0 // 60, t1 // 60 + 1):
        x = X(h * 60)
        o.append(f'<line x1="{x:.1f}" y1="{ty}" x2="{x:.1f}" y2="{ty + (6 if h % 3 == 0 else 3)}" class="s3" stroke-width="1"/>')
        step_h = 3 if wide else 6
        if h % step_h == 0 and 0 < h < 24 and PAD + 12 < x < W - PAD - 12:
            o.append(f'<text x="{x:.1f}" y="{ty + 22}" text-anchor="middle" class="lbl">{hm(h * 60)}</text>')
    o.append("</svg>")
    return "".join(o)

# ---------- bloques ----------
ARROW = '<svg class="ext" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.5h5.5V7M8.5 1.5 1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'

def title(it):
    t = E(it.get("titulo"))
    u = it.get("url") or ""
    if u.startswith("https://"):
        return f'<a class="t" href="{E(u)}" target="_blank" rel="noopener">{t}{ARROW}</a>'
    return f'<span class="t">{t}</span>'

def meta(it):
    bits = [E(x) for x in (it.get("fuente"), it.get("cuando")) if x]
    return f'<p class="meta">{" · ".join(bits)}</p>' if bits else ""

def items(lst, extra=True):
    out = ['<ol class="items">']
    for i, it in enumerate(lst, 1):
        body = f'<p class="x">{E(it.get("texto"))}</p>' if it.get("texto") else ""
        if extra and it.get("para_ti"):
            body += f'<p class="note"><span class="k">Para ti</span> {E(it["para_ti"])}</p>'
        if extra and it.get("letra_pequena"):
            body += f'<p class="note"><span class="k">Letra pequeña</span> {E(it["letra_pequena"])}</p>'
        out.append(f'<li><span class="n">{i:02d}</span><div>{title(it)}{body}{meta(it)}</div></li>')
    out.append("</ol>")
    return "".join(out)

def agenda(ev_hoy, ev_man, d):
    def rows(evs):
        r = ['<ul class="agenda">']
        for ev in evs:
            when = "Todo el día" if not ev.get("inicio") else rango(ev["inicio"], ev["fin"]) if ev.get("fin") else hm(to_min(ev["inicio"]))
            tag = ' <span class="tent">por confirmar</span>' if ev.get("tentativo") else ""
            place = f'<span class="where">{E(ev.get("lugar"))}</span>' if ev.get("lugar") else ""
            r.append(f'<li><span class="when">{E(when)}</span><span class="what">{title(ev)}{tag}{place}</span></li>')
        r.append("</ul>")
        return "".join(r)
    man = d + dt.timedelta(days=1)
    if not ev_hoy and not ev_man:
        return '<p class="quiet">Sin eventos hoy ni mañana en el calendario.</p>'
    out = [rows(ev_hoy) if ev_hoy else '<p class="quiet">Hoy no hay eventos en el calendario.</p>']
    out.append(f'<h3 class="sub">Mañana, {DIAS[man.weekday()]} {man.day}</h3>')
    out.append(rows(ev_man) if ev_man else '<p class="quiet">Sin eventos.</p>')
    return "".join(out)

def entregas(lst):
    r = ['<ul class="agenda">']
    for it in lst:
        f = dt.date.fromisoformat(it["fecha"])
        r.append(f'<li><span class="when">{DIAS[f.weekday()][:3].capitalize()} {f.day} {MESES[f.month - 1][:3]}</span>'
                 f'<span class="what">{title(it)}{"<span class=where>" + E(it.get("curso")) + "</span>" if it.get("curso") else ""}</span></li>')
    r.append("</ul>")
    return "".join(r)

def idea(it):
    rows = [("Formato", it.get("formato")), ("Red", it.get("red")), ("Gancho", it.get("gancho")),
            ("Desarrollo", it.get("desarrollo")), ("Cierre", it.get("cierre"))]
    dl = "".join(f'<dt>{k}</dt><dd>{E(v)}</dd>' for k, v in rows if v)
    return f'<div class="idea"><p class="idea-t">{E(it.get("titulo"))}</p><dl>{dl}</dl></div>'

# ---------- página ----------
CSS = """
:root{--bg:#fff;--ink:#0a0a0a;--ink2:#3d3d3d;--ink3:#6e6e6e;--ink4:#d0d0d0;--rule:#e6e6e6;--inv-bg:#0a0a0a;--inv-fg:#fff;--inv-2:#c9c9c9;
--sans:"Archivo",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--mono:"Plex Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0b;--ink:#f4f4f4;--ink2:#c8c8c8;--ink3:#8f8f8f;--ink4:#3a3a3a;--rule:#262626;--inv-bg:#1a1a1a;--inv-fg:#f4f4f4;--inv-2:#bdbdbd}}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg);scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--ink);font:400 16px/1.55 var(--sans);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:inherit}
:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.wrap{max-width:880px;margin:0 auto;padding:20px 24px 56px}
.mast{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding-bottom:12px;border-bottom:1px solid var(--ink)}
.brand{font-weight:700;font-size:15px;letter-spacing:-.01em;white-space:nowrap}
.d-short{display:none}
.mono,.meta,.lbl,.idx,.sec-h,.when,.k,dt,.foot,.cap dt{font-family:var(--mono)}
.date{font:400 12px/1.2 var(--mono);color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;text-align:right}
h1{font-weight:700;font-size:clamp(34px,6.2vw,58px);line-height:1.02;letter-spacing:-.035em;margin:40px 0 8px;max-width:19ch;text-wrap:balance}
figure{margin:24px 0 0}
.art{display:block;width:100%;height:auto}
.art-narrow{display:none}
.s1{stroke:var(--ink)}.s3{stroke:var(--ink3)}.s4{stroke:var(--ink4)}.f1{fill:var(--ink)}.fbg{fill:var(--bg)}
.lbl{font-size:11px;fill:var(--ink3);letter-spacing:.02em}
.cap{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--rule);margin-top:4px}
.cap div{padding:10px 12px 0 0}
.cap dt{font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em}
.cap dd{font-size:15px;font-weight:600;margin-top:2px}
.idx{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);margin:36px 0 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);list-style:none}
.idx a{display:block;text-decoration:none;padding:12px 12px 12px 0;min-height:44px}
.idx b{display:block;font:700 28px/1 var(--sans);letter-spacing:-.02em}
.idx span{display:block;font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.06em;margin-top:6px;overflow-wrap:anywhere}
.idx a:hover span{color:var(--ink)}
section{margin-top:48px;scroll-margin-top:16px}
.sec-h{display:flex;align-items:baseline;gap:12px;font-size:12px;font-weight:400;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid var(--ink);padding-top:10px;margin-bottom:6px}
.sec-h .c{margin-left:auto;color:var(--ink3)}
.sec-h .i{color:var(--ink3)}
.items{list-style:none}
.items li{display:grid;grid-template-columns:36px 1fr;gap:0 8px;padding:18px 0;border-bottom:1px solid var(--rule)}
.items li:last-child{border-bottom:0}
#resuelto .t{font-size:17px}#resuelto .x{font-size:15px}
.n{font:400 12px/1.9 var(--mono);color:var(--ink3)}
.t{display:inline;font-weight:600;font-size:19px;line-height:1.3;letter-spacing:-.012em;text-decoration:none;color:var(--ink)}
a.t:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.ext{display:inline-block;width:.55em;height:.55em;margin-left:.3em;vertical-align:.18em;opacity:.55}
.x{color:var(--ink2);margin-top:6px;max-width:64ch}
.note{color:var(--ink2);margin-top:8px;max-width:64ch;font-size:15px}
.k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-right:6px}
.meta{font-size:12px;color:var(--ink3);margin-top:10px;letter-spacing:.02em}
.attn{background:var(--inv-bg);color:var(--inv-fg);padding:4px 24px;margin:40px -24px 0}
.attn .sec-h{border-top-color:var(--inv-fg);margin-top:20px}
.attn .sec-h .c,.attn .sec-h .i,.attn .n,.attn .meta,.attn .k{color:var(--inv-2)}
.attn .t{color:var(--inv-fg);font-size:22px}
.attn .x,.attn .note{color:var(--inv-fg);opacity:.86}
.attn .items li{border-color:rgba(255,255,255,.18)}
.attn .items{padding-bottom:10px}
.attn :focus-visible{outline-color:var(--inv-fg)}
.agenda{list-style:none}
.agenda li{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--rule)}
.agenda li:last-child{border-bottom:0}
.when{font-size:13px;color:var(--ink2);padding-top:3px}
.agenda .t{font-size:17px}
.where{display:block;color:var(--ink3);font-size:14px;margin-top:2px}
.tent{font:400 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-left:8px}
.sub{font:400 12px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--ink3);margin:22px 0 2px}
.quiet{color:var(--ink2);padding:16px 0 4px;font-size:17px}
.idea{padding:18px 0 0}
.idea-t{font-weight:700;font-size:26px;line-height:1.15;letter-spacing:-.025em;max-width:32ch}
.idea dl{display:grid;grid-template-columns:120px 1fr;margin-top:16px;border-top:1px solid var(--rule)}
.idea dt,.idea dd{padding:10px 0;border-bottom:1px solid var(--rule)}
.idea dt{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);padding-top:13px}
.idea dd{color:var(--ink2)}
.foot{margin-top:56px;padding-top:12px;border-top:1px solid var(--ink);font-size:11px;color:var(--ink3);letter-spacing:.04em;text-transform:uppercase;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
@media (max-width:640px){
 .wrap{padding:16px 16px 40px}
 h1{margin-top:28px}
 .art-wide{display:none}.art-narrow{display:block}
 .cap{grid-template-columns:1fr 1fr}
 .idx b{font-size:24px}
 .idx span{font-size:10px;letter-spacing:.03em}
 .idx a{padding-right:6px}
 .d-long{display:none}.d-short{display:inline}
 .attn{padding:4px 16px;margin:32px -16px 0}
 section{margin-top:40px}
 #resuelto .t{font-size:16px}
 .attn .t{font-size:20px}
 .items li{grid-template-columns:28px 1fr}
 .t{font-size:18px}
 .agenda li{grid-template-columns:92px 1fr;gap:10px}
 .when{font-size:12px}
 .agenda .t{font-size:16px}
 .idea dl{grid-template-columns:1fr}.idea dt{border-bottom:0;padding-bottom:0}.idea dd{padding-top:2px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
"""

def render(data):
    d = dt.date.fromisoformat(data["fecha"])
    loc = data.get("ubicacion") or UBICACION_EJEMPLO
    sr, noon, ss = sun_times(d, loc["lat"], loc["lon"], loc["tz"])
    _, _, luna = moon(d)
    luz = int(ss) - int(sr)
    ev_hoy, ev_man = data.get("eventos_hoy") or [], data.get("eventos_manana") or []
    secs = []  # (id, etiqueta índice, título sección, cuenta, html, clase)
    at = data.get("atencion") or []
    secs.append(("atencion", "Atención", "Necesita tu atención", len(at),
                 items(at) if at else '<p class="quiet">Nada urgente esta mañana.</p>', "attn" if at else ""))
    secs.append(("agenda", "Agenda", "Agenda", len(ev_hoy), agenda(ev_hoy, ev_man, d), ""))
    if data.get("entregas"):
        secs.append(("entregas", "Entregas", "Entregas de la U · próximos 7 días", len(data["entregas"]), entregas(data["entregas"]), ""))
    if data.get("resuelto"):
        secs.append(("resuelto", "Resuelto", "Resuelto", len(data["resuelto"]), items(data["resuelto"], False), ""))
    if data.get("ia"):
        secs.append(("ia", "IA", "Novedades de IA", len(data["ia"]), items(data["ia"]), ""))
    if data.get("idea"):
        secs.append(("idea", "Idea", "Idea de contenido", 1, idea(data["idea"]), ""))
    for extra in data.get("secciones_extra") or []:
        sid = "x" + str(len(secs))
        secs.append((sid, extra["titulo"][:10], extra["titulo"], len(extra.get("items") or []), items(extra.get("items") or []), ""))

    idx = "".join(f'<li><a href="#{s[0]}"><b>{s[3]}</b><span>{E(s[1])}</span></a></li>' for s in secs)
    body = "".join(
        f'<section id="{s[0]}" class="{s[5]}" aria-labelledby="h-{s[0]}"><h2 class="sec-h" id="h-{s[0]}">'
        f'<span class="i">{i:02d}</span><span>{E(s[2])}</span><span class="c">{s[3]}</span></h2>{s[4]}</section>'
        for i, s in enumerate(secs, 1))
    fecha_larga = f"{DIAS[d.weekday()].capitalize()} {d.day} de {MESES[d.month - 1]} de {d.year}"
    semana = d.isocalendar()[1]
    fecha_corta = f"{DIAS[d.weekday()][:3].capitalize()} {d.day} {MESES[d.month - 1][:3]}"
    alt = (f"Amanecer en {loc['nombre']}: el sol sale a las {hm(sr)} y se pone a las {hm(ss)}. "
           + (f"{len(ev_hoy)} eventos hoy en la línea del día." if ev_hoy else "Sin eventos hoy en la línea del día."))
    fuentes = " · ".join(E(f) for f in data.get("fuentes") or [])
    gen = E(data.get("generado") or "")
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Brief · {E(fecha_larga)}</title>
<style>{font_css()}{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="mast"><span class="brand">Brief mañanero</span><span class="date"><span class="d-long">{E(fecha_larga)} · </span><span class="d-short">{E(fecha_corta)} · </span>Sem {semana}</span></header>
<main>
<h1>{E(data.get("titular"))}</h1>
<figure>
<div role="img" aria-label="{E(alt)}">
{art(d, loc, ev_hoy, "wide")}
{art(d, loc, ev_hoy, "narrow")}
</div>
<dl class="cap">
<div><dt>Sale el sol</dt><dd>{hm(sr)}</dd></div>
<div><dt>Se pone</dt><dd>{hm(ss)}</dd></div>
<div><dt>Luz</dt><dd>{luz // 60} h {luz % 60} min</dd></div>
<div><dt>Luna</dt><dd>{luna}</dd></div>
</dl>
</figure>
<nav aria-label="Secciones"><ol class="idx">{idx}</ol></nav>
{body}
</main>
<footer class="foot"><span>{E(loc["nombre"])} · {fuentes}</span><span>{("Generado " + gen) if gen else ""}</span></footer>
</div>
</body>
</html>"""

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src, encoding="utf-8"))
    open(dst, "w", encoding="utf-8").write(render(data))
    print("ok", dst, os.path.getsize(dst), "bytes")
