// Uso: node herramientas/deseos.js http://localhost:4173
// Prueba la pantalla Lista de deseos de la app ya compilada (npm run build y npm run preview dentro de app/)
// con las tablas lista_deseos y billetera de Supabase simuladas en memoria dentro del navegador de prueba:
// agregar rápido y con precio y enlace, datos que no sirven, prioridad, actualizar el precio, "llegó a tu
// precio", los totales y lo que sobra del mes en la Billetera, marcar como comprado y anotar el gasto,
// deshacer la compra, borrar, errores, la línea de Mi Día, sin internet y cerrar sesión.
// Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la lista vacía, con productos y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/deseos.js http://localhost:4173');
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
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000009', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- las tablas lista_deseos y billetera, simuladas en memoria ----------
const marca0 = new Date().toISOString();
const movimiento = (datos) => ({ id: crypto.randomUUID(), usuario_id: usuario.id, moneda: 'HNL', descripcion: null, ...datos, creado: marca0, actualizado: marca0 });
const servidor = {
  deseos: [],
  // En la Billetera de este mes: ingresos de L 8,000 y gastos de L 3,000. Sobran L 5,000.
  billetera: [movimiento({ fecha: HOY, tipo: 'ingreso', monto: 8000, categoria: 'trabajo' }), movimiento({ fecha: HOY, tipo: 'gasto', monto: 3000, categoria: 'servicios' })],
  fallar: false, sinRed: false, llamadas: [], inesperadas: [],
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (tabla, metodo) => servidor.llamadas.filter((l) => l.tabla === tabla && l.metodo === metodo);
let reloj = 0;

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (['/rest/v1/pendientes', '/rest/v1/descanso', '/rest/v1/gym', '/rest/v1/gym_plan', '/rest/v1/comidas'].includes(u.pathname)) return json(route, 200, []);
  const tabla = { '/rest/v1/lista_deseos': 'deseos', '/rest/v1/billetera': 'billetera' }[u.pathname];
  if (tabla) {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ tabla, metodo, cuerpo, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const marca = new Date(Date.now() + ++reloj * 1000).toISOString();
    const filas = servidor[tabla];

    if (metodo === 'GET') return json(route, 200, filas);
    if (metodo === 'POST') {
      const base = tabla === 'deseos'
        ? { enlace: null, precio: null, precio_objetivo: null, moneda: 'HNL', prioridad: 'media', estado: 'quiero', notas: null }
        : { moneda: 'HNL', descripcion: null };
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, ...base, ...cuerpo, creado: marca, actualizado: marca };
      filas.push(nueva);
      return responder([nueva]);
    }
    if (metodo === 'PATCH') {
      const f = filas.find((x) => x.id === id);
      if (!f) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(f, cuerpo, { actualizado: marca });
      // numeric sale de PostgREST como número, pero la app también acepta texto: se prueba así.
      return responder([{ ...f, precio: f.precio === null ? null : String(f.precio) }]);
    }
    if (metodo === 'DELETE') {
      servidor[tabla] = filas.filter((f) => f.id !== id);
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
async function esperarLlamada(tabla, metodo, antes) {
  for (let i = 0; i < 50 && llamadas(tabla, metodo).length === antes; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 250));
}
const textoDe = (loc) => loc.textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim(), () => '');
const form = (p) => p.getByRole('form', { name: 'Agregar a la lista' });
const producto = (p) => form(p).getByLabel('¿Qué quieres comprar?');
async function agregar(p, nombre) {
  const antes = llamadas('deseos', 'POST').length;
  await producto(p).fill(nombre);
  await producto(p).press('Enter');
  await esperarLlamada('deseos', 'POST', antes);
}
const fila = (p, nombre) => p.locator('li.pend').filter({ has: p.getByRole('checkbox', { name: nombre, exact: true }) });
const dato = (p, dt) => textoDe(p.locator('dl.totales div').filter({ has: p.locator('dt', { hasText: dt }) }).locator('dd'));

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

  // 1. Abrir /deseos directo, sin nada.
  await p.goto(`${url}/deseos`);
  revisar((await esperarTitulo(p, 'Tu lista de deseos está vacía')) === 'Tu lista de deseos está vacía', 'la dirección /deseos abre la pantalla, sin nada');
  revisar((await textoDe(p.locator('nav.modulos a[aria-current="page"]'))) === 'Deseos', 'la barra marca Deseos como la pantalla actual');
  revisar(llamadas('deseos', 'GET')[0]?.permiso === `Bearer ${SESION.access_token}`, 'la lista se pide con la sesión del usuario, para que RLS le dé solo lo suyo');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'lista vacía');
  await capturar(p, 'app-deseos-vacio');

  // 2. Agregar rápido: escribir y Enter.
  await agregar(p, 'Audífonos');
  const alta = llamadas('deseos', 'POST')[0]?.cuerpo;
  revisar(JSON.stringify(alta) === JSON.stringify({ producto: 'Audífonos', precio: null, precio_objetivo: null, moneda: 'HNL', enlace: null, prioridad: 'media', notas: null }),
    'agregar rápido: solo el nombre', JSON.stringify(alta));
  revisar((await titulo(p)) === '1 cosa en tu lista' && (await textoDe(fila(p, 'Audífonos').locator('.meta'))).startsWith('Sin precio'), 'el título cuenta y la fila dice que no tiene precio');
  revisar(!(await p.locator('dl.totales').count()), 'sin precios, no hay totales que mostrar');

  // 3. Con precio, enlace y prioridad; lo que no sirve no se envía.
  await p.getByText('Precio, enlace y prioridad').click();
  await form(p).getByLabel('Precio hoy').fill('2,500');
  await form(p).getByLabel('Lo compraría a').fill('2000');
  await form(p).getByLabel('Prioridad').selectOption('alta');
  await form(p).getByLabel('Enlace de la tienda').fill('http://tienda.hn/teclado');
  const enviados = servidor.llamadas.length;
  await producto(p).fill('Teclado mecánico');
  await producto(p).press('Enter');
  revisar((await form(p).getByRole('alert').innerText().catch(() => '')) === 'El enlace tiene que empezar con https://', 'un enlace que no es https se explica');
  await form(p).getByLabel('Enlace de la tienda').fill('https://www.tienda.hn/teclado');
  await form(p).getByLabel('Precio hoy').fill('dos mil');
  await producto(p).press('Enter');
  revisar((await form(p).getByRole('alert').innerText().catch(() => '')).startsWith('El precio va como'), 'un precio que no es número se explica');
  revisar(servidor.llamadas.length === enviados, 'y no se envía nada');
  await form(p).getByLabel('Precio hoy').fill('2,500');
  await agregar(p, 'Teclado mecánico');
  const teclado = llamadas('deseos', 'POST').at(-1)?.cuerpo;
  revisar(teclado?.precio === 2500 && teclado?.precio_objetivo === 2000 && teclado?.enlace === 'https://www.tienda.hn/teclado' && teclado?.prioridad === 'alta',
    'precio, precio que pagaría, enlace y prioridad llegan a la base', JSON.stringify(teclado));
  revisar((await textoDe(fila(p, 'Teclado mecánico').locator('.meta'))).startsWith('L 2,500.00 · lo comprarías a L 2,000.00 · Prioridad alta'),
    'la fila dice el precio, el que pagaría y la prioridad', await textoDe(fila(p, 'Teclado mecánico').locator('.meta')));
  const enlace = fila(p, 'Teclado mecánico').getByRole('link', { name: /Ver en tienda\.hn/ });
  revisar((await enlace.getAttribute('href')) === 'https://www.tienda.hn/teclado' && (await enlace.getAttribute('target')) === '_blank'
    && (await enlace.getAttribute('rel')) === 'noopener noreferrer', 'el enlace a la tienda se abre aparte, sin pasarle nada de la app');
  revisar(JSON.stringify(await p.locator('#quiero .pend-t').allTextContents()) === JSON.stringify(['Teclado mecánico', 'Audífonos']), 'la prioridad alta va primero');

  // 4. Los totales y lo que sobra del mes en la Billetera.
  revisar((await dato(p, 'Todo, al precio de hoy')) === 'L 2,500.00' && (await dato(p, 'Te sobra este mes')) === 'L 5,000.00',
    'los totales y lo que sobra este mes en la Billetera', `${await dato(p, 'Todo, al precio de hoy')} | ${await dato(p, 'Te sobra este mes')}`);
  revisar((await textoDe(fila(p, 'Teclado mecánico').locator('.meta'))).includes('Te alcanza con lo que sobra este mes'), 'y dice qué alcanza');

  // 5. Actualizar el precio hasta que llega al que quiero.
  await fila(p, 'Audífonos').getByRole('button', { name: 'Editar: Audífonos' }).click();
  let editor = p.getByRole('form', { name: 'Editar: Audífonos' });
  revisar(await editor.getByLabel('Precio hoy').evaluate((e) => e === document.activeElement), 'al editar, el foco va al precio');
  await editor.getByLabel('Precio hoy').fill('1200');
  await editor.getByLabel('Lo compraría a').fill('1000');
  await auditar(p, 'editando un producto');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-deseos-editar');
  let antes = llamadas('deseos', 'PATCH').length;
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('deseos', 'PATCH', antes);
  revisar(llamadas('deseos', 'PATCH').at(-1)?.cuerpo.precio === 1200, 'el precio llega a la base');
  await fila(p, 'Audífonos').getByRole('button', { name: 'Editar: Audífonos' }).click();
  editor = p.getByRole('form', { name: 'Editar: Audífonos' });
  await editor.getByLabel('Precio hoy').fill('950');
  antes = llamadas('deseos', 'PATCH').length;
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('deseos', 'PATCH', antes);
  revisar((await titulo(p)) === 'Audífonos llegó a tu precio', 'cuando el precio baja al que quiero, el título lo dice', await titulo(p));
  revisar(JSON.stringify(await p.locator('#a-su-precio .pend-t').allTextContents()) === JSON.stringify(['Audífonos']), 'y va arriba, en "Llegaron a tu precio"');
  revisar((await dato(p, 'Todo, al precio de hoy')) === 'L 3,450.00' && (await dato(p, 'Al precio que quieres')) === 'L 2,950.00',
    'si ya está más barato que lo que pagaría, cuenta el precio de hoy', `${await dato(p, 'Todo, al precio de hoy')} | ${await dato(p, 'Al precio que quieres')}`);
  await auditar(p, 'lista con productos');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-deseos');

  // 6. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const lineas = (await p.locator('section#dinero li').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
  revisar(lineas.length === 2 && lineas[0].startsWith('Billetera') && lineas[1].includes('Audífonos llegó a tu precio: L 950.00.'),
    'Mi Día, en Dinero: la Billetera y lo que llegó a tu precio', lineas.join(' | '));
  await auditar(p, 'Mi Día con la lista de deseos');
  await p.getByRole('link', { name: 'Ver la lista' }).click();
  await esperarTitulo(p, 'Audífonos llegó a tu precio');
  revisar(new URL(p.url()).pathname === '/deseos', 'el enlace de Mi Día lleva a la lista');

  // 7. Comprado: un toque, y otro para anotarlo en la Billetera.
  antes = llamadas('deseos', 'PATCH').length;
  await p.getByRole('checkbox', { name: 'Audífonos', exact: true }).click();
  await esperarLlamada('deseos', 'PATCH', antes);
  revisar(llamadas('deseos', 'PATCH').at(-1)?.cuerpo.estado === 'comprado' && (await titulo(p)) === '1 cosa en tu lista', 'marcarlo lo pasa a comprado');
  const aviso = p.locator('main > p.aviso[role="status"]');
  revisar((await textoDe(aviso)).startsWith('Audífonos: comprado.'), 'avisa que se compró');
  antes = llamadas('billetera', 'POST').length;
  await aviso.getByRole('button', { name: 'Anotar el gasto (L 950.00)' }).click();
  await esperarLlamada('billetera', 'POST', antes);
  const gasto = llamadas('billetera', 'POST').at(-1)?.cuerpo;
  revisar(JSON.stringify(gasto) === JSON.stringify({ fecha: HOY, tipo: 'gasto', monto: 950, moneda: 'HNL', categoria: 'compras', descripcion: 'Audífonos' }),
    'un toque lo anota como gasto en la Billetera', JSON.stringify(gasto));
  revisar((await textoDe(aviso)) === 'Gasto anotado en la Billetera: L 950.00 en Compras.' && (await dato(p, 'Te sobra este mes')) === 'L 4,050.00',
    'lo dice, y lo que sobra del mes baja', await dato(p, 'Te sobra este mes'));

  // 8. Deshacer la compra desde "Comprado y descartado".
  await p.getByText('Ver lo comprado y lo descartado').click();
  antes = llamadas('deseos', 'PATCH').length;
  await p.getByRole('checkbox', { name: 'Audífonos', exact: true }).click();
  await esperarLlamada('deseos', 'PATCH', antes);
  revisar(llamadas('deseos', 'PATCH').at(-1)?.cuerpo.estado === 'quiero' && (await titulo(p)) === 'Audífonos llegó a tu precio', 'desmarcarlo lo devuelve a la lista');

  // 9. Errores de la base.
  servidor.fallar = true;
  await p.getByRole('checkbox', { name: 'Teclado mecánico', exact: true }).click();
  await p.waitForTimeout(400);
  revisar(!(await p.getByRole('checkbox', { name: 'Teclado mecánico', exact: true }).isChecked())
    && (await p.locator('main > .alerta').innerText().catch(() => '')).includes('quedó como estaba'), 'si marcar falla, vuelve a como estaba y lo avisa');
  servidor.fallar = false;

  // 10. Borrar, con confirmación.
  await fila(p, 'Teclado mecánico').getByRole('button', { name: 'Editar: Teclado mecánico' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(!llamadas('deseos', 'DELETE').length, 'borrar pide confirmación antes');
  antes = llamadas('deseos', 'DELETE').length;
  await p.getByRole('button', { name: 'Sí, borrar' }).click();
  await esperarLlamada('deseos', 'DELETE', antes);
  revisar(!(await p.getByRole('checkbox', { name: 'Teclado mecánico', exact: true }).count()), 'confirmado, se borra');

  // 11. Sin internet: se ve lo guardado y no deja cambiar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, 'Audífonos llegó a tu precio')) === 'Audífonos llegó a tu precio', 'sin internet: se ve lo guardado');
  revisar(await producto(p).isDisabled() && await p.getByRole('checkbox', { name: 'Audífonos', exact: true }).isDisabled(), 'sin internet no deja agregar ni marcar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 12. Cerrar sesión borra la copia de la lista.
  await p.reload();
  await esperarTitulo(p, 'Audífonos llegó a tu precio');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.deseos.')))), 'cerrar sesión borra la lista guardada');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a lista_deseos y billetera: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
