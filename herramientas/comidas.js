// Uso: node herramientas/comidas.js http://localhost:4173
// Prueba la pantalla Comidas de la app ya compilada (npm run build y npm run preview dentro de app/) con la
// tabla comidas de Supabase simulada en memoria dentro del navegador de prueba: qué hay de comer ahora,
// anotar (el momento sale de la hora), deshacer, cambiar lo ya anotado, anotar desde la lista de hoy,
// planear mañana, lo de ayer, cuántas fueron hechas en casa, borrar, errores, la línea de Mi Día, sin
// internet y cerrar sesión. El reloj del navegador queda fijo hoy a las 12:00, así el momento es siempre el
// almuerzo. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con comidas y de los próximos días (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/comidas.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- fechas, reloj y sesión de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const MEDIODIA = new Date();
MEDIODIA.setHours(12, 0, 0, 0);
const HOY = fechaLocal(MEDIODIA);
const masDias = (n) => fechaLocal(new Date(MEDIODIA.getTime() + n * 86400000));
const AYER = masDias(-1);
const MANANA = masDias(1);
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// La sesión vence un día después del mediodía fijo: así sirve sea la hora que sea de verdad.
const ahora = () => Math.floor(MEDIODIA.getTime() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000008', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: MEDIODIA.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: MEDIODIA.toISOString(), updated_at: MEDIODIA.toISOString(),
};
function sesion() {
  const exp = ahora() + 86400;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla comidas, simulada en memoria ----------
const servidor = { filas: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (metodo) => servidor.llamadas.filter((l) => l.metodo === metodo);
let reloj = 0;

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (['/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/descanso', '/rest/v1/gym', '/rest/v1/gym_plan', '/rest/v1/lista_deseos'].includes(u.pathname)) return json(route, 200, []);
  if (u.pathname === '/rest/v1/comidas') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, consulta: u.searchParams, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    // Marcas que siempre crecen, aunque el reloj del navegador esté fijo.
    const marca = new Date(MEDIODIA.getTime() + ++reloj * 1000).toISOString();

    if (metodo === 'GET') {
      // fecha=gte.X&fecha=lte.Y, como PostgREST.
      const filtros = u.searchParams.getAll('fecha');
      const desde = (filtros.find((f) => f.startsWith('gte.')) || '').slice(4);
      const hasta = (filtros.find((f) => f.startsWith('lte.')) || '').slice(4);
      return json(route, 200, servidor.filas.filter((f) => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta)));
    }
    if (metodo === 'POST') {
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, casera: false, notas: null, ...cuerpo, creado: marca, actualizado: marca };
      servidor.filas.push(nueva);
      return responder([nueva]);
    }
    if (metodo === 'PATCH') {
      const f = servidor.filas.find((x) => x.id === id);
      if (!f) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(f, cuerpo, { actualizado: marca });
      return responder([f]);
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
const form = (p) => p.getByRole('form', { name: 'Anotar una comida' });
const comida = (p) => form(p).getByLabel('¿Qué hay de comer?');
async function guardar(p, metodo) {
  const antes = llamadas(metodo).length;
  await form(p).locator('button[type="submit"]').click();
  await esperarLlamada(metodo, antes);
}
const filaDeHoy = (p, momento) => p.locator('#hoy li').filter({ has: p.locator('.k', { hasText: momento }) });

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: { cookies: [], origins: [{ origin: url, localStorage: [{ name: CLAVE_SESION, value: JSON.stringify(SESION) }] }] },
  });
  await ctx.clock.setFixedTime(MEDIODIA);
  await ctx.route((u) => u.hostname.endsWith('.supabase.co'), supabaseSimulado);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));

  // 1. Abrir /comidas directo, sin nada: a mediodía, pregunta por el almuerzo.
  await p.goto(`${url}/comidas`);
  revisar((await esperarTitulo(p, '¿Qué hay de almuerzo?')) === '¿Qué hay de almuerzo?', 'la dirección /comidas abre la pantalla y, a mediodía, pregunta por el almuerzo', await titulo(p));
  const pedido = llamadas('GET')[0];
  revisar(pedido?.permiso === `Bearer ${SESION.access_token}`, 'las comidas se piden con la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar(JSON.stringify(pedido?.consulta.getAll('fecha')) === JSON.stringify([`gte.${masDias(-30)}`, `lte.${masDias(30)}`]), 'se piden 30 días para atrás y 30 para adelante',
    pedido?.consulta.getAll('fecha').join(' '));
  revisar((await p.locator('#hoy .mov-t').allTextContents()).every((t) => t === 'Sin anotar'), 'hoy, los cuatro momentos sin anotar');
  revisar((await form(p).getByRole('button', { name: 'Almuerzo', exact: true }).getAttribute('aria-pressed')) === 'true', 'el formulario propone el almuerzo');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'comidas vacío');
  await capturar(p, 'app-comidas-vacio');

  // 2. Anotar el almuerzo, hecho en casa.
  await comida(p).fill('Pollo con arroz');
  await form(p).getByLabel('Hecha en casa').check();
  await guardar(p, 'POST');
  const alta = llamadas('POST')[0]?.cuerpo;
  revisar(JSON.stringify(alta) === JSON.stringify({ fecha: HOY, momento: 'almuerzo', comida: 'Pollo con arroz', casera: true, notas: null }), 'el almuerzo de hoy llega a la base', JSON.stringify(alta));
  revisar((await titulo(p)) === 'Almuerzo: Pollo con arroz', 'el título dice qué hay de almuerzo', await titulo(p));
  revisar((await textoDe(filaDeHoy(p, 'Almuerzo'))).includes('Pollo con arroz') && (await textoDe(filaDeHoy(p, 'Almuerzo'))).includes('Hecha en casa'), 'y la lista de hoy lo muestra');
  const aviso = form(p).getByRole('status');
  revisar((await textoDe(aviso)).startsWith('Almuerzo anotado: Pollo con arroz.'), 'avisa que se anotó', await textoDe(aviso));

  // 3. Deshacer y volver a anotar; después, cambiarlo.
  let antes = llamadas('DELETE').length;
  await aviso.getByRole('button', { name: 'Deshacer' }).click();
  await esperarLlamada('DELETE', antes);
  revisar((await titulo(p)) === '¿Qué hay de almuerzo?' && (await comida(p).inputValue()) === '', 'Deshacer lo borra y deja el formulario vacío');
  await comida(p).fill('Pollo con arroz');
  await form(p).getByLabel('Hecha en casa').check();
  await guardar(p, 'POST');
  revisar((await form(p).locator('button[type="submit"]').textContent())?.trim() === 'Cambiar'
    && (await textoDe(form(p).locator('.ayuda'))) === 'Ya hay algo para el almuerzo de hoy: guardar lo cambia.', 'ya anotado, guardar lo cambia y lo dice');
  await comida(p).fill('Pollo con arroz y ensalada');
  await guardar(p, 'PATCH');
  revisar(llamadas('PATCH').at(-1)?.cuerpo.comida === 'Pollo con arroz y ensalada' && llamadas('POST').length === 2, 'cambiar el almuerzo lo actualiza, sin crear otro');

  // 4. En blanco no se envía.
  const enviados = servidor.llamadas.length;
  await comida(p).fill('   ');
  await form(p).locator('button[type="submit"]').click();
  revisar((await form(p).getByRole('alert').innerText().catch(() => '')) === 'Escribe qué hay de comer.' && servidor.llamadas.length === enviados, 'en blanco no se envía');

  // 5. Desde la lista de hoy: anotar la cena.
  await p.getByRole('button', { name: 'Anotar la cena de hoy' }).click();
  revisar((await form(p).getByRole('button', { name: 'Cena', exact: true }).getAttribute('aria-pressed')) === 'true'
    && await comida(p).evaluate((e) => e === document.activeElement), 'el botón de la lista lleva al formulario, con la cena elegida y el foco en la comida');
  await comida(p).fill('Sopa de frijoles');
  await guardar(p, 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo.momento === 'cena' && llamadas('POST').at(-1)?.cuerpo.casera === false, 'la cena llega a la base');

  // 6. Planear mañana.
  await p.getByRole('button', { name: 'Planear mañana' }).click();
  await comida(p).fill('Pescado');
  await guardar(p, 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo.fecha === MANANA && llamadas('POST').at(-1)?.cuerpo.momento === 'almuerzo', 'el almuerzo de mañana se planea');
  revisar((await textoDe(aviso)).startsWith('Almuerzo planeado: Pescado.'), 'y el aviso dice "planeado"', await textoDe(aviso));
  revisar((await textoDe(p.locator('#proximos .dia').first())).includes('Pescado'), 'mañana aparece en los próximos días');

  // 7. Lo de ayer.
  await form(p).getByRole('button', { name: 'Ayer', exact: true }).click();
  await form(p).getByRole('button', { name: 'Desayuno', exact: true }).click();
  await comida(p).fill('Baleadas');
  await form(p).getByLabel('Hecha en casa').check();
  await guardar(p, 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo.fecha === AYER && llamadas('POST').at(-1)?.cuerpo.momento === 'desayuno', 'el desayuno de ayer llega a la base');

  // 8. Hechas en casa, en los últimos 7 días (lo planeado para mañana no cuenta).
  const dato = (dt) => textoDe(p.locator('#semana .cap div').filter({ has: p.locator('dt', { hasText: dt }) }).locator('dd'));
  revisar((await dato('Hechas en casa')) === '2 de 3' && (await dato('Parte')) === '67 %', 'cuántas fueron hechas en casa en la semana', `${await dato('Hechas en casa')} | ${await dato('Parte')}`);
  await p.getByText('Lo que comí').click();
  revisar((await textoDe(p.locator('#semana .dia').first())).includes('Baleadas'), '"Lo que comí" muestra lo de los días anteriores');
  await auditar(p, 'comidas con hoy, plan y semana');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-comidas');
  await p.locator('#proximos').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await capturar(p, 'app-comidas-proximos');

  // 9. Borrar lo planeado, desde los próximos días.
  await p.getByRole('button', { name: 'Cambiar el almuerzo de mañana' }).click();
  revisar((await comida(p).inputValue()) === 'Pescado', 'el formulario carga lo planeado');
  await form(p).getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(!llamadas('DELETE').slice(1).length, 'borrar pide confirmación antes');
  antes = llamadas('DELETE').length;
  await form(p).getByRole('button', { name: 'Sí, borrar' }).click();
  await esperarLlamada('DELETE', antes);
  revisar((await textoDe(p.locator('#proximos .dia').first())).includes('Nada planeado'), 'confirmado, se borra y mañana queda sin plan');

  // 10. Errores de la base.
  servidor.fallar = true;
  await p.getByRole('button', { name: 'Cambiar el almuerzo de hoy' }).click();
  await comida(p).fill('Otra cosa');
  await guardar(p, 'PATCH');
  revisar((await form(p).getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar') && (await titulo(p)) === 'Almuerzo: Pollo con arroz y ensalada',
    'si guardar falla, lo avisa y queda como estaba', await titulo(p));
  servidor.fallar = false;

  // 11. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const linea = await textoDe(p.locator('section#salud li').first());
  revisar(linea.includes('Hoy: almuerzo, Pollo con arroz y ensalada; cena, Sopa de frijoles. Esta semana, 2 de 3 hechas en casa.'), 'Mi Día dice qué hay de comer hoy', linea);
  await auditar(p, 'Mi Día con las comidas');
  await p.getByRole('link', { name: 'Ver las comidas' }).click();
  await esperarTitulo(p, 'Almuerzo: Pollo con arroz y ensalada');
  revisar(new URL(p.url()).pathname === '/comidas', 'el enlace de Mi Día lleva a las comidas');

  // 12. Sin internet: se ve lo guardado y no deja anotar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, 'Almuerzo: Pollo con arroz y ensalada')) === 'Almuerzo: Pollo con arroz y ensalada', 'sin internet: se ve lo guardado');
  revisar(await form(p).locator('button[type="submit"]').isDisabled(), 'sin internet no deja guardar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 13. Cerrar sesión borra la copia de las comidas.
  await p.reload();
  await esperarTitulo(p, 'Almuerzo: Pollo con arroz y ensalada');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.comidas.')))), 'cerrar sesión borra las comidas guardadas');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla comidas: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
