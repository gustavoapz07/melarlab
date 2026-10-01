// Uso: node herramientas/mi-dia.js http://localhost:4173
// Prueba la pantalla Mi Día de la app ya compilada (npm run build y npm run preview dentro de app/)
// con la tabla mi_dia de Supabase simulada dentro del navegador de prueba: el Mi Día de hoy, uno de
// otro día, todavía ninguno, errores, sin internet, datos raros y cerrar sesión.
// Ninguna llamada sale a supabase.co y los datos son los ficticios del repositorio.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda una captura de cada estado (claro, 390 px).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/mi-dia.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- datos de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const HOY = fechaLocal(new Date());
const AYER = fechaLocal(new Date(Date.now() - 86400000));
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));
const miDia = (fecha, cambios = {}) => ({ ...EJEMPLO, fecha, ...cambios });

// Una sesión de prueba ya guardada en el celular, como si el usuario hubiera entrado antes.
const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();
const CLAVE_MI_DIA = `melarlab.mi-dia.${usuario.id}`;

// ---------- Supabase simulado ----------
const servidor = { estado: 200, filas: [], sinRed: false, consultas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');
  if (req.method() === 'GET' && u.pathname === '/rest/v1/mi_dia') {
    servidor.consultas.push({ permiso: req.headers().authorization || '', apikey: req.headers().apikey || '', consulta: u.searchParams });
    if (servidor.estado !== 200) return json(route, servidor.estado, { code: 'XX000', message: 'Falla simulada' });
    return json(route, 200, servidor.filas);
  }
  // La pantalla Mi Día también trae los pendientes de hoy y la billetera; esta prueba no tiene nada de eso
  // (ver pendientes.js y billetera.js).
  if (req.method() === 'GET' && u.pathname === '/rest/v1/pendientes') return json(route, 200, []);
  if (req.method() === 'GET' && u.pathname === '/rest/v1/billetera') return json(route, 200, []);
  if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
  if (u.pathname === '/auth/v1/token') return json(route, 200, sesion());
  if (u.pathname === '/auth/v1/user') return json(route, 200, usuario);
  servidor.inesperadas.push(`${req.method()} ${u.pathname}`);
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
  await p.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
}
const titular = (p) => p.locator('h1').first().innerText().then((t) => t.trim(), () => '');
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return titular(p);
}
const guardado = (p) => p.evaluate((k) => localStorage.getItem(k), CLAVE_MI_DIA);

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: { cookies: [], origins: [{ origin: url, localStorage: [{ name: CLAVE_SESION, value: JSON.stringify(SESION) }] }] },
  });
  await ctx.route((u) => u.hostname.endsWith('.supabase.co'), supabaseSimulado);
  const p = await ctx.newPage();
  const erroresDePagina = [];
  p.on('pageerror', (e) => erroresDePagina.push(e.message));

  // 1. Todavía no hay ningún Mi Día.
  servidor.filas = [];
  await p.goto(url);
  revisar((await esperarTitulo(p, 'Tu Mi Día llega a las 5:50')) === 'Tu Mi Día llega a las 5:50', 'sin Mi Día publicado: explica cuándo llega');
  revisar(!(await p.getByText('Datos de ejemplo').count()), 'ya no hay datos de ejemplo');
  await auditar(p, 'todavía sin Mi Día');
  await capturar(p, 'app-mi-dia-vacio-390-light');

  // 2. El Mi Día de hoy, recién publicado por la rutina.
  servidor.filas = [{ datos: miDia(HOY) }];
  await p.reload();
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'Mi Día de hoy: se ve el titular publicado');
  revisar(!(await p.getByText('Es el Mi Día del').count()), 'Mi Día de hoy: sin aviso de otro día');
  const c = servidor.consultas.at(-1);
  revisar(c?.permiso === `Bearer ${SESION.access_token}`, 'la consulta lleva la sesión del usuario, para que RLS le dé solo lo suyo');
  revisar(Boolean(c?.apikey), 'la consulta lleva la clave publicable');
  revisar(c?.consulta.get('order') === 'fecha.desc' && c?.consulta.get('limit') === '1', 'pide solo el Mi Día más reciente',
    `order=${c?.consulta.get('order')}, limit=${c?.consulta.get('limit')}`);
  revisar(JSON.parse((await guardado(p)) || '{}').fecha === HOY, 'queda una copia en el celular para verlo sin internet');
  await auditar(p, 'Mi Día de hoy');

  // 3. El más reciente es de otro día (fin de semana, o antes de las 5:50).
  servidor.filas = [{ datos: miDia(AYER, { titular: 'Titular de ayer' }) }];
  await p.reload();
  await esperarTitulo(p, 'Titular de ayer');
  // textContent y no innerText: los avisos van en mayúsculas por CSS.
  const avisoOtroDia = await p.locator('.aviso', { hasText: 'Es el Mi Día del' }).textContent().catch(() => '') || '';
  revisar(avisoOtroDia.includes('Uno nuevo llega de lunes a viernes a las 5:50 AM'), 'Mi Día de otro día: lo avisa', avisoOtroDia);
  await auditar(p, 'Mi Día de otro día');
  await capturar(p, 'app-mi-dia-otro-dia-390-light');

  // 4. Supabase falla, pero hay copia guardada: se ve la copia y se puede reintentar.
  servidor.estado = 500;
  await p.reload();
  await esperarTitulo(p, 'Titular de ayer');
  await p.getByText('No se pudo actualizar Mi Día').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.getByText('No se pudo actualizar Mi Día').isVisible(), 'falla con copia guardada: muestra la copia y lo avisa');
  servidor.estado = 200;
  servidor.filas = [{ datos: miDia(HOY) }];
  await p.getByRole('button', { name: 'Reintentar' }).click();
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'Reintentar trae el Mi Día nuevo');
  revisar(!(await p.getByText('No se pudo actualizar Mi Día').count()), 'y el aviso de falla se va');

  // 5. Sin internet: se abre la copia guardada, sin consultar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  const consultasAntes = servidor.consultas.length;
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'sin internet: se ve el Mi Día guardado');
  revisar(await p.getByText('Sin conexión. Lo que ves quedó guardado en el celular.').isVisible(), 'sin internet: lo avisa');
  revisar(servidor.consultas.length === consultasAntes, 'sin internet no intenta consultar');
  servidor.sinRed = false;
  await ctx.setOffline(false);
  await p.waitForTimeout(1500);
  revisar(servidor.consultas.length > consultasAntes, 'al volver la red, consulta otra vez sola');

  // 6. Sin internet y sin copia guardada (la primera vez).
  await p.evaluate((k) => localStorage.removeItem(k), CLAVE_MI_DIA);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  await esperarTitulo(p, 'No se pudo cargar Mi Día');
  const bajada = await p.locator('main .bajada').innerText().catch(() => '');
  revisar(bajada.includes('Para ver Mi Día por primera vez hace falta internet'), 'sin internet y sin copia: lo explica', bajada);
  revisar(!(await p.getByRole('button', { name: 'Reintentar' }).count()), 'sin internet no ofrece reintentar');
  servidor.sinRed = false;
  await ctx.setOffline(false);
  // Al volver la red consulta sola; se espera a que termine antes del paso siguiente.
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'al volver la red, Mi Día aparece solo');

  // 7. Supabase falla y no hay copia: error con Reintentar.
  await p.evaluate((k) => localStorage.removeItem(k), CLAVE_MI_DIA);
  servidor.estado = 500;
  await p.reload();
  revisar((await esperarTitulo(p, 'No se pudo cargar Mi Día')) === 'No se pudo cargar Mi Día', 'falla sin copia: pantalla de error');
  await auditar(p, 'error al cargar');
  await capturar(p, 'app-mi-dia-error-390-light');
  servidor.estado = 200;
  await p.getByRole('button', { name: 'Reintentar' }).click();
  revisar((await esperarTitulo(p, EJEMPLO.titular)) === EJEMPLO.titular, 'Reintentar desde el error trae Mi Día');

  // 8. Datos raros: nada se ejecuta, lo que no se puede dibujar se descarta y la pantalla no se rompe.
  servidor.filas = [{
    datos: miDia(HOY, {
      titular: '<img src=x onerror="window.__inyectado=1">Titular raro',
      atencion: [{ texto: 'sin título' }, { titulo: 'Enlace peligroso', url: 'javascript:alert(1)' }, 'no es un objeto'],
      eventos_hoy: [{ titulo: 'Hora rota', inicio: '25:99', fin: 'xx' }, { titulo: 'Evento normal', inicio: '09:00', fin: '10:00' }, {}],
      ia: 'no es una lista',
      ubicacion: { nombre: 'Sin coordenadas', lat: 'no' },
    }),
  }];
  await p.reload();
  await esperarTitulo(p, /Titular raro/);
  const raro = await p.evaluate(() => ({
    titular: document.querySelector('h1')?.textContent || '',
    inyectado: 'window.__inyectado' in window && window.__inyectado === 1,
    imagen: Boolean(document.querySelector('main img[src="x"]')),
    atencion: document.querySelectorAll('#atencion li').length,
    enlaceJs: Boolean(document.querySelector('a[href^="javascript:"]')),
    horaRota: [...document.querySelectorAll('.agenda li')].find((li) => li.textContent.includes('Hora rota'))?.querySelector('.when')?.textContent || '',
  }));
  revisar(raro.titular.startsWith('<img') && !raro.inyectado && !raro.imagen, 'el HTML de un titular se muestra como texto, no se ejecuta');
  revisar(raro.atencion === 1 && !raro.enlaceJs, 'atención: descarta lo que no tiene título y el enlace javascript: queda como texto', `${raro.atencion} elementos`);
  revisar(raro.horaRota === 'Todo el día', 'una hora imposible no rompe la agenda: queda como todo el día', raro.horaRota);
  revisar(erroresDePagina.length === 0, 'ningún error de JavaScript en la página', erroresDePagina.slice(0, 2).join(' | '));

  // 9. Cerrar sesión borra el Mi Día guardado.
  servidor.filas = [{ datos: miDia(HOY) }];
  await p.reload();
  await esperarTitulo(p, EJEMPLO.titular);
  revisar(Boolean(await guardado(p)), 'antes de cerrar sesión hay una copia guardada');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.mi-dia.')))), 'cerrar sesión borra el Mi Día guardado');

  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nConsultas simuladas de Mi Día: ${servidor.consultas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
