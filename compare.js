/* Jam comparison parser + Yard 2.0 regimen */
let ECON = {};
let parsed = null;

const NORMS = { ctr: 6, cart_cr: 23, order_cr: 70, buyout: 80 };

const NM_RE = /\b(\d{7,12})\b/;

function num(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/\s/g, '').replace(',', '.').replace(/%/g, '');
  const m = s.match(/^[\d.,]+/);
  const n = parseFloat(m ? m[0] : s);
  return isNaN(n) ? null : n;
}

const METRIC_PATTERNS = [
  { key: 'ctr', re: /^ctr$/i },
  { key: 'views', re: /^показы$|количество показов/i },
  { key: 'clicks', re: /перешли в карточк|переход.*карточк|количество переходов|^перешли$/i },
  { key: 'cart_cr', re: /конверс.*в корзин|конверс.*корзин|cr\s*1/i },
  { key: 'order_cr', re: /конверс.*в заказ|конверс.*заказ|cr\s*2/i },
  { key: 'buyout', re: /процент выкупа|доля выкупа|выкуп\s*%/i },
  { key: 'price', re: /медианн.*цен|цен.*скидк|минимальн.*цен|максимальн.*цен|средн.*цен|цена покуп/i },
  { key: 'orders', re: /заказали|заказов|количество заказ|товаров заказ/i },
  { key: 'rating', re: /рейтинг/i },
  { key: 'reviews', re: /количество отзыв|отзывов|^отзывы$/i },
  { key: 'position', re: /позиц.*поиск|средн.*позиц/i },
];

const SKIP_LABEL = /^(артикул|предмет|дата|сервис|назван|бренд|категор|номенклатур|период|сравнен|наимен)/i;
const SKIP_COL = /изменен|динамик|к прошл|разница|тренд|^\s*Δ|delta/i;
const HEADER_LABEL = /^(показател|параметр|метрик|показатель|название|предмет)/i;

function normalizeRows(rows) {
  return rows
    .map(r => (Array.isArray(r) ? r : Object.values(r)).map(c => (c == null ? '' : c)))
    .filter(r => r.some(c => String(c).trim()));
}

function matchMetric(label) {
  const t = String(label || '').trim();
  if (!t || SKIP_LABEL.test(t) || SKIP_COL.test(t)) return null;
  for (const m of METRIC_PATTERNS) if (m.re.test(t)) return m.key;
  return null;
}

function extractNm(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(/\.0+$/, '');
  const m = NM_RE.exec(s);
  if (m) return m[1];
  return /^\d{7,12}$/.test(s) ? s : null;
}

function cardId(header, articleIds, idx) {
  if (articleIds?.[idx]) return articleIds[idx];
  const nm = extractNm(header);
  if (nm) return nm;
  const h = String(header || '').trim();
  return h ? h.slice(0, 60) : `col_${idx + 1}`;
}

function findHeaderRow(rows) {
  let best = { idx: 0, score: 0 };
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i].map(c => String(c ?? '').trim());
    const first = row[0];
    if (/^артикул\s*wb$/i.test(first)) continue;
    let score = 0;
    if (HEADER_LABEL.test(first)) score += 40;
    const metricHeaders = row.filter(c => matchMetric(c)).length;
    const nmInRow = row.filter(c => extractNm(c)).length;
    const metricInCol = rows.slice(i + 1, i + 30).filter(r => matchMetric(r[0])).length;
    const hasNmHeader = row.some(c => /артикул/i.test(c));
    score += metricHeaders * 4 + metricInCol + nmInRow;
    if (hasNmHeader) score += 15;
    if (score > best.score) best = { idx: i, score };
  }
  return best.idx;
}

function findArticleIds(rows, headerIdx, colStart, colCount) {
  for (let i = headerIdx; i < Math.min(headerIdx + 25, rows.length); i++) {
    const label = String(rows[i][colStart - 1] ?? rows[i][0] ?? '').toLowerCase();
    if (!/артикул|nm\s*id|nmid/i.test(label)) continue;
    return rows[i].slice(colStart, colStart + colCount).map(v => extractNm(v));
  }
  return null;
}

/** WB export: each row = card, columns = metrics (most common in 2025+ Jam) */
function parseLayoutCardsAsRows(rows) {
  const hi = findHeaderRow(rows);
  const headers = rows[hi].map(c => String(c ?? '').trim());
  let nmCol = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (/артикул\s*wb|артикул\s*wild|nm\s*id/i.test(h)) { nmCol = i; break; }
  }
  if (nmCol < 0) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (/^артикул$/i.test(h) || (/артикул/i.test(h) && !/продав|поставщик/i.test(h))) {
        nmCol = i; break;
      }
    }
  }
  if (nmCol < 0) {
    for (let i = 0; i < headers.length; i++) {
      let cnt = 0;
      for (let r = hi + 1; r < Math.min(hi + 12, rows.length); r++) {
        if (extractNm(rows[r][i])) cnt++;
      }
      if (cnt >= 2) { nmCol = i; break; }
    }
  }
  if (nmCol < 0) return null;

  const metricCols = [];
  headers.forEach((h, i) => {
    if (i === nmCol || SKIP_COL.test(h)) return;
    const mk = matchMetric(h);
    if (mk) metricCols.push({ i, mk });
  });
  if (metricCols.length < 2) return null;

  const nameCol = headers.findIndex(h => /наимен|название тов|товар$/i.test(h));
  const cards = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const nm = extractNm(row[nmCol]);
    if (!nm) continue;
    const metrics = {};
    metricCols.forEach(({ i, mk }) => {
      const n = num(row[i]);
      if (n != null) metrics[mk] = n;
    });
    if (!Object.values(metrics).some(v => v != null)) continue;
    const header = nameCol >= 0 ? String(row[nameCol] || nm).trim() : nm;
    cards.push({ id: nm, header: header || nm, metrics });
  }
  return cards.length ? cards : null;
}

/** Metrics in rows, cards in columns (older / custom templates) */
function parseLayoutMetricsInCols(rows) {
  const hi = findHeaderRow(rows);
  const headers = rows[hi].map(c => String(c ?? '').trim());
  const colStart = HEADER_LABEL.test(headers[0]) || !headers[0] ? 1 : 0;
  const colHeaders = headers.slice(colStart).filter(h => h && !SKIP_COL.test(h));
  const body = rows.slice(hi + 1);
  const articleIds = findArticleIds(rows, hi, colStart, colHeaders.length);

  const metricRows = body.filter(r => matchMetric(r[colStart - 1] ?? r[0])).length;
  if (metricRows < 3) return null;

  const cards = colHeaders.map((h, i) => ({
    id: cardId(h, articleIds, i),
    header: h || articleIds?.[i] || `Карточка ${i + 1}`,
    metrics: {},
  }));
  body.forEach(row => {
    const label = row[colStart - 1] ?? row[0];
    const mk = matchMetric(label);
    if (!mk) return;
    row.slice(colStart).forEach((v, i) => {
      if (i >= cards.length) return;
      const n = num(v);
      if (n != null) cards[i].metrics[mk] = n;
    });
  });
  const out = cards.filter(c => Object.values(c.metrics).some(v => v != null));
  return out.length ? out : null;
}

function parseSheet(rawRows) {
  const rows = normalizeRows(rawRows);
  if (!rows.length) return null;
  return parseLayoutCardsAsRows(rows)
    || parseLayoutMetricsInCols(rows)
    || null;
}

function sheetScore(name, cards) {
  let s = 0;
  const n = name.toLowerCase();
  if (/показател/i.test(n)) s += 100;
  else if (/comparison|сравнен|cards/i.test(n)) s += 80;
  else if (/поисков|запрос/i.test(n)) s += 20;
  else if (/склад|регион|динамик/i.test(n)) s += 5;
  else s += 40;
  s += cards.length * 8 + cards.reduce((a, c) => a + Object.keys(c.metrics).length, 0);
  return s;
}

function parseWorkbook(wb) {
  let best = null;
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const cards = parseSheet(raw);
    if (!cards?.length) continue;
    const score = sheetScore(name, cards);
    if (!best || score > best.score) best = { name, cards, score };
  }
  return best;
}

function debugPreview(wb) {
  const parts = [];
  for (const name of wb.SheetNames.slice(0, 5)) {
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    const rows = normalizeRows(raw).slice(0, 4);
    const preview = rows.map(r => r.slice(0, 5).map(c => String(c).slice(0, 20)).join(' | ')).join(' /// ');
    parts.push(`«${name}»: ${preview || '(пусто)'}`);
  }
  return parts.join('\n');
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const hit = parseWorkbook(wb);
        if (hit) resolve({ cards: hit.cards, sheet: hit.name, sheets: wb.SheetNames });
        else resolve({ cards: null, sheets: wb.SheetNames, preview: debugPreview(wb) });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function bestCompetitors(cards, myId) {
  return cards.filter(c => c.id !== myId);
}

function findBottleneck(m) {
  const issues = [];
  if (m.ctr != null && m.ctr < 4) issues.push({ stage: 'CTR', severity: 'red', text: `CTR ${m.ctr}% — проблема в главном фото и заголовке` });
  else if (m.ctr != null && m.ctr < NORMS.ctr) issues.push({ stage: 'CTR', severity: 'yellow', text: `CTR ${m.ctr}% — ниже цели ${NORMS.ctr}%` });
  if (m.cart_cr != null && m.cart_cr < 18) issues.push({ stage: 'CR корзина', severity: 'red', text: `Конверсия в корзину ${m.cart_cr}% — инфографика и описание` });
  else if (m.cart_cr != null && m.cart_cr < NORMS.cart_cr) issues.push({ stage: 'CR корзина', severity: 'yellow', text: `CR корзина ${m.cart_cr}% — цель ${NORMS.cart_cr}%` });
  if (m.buyout != null && m.buyout < 75) issues.push({ stage: 'Выкуп', severity: 'yellow', text: `Выкуп ${m.buyout}% — цена, ожидания, логистика (не контент)` });
  issues.sort((a, b) => (a.severity === 'red' ? 0 : 1) - (b.severity === 'red' ? 0 : 1));
  return issues[0] || null;
}

function getEcon(nmId) {
  const list = ECON.skus || [];
  return list.find(s => String(s.nm_id) === String(nmId) || String(s.sku).includes(nmId));
}

function buildRegulations(my, comps, bottleneck, econ, marginTarget) {
  const regs = [];
  const best = {};
  ['ctr', 'cart_cr', 'buyout', 'price', 'orders'].forEach(k => {
    const vals = comps.map(c => c.metrics[k]).filter(v => v != null);
    if (vals.length) best[k] = k === 'price' ? Math.min(...vals) : Math.max(...vals);
  });

  // Yard 2.0: economics first
  if (econ) {
    if (econ.is_minus) {
      regs.push({ level: 'ads', tag: 'СТОП РК', text: `SKU в минусе (${fmtRub(econ.profit_w1)} W1). Ярд 2.0: стоп рекламы до исправления экономики. Не масштабировать контент-гонку.` });
    } else if (econ.drr_w1 > 20) {
      regs.push({ level: 'ads', tag: 'Срез РК', text: `ДРР ${econ.drr_w1}% — срезать ставки на 30%, проверить связку остаток↔реклама.` });
    } else if (econ.drr_w1 > 12) {
      regs.push({ level: 'margin', tag: 'ДРР', text: `ДРР ${econ.drr_w1}% — держать в коридоре ≤12% перед масштабом.` });
    }
    if (econ.profit_w1 > 0 && econ.roas_w1 && econ.roas_w1 < 100) {
      regs.push({ level: 'margin', tag: 'ROAS', text: `ROAS ${econ.roas_w1}% < 100 — реклама не окупается, не копировать конкурента в ставках.` });
    }
  }

  if (bottleneck) {
    const tag = bottleneck.severity === 'red' ? '🔴 24-48ч' : '🟡 неделя';
    if (bottleneck.stage === 'CTR') {
      regs.push({ level: bottleneck.severity === 'red' ? 'red' : 'yellow', tag,
        text: `${bottleneck.text}. ТЗ только на главное фото: товар 55-60% кадра, УТП читается на 200×200. Не трогать инфографику пока CTR не вырос.` });
      if (best.ctr && my.metrics.ctr != null && my.metrics.ctr < best.ctr * 0.85) {
        regs.push({ level: 'yellow', tag: '🟡', text: `Лучший CTR у конкурента ${best.ctr}% — снять эталон обложки, не копировать слепо (проверить продажи в Wildbox).` });
      }
    } else if (bottleneck.stage.includes('корзина')) {
      regs.push({ level: bottleneck.severity === 'red' ? 'red' : 'yellow', tag,
        text: `${bottleneck.text}. ТЗ на слайды: проблема→решение→цифры→отзывы. Главное фото не трогать если CTR ок.` });
    } else if (bottleneck.stage === 'Выкуп') {
      regs.push({ level: 'yellow', tag: '⚠ Настя', text: `${bottleneck.text}. Это не ТЗ Марго — разбор цены и ожиданий карточки.` });
    }
  }

  // Price vs competitors with margin guard
  if (my.metrics.price != null && best.price != null && my.metrics.price > best.price * 1.08) {
    const diff = Math.round((my.metrics.price / best.price - 1) * 100);
    if (econ && econ.is_minus) {
      regs.push({ level: 'margin', tag: 'Цена', text: `Цена +${diff}% к лидеру (${my.metrics.price} vs ${best.price} ₽), но SKU в минусе — сначала себестоимость/логистика, не демпинг.` });
    } else {
      regs.push({ level: 'yellow', tag: 'Цена', text: `Цена +${diff}% к конкуренту. Снижать только если маржа ≥${marginTarget}% после скидки. Иначе — усилить УТП, не цену.` });
    }
  }

  if (my.metrics.ctr != null && my.metrics.ctr >= NORMS.ctr && my.metrics.cart_cr != null && my.metrics.cart_cr >= NORMS.cart_cr) {
    regs.push({ level: 'green', tag: '🟢', text: 'Воронка в норме — фокус на масштаб топ-SKU (ДРР+контент), аут-SKU не качать.' });
  }

  // Yard generic
  regs.push({ level: 'margin', tag: 'Ярд', text: 'Решения на P&L, не на обороте. Серые схемы конверсии — запрет. После OOS — лесенка ставок, не max сразу.' });

  if (!regs.length) regs.push({ level: 'green', tag: 'Ок', text: 'Явных провалов нет — сравните позиции и отзывы вручную.' });
  return regs;
}

const fmtRub = n => n == null ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽';

function renderCompare(my, comps) {
  const metrics = ['ctr', 'cart_cr', 'buyout', 'price', 'orders', 'rating', 'reviews'];
  const labels = { ctr: 'CTR %', cart_cr: 'CR корзина %', buyout: 'Выкуп %', price: 'Цена ₽',
    orders: 'Заказы', rating: 'Рейтинг', reviews: 'Отзывы' };
  const thead = document.querySelector('#cmpTable thead');
  const tbody = document.querySelector('#cmpTable tbody');
  thead.innerHTML = '<tr><th>Метрика</th><th class="num">Мой</th>'
    + comps.map(c => `<th class="num">${c.id}</th>`).join('') + '<th>Лидер</th></tr>';
  tbody.innerHTML = metrics.map(k => {
    const mine = my.metrics[k];
    const vals = comps.map(c => c.metrics[k]);
    const valid = vals.filter(v => v != null);
    const leader = valid.length ? (k === 'price' ? Math.min(...valid) : Math.max(...valid)) : null;
    const mineCls = mine != null && leader != null
      ? (k === 'price' ? (mine <= leader * 1.02 ? 'better' : 'worse') : (mine >= leader * 0.95 ? 'better' : 'worse'))
      : '';
    return `<tr><td>${labels[k] || k}</td><td class="num ${mineCls}">${mine ?? '—'}</td>`
      + vals.map(v => `<td class="num">${v ?? '—'}</td>`).join('')
      + `<td class="num">${leader ?? '—'}</td></tr>`;
  }).join('');
}

function analyze() {
  if (!parsed || !parsed.length) return;
  const myId = document.getElementById('myCard').value;
  const my = parsed.find(c => c.id === myId);
  if (!my) return;
  const comps = bestCompetitors(parsed, myId);
  const marginTarget = +document.getElementById('marginTarget').value || 18;
  const bottleneck = findBottleneck(my.metrics);
  const econ = getEcon(myId);

  renderCompare(my, comps);

  document.getElementById('bottleneck').innerHTML = bottleneck
    ? `<div class="reg-item ${bottleneck.severity === 'red' ? 'red' : 'yellow'}">${bottleneck.text}</div>`
    : '<p class="note">Воронка без явных провалов по нормативам</p>';

  document.getElementById('econBox').innerHTML = econ ? `
    <p>Прибыль W1: <strong style="color:${econ.profit_w1 < 0 ? 'var(--red)' : 'var(--green)'}">${fmtRub(econ.profit_w1)}</strong></p>
    <p>ДРР W1: <strong>${econ.drr_w1 ?? '—'}%</strong> · Реклама: ${fmtRub(econ.ad_w1)}</p>
    <p>Остаток: ${econ.stock ?? '—'} · ${econ.is_minus ? '<span style="color:var(--red)">в минусе</span>' : 'ок'}</p>`
    : '<p class="note">Нет данных экономики — положите себестоимость и обновите fetch. Регламент по марже будет без точных цифр.</p>';

  const regs = buildRegulations(my, comps, bottleneck, econ, marginTarget);
  document.getElementById('regulations').innerHTML = regs.map(r => {
    const cls = r.level === 'red' ? 'red' : r.level === 'yellow' ? 'yellow' : r.level === 'green' ? 'green'
      : r.level === 'ads' ? 'ads' : 'margin';
    return `<div class="reg-item ${cls}"><span class="tag">${r.tag}</span>${r.text}</div>`;
  }).join('');

  document.getElementById('results').style.display = 'block';
}

async function onFile(file) {
  document.getElementById('fileInfo').textContent = `Читаю ${file.name}…`;
  try {
    const result = await readFile(file);
    if (!result?.cards?.length) {
      const sheets = result?.sheets?.length ? `Листы: ${result.sheets.join(', ')}.` : '';
      const preview = result?.preview
        ? `<pre style="font-size:.7rem;white-space:pre-wrap;margin-top:8px;max-height:120px;overflow:auto">${result.preview}</pre>`
        : '';
      document.getElementById('fileInfo').innerHTML =
        `${sheets} Не распознан формат.<br>`
        + `Нужен XLSX из ЛК WB → Аналитика → <b>Сравнение карточек</b> → вкладка <b>Показатели</b> → скачать Excel.`
        + preview;
      return;
    }
    parsed = result.cards;
    document.getElementById('fileInfo').textContent = `✓ ${file.name} · лист «${result.sheet}» · ${parsed.length} карточек · метрики: ${
      [...new Set(parsed.flatMap(c => Object.keys(c.metrics)))].join(', ')}`;
    const sel = document.getElementById('myCard');
    sel.innerHTML = parsed.map(c => `<option value="${c.id}">${c.id} — ${c.header}</option>`).join('');
    // auto-select first nm from filename
    const fn = NM_RE.exec(file.name);
    if (fn) {
      const opt = [...sel.options].find(o => o.value === fn[1]);
      if (opt) sel.value = fn[1];
    }
    document.getElementById('setupCard').style.display = 'block';
  } catch (e) {
    document.getElementById('fileInfo').textContent = 'Ошибка: ' + e.message;
  }
}

// events
const drop = document.getElementById('dropZone');
const input = document.getElementById('fileInput');
drop.addEventListener('click', () => input.click());
input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', e => {
  e.preventDefault(); drop.classList.remove('drag');
  if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
});
document.getElementById('btnAnalyze').addEventListener('click', analyze);

// load economics overlay
fetch('data.json').then(r => r.json()).then(d => {
  ECON = d.economics || {};
}).catch(() => {});
