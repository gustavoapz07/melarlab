// Uso: node herramientas/clientes.js http://localhost:4173
// Prueba la pantalla Clientes de la app ya compilada (npm run build y npm run preview dentro de app/) con la
// tabla clientes de Supabase simulada en memoria dentro del navegador de prueba: agregar rápido y con
// detalles, "toca hoy" y los atrasados, el embudo, "Contacté hoy" y deshacer, editar la etapa, descartar,
// borrar, errores, la línea de Mi Día, sin internet y cerrar sesión. Los negocios son inventados.
// Ninguna llamada sale a supabase.co.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas de la pantalla vacía, con negocios y del editor (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/clientes.js http://localhost:4173');
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
const EN_UNA_SEMANA = fechaLocal(new Date(Date.now() + 7 * 86400000));
const EJEMPLO = JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8'));

const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000010', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();

// ---------- la tabla clientes, simulada en memoria ----------
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
  if (['/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/descanso', '/rest/v1/gym', '/rest/v1/gym_plan', '/rest/v1/comidas', '/rest/v1/lista_deseos']
    .includes(u.pathname)) return json(route, 200, []);
  if (u.pathname === '/rest/v1/clientes') {
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
      const nueva = { id: crypto.randomUUID(), usuario_id: usuario.id, contacto: null, rubro: null, estado: 'prospecto', ultimo_contacto: null,
        proximo_seguimiento: null, notas: null, ...cuerpo, creado: marca, actualizado: marca };
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
const form = (p) => p.getByRole('form', { name: 'Agregar un negocio' });
const negocio = (p) => form(p).getByLabel('Negocio nuevo');
async function agregar(p, nombre) {
  const antes = llamadas('POST').length;
  await negocio(p).fill(nombre);
  await negocio(p).press('Enter');
  await esperarLlamada('POST', antes);
}
const nombres = (p, seccion) => p.locator(`#${seccion} .mov-t`).allTextContents();
const fila = (p, nombre) => p.locator('li.cliente').filter({ has: p.locator('.mov-t', { hasText: nombre }) });
async function tocar(p, loc, metodo = 'PATCH') {
  const antes = llamadas(metodo).length;
  await loc.click();
  await esperarLlamada(metodo, antes);
}
const etapa = (p, nombre) => textoDe(p.locator('dl.embudo div').filter({ has: p.locator('dt', { hasText: nombre }) }).locator('dd'));

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

  // 1. Abrir /clientes directo, sin negocios. Clientes va al final de la barra: tiene que quedar a la vista.
  await p.goto(`${url}/clientes`);
  revisar((await esperarTitulo(p, 'Todavía no hay negocios')) === 'Todavía no hay negocios', 'la dirección /clientes abre la pantalla, sin negocios');
  const barra = await p.locator('nav.modulos').evaluate((nav) => {
    const a = nav.querySelector('[aria-current="page"]').getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return { texto: nav.querySelector('[aria-current="page"]').textContent, visible: a.left >= n.left - 1 && a.right <= n.right + 1 };
  });
  revisar(barra.texto === 'Clientes' && barra.visible, 'la barra marca Clientes y, aunque va al final, queda a la vista');
  revisar(llamadas('GET')[0]?.permiso === `Bearer ${SESION.access_token}`, 'los negocios se piden con la sesión del usuario, para que RLS le dé solo lo suyo');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'clientes vacío');
  await capturar(p, 'app-clientes-vacio');

  // 2. Agregar rápido: escribir y Enter.
  await agregar(p, 'Panadería Lupita');
  const alta = llamadas('POST')[0]?.cuerpo;
  revisar(JSON.stringify(alta) === JSON.stringify({ negocio: 'Panadería Lupita', contacto: null, rubro: null, estado: 'prospecto', proximo_seguimiento: null }),
    'agregar rápido: un prospecto sin seguimiento', JSON.stringify(alta));
  revisar((await titulo(p)) === '1 negocio en seguimiento' && JSON.stringify(await nombres(p, 'etapa-prospecto')) === JSON.stringify(['Panadería Lupita']),
    'el título cuenta y va en Prospecto', await titulo(p));

  // 3. Con contacto, rubro y seguimiento para hoy.
  await p.getByText('Contacto, rubro, etapa y seguimiento').click();
  await form(p).getByLabel('Contacto').fill('Don Mario');
  await form(p).getByLabel('Rubro').fill('ferretería');
  await form(p).getByRole('button', { name: 'Hoy', exact: true }).click();
  await agregar(p, 'Ferretería Central');
  const ferreteria = llamadas('POST').at(-1)?.cuerpo;
  revisar(ferreteria?.contacto === 'Don Mario' && ferreteria?.rubro === 'ferretería' && ferreteria?.proximo_seguimiento === HOY, 'contacto, rubro y seguimiento llegan a la base');
  revisar((await titulo(p)) === 'Toca escribirle a Ferretería Central', 'con seguimiento hoy, el título dice a quién escribirle', await titulo(p));
  revisar((await textoDe(fila(p, 'Ferretería Central'))).includes('Prospecto · ferretería · Don Mario') && (await textoDe(fila(p, 'Ferretería Central'))).includes('Seguimiento: hoy'),
    'en "Toca hoy" dice la etapa, el rubro, el contacto y el seguimiento', await textoDe(fila(p, 'Ferretería Central')));

  // 4. Uno atrasado y en conversación.
  await form(p).getByLabel('Rubro').fill('cafetería');
  await form(p).getByLabel('Contacto').fill('');
  await form(p).getByLabel('Etapa').selectOption('en_conversacion');
  await form(p).getByLabel('Próximo seguimiento').fill(AYER);
  await agregar(p, 'Café El Sol');
  revisar((await titulo(p)) === 'Toca escribirles a 2 negocios' && JSON.stringify(await nombres(p, 'toca-hoy')) === JSON.stringify(['Café El Sol', 'Ferretería Central']),
    'dos para hoy, lo atrasado primero', (await nombres(p, 'toca-hoy')).join(' | '));
  revisar((await textoDe(fila(p, 'Café El Sol'))).includes('Seguimiento atrasado: ayer'), 'el atrasado lo dice');
  revisar((await etapa(p, 'Prospecto')) === '2' && (await etapa(p, 'En conversación')) === '1' && (await etapa(p, 'Cliente')) === '0', 'el embudo cuenta por etapa');
  await auditar(p, 'clientes con negocios');
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await capturar(p, 'app-clientes');

  // 5. Contacté hoy: un toque, con Deshacer.
  await tocar(p, p.getByRole('button', { name: 'Contacté hoy a Ferretería Central' }));
  const contacto = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(JSON.stringify(contacto) === JSON.stringify({ ultimo_contacto: HOY, proximo_seguimiento: EN_UNA_SEMANA, estado: 'contactado' }),
    'anota el contacto de hoy, lo pasa a contactado y el siguiente seguimiento queda en una semana', JSON.stringify(contacto));
  const aviso = p.locator('main > p.aviso[role="status"]');
  revisar((await textoDe(aviso)).startsWith('Ferretería Central: contacto anotado. Próximo seguimiento:'), 'lo avisa', await textoDe(aviso));
  revisar((await titulo(p)) === 'Toca escribirle a Café El Sol' && (await textoDe(fila(p, 'Ferretería Central'))).includes('Último contacto: hoy'),
    'sale de "Toca hoy" y dice el último contacto', await titulo(p));
  await tocar(p, aviso.getByRole('button', { name: 'Deshacer' }));
  const vuelta = llamadas('PATCH').at(-1)?.cuerpo;
  revisar(JSON.stringify(vuelta) === JSON.stringify({ ultimo_contacto: null, proximo_seguimiento: HOY, estado: 'prospecto' }) && (await titulo(p)) === 'Toca escribirles a 2 negocios',
    'Deshacer lo deja como estaba', JSON.stringify(vuelta));
  await tocar(p, p.getByRole('button', { name: 'Contacté hoy a Café El Sol' }));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'en_conversacion', 'si ya está en conversación, no lo devuelve a contactado');

  // 6. La línea de Mi Día.
  await p.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Mi Día' }).click();
  await esperarTitulo(p, EJEMPLO.titular);
  const linea = await textoDe(p.locator('section#negocio li').first());
  revisar(linea.startsWith('Clientes') && linea.includes('Toca escribirle a Ferretería Central.'), 'Mi Día, en Negocio: a quién toca escribirle hoy', linea);
  await auditar(p, 'Mi Día con los clientes');
  await p.getByRole('link', { name: 'Ver los clientes' }).click();
  await esperarTitulo(p, 'Toca escribirle a Ferretería Central');
  revisar(new URL(p.url()).pathname === '/clientes', 'el enlace de Mi Día lleva a los clientes');

  // 7. Editar: Panadería Lupita pasa a cliente, con notas.
  await fila(p, 'Panadería Lupita').getByRole('button', { name: 'Editar: Panadería Lupita' }).click();
  const editor = p.getByRole('form', { name: 'Editar: Panadería Lupita' });
  revisar(await editor.getByLabel('Negocio').evaluate((e) => e === document.activeElement), 'al editar, el foco va al nombre');
  await auditar(p, 'editando un negocio');
  await editor.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await capturar(p, 'app-clientes-editar');
  await editor.getByLabel('Etapa').selectOption('cliente');
  await editor.getByLabel('Notas').fill('Quiere página web y menú en línea.');
  await tocar(p, editor.getByRole('button', { name: 'Guardar' }));
  revisar(llamadas('PATCH').at(-1)?.cuerpo.estado === 'cliente' && JSON.stringify(await nombres(p, 'etapa-cliente')) === JSON.stringify(['Panadería Lupita']),
    'pasa a la sección Cliente');

  // 8. Descartar: va a "Descartados", plegado, y ya no ofrece "Contacté hoy".
  await fila(p, 'Ferretería Central').getByRole('button', { name: 'Editar: Ferretería Central' }).click();
  await p.getByRole('form', { name: 'Editar: Ferretería Central' }).getByLabel('Etapa').selectOption('descartado');
  await tocar(p, p.getByRole('form', { name: 'Editar: Ferretería Central' }).getByRole('button', { name: 'Guardar' }));
  revisar((await titulo(p)) === '2 negocios en seguimiento' && !(await fila(p, 'Ferretería Central').isVisible()), 'descartado, sale de la lista y ya no toca escribirle');
  await p.getByText('Ver los descartados').click();
  revisar(await fila(p, 'Ferretería Central').isVisible() && !(await p.getByRole('button', { name: 'Contacté hoy a Ferretería Central' }).count()),
    'en "Descartados", sin "Contacté hoy"');

  // 9. Borrar, con confirmación.
  await fila(p, 'Ferretería Central').getByRole('button', { name: 'Editar: Ferretería Central' }).click();
  await p.getByRole('button', { name: 'Borrar', exact: true }).click();
  revisar(!llamadas('DELETE').length, 'borrar pide confirmación antes');
  await tocar(p, p.getByRole('button', { name: 'Sí, borrar' }), 'DELETE');
  revisar(!(await fila(p, 'Ferretería Central').count()), 'confirmado, se borra');

  // 10. Errores de la base.
  servidor.fallar = true;
  await tocar(p, p.getByRole('button', { name: 'Contacté hoy a Panadería Lupita' }));
  revisar((await p.locator('main > .alerta').innerText().catch(() => '')).includes('quedó como estaba') && !(await textoDe(fila(p, 'Panadería Lupita'))).includes('Último contacto'),
    'si falla, lo avisa y queda como estaba');
  servidor.fallar = false;

  // 11. Sin internet: se ve lo guardado y no deja cambiar.
  await p.evaluate(() => navigator.serviceWorker.ready);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  revisar((await esperarTitulo(p, '2 negocios en seguimiento')) === '2 negocios en seguimiento', 'sin internet: se ve lo guardado');
  revisar(await negocio(p).isDisabled() && await p.getByRole('button', { name: 'Contacté hoy a Panadería Lupita' }).isDisabled(), 'sin internet no deja agregar ni anotar contactos');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 12. Cerrar sesión borra la copia de los clientes.
  await p.reload();
  await esperarTitulo(p, '2 negocios en seguimiento');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(!(await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('melarlab.clientes.')))), 'cerrar sesión borra los clientes guardados');

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a la tabla clientes: ${servidor.llamadas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
