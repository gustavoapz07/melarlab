// Uso: node herramientas/contenido.js http://localhost:4173
// Prueba la pantalla Contenido de la app ya compilada (npm run build y npm run preview dentro de app/) con la
// tabla contenido de Supabase simulada en memoria dentro del navegador de prueba: anotar ideas rápido y con
// formato, redes y fecha, "toca publicar", pasar a producción y marcar como publicada, el enlace (solo https),
// editar y borrar, errores, guardar la idea del día desde Mi Día, la línea de Mi Día, sin internet y cerrar
// sesión. Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con ideas y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/contenido.js http://localhost:4173');
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
const MANANA = fechaLocal(new Date(Date.now() + 86400000));
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));
// La idea del día de Mi Día, como la escribe la rutina de la mañana.
const IDEA_DEL_DIA = { titulo: 'Tres automatizaciones que me ahorran una hora al día', formato: 'Carrusel', red: 'LinkedIn e Instagram', gancho: 'Lo que hago antes de las 7' };

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000011', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla contenido, simulada en memoria ----------
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

  if (u.pathname === '/rest/v1/mi_dia') return json(route, 200, [{ datos: { ...EJEMPLO, fecha: HOY, idea: IDEA_DEL_DIA } }]);
  if (['/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/descanso', '/rest/v1/gym', '/rest/v1/gym_plan', '/rest/v1/comidas', '/rest/v1/lista_deseos',
    '/rest/v1/clientes'].includes(u.pathname)) return json(route, 200, []);
  if (u.pathname === '/rest/v1/contenido') {
    let cuerpo = null;
    try { cuerpo = JSON.parse(req.postData() || 'null'); } catch { /* sin cuerpo */ }
    servidor.llamadas.push({ metodo, cuerpo, permiso: req.headers().authorization || '' });
    if (servidor.fallar && metodo !== 'GET') return json(route, 500, { code: 'XX000', message: 'Falla simulada' });
    const uno = (req.headers().accept || '').includes('vnd.pgrst.object');
    const responder = (filas) => json(route, metodo === 'POST' ? 201 : 200, uno ? filas[0] : filas);
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const marca = new Date(Date.now() + ++reloj * 1000).toISOString();

    if (metodo === 'GET') return json(route, 200, servidor.filas);
    if (metodo === 'POST') {
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, formato: null, redes: [], estado: 'idea', fecha_publicacion: null, enlace: null,
        ...cuerpo, creado: marca, actualizado: marca };
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
const form = (p) => p.getByRole('form', { name: 'Anotar una idea' });
const idea = (p) => form(p).getByLabel('Idea nueva');
async function anotar(p, texto) {
  const antes = llamadas('POST').length;
  await idea(p).fill(texto);
  await idea(p).press('Enter');
  await esperarLlamada('POST', antes);
}
async function tocar(p, loc, metodo = 'PATCH') {
  const antes = llamadas(metodo).length;
  await loc.click();
  await esperarLlamada(metodo, antes);
}
const ideas = (p, seccion) => p.locator(`#${seccion} .mov-t`).allTextContents();
const fila = (p, texto) => p.locator('li.pieza').filter({ has: p.locator('.mov-t', { hasText: texto }) });

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

  // 1. Abrir /contenido directo, sin nada.
  await p.goto(`${url}/contenido`);
  revisar((await esperarTitulo(p, 'Todavía no hay ideas')) === 'Todavía no hay ideas', 'la dirección /contenido abre la pantalla, sin ideas');
  revisar((await textoDe(p.locator('nav.modulos a[aria-current="page"]'))) === 'Contenido', 'la barra marca Contenido como la pantalla actual');
  revisar(llamadas('GET')[0]?.permiso === `Bearer ${SESION.access_token}`, 'el contenido se pide con la sesión del usuario, para que RLS le dé solo lo suyo');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'contenido vacío');
  await capturar(p, 'app-contenido-vacio');

  // 2. Anotar rápido, y con formato, redes y fecha.
  await anotar(p, 'Antes y después de mi escritorio');
  revisar(JSON.stringify(llamadas('POST')[0]?.cuerpo) === JSON.stringify({ idea: 'Antes y después de mi escritorio', formato: null, redes: [], estado: 'idea', fecha_publicacion: null }),
    'anotar rápido: solo la idea', JSON.stringify(llamadas('POST')[0]?.cuerpo));
  revisar((await titulo(p)) === '1 idea', 'el título cuenta las ideas', await titulo(p));
  await p.getByText('Formato, redes y fecha').click();
  await form(p).getByLabel('Formato').selectOption('reel');
  await form(p).getByRole('button', { name: 'Instagram', exact: true }).click();
  await form(p).getByRole('button', { name: 'TikTok', exact: true }).click();
  revisar((await form(p).getByRole('button', { name: 'TikTok', exact: true }).getAttribute('aria-pressed')) === 'true', 'las redes se eligen con un toque');
  await form(p).getByRole('button', { name: 'Hoy', exact: true }).click();
  await anotar(p, 'Cómo armé MelarLab en una semana');
  const reel = llamadas('POST').at(-1)?.cuerpo;
  revisar(reel?.formato === 'reel' && JSON.stringify(reel?.redes) === JSON.stringify(['tiktok', 'instagram']) && reel?.fecha_publicacion === HOY,
    'formato, redes (en orden fijo) y fecha llegan a la base', JSON.stringify(reel));
  revisar((await titulo(p)) === 'Hoy toca publicar: Cómo armé MelarLab en una semana', 'con fecha de hoy, el título dice qué toca publicar', await titulo(p));
  revisar((await textoDe(fila(p, 'Cómo armé MelarLab').locator('.meta'))) === 'Reel · TikTok y Instagram · Sale: hoy', 'dice formato, redes y cuándo sale',
    await textoDe(fila(p, 'Cómo armé MelarLab').locator('.meta')));
  await form(p).getByRole('button', { name: 'Mañana', exact: true }).click();
  await anotar(p, 'Mi rutina de estudio');

  // 3. Avanzar: de idea a producción, de producción a publicada.
  await tocar(p, p.getByRole('button', { name: 'Pasar a producción: Mi rutina de estudio' }));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'en_produccion' && JSON.stringify(await ideas(p, 'en-produccion')) === JSON.stringify(['Mi rutina de estudio']),
    'pasar a producción la mueve de sección');
  revisar((await textoDe(p.locator('main > p.aviso[role="status"]'))) === 'En producción: Mi rutina de estudio.', 'y lo avisa');
  await auditar(p, 'contenido con ideas');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-contenido');
  await tocar(p, p.getByRole('button', { name: 'Pasar a producción: Cómo armé MelarLab en una semana' }));
  await tocar(p, p.getByRole('button', { name: 'Marcar como publicada: Cómo armé MelarLab en una semana' }));
  const publicada = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(publicada?.estado === 'publicado' && publicada?.fecha_publicacion === HOY, 'marcarla como publicada guarda el estado y la fecha', JSON.stringify(publicada));
  revisar((await titulo(p)) === '1 idea, 1 en producción', 'ya publicada, deja de tocar', await titulo(p));
  revisar((await textoDe(p.locator('main > p.aviso[role="status"]'))).includes('Con Editar le agregas el enlace'), 'y sugiere agregar el enlace');

  // 4. El enlace de la publicación: solo https.
  await p.getByText('Ver lo publicado').click();
  await fila(p, 'Cómo armé MelarLab').getByRole('button', { name: /Editar: Cómo armé/ }).click();
  const editor = p.getByRole('form', { name: /Editar: Cómo armé/ });
  revisar(await editor.getByLabel('Idea').evaluate((e) => e === document.activeElement), 'al editar, el foco va a la idea');
  await auditar(p, 'editando una pieza');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-contenido-editar');
  await editor.getByLabel('Enlace de la publicación').fill('javascript:alert(1)');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  revisar((await editor.getByRole('alert').innerText().catch(() => '')) === 'El enlace tiene que empezar con https://', 'un enlace que no es https no se acepta');
  await editor.getByLabel('Enlace de la publicación').fill('https://www.instagram.com/p/prueba');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  const enlace = fila(p, 'Cómo armé MelarLab').getByRole('link', { name: /Ver la publicación/ });
  revisar((await enlace.getAttribute('href')) === 'https://www.instagram.com/p/prueba' && (await enlace.getAttribute('rel')) === 'noopener noreferrer', 'el enlace se guarda y se abre aparte');

  // 5. Borrar, con confirmación.
  await fila(p, 'Antes y después').getByRole('button', { name: /Editar: Antes y después/ }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(!llamadas('DELETE').length, 'borrar pide confirmación antes');
  await tocar(p, p.getByRole('button', { name: 'Sí, borrar' }), 'DELETE');
  revisar(!(await fila(p, 'Antes y después').count()) && (await titulo(p)) === '0 ideas, 1 en producción', 'confirmado, se borra', await titulo(p));

  // 6. Errores de la base.
  servidor.fallar = true;
  await tocar(p, p.getByRole('button', { name: 'Marcar como publicada: Mi rutina de estudio' }));
  revisar((await p.locator('main > .alerta').innerText().catch(() => '')).includes('quedó como estaba') && JSON.stringify(await ideas(p, 'en-produccion')) === JSON.stringify(['Mi rutina de estudio']),
    'si falla, lo avisa y queda como estaba');
  servidor.fallar = false;

  // 7. Mi Día: guardar la idea del día en un toque, y lo que toca publicar.
  const mananaFila = fila(p, 'Mi rutina de estudio');
  await mananaFila.getByRole('button', { name: /Editar: Mi rutina/ }).click();
  await p.getByRole('form', { name: /Editar: Mi rutina/ }).getByRole('button', { name: 'Hoy', exact: true }).click();
  await tocar(p, p.getByRole('form', { name: /Editar: Mi rutina/ }).getByRole('button', { name: 'Guardar' }));
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const linea = await textoDe(p.locator('section#negocio li').first());
  revisar(linea.startsWith('Contenido') && linea.includes('Hoy toca publicar: Mi rutina de estudio.'), 'Mi Día, en Negocio: lo que toca publicar hoy', linea);
  const antes = llamadas('POST').length;
  await p.getByRole('button', { name: 'Guardar en Contenido' }).click();
  await esperarLlamada('POST', antes);
  const delDia = llamadas('POST').at(-1)?.cuerpo;
  revisar(delDia?.idea === `${IDEA_DEL_DIA.titulo}. Gancho: ${IDEA_DEL_DIA.gancho}` && delDia?.formato === 'carrusel'
    && JSON.stringify(delDia?.redes) === JSON.stringify(['instagram', 'linkedin']) && delDia?.estado === 'idea',
  'la idea del día se guarda en un toque, con el formato y las redes reconocidos', JSON.stringify(delDia));
  revisar((await textoDe(p.locator('section#idea .ver-mas'))).startsWith('Guardada en Contenido'), 'y Mi Día dice que ya está guardada');
  await auditar(p, 'Mi Día con la idea guardada');
  await p.getByRole('link', { name: 'Ver en Contenido' }).click();
  await esperarTitulo(p, 'Hoy toca publicar: Mi rutina de estudio');
  revisar((await ideas(p, 'ideas')).includes(delDia?.idea), 'la idea del día aparece en Contenido');

  // 8. Sin internet: se ve lo guardado y no deja cambiar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, 'Hoy toca publicar: Mi rutina de estudio')) === 'Hoy toca publicar: Mi rutina de estudio', 'sin internet: se ve lo guardado');
  revisar(await idea(p).isDisabled() && await p.getByRole('button', { name: 'Marcar como publicada: Mi rutina de estudio' }).isDisabled(), 'sin internet no deja anotar ni avanzar');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 9. Cerrar sesión borra la copia del contenido.
  await p.reload();
  await esperarTitulo(p, 'Hoy toca publicar: Mi rutina de estudio');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.contenido.')))), 'cerrar sesión borra el contenido guardado');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla contenido: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
