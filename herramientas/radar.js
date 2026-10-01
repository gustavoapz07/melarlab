// Uso: node herramientas/radar.js http://localhost:4173
// Prueba la pantalla Radar de la app ya compilada (npm run build y npm run preview dentro de app/) con la
// tabla radar de Supabase simulada en memoria dentro del navegador de prueba: sin ningún Radar, el último
// con sus novedades, la herramienta para probar y la idea de servicio, datos raros (HTML, enlaces que no son
// https, novedades sin título), los radares anteriores, uno viejo, sin internet y cerrar sesión.
// Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía y con un Radar (claro y oscuro, 390 x 844).
const fs = require('fs');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/radar.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- fechas, datos y sesión de prueba ----------
const dos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const haceDias = (n) => fechaLocal(new Date(Date.now() - n * 86400000));
const ULTIMO = haceDias(2);
const ANTERIOR = haceDias(9);

const radar = (fecha, extra = {}) => ({
  fecha,
  datos: {
    fecha,
    generado: '6:52 PM',
    titular: 'La semana en IA: agentes que trabajan solos',
    resumen: 'Tres lanzamientos gratis que te sirven para la agencia, y una herramienta para probar en una hora.',
    novedades: [
      { titulo: 'Un modelo nuevo y gratis', texto: 'Qué es y qué cambió.', gratis: 'Plan gratis con límites', letra_pequena: '50 mensajes al día.',
        aplicacion: 'Para resumir los correos de un cliente.', enlace: 'https://www.anthropic.com/news', fuente: 'anthropic.com' },
      { titulo: '<b>Texto con HTML</b>', texto: '<img src=x onerror=alert(1)>', enlace: 'javascript:alert(1)', fuente: 'un blog' },
      { texto: 'Sin título: no se dibuja.' },
    ],
    probar: { titulo: 'Probar un agente local', texto: 'En menos de una hora.', pasos: ['Instalarlo', 'Darle una tarea', 'Revisar lo que hizo'], enlace: 'https://github.com/' },
    idea_servicio: { titulo: 'Respuestas automáticas para una panadería', texto: 'Un asistente que contesta los pedidos de WhatsApp.' },
    fuentes: ['anthropic.com', 'github.com'],
    ...extra,
  },
});

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000012', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla radar, simulada en memoria (la app solo lee) ----------
const servidor = { radares: [], sinRed: false, llamadas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');
  if (['/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/lista_deseos', '/rest/v1/descanso', '/rest/v1/comidas', '/rest/v1/gym', '/rest/v1/gym_plan',
    '/rest/v1/clientes', '/rest/v1/contenido'].includes(u.pathname) && metodo === 'GET') return json(route, 200, []);
  if (u.pathname === '/rest/v1/radar' && metodo === 'GET') {
    servidor.llamadas.push({ consulta: u.searchParams, permiso: req.headers().authorization || '' });
    return json(route, 200, [...servidor.radares].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, Number(u.searchParams.get('limit') || 99)));
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
const textoDe = (loc) => loc.textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim(), () => '');
const TITULAR = 'La semana en IA: agentes que trabajan solos';

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
  const alertas = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('dialog', (d) => { alertas.push(d.message()); d.dismiss(); });

  // 1. Sin ningún Radar todavía.
  await p.goto(`${url}/radar`);
  revisar((await esperarTitulo(p, 'Tu primer Radar llega el domingo')) === 'Tu primer Radar llega el domingo', 'sin ningún Radar, dice cuándo llega el primero');
  revisar((await textoDe(p.locator('nav.modulos a[aria-current="page"]'))) === 'Radar', 'la barra marca Radar como la pantalla actual');
  const pedido = servidor.llamadas[0];
  revisar(pedido?.permiso === `Bearer ${SESION.access_token}` && pedido?.consulta.get('limit') === '8' && pedido?.consulta.get('order') === 'fecha.desc',
    'se piden los últimos 8 radares, con la sesión del usuario');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'sin Radar');
  await capturar(p, 'app-radar-vacio');

  // 2. El último Radar.
  servidor.radares = [radar(ULTIMO), radar(ANTERIOR, { titular: 'La semana pasada' })];
  await p.reload();
  revisar((await esperarTitulo(p, TITULAR)) === TITULAR, 'el título es el titular del último Radar', await titulo(p));
  revisar((await textoDe(p.locator('main .bajada'))).startsWith('Tres lanzamientos gratis'), 'y el resumen va debajo');
  const novedades = p.locator('#novedades ol.items > li');
  revisar((await novedades.count()) === 2, 'la novedad sin título no se dibuja', String(await novedades.count()));
  const primera = novedades.first();
  revisar((await textoDe(primera)).includes('Para ti') && (await textoDe(primera)).includes('Letra pequeña') && (await textoDe(primera)).includes('Plan gratis con límites · anthropic.com'),
    'cada novedad dice cómo aplicarla, su letra pequeña, si es gratis y la fuente');
  const enlace = primera.getByRole('link');
  revisar((await enlace.getAttribute('href')) === 'https://www.anthropic.com/news' && (await enlace.getAttribute('target')) === '_blank'
    && (await enlace.getAttribute('rel')) === 'noopener noreferrer', 'el enlace a la fuente se abre aparte, sin pasarle nada de la app');

  // 3. Datos raros: se muestran como texto.
  const segunda = novedades.nth(1);
  revisar((await segunda.getByRole('link').count()) === 0, 'un enlace que no es https no se vuelve enlace');
  revisar((await textoDe(segunda.locator('.t'))) === '<b>Texto con HTML</b>' && !(await segunda.locator('b, img').count()), 'el HTML que llega se muestra como texto, nunca se interpreta');
  await p.waitForTimeout(300);
  revisar(!alertas.length, 'nada de lo que llega se ejecuta');

  // 4. Para probar y la idea de servicio.
  revisar(JSON.stringify(await p.locator('#probar ol.pasos li').allTextContents()) === JSON.stringify(['Instalarlo', 'Darle una tarea', 'Revisar lo que hizo']),
    'la herramienta para probar trae sus pasos');
  revisar((await textoDe(p.locator('#servicio'))).includes('Respuestas automáticas para una panadería'), 'y la idea de servicio');
  await auditar(p, 'con un Radar');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-radar');

  // 5. Los radares anteriores.
  const anterior = p.locator('#anteriores').getByRole('button');
  revisar((await anterior.count()) === 1, 'los radares anteriores, uno por semana');
  await anterior.first().click();
  revisar((await titulo(p)) === 'La semana pasada', 'al elegir uno anterior se ve ese', await titulo(p));
  revisar((await textoDe(p.locator('main > p.aviso').first())).startsWith('Es el Radar del'), 'y avisa que no es el último');
  await p.getByRole('button', { name: 'Ver el último' }).click();
  revisar((await titulo(p)) === TITULAR, '"Ver el último" vuelve al de esta semana');

  // 6. Si el último es de hace más de una semana, lo dice.
  servidor.radares = [radar(haceDias(10), { titular: 'Un Radar viejo' })];
  await p.reload();
  await esperarTitulo(p, 'Un Radar viejo');
  revisar((await textoDe(p.locator('main > p.aviso').last())).includes('Uno nuevo llega los domingos a las 6:45 PM'), 'un Radar de hace más de una semana lo avisa');

  // 7. Sin internet: se ve lo guardado.
  servidor.radares = [radar(ULTIMO)];
  await p.reload();
  await esperarTitulo(p, TITULAR);
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, TITULAR)) === TITULAR, 'sin internet: se ve el Radar guardado');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 8. Cerrar sesión borra la copia del Radar.
  await p.reload();
  await esperarTitulo(p, TITULAR);
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.radar.')))), 'cerrar sesión borra el Radar guardado');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nConsultas simuladas a la tabla radar: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
