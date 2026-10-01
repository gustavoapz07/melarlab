// Uso: node herramientas/billetera.js http://localhost:4173
// Prueba la pantalla Billetera de la app ya compilada (npm run build y npm run preview dentro de app/)
// con la tabla billetera de Supabase simulada en memoria dentro del navegador de prueba: anotar con el
// monto y un toque, deshacer, montos con coma, ingresos, ayer y detalle, dólares aparte, el resumen por
// categoría, los meses anteriores, editar y borrar, errores, la línea de Mi Día, el atajo del ícono, sin
// internet y cerrar sesión. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con movimientos y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/billetera.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- fechas, montos y sesión de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const HOY = fechaLocal(new Date());
const AYER = fechaLocal(new Date(Date.now() - 86400000));
const MES = HOY.slice(0, 7);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Un mes antes o después de "AAAA-MM". */
const otroMes = (mes, n) => {
  const i = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${dos((i % 12) + 1)}`;
};
const nombreMes = (mes) => MESES[Number(mes.slice(5, 7)) - 1] + (mes.slice(0, 4) === HOY.slice(0, 4) ? '' : ` de ${mes.slice(0, 4)}`);
const VENTANA = `${otroMes(MES, -11)}-01`;
const conCentavos = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const corto = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : conCentavos(n));
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000005', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla billetera, simulada en memoria ----------
const servidor = { filas: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (metodo) => servidor.llamadas.filter((l) => l.metodo === metodo);
const fila = (datos) => {
  const marca = new Date().toISOString();
  return { id: crypto.randomUUID(), usuario_id: usuario.id, moneda: 'HNL', descripcion: null, ...datos, creado: marca, actualizado: marca };
};

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (u.pathname === '/rest/v1/pendientes') return json(route, 200, []);
  if (u.pathname === '/rest/v1/billetera') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, consulta: u.searchParams, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');

    if (metodo === 'GET') {
      // Como PostgREST: fecha=gte.AAAA-MM-DD y orden por fecha y creado, de lo más nuevo a lo más viejo.
      const desde = (u.searchParams.get('fecha') || '').replace(/^gte\./, '');
      const filas = servidor.filas.filter((f) => !desde || f.fecha >= desde)
        .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado < b.creado ? 1 : -1));
      return json(route, 200, filas);
    }
    if (metodo === 'POST') {
      const nueva = fila(cuerpo);
      servidor.filas.push(nueva);
      return responder([nueva]);
    }
    if (metodo === 'PATCH') {
      const f = servidor.filas.find((x) => x.id === id);
      if (!f) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(f, cuerpo, { actualizado: new Date().toISOString() });
      // numeric sale de PostgREST como número, pero la app también acepta texto: se prueba así.
      return responder([{ ...f, monto: f.monto.toFixed(2) }]);
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
  await p.mouse.move(0, 0); // que el puntero no deje resaltada la última categoría tocada
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.screenshot({ path: `${CAPTURAS}/${nombre}-390-${esquema}.png` });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}
// Los montos llevan un espacio sin corte entre el símbolo y el número: se comparan como espacio normal.
const titulo = (p) => p.locator('main h1').first().innerText().then((t) => t.replace(/\s+/g, ' ').trim(), () => '');
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return titulo(p);
}
async function esperarLlamada(metodo, antes) {
  for (let i = 0; i < 50 && llamadas(metodo).length === antes; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 250));
}
const anotar = (p) => p.getByRole('form', { name: 'Anotar un movimiento' });
const monto = (p) => anotar(p).getByLabel('¿Cuánto?');
/** Escribe el monto y toca la categoría: las dos cosas que hacen falta para anotar. */
async function anotarRapido(p, cuanto, categoria) {
  const antes = llamadas('POST').length;
  await monto(p).fill(cuanto);
  await anotar(p).getByRole('button', { name: categoria, exact: true }).click();
  await esperarLlamada('POST', antes);
}
const textoDe = (loc) => loc.textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim(), () => '');
const dato = (p, bloque, dt) => textoDe(bloque.locator('.cap div').filter({ has: p.locator('dt', { hasText: dt }) }).locator('dd'));

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

  // 1. Abrir /billetera directo, sin movimientos.
  await p.goto(`${url}/billetera`);
  const vacio = `Nada gastado en ${nombreMes(MES)}`;
  revisar((await esperarTitulo(p, vacio)) === vacio, 'la dirección /billetera abre la pantalla, sin movimientos', await titulo(p));
  // textContent y no innerText: la barra va en mayúsculas por CSS.
  revisar((await p.locator('nav.modulos a[aria-current="page"]').textContent())?.trim() === 'Billetera', 'la barra marca Billetera como la pantalla actual');
  const pedido = llamadas('GET')[0];
  revisar(pedido?.permiso === `Bearer ${SESION.access_token}`, 'los movimientos se piden con la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar(pedido?.consulta.get('fecha') === `gte.${VENTANA}`, 'se piden los últimos 12 meses', pedido?.consulta.get('fecha'));
  revisar(await p.getByText(`Nada anotado en ${nombreMes(MES)}.`).isVisible(), 'el resumen del mes dice que no hay nada');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'billetera vacía');
  // En celulares de 360 px de ancho, "Entretenimiento" tiene que caber en su botón.
  await p.setViewportSize({ width: 360, height: 780 });
  const desbordados = await p.locator('.chip').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent));
  revisar(!desbordados.length, 'a 360 px, el nombre de cada categoría cabe en su botón', desbordados.join(', '));
  const lineas = await p.locator('nav.modulos a').evaluateAll((as) => new Set(as.map((a) => Math.round(a.getBoundingClientRect().top))).size);
  revisar(lineas === 1, 'a 360 px, la barra de módulos cabe en una línea', `${lineas} líneas`);
  await p.setViewportSize({ width: 390, height: 844 });
  await capturar(p, 'app-billetera-vacio');

  // 2. Anotar: el monto y un toque en la categoría.
  await anotarRapido(p, '150', 'Comida');
  const primero = llamadas('POST')[0]?.cuerpo;
  revisar(JSON.stringify(primero) === JSON.stringify({ fecha: HOY, tipo: 'gasto', monto: 150, moneda: 'HNL', categoria: 'comida', descripcion: null }),
    'monto y un toque: se guarda como gasto de hoy en lempiras', JSON.stringify(primero));
  revisar((await titulo(p)) === `L 150 gastados en ${nombreMes(MES)}`, 'el título suma lo gastado en el mes', await titulo(p));
  const aviso = anotar(p).getByRole('status');
  // textContent y no innerText: los avisos van en mayúsculas por CSS.
  revisar((await textoDe(aviso)).startsWith('Gasto anotado: L 150.00 en Comida.'), 'avisa qué se anotó', await textoDe(aviso));
  revisar((await monto(p).inputValue()) === '' && await monto(p).evaluate((e) => e === document.activeElement), 'el monto queda vacío y con el foco, listo para el siguiente');

  // 3. Deshacer.
  const borradosAntes = llamadas('DELETE').length;
  await aviso.getByRole('button', { name: 'Deshacer' }).click();
  await esperarLlamada('DELETE', borradosAntes);
  revisar(llamadas('DELETE').length === 1 && (await titulo(p)) === vacio, 'Deshacer lo borra y el título vuelve a cero');
  revisar((await textoDe(aviso)).startsWith('Listo, se quitó.'), 'y lo dice');

  // 4. Montos mal escritos: no se envían.
  const postsAntes = llamadas('POST').length;
  await anotar(p).getByRole('button', { name: 'Salud', exact: true }).click();
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).startsWith('Escribe cuánto fue'), 'sin monto, tocar la categoría pide el monto');
  revisar(await monto(p).evaluate((e) => e === document.activeElement), 'y deja el foco en el monto');
  for (const malo of ['abc', '0', '-5', '1.234', '12,3456']) {
    await monto(p).fill(malo);
    await anotar(p).getByRole('button', { name: 'Salud', exact: true }).click();
  }
  revisar(llamadas('POST').length === postsAntes, 'montos que no sirven no se envían: abc, 0, -5, 1.234 y 12,3456');
  await monto(p).fill('99');
  await monto(p).press('Enter');
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')) === 'Toca una categoría para guardarlo.', 'Enter en el monto explica que falta la categoría');

  // 5. Con coma de miles, con coma decimal y un ingreso.
  await anotarRapido(p, '1,250.75', 'Universidad');
  revisar(llamadas('POST').at(-1)?.cuerpo.monto === 1250.75, '"1,250.75" se lee como 1250.75');
  await anotarRapido(p, '150,5', 'Comida');
  revisar(llamadas('POST').at(-1)?.cuerpo.monto === 150.5, '"150,5" (coma decimal del teclado) se lee como 150.50');
  await anotar(p).getByRole('button', { name: 'Ingreso', exact: true }).click();
  await anotarRapido(p, '8000', 'Trabajo');
  revisar(llamadas('POST').at(-1)?.cuerpo.tipo === 'ingreso', 'un ingreso se guarda como ingreso');
  revisar((await textoDe(aviso)).startsWith('Ingreso anotado: L 8,000.00 en Trabajo.'), 'y el aviso lo dice', await textoDe(aviso));
  revisar((await anotar(p).getByRole('button', { name: 'Gasto', exact: true }).getAttribute('aria-pressed')) === 'true',
    'después vuelve a gasto, para no anotar un gasto como ingreso sin querer');

  // 6. Uno de ayer, con detalle. La fecha se queda y se ve; el detalle no.
  await p.getByText('Fecha, moneda y detalle').click();
  await anotar(p).getByRole('button', { name: 'Ayer', exact: true }).click();
  await anotar(p).getByLabel('Detalle').fill('Bus a la U');
  revisar((await textoDe(p.locator('.anotar summary'))).includes('Ayer') && (await textoDe(p.locator('.anotar summary'))).includes('con detalle'),
    'el resumen plegado avisa que la fecha no es hoy y que hay detalle', await textoDe(p.locator('.anotar summary')));
  await anotarRapido(p, '30', 'Transporte');
  const deAyer = llamadas('POST').at(-1)?.cuerpo;
  revisar(deAyer?.fecha === AYER && deAyer?.descripcion === 'Bus a la U' && deAyer?.categoria === 'transporte', 'la fecha de ayer y el detalle llegan a la base');
  revisar((await anotar(p).getByLabel('Detalle').inputValue()) === '' && (await textoDe(p.locator('.anotar summary'))).includes('Ayer'),
    'el detalle se limpia y la fecha se queda, a la vista');
  await anotar(p).getByRole('button', { name: 'Hoy', exact: true }).click();

  // 7. En dólares: se suma aparte.
  await anotar(p).getByLabel('Moneda').selectOption('USD');
  await anotarRapido(p, '20', 'Compras');
  revisar(llamadas('POST').at(-1)?.cuerpo.moneda === 'USD', 'la moneda llega a la base');
  await anotar(p).getByLabel('Moneda').selectOption('HNL');
  const gastosHNL = 1250.75 + 150.5 + (AYER.startsWith(MES) ? 30 : 0);
  const esperado = `L ${corto(gastosHNL)} y US$ 20 gastados en ${nombreMes(MES)}`;
  revisar((await titulo(p)) === esperado, 'lempiras y dólares se suman aparte, sin convertir', await titulo(p));

  // 8. El resumen del mes.
  const lempiras = p.locator('#resumen .bloque-moneda').first();
  revisar((await textoDe(lempiras.locator('h3'))) === 'Lempiras' && (await p.locator('#resumen .bloque-moneda').count()) === 2, 'con dos monedas, un bloque por moneda');
  revisar((await dato(p, lempiras, 'Gastos')) === `L ${conCentavos(gastosHNL)}` && (await dato(p, lempiras, 'Ingresos')) === 'L 8,000.00'
    && (await dato(p, lempiras, 'Balance')) === `+L ${conCentavos(8000 - gastosHNL)}`, 'gastos, ingresos y balance del mes',
  [await dato(p, lempiras, 'Gastos'), await dato(p, lempiras, 'Ingresos'), await dato(p, lempiras, 'Balance')].join(' | '));
  const filasCat = await lempiras.locator('.cats tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim())));
  revisar(filasCat[0]?.[0] === 'Universidad' && filasCat[0]?.[1] === 'L 1,250.75' && filasCat[0]?.[2] === `${Math.round((1250.75 / gastosHNL) * 100)} %`,
    'por categoría, de mayor a menor, con monto y parte', filasCat.map((f) => f.join(' ')).join(' | '));
  revisar(!filasCat.some((f) => f[0] === 'Trabajo'), 'los ingresos no entran en los gastos por categoría');
  revisar((await lempiras.locator('caption').textContent())?.includes('Gastos por categoría'), 'la tabla tiene título para el lector de pantalla');
  await auditar(p, 'billetera con movimientos');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-billetera');
  await p.locator('#resumen').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await capturar(p, 'app-billetera-resumen');

  // 9. Los movimientos, por día.
  const dias = await p.locator('#movimientos .dia h3').allTextContents();
  revisar(dias[0] === 'Hoy' && (!AYER.startsWith(MES) || dias[1] === 'Ayer'), 'los movimientos van por día: Hoy, Ayer…', dias.join(' | '));
  if (AYER.startsWith(MES)) {
    const bus = p.locator('li.mov').filter({ hasText: 'Bus a la U' });
    revisar((await textoDe(bus.locator('.meta'))) === 'Transporte' && (await textoDe(bus.locator('.mov-m'))) === 'Gasto: −L 30.00',
      'con detalle: el detalle de título, la categoría abajo y el monto con signo', await textoDe(bus.locator('.mov-m')));
  }
  revisar((await textoDe(p.locator('li.mov').filter({ hasText: 'Trabajo' }).locator('.mov-m'))) === 'Ingreso: +L 8,000.00', 'los ingresos llevan +');

  // 10. Editar y borrar.
  await p.getByRole('button', { name: 'Editar: Comida, L 150.50' }).click();
  const editor = p.getByRole('form', { name: 'Editar: Comida' });
  revisar(await editor.getByLabel('¿Cuánto?').evaluate((e) => e === document.activeElement), 'al editar, el foco va al monto');
  await auditar(p, 'editando un movimiento');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-billetera-editar');
  await editor.getByLabel('¿Cuánto?').fill('0');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  revisar((await editor.getByRole('alert').innerText().catch(() => '')).startsWith('Escribe cuánto fue'), 'el editor tampoco acepta un monto que no sirve');
  await editor.getByLabel('¿Cuánto?').fill('175');
  await editor.getByLabel('Categoría').selectOption('salud');
  await editor.getByLabel('Detalle').fill('Farmacia');
  let antes = llamadas('PATCH').length;
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('PATCH', antes);
  const cambio = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(cambio?.monto === 175 && cambio?.categoria === 'salud' && cambio?.descripcion === 'Farmacia', 'los cambios llegan a la base');
  revisar((await textoDe(p.locator('li.mov').filter({ hasText: 'Farmacia' }).locator('.mov-m'))) === 'Gasto: −L 175.00',
    'y se ven en la lista (aunque la base devuelva el monto como texto)');
  await p.getByRole('button', { name: 'Editar: Farmacia, L 175.00' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(llamadas('DELETE').length === 1, 'borrar pide confirmación antes');
  antes = llamadas('DELETE').length;
  await p.getByRole('button', { name: 'Sí, borrar' }).click();
  await esperarLlamada('DELETE', antes);
  revisar(!(await p.locator('li.mov').filter({ hasText: 'Farmacia' }).count()), 'confirmado, se borra');
  // Sin la comida (que pasó a Farmacia y se borró), lo gastado en lempiras baja.
  const gastosFinal = 1250.75 + (AYER.startsWith(MES) ? 30 : 0);
  const esperadoFinal = `L ${corto(gastosFinal)} y US$ 20 gastados en ${nombreMes(MES)}`;
  revisar((await titulo(p)) === esperadoFinal, 'y el título se actualiza', await titulo(p));

  // 11. Errores de la base: nada se pierde y se avisa.
  servidor.fallar = true;
  await anotarRapido(p, '45', 'Otro');
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar') && (await monto(p).inputValue()) === '45',
    'si anotar falla, lo avisa y el monto se queda para reintentar');
  await monto(p).fill('');
  await p.getByRole('button', { name: 'Editar: Universidad, L 1,250.75' }).click();
  const ed2 = p.getByRole('form', { name: 'Editar: Universidad' });
  await ed2.getByLabel('¿Cuánto?').fill('999');
  antes = llamadas('PATCH').length;
  await ed2.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('PATCH', antes);
  revisar((await ed2.getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar'), 'si editar falla, lo avisa');
  await ed2.getByRole('button', { name: 'Cancelar' }).click();
  revisar(await p.getByRole('button', { name: 'Editar: Universidad, L 1,250.75' }).isVisible(), 'y el movimiento queda como estaba');
  servidor.fallar = false;

  // 12. Meses anteriores: los que trae la app, no los más viejos.
  servidor.filas.push(fila({ fecha: `${otroMes(MES, -1)}-15`, tipo: 'gasto', monto: 500, categoria: 'servicios', descripcion: 'Internet' }));
  servidor.filas.push(fila({ fecha: `${otroMes(MES, -12)}-15`, tipo: 'gasto', monto: 777, categoria: 'otro', descripcion: 'Hace más de un año' }));
  await p.reload();
  await esperarTitulo(p, esperadoFinal);
  await p.getByRole('button', { name: `Ver ${nombreMes(otroMes(MES, -1))}` }).click();
  revisar((await textoDe(p.locator('#h-resumen'))).toLowerCase().startsWith(nombreMes(otroMes(MES, -1))), 'el botón lleva al mes anterior', await textoDe(p.locator('#h-resumen')));
  revisar((await dato(p, p.locator('#resumen .bloque-moneda').first(), 'Gastos')) === 'L 500.00' && await p.getByText('Internet').isVisible(),
    'con su resumen y sus movimientos');
  revisar((await titulo(p)) === esperadoFinal, 'el título sigue diciendo lo de este mes');
  revisar(!(await p.getByText('Hace más de un año').count()), 'lo de hace más de 12 meses no se trae');
  await p.getByRole('button', { name: `Ver ${nombreMes(MES)}` }).click();
  revisar((await textoDe(p.locator('#h-resumen'))).toLowerCase().startsWith(nombreMes(MES)), 'y se vuelve al mes actual');

  // 13. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const linea = await textoDe(p.locator('section#billetera .quiet'));
  revisar(linea === `Llevas L ${corto(gastosFinal)} y US$ 20 en gastos este mes; hoy, L 1,250.75 y US$ 20.`, 'Mi Día dice lo gastado en el mes y hoy', linea);
  await auditar(p, 'Mi Día con la billetera');
  await p.getByRole('link', { name: 'Abrir la billetera' }).click();
  await esperarTitulo(p, esperadoFinal);
  revisar(new URL(p.url()).pathname === '/billetera', 'el enlace de Mi Día lleva a la billetera');
  revisar(await p.evaluate(() => document.activeElement?.tagName === 'H1'), 'al cambiar de pantalla, el foco va al título');

  // 14. El atajo del ícono (Android): anotar un gasto sin pasar por Mi Día.
  const manifiesto = await p.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  revisar(manifiesto.shortcuts?.some((s) => s.url === '/billetera' && s.name === 'Anotar un gasto'), 'el manifiesto trae el atajo "Anotar un gasto"');

  // 15. Sin internet: se ve lo guardado y no deja anotar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, esperadoFinal)) === esperadoFinal, 'sin internet: se ve lo guardado');
  revisar(await p.getByText('Sin conexión. Ves lo último guardado; para anotar hace falta internet.').isVisible(), 'sin internet: lo avisa');
  revisar(await anotar(p).getByRole('button', { name: 'Comida', exact: true }).isDisabled(), 'sin internet no deja anotar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 16. Cerrar sesión borra la copia de la billetera.
  await p.reload();
  await esperarTitulo(p, esperadoFinal);
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.billetera.')))), 'cerrar sesión borra la billetera guardada');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla billetera: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
