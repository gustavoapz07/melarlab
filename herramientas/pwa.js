// Uso: node herramientas/pwa.js http://localhost:4173
// Prueba la app ya compilada (npm run build y npm run preview dentro de app/):
// que se pueda instalar, que funcione sin internet y que los avisos de instalación salgan en Android y iPhone.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const url = process.argv[2];
if (!/^https?:\/\//.test(url || '')) {
  console.error('Uso: node herramientas/pwa.js http://localhost:4173');
  process.exit(2);
}

let fallas = 0;
const revisar = (ok, texto, detalle = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${texto}${detalle ? ': ' + detalle : ''}`);
  if (!ok) fallas++;
};

(async () => {
  const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const b = await chromium.launch(opciones);

  // 1. Instalable: manifiesto, íconos y service worker.
  // Perfil normal y temporal: en incógnito Chrome nunca ofrece instalar.
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'melarlab-pwa-'));
  const ctx = await chromium.launchPersistentContext(perfil, { ...opciones, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto(url);
  await p.waitForSelector('h1');
  const sw = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { activo: Boolean(reg.active), alcance: reg.scope };
  });
  revisar(sw.activo, 'service worker activo', sw.alcance);
  await p.getByText('Lista para usar sin internet.').waitFor({ timeout: 10000 }).then(
    () => revisar(true, 'aviso "Lista para usar sin internet"'),
    () => revisar(false, 'aviso "Lista para usar sin internet"', 'no apareció'));

  // Accesibilidad con los avisos a la vista (instalar y "lista sin internet"), en claro y oscuro.
  await p.addScriptTag({ content: axe });
  for (const esquema of ['light', 'dark']) {
    await p.emulateMedia({ colorScheme: esquema });
    const r = await p.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
    const visibles = await p.evaluate(() => ({ toast: Boolean(document.querySelector('.toast')), instalar: Boolean([...document.querySelectorAll('.aviso button')].length) }));
    revisar(r.violations.length === 0, `axe con avisos a la vista (${esquema})`,
      r.violations.map((v) => `${v.id} x${v.nodes.length}`).join(', ') || `aviso flotante: ${visibles.toast}, botones de aviso: ${visibles.instalar}`);
  }
  await p.emulateMedia({ colorScheme: 'light' });

  const manifiesto = await p.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.href;
    if (!href) return null;
    const m = await (await fetch(href)).json();
    const iconos = await Promise.all(m.icons.map(async (i) => {
      const img = new Image();
      img.src = new URL(i.src, href).href;
      await img.decode().catch(() => {});
      return { ...i, real: `${img.naturalWidth}x${img.naturalHeight}` };
    }));
    return { ...m, icons: iconos };
  });
  revisar(Boolean(manifiesto), 'manifiesto enlazado');
  if (manifiesto) {
    revisar(manifiesto.display === 'standalone', 'se abre como app (display standalone)');
    revisar(manifiesto.lang === 'es' && Boolean(manifiesto.name && manifiesto.short_name), 'nombre e idioma', `${manifiesto.name}, ${manifiesto.lang}`);
    for (const i of manifiesto.icons) revisar(i.sizes === i.real, `ícono ${i.src} (${i.purpose})`, `declara ${i.sizes}, mide ${i.real}`);
    revisar(manifiesto.icons.some((i) => i.purpose === 'maskable'), 'ícono adaptable para Android');
  }
  const apple = await p.evaluate(async () => {
    const href = document.querySelector('link[rel="apple-touch-icon"]')?.href;
    if (!href) return 'sin enlace';
    const img = new Image();
    img.src = href;
    await img.decode().catch(() => {});
    return `${img.naturalWidth}x${img.naturalHeight}`;
  });
  revisar(apple === '180x180', 'ícono de iPhone', apple);

  const cdp = await ctx.newCDPSession(p);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  revisar(installabilityErrors.length === 0, 'Chrome la considera instalable',
    installabilityErrors.map((e) => e.errorId).join(', ') || 'sin errores');
  await cdp.detach(); // con la sesión abierta, la simulación sin internet no se aplica

  // 2. Sin internet: recargar sin red y que todo siga ahí, fuentes incluidas.
  await ctx.setOffline(true);
  const redCortada = await p.evaluate(() => fetch('/prueba-sin-red?' + Date.now()).then(() => false, () => true));
  revisar(redCortada, 'la red está cortada de verdad durante la prueba');
  await p.reload();
  await p.waitForSelector('h1', { timeout: 10000 }).catch(() => {});
  const sinRed = await p.evaluate(async () => {
    await document.fonts.ready;
    return {
      titular: document.querySelector('h1')?.textContent || '',
      secciones: document.querySelectorAll('section').length,
      aviso: [...document.querySelectorAll('.aviso')].map((a) => a.textContent).join(' | '),
      fuentes: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`).sort(),
    };
  });
  revisar(sinRed.titular.length > 0 && sinRed.secciones > 0, 'abre sin internet', `"${sinRed.titular.slice(0, 40)}…", ${sinRed.secciones} secciones`);
  revisar(sinRed.aviso.includes('Sin conexión'), 'aviso de sin conexión', sinRed.aviso);
  revisar(sinRed.fuentes.length === 4, 'las 4 fuentes cargan sin internet', sinRed.fuentes.join(', '));
  await ctx.setOffline(false);
  await p.reload();
  await p.waitForSelector('h1');
  const conRed = await p.evaluate(() => [...document.querySelectorAll('.aviso')].map((a) => a.textContent).join(' | '));
  revisar(!conRed.includes('Sin conexión'), 'el aviso se va al volver la conexión');
  await ctx.close();
  fs.rmSync(perfil, { recursive: true, force: true });

  // 3. iPhone: sin aviso automático, así que la app explica cómo instalarla, y el aviso se puede cerrar.
  const iphone = await b.newContext({ ...devices['iPhone 13'] });
  const pi = await iphone.newPage();
  await pi.goto(url);
  await pi.waitForSelector('h1');
  const ayuda = pi.locator('.aviso', { hasText: 'Agregar a pantalla de inicio' });
  revisar(await ayuda.isVisible(), 'iPhone: explica cómo instalarla');
  await ayuda.getByRole('button', { name: 'Entendido' }).click();
  await pi.reload();
  await pi.waitForSelector('h1');
  revisar(!(await ayuda.isVisible()), 'iPhone: el aviso cerrado no vuelve a salir');
  await iphone.close();

  // 4. Ya instalada: no debe pedir instalarla otra vez.
  const instalada = await b.newContext({ ...devices['iPhone 13'] });
  await instalada.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const ps = await instalada.newPage();
  await ps.goto(url);
  await ps.waitForSelector('h1');
  revisar((await ps.locator('.aviso', { hasText: 'Agregar a pantalla de inicio' }).count()) === 0, 'instalada: sin aviso de instalar');
  await instalada.close();

  await b.close();
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden');
  process.exit(fallas ? 1 : 0);
})();
