// Uso: node herramientas/descanso.js http://localhost:4173
// Prueba la pantalla Descanso de la app ya compilada (npm run build y npm run preview dentro de app/)
// con la tabla descanso de Supabase simulada en memoria dentro del navegador de prueba: anotar la noche,
// deshacer, cambiarla, horas que no sirven, noches anteriores, el aviso de noches cortas, el resumen de la
// semana y las barras, editar y borrar, errores, la línea de Mi Día, la barra de módulos que se desplaza,
// sin internet y cerrar sesión. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con noches y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/descanso.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- fechas y sesión de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const HOY = fechaLocal(new Date());
const AYER = fechaLocal(new Date(Date.now() - 86400000));
const ANTEAYER = fechaLocal(new Date(Date.now() - 2 * 86400000));
const DESDE = fechaLocal(new Date(Date.now() - 59 * 86400000));
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000006', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla descanso, simulada en memoria ----------
const servidor = { filas: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (metodo) => servidor.llamadas.filter((l) => l.metodo === metodo);
const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
/** Como la columna generada de la base: cruza la medianoche y redondea a 2 decimales. numeric sale como texto, para probar que la app lo lee. */
const conHoras = (f) => ({ ...f, me_dormi: `${f.me_dormi.slice(0, 5)}:00`, me_desperte: `${f.me_desperte.slice(0, 5)}:00`,
  horas_dormidas: (Math.round((((minutos(f.me_desperte) - minutos(f.me_dormi) + 1440) % 1440) / 60) * 100) / 100).toFixed(2) });

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (u.pathname === '/rest/v1/pendientes' || u.pathname === '/rest/v1/billetera') return json(route, 200, []);
  if (u.pathname === '/rest/v1/gym' || u.pathname === '/rest/v1/gym_plan') return json(route, 200, []);
  if (u.pathname === '/rest/v1/comidas' || u.pathname === '/rest/v1/lista_deseos' || u.pathname === '/rest/v1/clientes') return json(route, 200, []);
  if (u.pathname === '/rest/v1/descanso') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, consulta: u.searchParams, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const marca = new Date().toISOString();

    if (metodo === 'GET') {
      const desde = (u.searchParams.get('fecha') || '').replace(/^gte\./, '');
      const filas = servidor.filas.filter((f) => !desde || f.fecha >= desde)
        .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado < b.creado ? 1 : -1));
      return json(route, 200, filas.map(conHoras));
    }
    if (metodo === 'POST') {
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, calidad: null, notas: null, ...cuerpo, creado: marca, actualizado: marca };
      servidor.filas.push(nueva);
      return responder([conHoras(nueva)]);
    }
    if (metodo === 'PATCH') {
      const f = servidor.filas.find((x) => x.id === id);
      if (!f) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(f, cuerpo, { actualizado: marca });
      return responder([conHoras(f)]);
    }
    if (metodo === 'DELETE') {
      servidor.filas = servidor.filas.filter((f) => f.id !== id);
      return route.fulfill({ status: 204, headers: CORS });
    }
  }
  if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
  if (u.pathname === '/auth/v1/token') return json(route, 200, sesion());
  if (u.pathname === '/auth/v1/user') return json(route, 200, usuario);
  servidor.inesperadas.push(`${metodo} ${u.pathname}`);
  return json(route, 404, { message: 'no simulado' });
}

// ---------- ayudas ----------
async function auditar(p, nombre) {
  await p.evaluate(axe); // evaluate y no addScriptTag: la CSP de la app bloquea scripts en línea
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    const r = await p.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
    const scroll = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    revisar(r.violations.length === 0 && !scroll, `axe: ${nombre} (${esquema})`,
      [...r.violations.map((v) => `${v.id} x${v.nodes.length}`), ...(scroll ? ['scroll horizontal'] : [])].join(', '));
  }
  await p.emulateMedia({ colorScheme: 'light' });
}
/** Captura del tamaño de la pantalla del celular, en claro y oscuro. */
async function capturar(p, nombre) {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await p.evaluate(() => document.fonts.ready);
  await p.mouse.move(0, 0);
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.screenshot({ path: `${CAPTURAS}/${nombre}-390-${esquema}.png` });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}
const titulo = (p) => p.locator('main h1').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim(), () => '');
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return titulo(p);
}
async function esperarLlamada(metodo, antes) {
  for (let i = 0; i < 50 && llamadas(metodo).length === antes; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 250));
}
const textoDe = (loc) => loc.textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim(), () => '');
const anotar = (p) => p.getByRole('form', { name: 'Anotar la noche' });
const boton = (p) => anotar(p).locator('button[type="submit"]');
async function horas(p, dormi, desperte) {
  await anotar(p).getByLabel('Me dormí').fill(dormi);
  await anotar(p).getByLabel('Me desperté').fill(desperte);
}
async function guardar(p, metodo) {
  const antes = llamadas(metodo).length;
  await boton(p).click();
  await esperarLlamada(metodo, antes);
}
const dato = (p, dt) => textoDe(p.locator('#semana .cap div').filter({ has: p.locator('dt', { hasText: dt }) }).locator('dd'));

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: { cookies: [], origins: [{ origin: url, localStorage: [{ name: CLAVE_SESION, value: JSON.stringify(SESION) }] }] },
  });
  await ctx.route((u) => u.hostname.endsWith('.supabase.co'), supabaseSimulado);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));

  // 1. Abrir /descanso directo, sin noches.
  await p.goto(`${url}/descanso`);
  revisar((await esperarTitulo(p, '¿Cómo dormiste?')) === '¿Cómo dormiste?', 'la dirección /descanso abre la pantalla, sin noches');
  const pedido = llamadas('GET')[0];
  revisar(pedido?.permiso === `Bearer ${SESION.access_token}`, 'las noches se piden con la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar(pedido?.consulta.get('fecha') === `gte.${DESDE}`, 'se piden los últimos 60 días', pedido?.consulta.get('fecha'));
  revisar((await boton(p).textContent())?.trim() === 'Guardar la noche', 'el botón dice "Guardar la noche"');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas

  // 2. La barra de módulos: con cinco no caben en 390 px y se desplaza; la pantalla actual queda a la vista.
  const barra = await p.locator('nav.modulos').evaluate((nav) => {
    const a = nav.querySelector('[aria-current="page"]').getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return { desplaza: nav.scrollWidth > nav.clientWidth, visible: a.left >= n.left - 1 && a.right <= n.right + 1, antes: nav.dataset.antes, despues: nav.dataset.despues,
      lineas: new Set([...nav.querySelectorAll('a')].map((x) => Math.round(x.getBoundingClientRect().top))).size };
  });
  revisar(barra.desplaza && barra.lineas === 1, 'a 390 px la barra no cabe: queda en una línea y se desplaza de lado');
  revisar(barra.visible, 'la pantalla actual (Descanso) queda a la vista en la barra');
  revisar(barra.antes === 'true' || barra.despues === 'true', 'y un desvanecido en el borde avisa que hay más', `antes ${barra.antes}, después ${barra.despues}`);
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(200);
  const ancha = await p.locator('nav.modulos').evaluate((nav) => ({ desplaza: nav.scrollWidth > nav.clientWidth, antes: nav.dataset.antes, despues: nav.dataset.despues }));
  revisar(!ancha.desplaza && ancha.antes === 'false' && ancha.despues === 'false', 'a 1280 px caben todos y no hay desvanecido');
  await p.setViewportSize({ width: 390, height: 844 });
  await auditar(p, 'descanso vacío');
  await horas(p, '23:00', '06:00');
  await capturar(p, 'app-descanso-vacio');

  // 3. Anotar la noche: horas y, si quiero, cómo dormí.
  await horas(p, '23:30', '06:00');
  revisar((await textoDe(anotar(p).locator('.calculo'))) === 'Son 6 h 30 min, menos de las 7 h de la meta.', 'calcula las horas al vuelo, cruzando la medianoche',
    await textoDe(anotar(p).locator('.calculo')));
  const bien = anotar(p).getByRole('button', { name: 'Bien', exact: true });
  await bien.click();
  revisar((await bien.getAttribute('aria-pressed')) === 'true', 'la calidad se elige con un toque');
  await bien.click();
  revisar((await bien.getAttribute('aria-pressed')) === 'false', 'y otro toque la quita');
  await bien.click();
  await guardar(p, 'POST');
  const alta = llamadas('POST')[0]?.cuerpo;
  revisar(JSON.stringify(alta) === JSON.stringify({ fecha: HOY, me_dormi: '23:30', me_desperte: '06:00', calidad: 4, notas: null }),
    'se guarda la noche de hoy (la base calcula las horas)', JSON.stringify(alta));
  revisar((await titulo(p)) === 'Dormiste 6 h 30 min', 'el título dice cuánto dormí (aunque la base mande las horas como texto)', await titulo(p));
  const aviso = anotar(p).getByRole('status');
  revisar((await textoDe(aviso)).startsWith('Noche anotada: 6 h 30 min.'), 'avisa que se anotó', await textoDe(aviso));
  revisar((await boton(p).textContent())?.trim() === 'Cambiar la noche'
    && (await textoDe(anotar(p).locator('.ayuda'))) === 'Ya anotaste la noche de hoy: guardar la cambia.', 'ya anotada, guardar la cambia y lo dice');

  // 4. Deshacer y volver a anotar.
  let antes = llamadas('DELETE').length;
  await aviso.getByRole('button', { name: 'Deshacer' }).click();
  await esperarLlamada('DELETE', antes);
  revisar(llamadas('DELETE').length === 1 && (await titulo(p)) === '¿Cómo dormiste?', 'Deshacer la borra');
  await guardar(p, 'POST');

  // 5. Cambiarla: no se duplica.
  await anotar(p).getByLabel('Me desperté').fill('06:45');
  await guardar(p, 'PATCH');
  revisar(llamadas('POST').length === 2 && llamadas('PATCH').at(-1)?.cuerpo.me_desperte === '06:45', 'cambiar la noche de hoy la actualiza, sin crear otra');
  revisar((await titulo(p)) === 'Dormiste 7 h 15 min' && (await textoDe(aviso)).startsWith('Noche cambiada: 7 h 15 min.'), 'y el título y el aviso lo dicen', await titulo(p));

  // 6. Horas que no sirven: no se envían.
  const enviados = servidor.llamadas.length;
  await horas(p, '06:00', '06:00');
  await boton(p).click();
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).includes('iguales'), 'la misma hora para dormir y despertar se explica');
  await horas(p, '10:00', '05:00');
  await boton(p).click();
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).includes('revisa las horas'), 'más de 16 horas pide revisar (¿AM y PM?)');
  revisar(servidor.llamadas.length === enviados, 'y no se envía nada');

  // 7. Noches anteriores: la fecha cambia el formulario.
  await p.getByText('Fecha y notas').click();
  await anotar(p).getByRole('button', { name: 'Ayer', exact: true }).click();
  revisar((await boton(p).textContent())?.trim() === 'Guardar la noche', 'al elegir ayer (sin anotar), el formulario es para una noche nueva');
  await horas(p, '00:30', '05:30');
  await anotar(p).getByLabel('Notas').fill('Estudié hasta tarde');
  await guardar(p, 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo.fecha === AYER && llamadas('POST').at(-1)?.cuerpo.notas === 'Estudié hasta tarde', 'la noche de ayer, con notas, llega a la base');
  await anotar(p).getByLabel('Día en que despertaste').fill(ANTEAYER);
  await horas(p, '01:00', '06:00');
  await guardar(p, 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo.fecha === ANTEAYER, 'y la de anteayer, eligiendo la fecha');
  await anotar(p).getByRole('button', { name: 'Hoy', exact: true }).click();
  revisar((await anotar(p).getByLabel('Me desperté').inputValue()) === '06:45' && (await boton(p).textContent())?.trim() === 'Cambiar la noche',
    'al volver a hoy, el formulario muestra la noche ya anotada');

  // 8. Tres noches cortas seguidas: aviso.
  revisar(!(await p.locator('main > .alerta').count()), 'con una noche buena hoy, no hay aviso');
  await anotar(p).getByLabel('Me desperté').fill('06:00');
  await guardar(p, 'PATCH');
  revisar((await textoDe(p.locator('main > .alerta'))) === 'Llevas 3 noches seguidas durmiendo menos de 7 horas.', 'tres noches cortas seguidas: lo avisa',
    await textoDe(p.locator('main > .alerta')));

  // 9. La semana y las barras.
  revisar((await dato(p, 'Promedio')) === '5 h 30 min' && (await dato(p, 'Noches cortas')) === '3 de 3' && (await dato(p, 'Calidad')) === 'Bien',
    'el resumen de la semana: promedio, noches cortas y calidad', [await dato(p, 'Promedio'), await dato(p, 'Noches cortas'), await dato(p, 'Calidad')].join(' | '));
  revisar((await p.locator('svg.barras rect').count()) === 3 && (await p.locator('svg.barras .meta-linea').count()) === 1, 'una barra por noche y la línea de la meta');
  const tituloBarra = await p.locator('svg.barras rect title').first().textContent();
  revisar(/: \d+ h/.test(tituloBarra || ''), 'cada barra dice su noche al pasar el puntero', tituloBarra);
  await auditar(p, 'descanso con noches');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-descanso');
  await p.locator('#semana').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await capturar(p, 'app-descanso-semana');

  // 10. La lista de noches: editar y borrar.
  const filas = await p.locator('#noches .mov-t').allTextContents();
  revisar(filas[0] === 'Hoy' && filas[1] === 'Ayer' && filas.length === 3, 'las noches, de la más reciente a la más vieja', filas.join(' | '));
  revisar((await textoDe(p.locator('#noches li').first().locator('.meta'))) === '23:30 → 06:00 · Bien', 'con las horas y la calidad');
  await p.getByRole('button', { name: 'Editar la noche de ayer' }).click();
  const editor = p.getByRole('form', { name: 'Editar la noche de ayer' });
  revisar(await editor.getByLabel('Me dormí').evaluate((e) => e === document.activeElement), 'al editar, el foco va a la hora de dormir');
  await auditar(p, 'editando una noche');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-descanso-editar');
  await editor.getByLabel('Cómo dormiste').selectOption('1');
  antes = llamadas('PATCH').length;
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('PATCH', antes);
  revisar(llamadas('PATCH').at(-1)?.cuerpo.calidad === 1, 'los cambios llegan a la base');
  revisar((await textoDe(p.locator('#noches li').nth(1).locator('.meta'))).endsWith('Muy mal'), 'y se ven en la lista');
  const nombreAnteayer = await p.locator('#noches .mov-t').nth(2).textContent();
  await p.getByRole('button', { name: `Editar la noche del ${nombreAnteayer.toLowerCase()}` }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(llamadas('DELETE').length === 1, 'borrar pide confirmación antes');
  antes = llamadas('DELETE').length;
  await p.getByRole('button', { name: 'Sí, borrar' }).click();
  await esperarLlamada('DELETE', antes);
  revisar((await p.locator('#noches li').count()) === 2 && !(await p.locator('main > .alerta').count()), 'confirmado, se borra, y con dos noches cortas ya no hay aviso');

  // 11. Errores de la base: nada cambia y se avisa.
  servidor.fallar = true;
  await anotar(p).getByLabel('Me desperté').fill('07:00');
  await guardar(p, 'PATCH');
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar') && (await titulo(p)) === 'Dormiste 6 h 30 min',
    'si guardar falla, lo avisa y la noche queda como estaba', await titulo(p));
  servidor.fallar = false;

  // 12. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const linea = await textoDe(p.locator('section#salud li').first());
  revisar(linea.startsWith('Descanso') && linea.includes('Anoche dormiste 6 h 30 min; promedio de la semana, 5 h 45 min.'), 'Mi Día dice cómo vengo durmiendo', linea);
  await auditar(p, 'Mi Día con la salud');
  await p.getByRole('link', { name: 'Ver el descanso' }).click();
  await esperarTitulo(p, 'Dormiste 6 h 30 min');
  revisar(new URL(p.url()).pathname === '/descanso', 'el enlace de Mi Día lleva al descanso');

  // 13. Sin internet: se ve lo guardado y no deja anotar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, 'Dormiste 6 h 30 min')) === 'Dormiste 6 h 30 min', 'sin internet: se ve lo guardado');
  revisar(await p.getByText('Sin conexión. Ves lo último guardado; para anotar hace falta internet.').isVisible() && await boton(p).isDisabled(),
    'sin internet: lo avisa y no deja guardar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 14. Cerrar sesión borra la copia del descanso.
  await p.reload();
  await esperarTitulo(p, 'Dormiste 6 h 30 min');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.descanso.')))), 'cerrar sesión borra el descanso guardado');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla descanso: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
