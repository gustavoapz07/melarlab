// Uso: node herramientas/audit.js pagina.html
// axe-core (WCAG 2.1 AA y buenas prácticas) en claro y oscuro, a 390 y 1280 px, más chequeos propios.
// Si Chromium no está donde lo espera Playwright, indica la ruta con CHROMIUM_PATH.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

(async () => {
  const file = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(file)) {
    console.error('Uso: node herramientas/audit.js pagina.html');
    process.exit(2);
  }
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  let fail = 0;
  for (const [w, scheme] of [[390, 'light'], [390, 'dark'], [1280, 'light'], [1280, 'dark']]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    await p.goto('file://' + file);
    await p.waitForTimeout(300);
    await p.addScriptTag({ content: axe });
    const r = await p.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
    const own = await p.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('scroll horizontal');
      document.querySelectorAll('a').forEach(a => { const h = a.getAttribute('href') || ''; if (!(h.startsWith('https://') || h.startsWith('#'))) out.push('href no https: ' + h); });
      document.querySelectorAll('.idx a').forEach(a => { const r = a.getBoundingClientRect(); if (r.height < 44) out.push('objetivo táctil del índice: ' + r.height + ' px'); });
      const vis = [...document.querySelectorAll('svg.art')].filter(s => getComputedStyle(s).display !== 'none').length;
      if (vis !== 1) out.push('ilustraciones visibles: ' + vis);
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
