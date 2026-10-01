// Uso: node herramientas/estudios.js http://localhost:4173
// Prueba la pantalla Estudios de la app ya compilada (npm run build y npm run preview dentro de app/)
// con la tabla estudios de Supabase simulada en memoria dentro del navegador de prueba: cargar el plan,
// marcar aprobadas una por una o todo un período (y deshacer), cursando, editar, notas y promedio, código
// repetido, agregar y borrar, errores, períodos plegados, sin internet, la navegación y cerrar sesión.
// Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas del plan vacío, con avance y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/estudios.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- sesión de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const HOY = fechaLocal(new Date());
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000004', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla estudios, simulada en memoria ----------
const servidor = { filas: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (metodo) => servidor.llamadas.filter((l) => l.metodo === metodo);
const repetido = (codigo, salvo) => servidor.filas.some((f) => f.codigo === codigo && f.id !== salvo);
const REPETIDO = { code: '23505', message: 'duplicate key value violates unique constraint "estudios_usuario_id_codigo_key"' };

/** Los ids que pide la app: id=eq.x (una materia) o id=in.(x,y) (todo un período). */
function ids(u) {
  const filtro = u.searchParams.get('id') || '';
  if (filtro.startsWith('eq.')) return [filtro.slice(3)];
  if (filtro.startsWith('in.(')) return filtro.slice(4, -1).split(',').map((s) => s.replace(/"/g, ''));
  return [];
}

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (u.pathname === '/rest/v1/pendientes') return json(route, 200, []);
  if (u.pathname === '/rest/v1/billetera') return json(route, 200, []);
  if (u.pathname === '/rest/v1/estudios') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, ids: ids(u), permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    // Un solo objeto cuando la app lo pide así (.single()), como hace PostgREST.
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const marca = new Date().toISOString();

    if (metodo === 'GET') {
      const orden = [...servidor.filas].sort((a, b) => a.periodo - b.periodo || (a.codigo < b.codigo ? -1 : 1));
      return json(route, 200, orden);
    }
    if (metodo === 'POST') {
      const nuevas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).map((c) => ({
        id: crypto.randomUUID(), usuario_id: usuario.id, creditos: 0, estado: 'pendiente', nota_final: null, notas: null,
        ...c, creado: marca, actualizado: marca,
      }));
      const codigos = nuevas.map((n) => n.codigo);
      if (codigos.some((c, i) => repetido(c) || codigos.indexOf(c) !== i)) return json(route, 409, REPETIDO);
      servidor.filas.push(...nuevas);
      return responder(nuevas);
    }
    if (metodo === 'PATCH') {
      const filas = servidor.filas.filter((f) => ids(u).includes(f.id));
      if (cuerpo.codigo && filas.some((f) => repetido(cuerpo.codigo, f.id))) return json(route, 409, REPETIDO);
      if (uno && !filas.length) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      // numeric sale de PostgREST como número, pero la app también acepta texto: se prueba así.
      for (const f of filas) Object.assign(f, cuerpo, { actualizado: marca });
      return responder(filas.map((f) => ({ ...f, nota_final: f.nota_final === null ? null : String(f.nota_final) })));
    }
    if (metodo === 'DELETE') {
      servidor.filas = servidor.filas.filter((f) => !ids(u).includes(f.id));
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
/** Captura del tamaño de la pantalla del celular (el plan entero mide varios metros), en claro y oscuro. */
async function capturar(p, nombre) {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await p.evaluate(() => document.fonts.ready);
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.screenshot({ path: `${CAPTURAS}/${nombre}-390-${esquema}.png` });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}
const titulo = (p) => p.locator('main h1').first().innerText().then((t) => t.trim(), () => '');
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return titulo(p);
}
async function esperarLlamada(metodo, antes) {
  for (let i = 0; i < 50 && llamadas(metodo).length === antes; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 250));
}
const periodo = (p, n) => p.locator(`section#periodo-${n}`);
const nombres = (p, n) => periodo(p, n).locator('.pend-t').allInnerTexts();
const cabecera = (p, n) => periodo(p, n).locator('.sec-h .c').textContent().then((t) => (t || '').trim());
const dato = (p, dt) => p.locator('.cap div').filter({ has: p.locator('dt', { hasText: dt }) }).locator('dd').textContent().then((t) => (t || '').trim());
const casilla = (p, nombre) => p.getByRole('checkbox', { name: nombre, exact: true });
const fila = (p, nombre) => p.locator('li.mat').filter({ has: casilla(p, nombre) });
async function tocar(p, locator, metodo = 'PATCH') {
  const antes = llamadas(metodo).length;
  await locator.click();
  await esperarLlamada(metodo, antes);
}
const CREDITOS_POR_PERIODO = [15, 14, 14, 15, 14, 15, 14, 12, 16, 15, 15, 16, 15, 16, 16, 4, 4]; // la columna del PDF oficial

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

  // 1. Abrir /estudios directo, sin materias: ofrece cargar el plan.
  await p.goto(`${url}/estudios`);
  revisar((await esperarTitulo(p, 'Carga tu plan de estudios')) === 'Carga tu plan de estudios', 'la dirección /estudios abre la pantalla, sin materias');
  // textContent y no innerText: la barra va en mayúsculas por CSS.
  revisar((await p.locator('nav.modulos a[aria-current="page"]').textContent())?.trim() === 'Estudios', 'la barra marca Estudios como la pantalla actual');
  revisar(llamadas('GET')[0]?.permiso === `Bearer ${SESION.access_token}`, 'el plan se pide con la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar((await p.getByRole('link', { name: 'Ver el plan oficial (PDF)' }).getAttribute('href'))?.startsWith('https://www.unitec.edu/'), 'enlaza al plan oficial de UNITEC');
  await auditar(p, 'sin plan');
  // El aviso "Lista para usar sin internet" taparía parte de las capturas.
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {});
  await capturar(p, 'app-estudios-vacio');

  // 2. Cargar el plan: una sola llamada con todo el plan oficial.
  await tocar(p, p.getByRole('button', { name: 'Cargar el plan' }), 'POST');
  const plan = llamadas('POST')[0]?.cuerpo || [];
  const suma = (lista) => lista.reduce((s, m) => s + m.creditos, 0);
  const porPeriodo = CREDITOS_POR_PERIODO.map((_, i) => suma(plan.filter((m) => m.periodo === i + 1)));
  revisar(llamadas('POST').length === 1 && plan.length === 65, 'cargar el plan: una sola llamada con 65 materias (62 del plan, los 3 laboratorios aparte)', String(plan.length));
  revisar(suma(plan) === 230 && JSON.stringify(porPeriodo) === JSON.stringify(CREDITOS_POR_PERIODO),
    'el plan suma 230 créditos y cada período coincide con el PDF', porPeriodo.join(' '));
  revisar(new Set(plan.map((m) => m.codigo)).size === plan.length, 'ningún código se repite (la base no lo aceptaría)');
  revisar(plan.every((m) => m.codigo.length <= 20 && m.asignatura.length <= 200 && m.creditos >= 0 && m.creditos <= 30 && !('estado' in m)),
    'todo cabe en los límites de la base y entra como pendiente');
  revisar((await esperarTitulo(p, '0 de 230 créditos')) === '0 de 230 créditos', 'el título dice los créditos aprobados', await titulo(p));
  revisar((await p.locator('section.periodo').count()) === 17, '17 períodos en pantalla');
  revisar((await cabecera(p, 1)) === '15 créditos · 0 de 4 aprobadas', 'cada período dice sus créditos y cuántas lleva', await cabecera(p, 1));
  revisar(JSON.stringify(await nombres(p, 2)) === JSON.stringify(['Álgebra', 'Inglés II', 'Programación I', 'Programación I, laboratorio', 'Sociología']),
    'dentro del período, por nombre y con el laboratorio junto a su clase', (await nombres(p, 2)).join(' | '));
  revisar((await dato(p, 'Faltan')) === '230 créditos' && (await dato(p, 'Promedio')) === 'Sin notas', 'faltan 230 créditos y todavía no hay notas');
  revisar(await periodo(p, 14).getByText('Se elige entre CCC504').isVisible(), 'las electivas dicen entre qué se elige');

  // 3. Todo un período de una vez, con Deshacer.
  await tocar(p, p.getByRole('button', { name: 'Aprobar el período I', exact: true }));
  const lote = llamadas('PATCH').at(-1);
  revisar(lote?.ids.length === 4 && lote?.cuerpo.estado === 'aprobada', 'aprobar el período I: una sola llamada con sus 4 materias');
  revisar((await titulo(p)) === '15 de 230 créditos' && (await cabecera(p, 1)) === '15 créditos · aprobado', 'el título y el período se actualizan', await titulo(p));
  revisar((await dato(p, 'Aprobado')) === '6\u00a0%', 'el avance en porcentaje, hacia abajo', await dato(p, 'Aprobado'));
  // textContent y no innerText: los avisos van en mayúsculas por CSS.
  revisar((await periodo(p, 1).locator('.aviso').textContent().catch(() => '') || '').includes('4 materias marcadas como aprobadas.'), 'avisa cuántas marcó');
  await tocar(p, periodo(p, 1).getByRole('button', { name: 'Deshacer' }));
  revisar((await titulo(p)) === '0 de 230 créditos' && llamadas('PATCH').at(-1)?.cuerpo.estado === 'pendiente', 'Deshacer las devuelve a como estaban');
  await tocar(p, p.getByRole('button', { name: 'Aprobar el período I', exact: true }));
  await tocar(p, p.getByRole('button', { name: 'Aprobar el período II', exact: true }));
  revisar((await titulo(p)) === '29 de 230 créditos', 'aprobar el período II suma sus 14 créditos', await titulo(p));

  // 4. Una materia a la vez.
  await tocar(p, casilla(p, 'Álgebra lineal'));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'aprobada' && (await titulo(p)) === '33 de 230 créditos', 'marcar una materia la aprueba', await titulo(p));
  revisar((await periodo(p, 4).locator('.meta .sr').first().textContent())?.includes('Aprobada'), 'el lector de pantalla oye "Aprobada" en la descripción');
  await tocar(p, casilla(p, 'Álgebra lineal'));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'pendiente' && (await titulo(p)) === '29 de 230 créditos', 'desmarcarla la devuelve a pendiente');

  // 5. Cursar un período.
  await tocar(p, p.getByRole('button', { name: 'Cursar el período III', exact: true }));
  revisar(llamadas('PATCH').at(-1)?.ids.length === 5 && llamadas('PATCH').at(-1)?.cuerpo.estado === 'cursando', 'cursar el período III: sus 5 materias en una llamada');
  revisar((await dato(p, 'Cursando')) === '5 materias', 'el resumen cuenta las que se están cursando', await dato(p, 'Cursando'));
  revisar((await periodo(p, 3).locator('.meta b').first().innerText()).toLowerCase() === 'cursando', 'cada una dice "Cursando"');
  revisar(!(await p.getByRole('button', { name: 'Cursar el período III', exact: true }).count()), 'y el botón de cursar desaparece');
  await auditar(p, 'plan con avance');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); // instant: la página se desplaza suave
  await capturar(p, 'app-estudios');

  // 6. Editar: la nota, el promedio y una electiva ya elegida.
  await p.getByRole('button', { name: 'Editar: Introducción al álgebra' }).click();
  let editor = p.getByRole('form', { name: 'Editar: Introducción al álgebra' });
  revisar(await editor.getByLabel('Asignatura').evaluate((e) => e === document.activeElement), 'al editar, el foco va al nombre de la materia');
  await auditar(p, 'editando una materia');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-estudios-editar');
  await editor.getByLabel('Nota final').fill('90');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.nota_final === 90, 'la nota llega a la base como número');
  revisar((await fila(p, 'Introducción al álgebra').locator('.meta').innerText()).includes('Nota 90'), 'y se ve junto a la materia (aunque la base la devuelva como texto)');
  await p.getByRole('button', { name: 'Editar: Comunicación oral y escrita' }).click();
  editor = p.getByRole('form', { name: 'Editar: Comunicación oral y escrita' });
  await editor.getByLabel('Nota final').fill('80.5');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  revisar((await dato(p, 'Promedio')) === '85.3', 'el promedio pondera por créditos las notas registradas', await dato(p, 'Promedio'));

  await p.getByRole('button', { name: 'Editar: Electiva de formación específica I', exact: true }).click();
  editor = p.getByRole('form', { name: 'Editar: Electiva de formación específica I', exact: true });
  await editor.getByLabel('Asignatura').fill('Desarrollo de aplicaciones móviles I');
  await editor.getByLabel('Código').fill('CCC424');
  await editor.getByLabel('Notas').fill('');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  const eleccion = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(eleccion?.asignatura === 'Desarrollo de aplicaciones móviles I' && eleccion?.codigo === 'CCC424' && eleccion?.notas === null, 'elegir la electiva: nombre, código y notas llegan a la base');
  revisar((await nombres(p, 14)).includes('Desarrollo de aplicaciones móviles I'), 'y se ve en su período');

  // 7. Un código repetido: la base lo rechaza y la app lo explica.
  await p.getByRole('button', { name: 'Editar: Sociología' }).click();
  editor = p.getByRole('form', { name: 'Editar: Sociología' });
  await editor.getByLabel('Código').fill('MAT101');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  revisar((await editor.getByRole('alert').innerText().catch(() => '')) === 'Ya tienes una materia con el código MAT101.', 'un código repetido se explica', await editor.getByRole('alert').innerText().catch(() => ''));
  await editor.getByRole('button', { name: 'Cancelar' }).click();
  revisar((await fila(p, 'Sociología').locator('.meta').innerText()).includes('SOC101'), 'y la materia queda como estaba');

  // 8. Agregar una materia y borrarla.
  await p.getByText('Agregar una materia').click();
  const alta = p.getByRole('form', { name: 'Agregar una materia' });
  await alta.getByLabel('Asignatura').fill('Tecnologías emergentes');
  await alta.getByLabel('Código').fill('CCC504');
  await alta.getByLabel('Período').selectOption({ label: 'XIV' });
  await tocar(p, alta.getByRole('button', { name: 'Agregar' }), 'POST');
  const nueva = llamadas('POST').at(-1)?.cuerpo;
  revisar(Array.isArray(nueva) && nueva[0]?.periodo === 14 && nueva[0]?.creditos === 4 && nueva[0]?.codigo === 'CCC504', 'agregar: período, créditos y código llegan a la base', JSON.stringify(nueva));
  revisar((await nombres(p, 14)).includes('Tecnologías emergentes') && (await titulo(p)) === '29 de 234 créditos', 'aparece en su período y suma al total', await titulo(p));
  revisar((await alta.getByLabel('Asignatura').inputValue()) === '' && await alta.getByLabel('Asignatura').evaluate((e) => e === document.activeElement),
    'el formulario queda listo para la siguiente');
  await tocar(p, alta.getByRole('button', { name: 'Agregar' }), 'POST');
  revisar(llamadas('POST').at(-1)?.cuerpo === nueva, 'una materia en blanco no se envía');
  await alta.getByLabel('Asignatura').fill('Repetida');
  await alta.getByLabel('Código').fill('CCC504');
  await tocar(p, alta.getByRole('button', { name: 'Agregar' }), 'POST');
  revisar((await alta.getByRole('alert').innerText().catch(() => '')).includes('código CCC504'), 'agregar un código repetido se explica');
  await p.getByRole('button', { name: 'Editar: Tecnologías emergentes' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(!llamadas('DELETE').length, 'borrar pide confirmación antes');
  await tocar(p, p.getByRole('button', { name: 'Sí, borrar' }), 'DELETE');
  revisar(!(await nombres(p, 14)).includes('Tecnologías emergentes') && (await titulo(p)) === '29 de 230 créditos', 'confirmado, se borra', await titulo(p));

  // 9. Errores de la base: nada cambia y se avisa donde pasó.
  servidor.fallar = true;
  await tocar(p, casilla(p, 'Cálculo II'));
  revisar(!(await casilla(p, 'Cálculo II').isChecked()), 'si marcar falla, vuelve a como estaba');
  revisar((await periodo(p, 5).getByRole('alert').innerText().catch(() => '')).includes('quedó como estaba'), 'y lo avisa en la misma materia');
  await tocar(p, p.getByRole('button', { name: 'Aprobar el período V', exact: true }));
  revisar((await periodo(p, 5).locator('.alerta').last().innerText().catch(() => '')).includes('El período V quedó como estaba') && (await titulo(p)) === '29 de 230 créditos',
    'si aprobar el período falla, lo avisa y no suma nada');
  servidor.fallar = false;

  // 10. Al volver a abrir, los períodos aprobados van plegados.
  await p.reload();
  await esperarTitulo(p, '29 de 230 créditos');
  revisar(await periodo(p, 1).locator('details:not([open])').count() === 1 && !(await casilla(p, 'Introducción al álgebra').isVisible()),
    'el período I, ya aprobado, va plegado');
  revisar(await casilla(p, 'Geometría y trigonometría').isVisible(), 'el período III, en curso, va abierto');
  await periodo(p, 1).getByText('Ver las materias').click();
  revisar(await casilla(p, 'Introducción al álgebra').isVisible(), 'y se abre con un toque');

  // 11. La barra lleva a las otras pantallas y el botón de atrás vuelve.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Pendientes' }).click();
  await esperarTitulo(p, 'Nada pendiente.');
  revisar(new URL(p.url()).pathname === '/pendientes', 'la barra lleva a Pendientes');
  await p.goBack();
  revisar((await esperarTitulo(p, '29 de 230 créditos')) === '29 de 230 créditos', 'el botón de atrás vuelve a Estudios, con lo guardado');
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const getsAntes = llamadas('GET').length;
  await p.waitForTimeout(500);
  revisar(llamadas('GET').length === getsAntes, 'Mi Día no consulta la tabla estudios');
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Estudios' }).click();
  await esperarTitulo(p, '29 de 230 créditos');
  revisar(await p.evaluate(() => document.activeElement?.tagName === 'H1'), 'al cambiar de pantalla, el foco va al título');

  // 12. Sin internet: se ve lo guardado y no deja cambiar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, '29 de 230 créditos')) === '29 de 230 créditos', 'sin internet: se ve el plan guardado');
  revisar(await p.getByText('Sin conexión. Ves lo último guardado').isVisible(), 'sin internet: lo avisa');
  revisar(await casilla(p, 'Cálculo II').isDisabled() && await p.getByRole('button', { name: 'Aprobar el período V', exact: true }).isDisabled(),
    'sin internet no deja marcar materias ni períodos');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 13. Cerrar sesión borra la copia del plan.
  await p.reload();
  await esperarTitulo(p, '29 de 230 créditos');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.estudios.')))), 'cerrar sesión borra el plan guardado');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla estudios: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
