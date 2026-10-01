// Uso: node herramientas/pendientes.js http://localhost:4173
// Prueba la pantalla Pendientes de la app ya compilada (npm run build y npm run preview dentro de app/)
// con la tabla pendientes de Supabase simulada en memoria dentro del navegador de prueba: agregar,
// fechas y grupos, marcar como hecho, editar, borrar, errores, sin internet, Mi Día, la navegación y
// cerrar sesión. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la lista y del editor (claro, 390 px).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/pendientes.js http://localhost:4173');
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
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000003', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla pendientes, simulada en memoria ----------
const servidor = { filas: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (metodo) => servidor.llamadas.filter((l) => l.metodo === metodo);

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (u.pathname === '/rest/v1/billetera') return json(route, 200, []);
  if (u.pathname === '/rest/v1/descanso') return json(route, 200, []);
  if (u.pathname === '/rest/v1/gym' || u.pathname === '/rest/v1/gym_plan') return json(route, 200, []);
  if (u.pathname === '/rest/v1/comidas' || u.pathname === '/rest/v1/lista_deseos') return json(route, 200, []);
  if (u.pathname === '/rest/v1/pendientes') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, consulta: u.searchParams, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    // Un solo objeto cuando la app lo pide así (.single()), como hace PostgREST.
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const marca = new Date().toISOString();

    if (metodo === 'GET') return json(route, 200, servidor.filas);
    if (metodo === 'POST') {
      const nueva = {
        id: crypto.randomUUID(), usuario_id: usuario.id, area: 'personal', fecha_limite: null, prioridad: 'media',
        estado: 'pendiente', notas: null, ...cuerpo, creado: marca, actualizado: marca,
      };
      servidor.filas.push(nueva);
      return responder([nueva]);
    }
    if (metodo === 'PATCH') {
      const fila = servidor.filas.find((f) => f.id === id);
      if (!fila) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(fila, cuerpo, { actualizado: marca });
      return responder([fila]);
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
async function capturar(p, nombre) {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
}
const titulo = (p) => p.locator('main h1').first().innerText().then((t) => t.trim(), () => '');
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return titulo(p);
}
const grupo = (p, id) => p.locator(`section#${id} .pend-t`).allInnerTexts();
const campoNuevo = (p) => p.getByLabel('Nuevo pendiente');
async function agregar(p, tarea) {
  const antes = llamadas('POST').length;
  await campoNuevo(p).fill(tarea);
  await campoNuevo(p).press('Enter');
  for (let i = 0; i < 50 && llamadas('POST').length === antes; i++) await p.waitForTimeout(100);
  await p.waitForTimeout(200);
}

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

  // 1. Abrir /pendientes directo: lista vacía.
  await p.goto(`${url}/pendientes`);
  revisar((await esperarTitulo(p, 'Nada pendiente.')) === 'Nada pendiente.', 'la dirección /pendientes abre la pantalla, sin pendientes');
  // textContent y no innerText: la barra va en mayúsculas por CSS.
  revisar((await p.locator('nav.modulos a[aria-current="page"]').textContent())?.trim() === 'Pendientes', 'la barra marca Pendientes como la pantalla actual');
  revisar(llamadas('GET')[0]?.permiso === `Bearer ${SESION.access_token}`, 'la lista se pide con la sesión del usuario, para que RLS le dé solo lo suyo');
  await auditar(p, 'sin pendientes');

  // 2. Agregar rápido: escribir y Enter.
  await agregar(p, '   ');
  revisar(llamadas('POST').length === 0, 'un pendiente en blanco no se envía');
  await agregar(p, 'Leer el capítulo 3');
  const alta = llamadas('POST')[0]?.cuerpo;
  revisar(alta?.tarea === 'Leer el capítulo 3' && alta.fecha_limite === null && alta.area === 'personal' && alta.prioridad === 'media',
    'agregar rápido: se guarda con los valores por defecto', JSON.stringify(alta));
  revisar((await grupo(p, 'sin-fecha')).includes('Leer el capítulo 3'), 'aparece en "Sin fecha"');
  revisar((await campoNuevo(p).inputValue()) === '' && await campoNuevo(p).evaluate((e) => e === document.activeElement),
    'el campo queda vacío y con el foco, listo para el siguiente');
  revisar((await titulo(p)) === '1 por hacer', 'el título cuenta lo que falta', await titulo(p));

  // 3. Con fecha de hoy (atajo) y área.
  await p.getByText('Fecha, área y prioridad').click();
  await p.locator('.agregar').getByRole('button', { name: 'Hoy' }).click();
  await p.locator('.agregar').getByLabel('Área').selectOption('universidad');
  await agregar(p, 'Entregar el laboratorio');
  revisar(llamadas('POST').at(-1)?.cuerpo.fecha_limite === HOY && llamadas('POST').at(-1)?.cuerpo.area === 'universidad', 'el atajo "Hoy" y el área llegan a la base');
  revisar((await grupo(p, 'hoy')).includes('Entregar el laboratorio'), 'aparece en "Hoy"');
  const metaHoy = await p.locator('section#hoy .meta').first().innerText().catch(() => '');
  revisar(/hoy/i.test(metaHoy) && /universidad/i.test(metaHoy), 'dice cuándo vence y el área', metaHoy);

  // 4. Atrasado y con prioridad alta.
  await p.locator('.agregar').getByLabel('Para cuándo').fill(AYER);
  await p.locator('.agregar').getByLabel('Área').selectOption('personal');
  await p.locator('.agregar').getByLabel('Prioridad').selectOption('alta');
  await agregar(p, 'Pagar la luz');
  revisar((await grupo(p, 'atrasados')).includes('Pagar la luz'), 'lo vencido aparece en "Atrasados"');
  const metaAtrasado = await p.locator('section#atrasados .meta').first().innerText().catch(() => '');
  revisar(/venció el/i.test(metaAtrasado) && /prioridad alta/i.test(metaAtrasado), 'dice cuándo venció y la prioridad', metaAtrasado);
  revisar((await titulo(p)) === '3 por hacer, 1 atrasado', 'el título cuenta los atrasados', await titulo(p));
  await auditar(p, 'lista con pendientes');
  await capturar(p, 'app-pendientes-390-light');

  // 5. Marcar como hecho y deshacer. Clic y no check(): la fila se muda de grupo al marcarla.
  await p.getByRole('checkbox', { name: 'Leer el capítulo 3' }).click();
  await p.locator('section#hechos').waitFor({ timeout: 5000 }).catch(() => {});
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'hecho', 'marcar como hecho llega a la base');
  revisar(await p.locator('section#hechos').isVisible() && !(await grupo(p, 'sin-fecha')).includes('Leer el capítulo 3'), 'pasa a "Hechos"');
  revisar((await titulo(p)) === '2 por hacer, 1 atrasado', 'y deja de contar', await titulo(p));
  await p.getByText('Ver los hechos').click();
  await p.getByRole('checkbox', { name: 'Leer el capítulo 3' }).click();
  await p.waitForTimeout(300);
  revisar((await grupo(p, 'sin-fecha')).includes('Leer el capítulo 3'), 'desmarcarlo lo devuelve a su grupo');

  // 6. Editar.
  await p.getByRole('button', { name: 'Editar: Entregar el laboratorio' }).click();
  const editor = p.getByRole('form', { name: 'Editar: Entregar el laboratorio' });
  revisar(await editor.getByLabel('Pendiente').evaluate((e) => e === document.activeElement), 'al editar, el foco va al texto del pendiente');
  await auditar(p, 'editando un pendiente');
  await capturar(p, 'app-pendientes-editar-390-light');
  await editor.getByLabel('Pendiente').fill('Entregar el laboratorio 2');
  await editor.getByLabel('Notas').fill('En grupo, por Canvas.');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await p.waitForTimeout(400);
  const editado = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(editado?.tarea === 'Entregar el laboratorio 2' && editado?.notas === 'En grupo, por Canvas.', 'los cambios llegan a la base');
  revisar((await grupo(p, 'hoy')).includes('Entregar el laboratorio 2') && await p.getByText('En grupo, por Canvas.').isVisible(), 'y se ven en la lista');

  // 7. Borrar, con confirmación.
  await p.getByRole('button', { name: 'Editar: Pagar la luz' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(llamadas('DELETE').length === 0, 'borrar pide confirmación antes');
  await p.getByRole('button', { name: 'Sí, borrar' }).click();
  await p.waitForTimeout(400);
  revisar(llamadas('DELETE').length === 1 && !(await grupo(p, 'atrasados')).length, 'confirmado, se borra');
  revisar((await titulo(p)) === '2 por hacer', 'y el título se actualiza', await titulo(p));

  // 8. Errores de la base: nada se pierde y se avisa.
  servidor.fallar = true;
  await agregar(p, 'Esto no se guarda');
  revisar((await p.getByRole('alert').first().innerText().catch(() => '')).includes('No se pudo guardar'), 'si agregar falla, lo avisa');
  revisar(!(await p.getByText('Esto no se guarda', { exact: true }).count()) && (await campoNuevo(p).inputValue()) === 'Esto no se guarda',
    'y el texto se queda en el campo para reintentar');
  await campoNuevo(p).fill('');
  await p.getByRole('checkbox', { name: 'Entregar el laboratorio 2' }).click();
  await p.waitForTimeout(400);
  revisar(!(await p.getByRole('checkbox', { name: 'Entregar el laboratorio 2' }).isChecked()), 'si marcar falla, vuelve a como estaba');
  revisar((await p.locator('main > .alerta').innerText().catch(() => '')).includes('quedó como estaba'), 'y lo avisa arriba de la lista');
  servidor.fallar = false;

  // 9. Mi Día muestra los de hoy y lleva a la lista.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  revisar(new URL(p.url()).pathname === '/', 'la barra lleva a Mi Día');
  const deHoy = await p.locator('section#pendientes .t').allInnerTexts();
  revisar(deHoy.includes('Entregar el laboratorio 2') && !deHoy.includes('Leer el capítulo 3'), 'Mi Día muestra los pendientes de hoy, no los sin fecha', deHoy.join(' | '));
  await auditar(p, 'Mi Día con pendientes');
  await p.getByRole('link', { name: 'Ver todos los pendientes' }).click();
  await esperarTitulo(p, '2 por hacer');
  revisar(new URL(p.url()).pathname === '/pendientes', 'el enlace de Mi Día lleva a la lista');
  revisar(await p.evaluate(() => document.activeElement?.tagName === 'H1'), 'al cambiar de pantalla, el foco va al título');
  await p.goBack();
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'el botón de atrás vuelve a Mi Día');

  // 10. Sin internet: se ve lo guardado y no deja escribir.
  await p.goto(`${url}/pendientes`);
  await esperarTitulo(p, '2 por hacer');
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, '2 por hacer')) === '2 por hacer', 'sin internet: se ve la lista guardada');
  revisar(await p.getByText('Sin conexión. Ves lo último guardado').isVisible(), 'sin internet: lo avisa');
  revisar(await campoNuevo(p).isDisabled() && await p.getByRole('checkbox').first().isDisabled(), 'sin internet no deja agregar ni marcar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 11. Cerrar sesión borra la copia de los pendientes.
  await p.reload();
  await esperarTitulo(p, '2 por hacer');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.pendientes.')))), 'cerrar sesión borra los pendientes guardados');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla pendientes: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
