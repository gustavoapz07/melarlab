// Uso: node herramientas/audit.js pagina.html  (o una dirección: http://localhost:4173)
// axe-core (WCAG 2.1 AA y buenas prácticas) en claro y oscuro, a 390 y 1280 px, más chequeos propios.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

(async () => {
  const objetivo = process.argv[2] || '';
  const esUrl = /^https?:\/\//.test(objetivo);
  const file = path.resolve(objetivo);
  if (!objetivo || (!esUrl && !fs.existsSync(file))) {
    console.error('Uso: node herramientas/audit.js pagina.html  (o una dirección http)');
    process.exit(2);
  }
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let fail = 0;
  for (const [w, scheme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    await p.goto(esUrl ? objetivo : 'file://' + file);
    await p.waitForSelector('h1');
    await p.waitForTimeout(300);
    await p.evaluate(axe); // evaluate y no addScriptTag: la CSP de la app bloquea scripts en línea
    const r = await p.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
    const own = await p.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('scroll horizontal');
      document.querySelectorAll('a').forEach(a => { const h = a.getAttribute('href') || ''; if (!(h.startsWith('https://') || h.startsWith('#'))) out.push('href no https: ' + h); });
      document.querySelectorAll('.idx a').forEach(a => { const r = a.getBoundingClientRect(); if (r.height < 44) out.push('objetivo táctil del índice: ' + r.height + ' px'); });
      const vis = [...document.querySelectorAll('svg.art')].filter(s => getComputedStyle(s).display !== 'none').length;
      if (document.querySelector('svg.art') && vis !== 1) out.push('ilustraciones visibles: ' + vis);
      if (/—/.test(document.body.innerText)) out.push('raya larga en el texto');
      return out;
    });
    const v = r.violations.map(x => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`);
    console.log(`${w} ${scheme}: axe ${r.violations.length} violaciones, ${r.passes.length} pasan; propios: ${own.length ? own.join('; ') : 'ok'}`);
    v.forEach(x => console.log('   - ' + x));
    fail += r.violations.length + own.length;
    await p.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
