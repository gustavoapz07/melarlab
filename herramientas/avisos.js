// Uso: node herramientas/avisos.js http://localhost:4173
// Prueba el aviso de las 6:00 en la app ya compilada (npm run build y npm run preview dentro de app/), con
// Supabase simulado en el navegador de prueba: activarlo y apagarlo desde el pie, lo que se guarda en la tabla
// avisos_push, los errores (sin llave, la base que falla, sin internet), cerrar sesión, el permiso bloqueado,
// el iPhone sin instalar y el service worker mostrando un aviso que llega (entregado con DevTools).
// Chrome sin ventana no puede suscribirse de verdad al servicio de push de Google, así que la suscripción del
// navegador se simula; el cifrado y el envío se prueban aparte (herramientas/webpush.js y supabase/pruebas/avisos.sql).
// Ninguna llamada sale a supabase.co y los datos son de prueba.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
// Con CAPTURAS=carpeta guarda capturas del pie con el aviso apagado y activo (claro y oscuro, 390 x 844).
const crypto = require('crypto');
const fs = require('fs');
const { chromium, devices } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/avisos.js http://localhost:4173');
  process.exit(2);
}
const CAPTURAS = process.env.CAPTURAS;

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- sesión y llave de prueba ----------
const CLAVE_SESION = 'melarlab.sesion';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000013', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.com',
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function sesion() {
  const exp = ahora() + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, role: 'authenticated', aud: 'authenticated', exp, iat: ahora() })}.firma-de-prueba`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-prueba', user: usuario };
}
const SESION = sesion();
const llaveNueva = () => {
  const par = crypto.createECDH('prime256v1');
  par.generateKeys();
  return par.getPublicKey().toString('base64url');
};
const LLAVE = llaveNueva();

// ---------- Supabase simulado: las tablas que lee Mi Día, la llave y avisos_push ----------
const servidor = { llave: LLAVE, sinRed: false, falla: null, altas: [], bajas: [], inesperadas: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');
  if (['/rest/v1/mi_dia', '/rest/v1/pendientes', '/rest/v1/billetera', '/rest/v1/lista_deseos', '/rest/v1/descanso', '/rest/v1/comidas', '/rest/v1/gym',
    '/rest/v1/gym_plan', '/rest/v1/clientes', '/rest/v1/contenido'].includes(u.pathname) && metodo === 'GET') return json(route, 200, []);
  if (u.pathname === '/rest/v1/rpc/llave_avisos' && metodo === 'POST') return json(route, 200, servidor.llave);
  if (u.pathname === '/rest/v1/avisos_push' && metodo === 'POST') {
    servidor.altas.push({ fila: req.postDataJSON(), consulta: u.searchParams, prefer: req.headers().prefer || '', permiso: req.headers().authorization || '' });
    if (servidor.falla === 'guardar') return json(route, 500, { message: 'falla simulada' });
    return route.fulfill({ status: 201, headers: CORS });
  }
  if (u.pathname === '/rest/v1/avisos_push' && metodo === 'DELETE') {
    servidor.bajas.push({ consulta: u.searchParams, permiso: req.headers().authorization || '' });
    if (servidor.falla === 'borrar') return json(route, 500, { message: 'falla simulada' });
    return route.fulfill({ status: 204, headers: CORS });
  }
  if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
  if (u.pathname === '/auth/v1/token') return json(route, 200, sesion());
  if (u.pathname === '/auth/v1/user') return json(route, 200, usuario);
  servidor.inesperadas.push(`${metodo} ${u.pathname}`);
  return json(route, 404, { message: 'no simulado' });
}

// La suscripción del navegador, simulada: queda en localStorage para que sobreviva a recargar la página.
function simularPush() {
  const CLAVE = 'prueba.push';
  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch { return null; } };
  const comoSuscripcion = (d) => d && {
    endpoint: d.endpoint,
    options: { applicationServerKey: Uint8Array.from(d.llave).buffer, userVisibleOnly: true },
    toJSON: () => ({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }),
    unsubscribe: async () => { localStorage.removeItem(CLAVE); localStorage.setItem('prueba.bajas', String(Number(localStorage.getItem('prueba.bajas') || 0) + 1)); return true; },
  };
  if (!('PushManager' in window)) return;
  PushManager.prototype.getSubscription = async function () { return comoSuscripcion(leer()); };
  PushManager.prototype.subscribe = async function (opciones) {
    const d = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/prueba-' + Math.random().toString(36).slice(2),
      p256dh: 'B' + 'A'.repeat(86), auth: 'Q'.repeat(22),
      llave: Array.from(new Uint8Array(opciones.applicationServerKey)), visible: opciones.userVisibleOnly,
    };
    localStorage.setItem(CLAVE, JSON.stringify(d));
    return comoSuscripcion(d);
  };
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
  await p.locator('.foot').scrollIntoViewIfNeeded();
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    await p.screenshot({ path: `${CAPTURAS}/${nombre}-390-${esquema}.png` });
  }
  await p.emulateMedia({ colorScheme: 'light' });
}
const textoDe = (loc) => loc.textContent().then((t) => (t || '').replace(/\s+/g, ' ').trim(), () => '');
const pie = (p) => p.locator('.foot-avisos');
async function esperarPie(p, texto) {
  await pie(p).filter({ hasText: texto }).waitFor({ timeout: 15000 }).catch(() => {});
  return textoDe(pie(p));
}
const bajas = (p) => p.evaluate(() => Number(localStorage.getItem('prueba.bajas') || 0));
const suscrito = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('prueba.push') || 'null'));
const deB64u = (s) => Buffer.from(s, 'base64url');

async function contexto(b, extra = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    storageState: { cookies: [], origins: [{ origin: url, localStorage: [{ name: CLAVE_SESION, value: JSON.stringify(SESION) }] }] },
    ...extra,
  });
  await ctx.route((u) => u.hostname.endsWith('.supabase.co'), supabaseSimulado);
  return ctx;
}

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await contexto(b);
  await ctx.grantPermissions(['notifications'], { origin: url });
  await ctx.addInitScript(simularPush);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));

  // 1. Apagado: el pie lo dice y ofrece activarlo.
  await p.goto(url);
  revisar((await esperarPie(p, 'apagado')).startsWith('Aviso de Mi Día a las 6:00: apagado'), 'el pie dice que el aviso de las 6:00 está apagado', await textoDe(pie(p)));
  const activar = p.getByRole('button', { name: 'Activar el aviso de Mi Día' });
  revisar(await activar.isEnabled(), 'con el botón "Activar"');
  await p.getByRole('button', { name: 'Entendido' }).click({ timeout: 5000 }).catch(() => {}); // el aviso de "sin internet" taparía las capturas
  await auditar(p, 'aviso apagado');
  await capturar(p, 'app-aviso-apagado');

  // 2. Activar: suscribe con la llave de la base y guarda la suscripción, con la sesión del usuario.
  await activar.click();
  revisar((await esperarPie(p, 'activo')).startsWith('Aviso de Mi Día a las 6:00: activo'), 'al activar, el pie dice que está activo', await textoDe(pie(p)));
  const sub = await suscrito(p);
  revisar(Buffer.from(sub?.llave || []).equals(deB64u(LLAVE)) && sub?.visible === true, 'el celular se suscribe con la llave pública de la base y avisos visibles');
  const alta = servidor.altas[0];
  revisar(alta?.fila?.endpoint === sub?.endpoint && alta?.fila?.p256dh === sub?.p256dh && alta?.fila?.auth === sub?.auth && !('usuario_id' in (alta?.fila || {})),
    'la suscripción se guarda en avisos_push (el dueño lo pone la base)', JSON.stringify(alta?.fila));
  revisar(alta?.consulta.get('on_conflict') === 'usuario_id,endpoint' && alta?.prefer.includes('resolution=ignore-duplicates'), 'si ya estaba guardada, no se duplica');
  revisar(alta?.permiso === `Bearer ${SESION.access_token}`, 'con la sesión del usuario');
  revisar(await p.getByRole('button', { name: 'Apagar el aviso de Mi Día' }).isVisible(), 'y ahora ofrece "Apagar"');
  await auditar(p, 'aviso activo');
  await capturar(p, 'app-aviso-activo');

  // 3. Al volver a abrir la app sigue activo, y se asegura de que la base lo tenga.
  const altasAntes = servidor.altas.length;
  await p.reload();
  revisar((await esperarPie(p, 'activo')).includes('activo'), 'al volver a abrir la app sigue activo');
  await p.waitForTimeout(500);
  revisar(servidor.altas.length === altasAntes + 1 && servidor.altas.at(-1).fila.endpoint === sub.endpoint, 'y vuelve a guardar la misma suscripción por si la base la había borrado');

  // 4. También sale en las otras pantallas.
  await p.goto(`${url}/pendientes`);
  revisar((await esperarPie(p, 'activo')).includes('activo'), 'el aviso sale en el pie de las otras pantallas (Pendientes)');

  // 5. Apagar: lo borra de la base y deshace la suscripción del celular.
  await p.getByRole('button', { name: 'Apagar el aviso de Mi Día' }).click();
  revisar((await esperarPie(p, 'apagado')).includes('apagado'), 'al apagar, el pie dice que está apagado');
  revisar(servidor.bajas[0]?.consulta.get('endpoint') === `eq.${sub.endpoint}` && servidor.bajas[0]?.permiso === `Bearer ${SESION.access_token}`,
    'se borra de avisos_push solo este celular, con la sesión');
  revisar((await suscrito(p)) === null && (await bajas(p)) === 1, 'y el celular deja de estar suscrito');

  // 6. Errores: la base sin llave, la base que no guarda, la base que no borra.
  servidor.llave = null;
  await p.getByRole('button', { name: 'Activar el aviso de Mi Día' }).click();
  await p.locator('.foot-error').waitFor({ timeout: 5000 }).catch(() => {});
  revisar((await textoDe(p.locator('.foot-error'))) === 'Los avisos todavía no están listos. Intenta más tarde.', 'sin la llave en la base, lo dice y no suscribe',
    await textoDe(p.locator('.foot-error')));
  revisar((await suscrito(p)) === null, 'y el celular no queda suscrito');
  servidor.llave = LLAVE;
  servidor.falla = 'guardar';
  await p.getByRole('button', { name: 'Activar el aviso de Mi Día' }).click();
  await p.locator('.foot-error').filter({ hasText: 'No se pudo activar' }).waitFor({ timeout: 5000 }).catch(() => {});
  revisar((await textoDe(p.locator('.foot-error'))) === 'No se pudo activar. Intenta de nuevo.' && (await textoDe(pie(p))).includes('apagado'),
    'si la base no guarda la suscripción, lo dice y sigue apagado');
  revisar((await suscrito(p)) === null && (await bajas(p)) === 2, 'y deshace la suscripción del celular (sin la base no llegaría nada)');
  await auditar(p, 'aviso con error');
  servidor.falla = null;
  await p.getByRole('button', { name: 'Activar el aviso de Mi Día' }).click();
  await esperarPie(p, 'activo');
  revisar((await p.locator('.foot-error').count()) === 0, 'al volver a intentar, el error se va');
  servidor.falla = 'borrar';
  await p.getByRole('button', { name: 'Apagar el aviso de Mi Día' }).click();
  await p.locator('.foot-error').waitFor({ timeout: 5000 }).catch(() => {});
  revisar((await textoDe(p.locator('.foot-error'))) === 'No se pudo apagar. Intenta de nuevo.' && (await textoDe(pie(p))).includes('activo') && (await suscrito(p)) !== null,
    'si la base no lo borra, lo dice y sigue activo (no queda a medias)');
  servidor.falla = null;

  // 7. Sin internet el botón no se puede usar.
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.waitForTimeout(300);
  revisar(await p.getByRole('button', { name: 'Apagar el aviso de Mi Día' }).isDisabled(), 'sin internet, el botón queda desactivado');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 8. El service worker muestra el aviso que llega (entregado con DevTools, como lo haría el servicio de push).
  const cdp = await ctx.newCDPSession(p);
  const registros = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => registros.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await p.evaluate(() => navigator.serviceWorker.ready);
  for (let i = 0; i < 20 && !registros.some((r) => !r.isDeleted); i++) await p.waitForTimeout(100);
  const registro = registros.find((r) => !r.isDeleted)?.registrationId;
  const avisosMostrados = () => p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications())
    .map((n) => ({ titulo: n.title, texto: n.body, etiqueta: n.tag, url: n.data?.url, icono: n.icon, insignia: n.badge })));
  /** Entrega un push y devuelve el aviso que quedó con esa etiqueta (espera hasta 3 segundos a que aparezca). */
  async function entregar(datos, etiqueta, texto) {
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: url, registrationId: registro, data: datos });
    for (let i = 0; i < 30; i++) {
      const aviso = (await avisosMostrados()).find((n) => n.etiqueta === etiqueta && (texto === undefined || n.texto === texto));
      if (aviso) return aviso;
      await p.waitForTimeout(100);
    }
    return null;
  }
  revisar(Boolean(registro), 'DevTools encuentra el service worker de la app');
  const n1 = await entregar(JSON.stringify({ titulo: 'Mi Día', texto: 'El calendario amanece en blanco.', url: '/', etiqueta: 'mi-dia' }), 'mi-dia');
  revisar(n1?.titulo === 'Mi Día' && n1?.texto === 'El calendario amanece en blanco.' && n1?.url === '/',
    'un aviso que llega se muestra con su título, su texto y su etiqueta', JSON.stringify(n1));
  revisar(Boolean(n1?.icono?.endsWith('/pwa-192x192.png') && n1?.insignia?.endsWith('/badge-96x96.png')), 'con el ícono de la app y el de la barra de Android');
  const n2 = await entregar(JSON.stringify({ titulo: 'x'.repeat(200), texto: 'Otro', url: 'https://ejemplo.com/robar', etiqueta: 'otra' }), 'otra');
  revisar(n2?.titulo?.length === 80 && n2?.url === '/', 'un título larguísimo se corta y una dirección de otro sitio se cambia por la app',
    JSON.stringify({ largo: n2?.titulo?.length, url: n2?.url }));
  const n3 = await entregar('esto no es JSON', 'melarlab');
  revisar(n3?.titulo === 'MelarLab', 'un aviso ilegible igual se muestra (MelarLab), como piden los navegadores', JSON.stringify(n3));
  const n4 = await entregar(JSON.stringify({ titulo: 'Mi Día', texto: 'El de mañana', etiqueta: 'mi-dia', url: '//ejemplo.com' }), 'mi-dia', 'El de mañana');
  const conEtiqueta = (await avisosMostrados()).filter((n) => n.etiqueta === 'mi-dia');
  revisar(conEtiqueta.length === 1 && n4?.url === '/', 'el aviso nuevo de Mi Día reemplaza al anterior, y "//otro-sitio" tampoco pasa', JSON.stringify(conEtiqueta));

  // 9. Cerrar sesión apaga el aviso en este celular.
  const bajasAntes = servidor.bajas.length;
  await p.goto(url);
  await esperarPie(p, 'activo');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await p.getByRole('heading', { level: 1, name: 'Entra a MelarLab' }).waitFor({ timeout: 10000 }).catch(() => {});
  revisar(servidor.bajas.length === bajasAntes + 1 && (await suscrito(p)) === null, 'al cerrar sesión, se borra de la base y el celular deja de estar suscrito');
  revisar((await p.getByRole('heading', { level: 1 }).first().innerText().catch(() => '')) === 'Entra a MelarLab', 'y la sesión se cierra');

  // 10. Permiso bloqueado en el navegador.
  const ctxBloqueado = await contexto(b);
  await ctxBloqueado.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }));
  const pb = await ctxBloqueado.newPage();
  await pb.goto(url);
  revisar((await esperarPie(pb, 'bloqueados')).startsWith('Los avisos están bloqueados'), 'con el permiso negado, explica dónde volver a darlo', await textoDe(pie(pb)));
  revisar((await pie(pb).getByRole('button').count()) === 0, 'y no ofrece un botón que no serviría');
  await ctxBloqueado.close();

  // 11. iPhone en Safari, sin instalar: los avisos piden la app instalada.
  const { defaultBrowserType: _tipo, ...iphone } = devices['iPhone 13'];
  const ctxIphone = await contexto(b, { ...iphone, deviceScaleFactor: 2 });
  const pi = await ctxIphone.newPage();
  await pi.goto(url);
  revisar((await esperarPie(pi, 'instala la app')).startsWith('Para el aviso de las 6:00, instala la app'), 'en iPhone sin instalar, explica que hay que instalarla', await textoDe(pie(pi)));
  await pi.getByRole('button', { name: 'Entendido' }).first().click({ timeout: 3000 }).catch(() => {});
  await auditar(pi, 'iPhone sin instalar');
  await ctxIphone.close();

  revisar(errores.length === 0, 'ningún error de JavaScript en la página', errores.slice(0, 2).join(' | '));
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nAltas y bajas simuladas en avisos_push: ${servidor.altas.length} y ${servidor.bajas.length}, ninguna salió de la computadora.`);
  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
