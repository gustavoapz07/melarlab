// Uso: node herramientas/shot.js pagina.html prefijo  (o una dirección: http://localhost:4173)
// Capturas de página completa a 1280, 768 y 390 px, en claro y oscuro.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [, , file, pre] = process.argv;
  const esUrl = /^https?:\/\//.test(file || '');
  if (!file || !pre || (!esUrl && !fs.existsSync(file))) {
    console.error('Uso: node herramientas/shot.js pagina.html prefijo  (o una dirección http)');
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(path.resolve(pre)), { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const res = [];
  for (const [w, scheme] of [[1280, 'light'], [390, 'light'], [390, 'dark'], [1280, 'dark'], [768, 'light']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme, deviceScaleFactor: w < 500 ? 2 : 1 });
    await p.goto(esUrl ? file : 'file://' + path.resolve(file));
    await p.waitForSelector('h1');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight,
      fuentes: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight)
    }));
    res.push({ w, scheme, ...m });
    await p.screenshot({ path: `${pre}-${w}-${scheme}.png`, fullPage: true });
    await p.close();
  }
  console.log(JSON.stringify(res));
  await b.close();
})();
