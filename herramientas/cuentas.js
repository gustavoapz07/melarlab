// Uso: node herramientas/cuentas.js http://localhost:4173
// Prueba las pantallas de cuenta de la app ya compilada (npm run build y npm run preview dentro de app/).
// Supabase Auth (y la consulta de Mi Día) se simulan dentro del navegador de prueba: ninguna llamada sale a supabase.co,
// así que no se crean cuentas reales ni se envían correos. El correo y la contraseña son de prueba
// y la contraseña cambia en cada corrida.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Uso: node herramientas/cuentas.js http://localhost:4173');
  process.exit(2);
}

const CORREO = 'prueba@example.com';
const CLAVE_INICIAL = crypto.randomBytes(9).toString('base64url') + 'a1';
const CLAVE_NUEVA = crypto.randomBytes(9).toString('base64url') + 'b2';
const CLAVE_SESION = 'melarlab.sesion';
// Con CAPTURAS=carpeta, guarda una captura de cada pantalla (claro, 390 px).
const CAPTURAS = process.env.CAPTURAS;
const capturar = async (p, nombre) => {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${CAPTURAS}/${nombre}.png` });
};

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

// ---------- Supabase Auth simulado ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = () => Math.floor(Date.now() / 1000);
const usuario = {
  id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: CORREO,
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
  identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
function token(exp) {
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: usuario.id, email: CORREO, role: 'authenticated', aud: 'authenticated', exp, iat: ahora(), session_id: 'prueba' })}.firma-de-prueba`;
}
function sesion(dura = 3600) {
  const exp = ahora() + dura;
  return { access_token: token(exp), token_type: 'bearer', expires_in: dura, expires_at: exp, refresh_token: 'r-' + crypto.randomBytes(6).toString('hex'), user: usuario };
}

const servidor = { clave: CLAVE_INICIAL, sinRed: false, llamadas: [], inesperadas: [], consultasMiDia: [] };

// El Mi Día que "publicó la rutina": el ejemplo ficticio del repositorio, con la fecha de hoy.
const dos = (n) => String(n).padStart(2, '0');
const hoy = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const MI_DIA = { ...JSON.parse(fs.readFileSync(path.join(__dirname, '../modulos/mi-dia/ejemplos/dia-cargado.json'), 'utf8')), fecha: hoy() };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (route, status, cuerpo) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function supabaseSimulado(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  if (servidor.sinRed) return route.abort('internetdisconnected');
  let cuerpo = {};
  try { cuerpo = JSON.parse(req.postData() || '{}'); } catch { /* sin cuerpo */ }
  const llamada = `${req.method()} ${u.pathname}${u.searchParams.get('grant_type') ? '?grant_type=' + u.searchParams.get('grant_type') : ''}`;
  servidor.llamadas.push({ llamada, redirect: u.searchParams.get('redirect_to'), cuerpo });

  if (llamada === 'POST /auth/v1/token?grant_type=password') {
    if (cuerpo.email === CORREO && cuerpo.password === servidor.clave) return json(route, 200, sesion());
    return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (llamada === 'POST /auth/v1/token?grant_type=refresh_token') return json(route, 200, sesion());
  if (llamada === 'POST /auth/v1/signup') return json(route, 200, { ...usuario, email: cuerpo.email, email_confirmed_at: null, confirmation_sent_at: new Date().toISOString() });
  if (llamada === 'POST /auth/v1/recover') return json(route, 200, {});
  if (llamada === 'GET /auth/v1/user') return json(route, 200, usuario);
  if (llamada === 'PUT /auth/v1/user') {
    if (cuerpo.password) servidor.clave = cuerpo.password;
    return json(route, 200, usuario);
  }
  if (llamada === 'POST /auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
  if (llamada === 'GET /rest/v1/pendientes') return json(route, 200, []);
  if (llamada === 'GET /rest/v1/mi_dia') {
    servidor.consultasMiDia.push(req.headers()['authorization'] || '');
    return json(route, 200, [{ datos: MI_DIA }]);
  }
  servidor.inesperadas.push(llamada);
  return json(route, 404, { code: 404, msg: 'no simulado' });
}
const llamo = (texto) => servidor.llamadas.filter((l) => l.llamada === texto);

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
const titulo = (p) => p.locator('h1').first().innerText();
const enlaceDeCorreo = (tipo, s = sesion()) =>
  `${url}/#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=${tipo}`;
// Un enlace del correo siempre carga la página de cero (llega desde otra app).
// Cambiar solo el # en la misma pestaña no recarga, así que se pasa por una página en blanco.
async function abrirEnlace(p, enlace) {
  await p.goto('about:blank');
  await p.goto(enlace);
}
async function esperarTitulo(p, texto) {
  await p.getByRole('heading', { level: 1, name: texto }).waitFor({ timeout: 10000 }).catch(() => {});
  return (await titulo(p)).trim();
}

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route((u) => u.hostname.endsWith('.supabase.co'), supabaseSimulado);
  const p = await ctx.newPage();

  // 1. Sin sesión: pantalla de entrar.
  await p.goto(url);
  revisar((await esperarTitulo(p, 'Entra a MelarLab')) === 'Entra a MelarLab', 'sin sesión se ve "Entra a MelarLab"');
  await auditar(p, 'entrar');

  // 2. Contraseña equivocada.
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Contraseña', { exact: true }).fill('equivocada-123');
  await p.getByRole('button', { name: 'Entrar' }).click();
  const alerta = await p.getByRole('alert').innerText().catch(() => '');
  revisar(alerta === 'Correo o contraseña incorrectos.', 'contraseña equivocada', alerta);
  await auditar(p, 'entrar con error');
  await capturar(p, 'app-cuenta-entrar-error');

  // 3. Mostrar la contraseña.
  const campo = p.getByLabel('Contraseña', { exact: true });
  await p.getByRole('button', { name: 'Mostrar contraseña' }).click();
  revisar((await campo.getAttribute('type')) === 'text', 'el botón Mostrar deja ver la contraseña');
  await p.getByRole('button', { name: 'Mostrar contraseña' }).click();

  // 4. Crear cuenta.
  await p.getByRole('button', { name: 'Crear una cuenta' }).click();
  revisar((await esperarTitulo(p, 'Crea tu cuenta')) === 'Crea tu cuenta', 'pantalla "Crea tu cuenta"');
  revisar(await p.evaluate(() => document.activeElement?.tagName === 'H1'), 'al cambiar de pantalla, el foco va al título');
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Contraseña nueva').fill('corta');
  await p.getByRole('button', { name: 'Crear cuenta' }).click();
  const corta = await p.evaluate(() => document.querySelector('input[autocomplete="new-password"]').validity.tooShort);
  revisar(corta && llamo('POST /auth/v1/signup').length === 0, 'contraseña corta: no se envía');
  await p.getByLabel('Contraseña nueva').fill(CLAVE_INICIAL);
  await p.getByRole('button', { name: 'Crear cuenta' }).click();
  const creada = await p.getByRole('status').filter({ hasText: 'Te enviamos un correo' }).innerText().catch(() => '');
  revisar(creada.includes(CORREO), 'cuenta creada: pide confirmar el correo');
  const alta = llamo('POST /auth/v1/signup')[0];
  revisar(alta?.redirect === `${url}/`, 'el enlace del correo vuelve a la app', alta?.redirect || 'sin redirect_to');
  await auditar(p, 'crear cuenta con mensaje');
  await capturar(p, 'app-cuenta-crear');

  // 5. Enlace de confirmación: entra directo a Mi Día.
  await abrirEnlace(p, enlaceDeCorreo('signup'));
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.locator('.foot-cuenta').isVisible(), 'el enlace de confirmación abre Mi Día');
  revisar(!p.url().includes('access_token'), 'la dirección queda limpia después del enlace', new URL(p.url()).hash || 'sin #');
  revisar((await p.locator('.foot-cuenta .correo').innerText().catch(() => '')) === CORREO, 'el pie muestra el correo de la cuenta');

  // 6. Cerrar sesión.
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  revisar((await esperarTitulo(p, 'Entra a MelarLab')) === 'Entra a MelarLab', 'cerrar sesión vuelve a "Entra a MelarLab"');
  revisar(llamo('POST /auth/v1/logout').length === 1, 'cerrar sesión avisa a Supabase');
  revisar(await p.evaluate((k) => localStorage.getItem(k) === null, CLAVE_SESION), 'cerrar sesión borra la sesión del celular');
  revisar(await p.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('melarlab.mi-dia.'))), 'cerrar sesión borra el Mi Día guardado');

  // 7. Entrar con la contraseña correcta.
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Contraseña', { exact: true }).fill(CLAVE_INICIAL);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.locator('.foot-cuenta').isVisible(), 'entrar con la contraseña correcta abre Mi Día');
  const titular = await p.getByRole('heading', { level: 1, name: MI_DIA.titular }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  revisar(titular, 'Mi Día viene de Supabase: se ve el titular publicado');
  const permiso = servidor.consultasMiDia.at(-1) || '';
  revisar(/^Bearer [\w-]+\.[\w-]+\./.test(permiso), 'Mi Día se pide con la sesión del usuario (RLS)', permiso ? 'Bearer …' : 'sin Authorization');
  await auditar(p, 'Mi Día con sesión');
  await p.reload();
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.locator('.foot-cuenta').isVisible(), 'la sesión sigue al recargar');

  // 8. Sin internet y con el permiso vencido (abrir la app temprano sin red): Mi Día sigue ahí.
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.expires_at = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem(k, JSON.stringify(s));
  }, CLAVE_SESION);
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.locator('.foot-cuenta').isVisible(), 'sin internet y con el permiso vencido, Mi Día se sigue viendo');
  revisar(await p.getByText('Sin conexión. Lo que ves quedó guardado en el celular.').isVisible(), 'aviso de sin conexión en Mi Día');
  servidor.sinRed = false;
  await ctx.setOffline(false);
  const renovacionesAntes = llamo('POST /auth/v1/token?grant_type=refresh_token').length;
  await p.reload();
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
  revisar(llamo('POST /auth/v1/token?grant_type=refresh_token').length > renovacionesAntes, 'al volver la red, el permiso se renueva solo');
  revisar(await p.locator('.foot-cuenta').isVisible(), 'y la sesión sigue');

  // 8b. Cerrar sesión sin internet: no se queda esperando a Supabase.
  servidor.sinRed = true;
  await ctx.setOffline(true);
  const inicio = Date.now();
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  const tardo = Date.now() - inicio;
  revisar((await titulo(p)) === 'Entra a MelarLab' && tardo < 6000, 'cerrar sesión sin internet', `${(tardo / 1000).toFixed(1)} s`);
  revisar(await p.evaluate((k) => localStorage.getItem(k) === null, CLAVE_SESION), 'sin internet, la sesión también se borra del celular');
  servidor.sinRed = false;
  await ctx.setOffline(false);

  // 9. Recuperar la contraseña.
  await p.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  revisar((await esperarTitulo(p, 'Recupera tu contraseña')) === 'Recupera tu contraseña', 'pantalla "Recupera tu contraseña"');
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByRole('button', { name: 'Enviar enlace' }).click();
  const enviado = await p.getByRole('status').filter({ hasText: 'te llegó un enlace' }).innerText().catch(() => '');
  revisar(enviado.length > 0, 'pide el enlace sin decir si la cuenta existe');
  revisar(llamo('POST /auth/v1/recover')[0]?.redirect === `${url}/`, 'el enlace de recuperar vuelve a la app');
  await auditar(p, 'recuperar con mensaje');

  await abrirEnlace(p, enlaceDeCorreo('recovery'));
  revisar((await esperarTitulo(p, 'Crea una contraseña nueva')) === 'Crea una contraseña nueva', 'el enlace de recuperar pide la contraseña nueva');
  await auditar(p, 'contraseña nueva');
  await capturar(p, 'app-cuenta-contrasena-nueva');
  await p.getByLabel('Contraseña nueva').fill(CLAVE_NUEVA);
  await p.getByRole('button', { name: 'Guardar contraseña' }).click();
  await p.getByText('Contraseña actualizada.').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.getByText('Contraseña actualizada.').isVisible(), 'guardar la contraseña nueva abre Mi Día con el aviso');
  revisar(llamo('PUT /auth/v1/user').some((l) => l.cuerpo.password === CLAVE_NUEVA), 'la contraseña nueva llega a Supabase');

  // 10. La contraseña vieja ya no sirve y la nueva sí.
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Contraseña', { exact: true }).fill(CLAVE_INICIAL);
  await p.getByRole('button', { name: 'Entrar' }).click();
  revisar((await p.getByRole('alert').innerText().catch(() => '')) === 'Correo o contraseña incorrectos.', 'la contraseña vieja ya no entra');
  await p.getByLabel('Contraseña', { exact: true }).fill(CLAVE_NUEVA);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.locator('.foot-cuenta').waitFor({ timeout: 10000 }).catch(() => {});
  revisar(await p.locator('.foot-cuenta').isVisible(), 'la contraseña nueva entra');
  await p.getByRole('button', { name: 'Cerrar sesión' }).click();
  await esperarTitulo(p, 'Entra a MelarLab');

  // 11. Enlace vencido o ya usado.
  await abrirEnlace(p, `${url}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await esperarTitulo(p, 'Entra a MelarLab');
  const vencido = await p.getByRole('alert').innerText().catch(() => '');
  revisar(vencido === 'El enlace venció o ya se usó. Pide uno nuevo.', 'enlace vencido: mensaje claro', vencido);
  revisar(!p.url().includes('error'), 'la dirección queda limpia después del error');

  // 12. Entrar sin internet.
  servidor.sinRed = true;
  await ctx.setOffline(true);
  await p.reload();
  await esperarTitulo(p, 'Entra a MelarLab');
  revisar(await p.getByText('Sin conexión. Para entrar hace falta internet.').isVisible(), 'sin internet: avisa que para entrar hace falta');
  await p.getByLabel('Correo').fill(CORREO);
  await p.getByLabel('Contraseña', { exact: true }).fill(CLAVE_NUEVA);
  await p.getByRole('button', { name: 'Entrar' }).click();
  const sinRed = await p.getByRole('alert').innerText().catch(() => '');
  revisar(sinRed === 'Sin conexión. Para esto hace falta internet.', 'sin internet: mensaje al intentar entrar', sinRed);
  await ctx.setOffline(false);
  servidor.sinRed = false;

  // 13. Nada fuera de lo simulado.
  revisar(servidor.inesperadas.length === 0, 'la app solo llamó a lo que se simuló', servidor.inesperadas.join(', ') || 'ninguna otra llamada');
  console.log(`\nLlamadas simuladas a Supabase: ${servidor.llamadas.length}, ninguna salió de la computadora.`);

  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
