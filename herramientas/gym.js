// Uso: node herramientas/gym.js http://localhost:4173
// Prueba la pantalla Gym de la app ya compilada (npm run build y npm run preview dentro de app/) con las
// tablas gym y gym_plan de Supabase simuladas en memoria dentro del navegador de prueba: armar el plan de
// la semana, "hoy toca", anotar el entreno (la rutina de hoy ya viene puesta), deshacer, datos que no
// sirven, entrenos de otros días, cambiar el plan, la semana de lunes a domingo, editar y borrar, errores,
// la línea de Mi Día, sin internet y cerrar sesión. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con plan y entrenos y del plan (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/gym.js http://localhost:4173');
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
const DESDE = fechaLocal(new Date(Date.now() - 59 * 86400000));
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
/** 1 = lunes … 7 = domingo, como gym_plan. */
const DIA_HOY = ((new Date().getDay() + 6) % 7) + 1;
// El plan de prueba: lunes, miércoles y viernes, y hoy (sea el día que sea) toca Pierna.
const PLAN = { 1: 'Pecho', 3: 'Pierna', 5: 'Espalda', [DIA_HOY]: 'Pierna' };
const DIAS_CON_PLAN = Object.keys(PLAN).length;
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000007', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- las tablas gym y gym_plan, simuladas en memoria ----------
const servidor = { entrenos: [], plan: [], fallar: false, sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const llamadas = (tabla, metodo) => servidor.llamadas.filter((l) => l.tabla === tabla && l.metodo === metodo);
/** id=eq.x, o dia=in.(1,5) */
const filtro = (u, campo) => {
  const v = u.searchParams.get(campo) || '';
  if (v.startsWith('eq.')) return [v.slice(3)];
  if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/"/g, ''));
  return [];
};

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY } }]);
  if (['/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/descanso'].includes(u.pathname)) return json(route, 200, []);
  const tabla = u.pathname.replace('/rest/v1/', '');
  if (tabla === 'gym' || tabla === 'gym_plan') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ tabla, metodo, cuerpo, consulta: u.searchParams, prefer: req.headers().prefer || '', permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const marca = new Date().toISOString();

    if (tabla === 'gym_plan') {
      if (metodo === 'GET') return json(route, 200, [...servidor.plan].sort((a, b) => a.dia - b.dia));
      if (metodo === 'POST') {
        // Upsert por usuario y día (on_conflict=usuario_id,dia), como PostgREST con resolution=merge-duplicates.
        const filas = cuerpo.map((c) => {
          const f = servidor.plan.find((x) => x.dia === c.dia);
          if (f) return Object.assign(f, c, { actualizado: marca });
          const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, ...c, creado: marca, actualizado: marca };
          servidor.plan.push(nueva);
          return nueva;
        });
        return responder(filas);
      }
      if (metodo === 'DELETE') {
        const dias = filtro(u, 'dia').map(Number);
        servidor.plan = servidor.plan.filter((f) => !dias.includes(f.dia));
        return route.fulfill({ status: 204, headers: CORS });
      }
    }
    const id = filtro(u, 'id')[0];
    if (metodo === 'GET') {
      const desde = (u.searchParams.get('fecha') || '').replace(/^gte\./, '');
      const filas = servidor.entrenos.filter((f) => !desde || f.fecha >= desde)
        .sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado < b.creado ? 1 : -1));
      return json(route, 200, filas);
    }
    if (metodo === 'POST') {
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, duracion_min: null, notas: null, ...cuerpo, creado: marca, actualizado: marca };
      servidor.entrenos.push(nueva);
      return responder([nueva]);
    }
    if (metodo === 'PATCH') {
      const f = servidor.entrenos.find((x) => x.id === id);
      if (!f) return json(route, 406, { code: 'PGRST116', message: 'No rows' });
      Object.assign(f, cuerpo, { actualizado: marca });
      return responder([f]);
    }
    if (metodo === 'DELETE') {
      servidor.entrenos = servidor.entrenos.filter((f) => f.id !== id);
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
const anotar = (p) => p.getByRole('form', { name: 'Anotar el entreno' });
const plan = (p) => p.getByRole('form', { name: 'Plan de la semana' });
async function guardarEntreno(p) {
  const antes = llamadas('gym', 'POST').length;
  await anotar(p).getByRole('button', { name: 'Guardar el entreno' }).click();
  await esperarLlamada('gym', 'POST', antes);
}
const bajada = (p) => textoDe(p.locator('main .bajada').first());

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

  // 1. Abrir /gym directo, sin plan ni entrenos.
  await p.goto(`${url}/gym`);
  revisar((await esperarTitulo(p, '0 entrenos esta semana')) === '0 entrenos esta semana', 'la dirección /gym abre la pantalla, sin plan ni entrenos', await titulo(p));
  revisar((await textoDe(p.locator('nav.modulos a[aria-current="page"]'))) === 'Gym', 'la barra marca Gym como la pantalla actual');
  const pedido = llamadas('gym', 'GET')[0];
  revisar(pedido?.permiso === `Bearer ${SESION.access_token}` && llamadas('gym_plan', 'GET')[0]?.permiso === `Bearer ${SESION.access_token}`,
    'entrenos y plan se piden con la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar(pedido?.consulta.get('fecha') === `gte.${DESDE}`, 'se piden los entrenos de los últimos 60 días', pedido?.consulta.get('fecha'));
  revisar(await plan(p).isVisible(), 'sin plan, el formulario del plan viene abierto');
  revisar(!(await p.locator('ol.semana-gym').count()), 'sin plan, no hay semana que mostrar');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'gym vacío');
  await capturar(p, 'app-gym-vacio');

  // 2. Armar el plan: una rutina por día, vacío es descanso.
  for (const [dia, rutina] of Object.entries(PLAN)) await plan(p).getByLabel(DIAS[dia - 1], { exact: true }).fill(rutina);
  let antes = llamadas('gym_plan', 'POST').length;
  await plan(p).getByRole('button', { name: 'Guardar el plan' }).click();
  await esperarLlamada('gym_plan', 'POST', antes);
  const alta = llamadas('gym_plan', 'POST').at(-1);
  revisar(alta?.cuerpo.length === DIAS_CON_PLAN && alta?.consulta.get('on_conflict') === 'usuario_id,dia' && alta?.prefer.includes('merge-duplicates'),
    'el plan se guarda en una sola llamada, que agrega o cambia por día', JSON.stringify(alta?.cuerpo));
  revisar((await titulo(p)) === 'Hoy toca Pierna', 'con plan, el título dice qué toca hoy', await titulo(p));
  revisar((await bajada(p)) === `0 de ${DIAS_CON_PLAN} esta semana.`, 'y cuántos van de los que tocan', await bajada(p));
  revisar((await textoDe(plan(p).getByRole('status'))) === 'Plan guardado.', 'avisa que se guardó el plan');
  const dias = p.locator('ol.semana-gym li');
  revisar((await dias.count()) === 7, 'la semana, de lunes a domingo');
  const deHoy = p.locator('ol.semana-gym li[aria-current="date"]');
  revisar((await textoDe(deHoy.locator('.sr'))) === `${DIAS[DIA_HOY - 1]}: toca Pierna.`, 'hoy está marcado y dice qué toca', await textoDe(deHoy.locator('.sr')));

  // 3. Al volver a abrir, la rutina de hoy ya viene puesta: anotar es un toque.
  await p.reload();
  await esperarTitulo(p, 'Hoy toca Pierna');
  revisar((await anotar(p).getByLabel('¿Qué entrenaste?').inputValue()) === 'Pierna', 'la rutina de hoy ya viene puesta');
  revisar(!(await plan(p).isVisible()), 'con plan, el formulario del plan va plegado');
  await anotar(p).getByRole('button', { name: '1 h', exact: true }).click();
  await guardarEntreno(p);
  const entreno = llamadas('gym', 'POST')[0]?.cuerpo;
  revisar(JSON.stringify(entreno) === JSON.stringify({ fecha: HOY, rutina: 'Pierna', duracion_min: 60, notas: null }), 'el entreno de hoy llega a la base', JSON.stringify(entreno));
  revisar((await titulo(p)) === 'Hoy entrenaste Pierna' && (await bajada(p)) === `1 de ${DIAS_CON_PLAN} esta semana.`, 'el título y la cuenta de la semana cambian', await titulo(p));
  revisar((await textoDe(deHoy.locator('.sr'))) === `${DIAS[DIA_HOY - 1]}: entrenado, Pierna.` && (await textoDe(deHoy.locator('.dia-gym-marca'))) === '✓', 'y hoy queda marcado');
  const aviso = anotar(p).getByRole('status');
  revisar((await textoDe(aviso)).startsWith('Entreno anotado: Pierna, 1 h.'), 'avisa qué se anotó', await textoDe(aviso));

  // 4. Deshacer y volver a anotar.
  antes = llamadas('gym', 'DELETE').length;
  await aviso.getByRole('button', { name: 'Deshacer' }).click();
  await esperarLlamada('gym', 'DELETE', antes);
  revisar((await titulo(p)) === 'Hoy toca Pierna', 'Deshacer lo borra');
  await anotar(p).getByRole('button', { name: 'Pierna', exact: true }).click();
  await anotar(p).getByRole('button', { name: '1 h', exact: true }).click();
  await guardarEntreno(p);
  revisar((await titulo(p)) === 'Hoy entrenaste Pierna', 'con el atajo de la rutina se vuelve a anotar');

  // 5. Datos que no sirven: no se envían.
  const enviados = servidor.llamadas.length;
  await anotar(p).getByLabel('¿Qué entrenaste?').fill('  ');
  await anotar(p).getByRole('button', { name: 'Guardar el entreno' }).click();
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).startsWith('Escribe qué entrenaste'), 'sin rutina, lo pide');
  await anotar(p).getByLabel('¿Qué entrenaste?').fill('Cardio');
  await p.getByText('Fecha, minutos exactos y notas').click();
  await anotar(p).getByLabel('Minutos exactos').fill('45.5');
  await anotar(p).getByRole('button', { name: 'Guardar el entreno' }).click();
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).startsWith('Los minutos van de 1 a 600'), 'minutos con decimales se explican');
  revisar(servidor.llamadas.length === enviados, 'y no se envía nada');

  // 6. Un entreno de ayer, con minutos exactos y notas.
  await anotar(p).getByLabel('Minutos exactos').fill('45');
  await anotar(p).getByRole('button', { name: 'Ayer', exact: true }).click();
  await anotar(p).getByLabel('Notas').fill('Caminadora 5 km');
  await guardarEntreno(p);
  const deAyer = llamadas('gym', 'POST').at(-1)?.cuerpo;
  revisar(deAyer?.fecha === AYER && deAyer?.duracion_min === 45 && deAyer?.rutina === 'Cardio' && deAyer?.notas === 'Caminadora 5 km', 'ayer, con minutos y notas, llega a la base');

  // 7. Cambiar el plan: un día queda de descanso.
  const quitar = [1, 3, 5].find((d) => d !== DIA_HOY);
  await p.getByText('Cambiar el plan').click();
  await plan(p).getByLabel(DIAS[quitar - 1], { exact: true }).fill('');
  antes = llamadas('gym_plan', 'DELETE').length;
  await plan(p).getByRole('button', { name: 'Guardar el plan' }).click();
  await esperarLlamada('gym_plan', 'DELETE', antes);
  revisar(llamadas('gym_plan', 'DELETE').at(-1)?.consulta.get('dia') === `in.(${quitar})`, 'el día que queda vacío se borra del plan', llamadas('gym_plan', 'DELETE').at(-1)?.consulta.get('dia'));
  // El Cardio de ayer cuenta en la semana, salvo que hoy sea lunes (ayer fue la semana pasada).
  const hechos = DIA_HOY > 1 ? 2 : 1;
  revisar((await bajada(p)) === `${hechos} de ${DIAS_CON_PLAN - 1} esta semana.`, 'y la cuenta de la semana se ajusta', await bajada(p));
  revisar((await textoDe(p.locator('ol.semana-gym li').nth(quitar - 1).locator('.sr'))) === `${DIAS[quitar - 1]}: descanso.`, 'ese día pasa a descanso');
  await auditar(p, 'gym con plan y entrenos');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-gym');
  await p.locator('#plan').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await capturar(p, 'app-gym-plan');

  // 8. Los entrenos: editar y borrar.
  const nombres = await p.locator('#entrenos .mov-t').allTextContents();
  revisar(nombres[0] === 'Pierna' && nombres.includes('Cardio'), 'la lista de entrenos, del más reciente al más viejo', nombres.join(' | '));
  await p.getByRole('button', { name: 'Editar: Pierna, hoy' }).click();
  const editor = p.getByRole('form', { name: 'Editar: Pierna, hoy' });
  revisar(await editor.getByLabel('Qué entrenaste').evaluate((e) => e === document.activeElement), 'al editar, el foco va a la rutina');
  await editor.getByLabel('Minutos').fill('75');
  antes = llamadas('gym', 'PATCH').length;
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await esperarLlamada('gym', 'PATCH', antes);
  revisar(llamadas('gym', 'PATCH').at(-1)?.cuerpo.duracion_min === 75 && (await textoDe(p.locator('#entrenos li').first().locator('.mov-m'))) === '1 h 15 min',
    'los cambios llegan a la base y se ven');
  await p.getByRole('button', { name: 'Editar: Cardio, ayer' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  antes = llamadas('gym', 'DELETE').length;
  revisar(antes === 1, 'borrar pide confirmación antes');
  await p.getByRole('button', { name: 'Sí, borrar' }).click();
  await esperarLlamada('gym', 'DELETE', antes);
  revisar(!(await p.locator('#entrenos').getByText('Cardio').count()), 'confirmado, se borra');

  // 9. Errores de la base: nada cambia y se avisa.
  servidor.fallar = true;
  await anotar(p).getByLabel('¿Qué entrenaste?').fill('Brazos');
  await guardarEntreno(p);
  revisar((await anotar(p).getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar') && (await anotar(p).getByLabel('¿Qué entrenaste?').inputValue()) === 'Brazos',
    'si anotar falla, lo avisa y lo escrito se queda');
  if (!(await plan(p).isVisible())) await p.getByText('Cambiar el plan').click();
  await plan(p).getByLabel('Domingo', { exact: true }).fill('Cardio');
  antes = llamadas('gym_plan', 'POST').length;
  await plan(p).getByRole('button', { name: 'Guardar el plan' }).click();
  await esperarLlamada('gym_plan', 'POST', antes);
  revisar((await plan(p).getByRole('alert').innerText().catch(() => '')).includes('No se pudo guardar') && (await bajada(p)) === `1 de ${DIAS_CON_PLAN - 1} esta semana.`,
    'si guardar el plan falla, lo avisa y el plan queda como estaba');
  servidor.fallar = false;

  // 10. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const lineas = await p.locator('section#salud li').allTextContents();
  revisar(lineas.length === 1 && lineas[0].replace(/\s+/g, ' ').includes(`Hoy entrenaste Pierna. Llevas 1 de ${DIAS_CON_PLAN - 1} esta semana.`),
    'Mi Día dice si hoy toca gym y cómo va la semana (sin descanso anotado, solo sale Gym)', lineas.join(' | '));
  await auditar(p, 'Mi Día con el gym');
  await p.getByRole('link', { name: 'Ver el gym' }).click();
  await esperarTitulo(p, 'Hoy entrenaste Pierna');
  revisar(new URL(p.url()).pathname === '/gym', 'el enlace de Mi Día lleva al gym');

  // 11. Sin internet: se ve lo guardado y no deja anotar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, 'Hoy entrenaste Pierna')) === 'Hoy entrenaste Pierna', 'sin internet: se ve lo guardado');
  revisar(await anotar(p).getByRole('button', { name: 'Guardar el entreno' }).isDisabled(), 'sin internet no deja anotar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 12. Cerrar sesión borra la copia del gym y del plan.
  await p.reload();
  await esperarTitulo(p, 'Hoy entrenaste Pierna');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.gym.')))), 'cerrar sesión borra el gym y el plan guardados');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a gym y gym_plan: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
