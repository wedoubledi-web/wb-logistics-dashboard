let DATA = null;
let state = { brand: '', q: {}, period: 'yesterday', dateFrom: '', dateTo: '', tab: 'today' };

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const rub = n => (n == null || n === 0) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const rubDec = n => n == null ? '—' : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
const pct = n => n == null ? '—' : (typeof n === 'number' && n > 1 ? n.toFixed(0) : (n * 100).toFixed(0)) + '%';
const pct2 = n => n == null ? '—' : Number(n).toFixed(2) + '%';
const num = n => (n == null || n === 0) ? '—' : Math.round(n).toLocaleString('ru-RU');

const trend = (v, label) => {
  if (v == null) return '<span class="trend flat">—</span>';
  const cls = v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
  const sym = v > 0 ? '↑' : v < 0 ? '↓' : '→';
  return `<span class="trend ${cls}">${sym} ${Math.abs(v)}% ${label || ''}</span>`;
};

const delta = (v, suffix = '%') => {
  if (v == null) return '<span class="trend flat">—</span>';
  const cls = v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
  const sym = v > 1 ? '↑' : v < -1 ? '↓' : '→';
  return `<span class="trend ${cls}">${sym} ${v}${suffix}</span>`;
};

function badge(st, label) { return `<span class="badge-s b-${st}">${label}</span>`; }
function zoneBadge(z) {
  const m = { green: 'Зелёная', yellow: 'Жёлтая', red: 'Красная' };
  return `<span class="z-${z}">${m[z] || z}</span>`;
}
function whTags(wh) {
  if (!wh || !Object.keys(wh).length) return '—';
  return '<div class="wh-tags">' + Object.entries(wh).map(([k, v]) =>
    `<span class="wh-tag">${k} ${v}</span>`).join('') + '</div>';
}
function daysCell(now, after) {
  if (now == null) return '—';
  if (after == null) return `<span class="z-red">${now}д</span>`;
  return `<span class="z-red">${now}д</span> → <span class="z-green">${after}д</span>`;
}
function filterBrand(list) {
  if (!state.brand) return list;
  return list.filter(s => s.brand === state.brand);
}
function setGuide(id, title, steps, sub) {
  const el = document.getElementById('guide-' + id);
  if (!el) return;
  el.innerHTML = `<h3>${title}</h3><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>${sub ? `<div class="sub">${sub}</div>` : ''}`;
}

function focusHtml(items) {
  if (!items.length) return '<p class="note">Нет пунктов</p>';
  return items.map(f => `<div class="focus-item"><div class="focus-dot ${f.level}"></div>
    <div><strong>${f.title}</strong> · ${f.sku}<br><span style="color:var(--muted)">${f.action}</span></div></div>`).join('');
}

function periodBounds() {
  const ps = getPeriodStats();
  if (!ps) return null;
  return {
    from: ps.from || state.dateFrom,
    to: ps.to || state.dateTo,
    label: ps.label || `${state.dateFrom} — ${state.dateTo}`,
  };
}

function prevPeriodRange(from, to) {
  const df = new Date(from + 'T12:00:00');
  const dt = new Date(to + 'T12:00:00');
  const len = Math.round((dt - df) / 86400000) + 1;
  const prevTo = new Date(df);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (len - 1));
  return [prevFrom.toISOString().slice(0, 10), prevTo.toISOString().slice(0, 10)];
}

function getPeriodCompare() {
  const ps = getPeriodStats();
  const bounds = periodBounds();
  if (!ps || !bounds) return null;
  if (state.period !== 'custom' && DATA.daily?.presets?.[state.period]) {
    const p = DATA.daily.presets[state.period];
    return { cur: ps, prev: p.compare, label: p.compare_label || 'прошлый период',
      chg_rev: p.chg_revenue_pct, chg_ord: p.chg_orders_pct };
  }
  const [pFrom, pTo] = prevPeriodRange(bounds.from, bounds.to);
  const prevRows = (DATA.daily?.daily || []).filter(r => r.date >= pFrom && r.date <= pTo);
  const prev = sumDaily(prevRows);
  const chg = v => prev && v ? Math.round((ps[v] - prev[v]) / prev[v] * 1000) / 10 : null;
  return { cur: ps, prev, label: `${pFrom} — ${pTo}`, chg_rev: chg('revenue'), chg_ord: chg('orders') };
}

function sumSkuPeriod(nmId, from, to) {
  const row = DATA.sku_series?.skus?.[String(nmId)];
  if (!row?.days) return { orders: 0, revenue: 0, sales: 0, ad: 0, drr: 0, buyout: 0 };
  let orders = 0, revenue = 0, sales = 0, ad = 0;
  for (const [d, v] of Object.entries(row.days)) {
    if (d >= from && d <= to) {
      orders += v.o || 0;
      revenue += v.r || 0;
      sales += v.s || 0;
      ad += v.ad || 0;
    }
  }
  return {
    orders, revenue, sales, ad,
    drr: revenue ? Math.round(ad / revenue * 1000) / 10 : 0,
    buyout: orders ? Math.round(sales / orders * 1000) / 10 : 0,
  };
}

function yardZoneFor(s) {
  if (s.orders === 0 && s.orders_prev >= 3) return 'red';
  if (s.drr > 20 || (s.ad > 500 && s.orders === 0)) return 'red';
  if (s.orders_chg_pct != null && s.orders_chg_pct < -15) return 'yellow';
  if (s.drr > 12) return 'yellow';
  if (s.buyout && s.buyout < 70 && s.orders >= 5) return 'yellow';
  return 'green';
}

function buildAllSkuPeriod() {
  const bounds = periodBounds();
  if (!bounds || !DATA.sku_series?.available) return [];
  const [pFrom, pTo] = prevPeriodRange(bounds.from, bounds.to);
  const rnpMap = {};
  (DATA.rnp?.skus || []).forEach(s => { rnpMap[s.nm_id] = s; });
  const econMap = {};
  (DATA.economics?.skus || []).forEach(s => { econMap[s.nm_id] = s; });
  const stockMap = {};
  (DATA.skus_all || []).forEach(s => { stockMap[s.nm_id] = s; });

  return Object.values(DATA.sku_series.skus).map(row => {
    const cur = sumSkuPeriod(row.nm_id, bounds.from, bounds.to);
    const prev = sumSkuPeriod(row.nm_id, pFrom, pTo);
    const ordersChg = prev.orders > 0
      ? Math.round((cur.orders - prev.orders) / prev.orders * 100)
      : (cur.orders > 0 ? 100 : null);
    const salesChg = prev.sales > 0
      ? Math.round((cur.sales - prev.sales) / prev.sales * 100)
      : (cur.sales > 0 ? 100 : null);
    const st = stockMap[row.nm_id] || {};
    const ec = econMap[row.nm_id] || {};
    const s = {
      nm_id: row.nm_id,
      sku: row.sku || row.nm_id,
      brand: row.brand,
      orders: cur.orders,
      orders_prev: prev.orders,
      orders_chg_pct: ordersChg,
      revenue: cur.revenue,
      sales: cur.sales,
      sales_prev: prev.sales,
      sales_chg_pct: salesChg,
      buyout_pct: cur.buyout,
      drr: cur.drr,
      ad: cur.ad,
      stock: st.stock,
      days_now: st.days_now,
      is_minus: ec.is_minus,
      profit_w1: ec.profit_w1,
    };
    s.yard_zone = yardZoneFor({ ...s, orders_prev: prev.orders });
    s.grow_action = ordersChg >= 15 ? 'Масштабировать — спрос растёт' : '';
    s.decline_action = ordersChg <= -15 ? 'Разбор карточки / цена / отзывы' : '';
    return s;
  }).filter(s => s.orders > 0 || s.orders_prev >= 2 || s.ad > 100);
}

function renderGuides() {
  const b = periodBounds();
  const pl = b ? `<b>${b.label}</b>` : 'выбранный период';
  const w1 = DATA.rnp?.week_current || '—';
  setGuide('today', 'С чего начать', [
    'Светофор — есть ли пожар по кабинету',
    `KPI за ${pl} — выручка, заказы, ДРР`,
    'Быстрые задачи ниже → полный список на вкладке <b>Фокус</b>',
  ], 'Период сверху влияет на все вкладки');
  setGuide('focus', 'Куда смотреть в первую очередь', [
    '🔴 Срочно — стоп рекламы, дефицит, просадка кабинета',
    '🟡 Внимание — просели заказы, низкий выкуп',
    '🟢 Масштабировать — растущие SKU',
  ], `За период ${pl}`);
  setGuide('rnp', 'Динамика кабинета', [
    'Сравни текущий и прошлый период — выручка и заказы',
    'Таблица «Растут» — кандидаты на усиление',
    'Полная таблица SKU — зоны и ДРР по артикулам',
  ], `Период: ${pl}`);
  setGuide('str', 'STR — кто просел по спросу', [
    'Слева: заказы упали ≥15% vs прошлый период',
    'Справа: кто растёт — можно дожать рекламой',
    'Выкупы смотри отдельно (лаг 7–14 дн)',
  ], `Период: ${pl}`);
  setGuide('minus', 'Экономика SKU', [
    'Сначала «В минусе» — стоп/срез по action',
    '«Залежи» — реклама при нуле продаж',
    'P&L считается за неделю W1 (' + w1 + '), не зависит от фильтра дат',
  ], 'Нужна себестоимость в xlsx для точной прибыли');
  setGuide('ads', 'Реклама', [
    '1. Слив — минус + реклама → стоп РК',
    '2. ДРР >15% или CPO высокий → срез ставок',
    '3. Кампании без SKU — привязать артикул',
  ], `KPI W1 + графики 30д · fullstats API`);
  setGuide('stock', 'Остатки и запас', [
    '1. Красная таблица — срочно, мало дней запаса',
    '2. «Куда везти» — топ складов по отгрузке',
    '3. Полная таблица — оборачиваемость и ИЛ',
  ], `Цель запаса ${DATA.meta?.target_days || 35} дн`);
  setGuide('plan', 'План отгрузки', [
    'Статус SKU — дефицит / ок / избыток',
    'Колонка «Отгр.» — сколько везти в ближайшую партию',
    '«Куда» — склады по регламенту S-002',
  ], `Партия: ${fmt(DATA.meta?.plan_batch)} шт · ${DATA.meta?.plan_sku} SKU`);
  setGuide('funnel', 'Воронка и выкуп', [
    'Низкий выкуп — цена, отзывы, контент карточки',
    'Таблица — заказы → выкупы за период ' + pl,
  ], 'Выкуп = выкупы / заказы за тот же период');
  setGuide('warehouses', 'Склады', [
    'Остатки — где лежит товар сейчас',
    'План отгрузки — куда везти следующую партию',
    'География — откуда заказы (30д)',
  ], '');
  setGuide('stop', 'Стоп-лист', [
    'SKU в минусе, избытке или заморозке',
    'Не довозить и не лить рекламу без решения',
  ], '');
}

function qfilter(list, key, fields = ['sku']) {
  const q = state.q[key] || '';
  let out = list;
  if (state.brand) out = out.filter(s => s.brand === state.brand);
  if (!q) return out;
  return out.filter(s => fields.some(f => String(s[f] || s.nm_id || '').toLowerCase().includes(q)));
}

function getDailyRows() {
  return (DATA.daily?.daily || []).filter(r =>
    (!state.dateFrom || r.date >= state.dateFrom) && (!state.dateTo || r.date <= state.dateTo));
}

function sumDaily(rows) {
  const rev = rows.reduce((a, r) => a + r.revenue, 0);
  const ords = rows.reduce((a, r) => a + r.orders, 0);
  const sold = rows.reduce((a, r) => a + r.sales, 0);
  const ad = rows.reduce((a, r) => a + r.ad, 0);
  return {
    revenue: rev, orders: ords, sales: sold, ad,
    drr: rev ? Math.round(ad / rev * 1000) / 10 : 0,
    avg_check: ords ? Math.round(rev / ords) : 0,
    buyout_pct: ords ? Math.round(sold / ords * 1000) / 10 : 0,
  };
}

function getPeriodStats() {
  const d = DATA.daily;
  if (!d?.available) return null;
  if (state.period !== 'custom' && d.presets?.[state.period]) {
    const p = d.presets[state.period];
    return { ...p.stats, chg_revenue_pct: p.chg_revenue_pct, chg_orders_pct: p.chg_orders_pct,
      chg_sales_pct: p.chg_sales_pct, compare_label: p.compare_label, label: p.label,
      from: p.from, to: p.to };
  }
  const rows = getDailyRows();
  if (!rows.length) return null;
  const s = sumDaily(rows);
  return { ...s, label: `${state.dateFrom} — ${state.dateTo}`, from: state.dateFrom, to: state.dateTo,
    chg_revenue_pct: null, compare_label: '' };
}

function drawLineChart(el, rows, keys, colors) {
  if (!rows.length) { el.innerHTML = '<p class="note">Нет данных</p>'; return; }
  const W = el.clientWidth || 400, H = 200, pad = { t: 12, r: 12, b: 28, l: 44 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const all = rows.flatMap(r => keys.map(k => r[k] || 0));
  const max = Math.max(...all, 1);
  const step = iw / Math.max(rows.length - 1, 1);
  const pt = (i, v) => [pad.l + i * step, pad.t + ih - (v / max) * ih];
  const lines = keys.map((k, ki) => {
    const d = rows.map((r, i) => `${i ? 'L' : 'M'}${pt(i, r[k] || 0).join(',')}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${colors[ki]}" stroke-width="2.5" stroke-linecap="round"/>`;
  }).join('');
  const dots = rows.map((r, i) => keys.map((k, ki) => {
    const [x, y] = pt(i, r[k] || 0);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${colors[ki]}"/>`;
  }).join('')).join('');
  const labels = rows.filter((_, i) => i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1)
    .map(r => {
      const i = rows.indexOf(r);
      return `<text x="${pad.l + i * step}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#9ca3af">${r.date.slice(5)}</text>`;
    }).join('');
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${lines}${dots}${labels}</svg>`;
}

function drawBarChart(el, rows, key, colorFn) {
  if (!rows.length) { el.innerHTML = '<p class="note">Нет данных</p>'; return; }
  const W = el.clientWidth || 400, H = 200, pad = { t: 12, r: 8, b: 28, l: 36 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(...rows.map(r => r[key] || 0), 1);
  const bw = iw / rows.length * 0.65, gap = iw / rows.length;
  const bars = rows.map((r, i) => {
    const h = ((r[key] || 0) / max) * ih;
    const x = pad.l + i * gap + (gap - bw) / 2;
    const y = pad.t + ih - h;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${colorFn(r)}"/>`;
  }).join('');
  const labels = rows.map((r, i) => {
    if (i % Math.ceil(rows.length / 7) !== 0 && i !== rows.length - 1) return '';
    return `<text x="${pad.l + i * gap + gap / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#9ca3af">${r.date.slice(8)}</text>`;
  }).join('');
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bars}${labels}</svg>`;
}

function drawDualBarChart(el, rows) {
  if (!rows.length) { el.innerHTML = '<p class="note">Нет данных</p>'; return; }
  const W = el.clientWidth || 400, H = 180, pad = { t: 12, r: 8, b: 28, l: 36 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxV = Math.max(...rows.map(r => r.views || 0), 1);
  const maxC = Math.max(...rows.map(r => r.clicks || 0), 1);
  const gap = iw / rows.length;
  const bw = gap * 0.28;
  const bars = rows.map((r, i) => {
    const x0 = pad.l + i * gap + gap * 0.1;
    const hv = ((r.views || 0) / maxV) * ih;
    const hc = ((r.clicks || 0) / maxC) * ih;
    return `<rect x="${x0}" y="${pad.t + ih - hv}" width="${bw}" height="${hv}" rx="2" fill="#93c5fd"/>
      <rect x="${x0 + bw + 2}" y="${pad.t + ih - hc}" width="${bw}" height="${hc}" rx="2" fill="#2563eb"/>`;
  }).join('');
  const labels = rows.map((r, i) => {
    if (i % Math.ceil(rows.length / 7) !== 0 && i !== rows.length - 1) return '';
    return `<text x="${pad.l + i * gap + gap / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#9ca3af">${r.date.slice(8)}</text>`;
  }).join('');
  const legend = `<text x="${pad.l}" y="10" font-size="10" fill="#93c5fd">■ показы</text>
    <text x="${pad.l + 70}" y="10" font-size="10" fill="#2563eb">■ клики</text>`;
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${legend}${bars}${labels}</svg>`;
}

function updateRangeLabel() {
  const el = document.getElementById('rangeLabel');
  if (!el) return;
  const ps = getPeriodStats();
  if (ps) el.textContent = `${ps.from || state.dateFrom} — ${ps.to || state.dateTo}`;
  else if (state.dateFrom) el.textContent = `${state.dateFrom} — ${state.dateTo}`;
}

async function loadData() {
  try {
    const r = await fetch('data.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw 0;
    DATA = await r.json();
    const badge = document.getElementById('srcBadge');
    const m = DATA.meta;
    const asOf = m.brief_as_of || m.snap_date;
    const daysOld = asOf ? Math.floor((Date.now() - new Date(asOf)) / 86400000) : 99;
    if (daysOld > 1) {
      badge.className = 'badge stale';
      badge.textContent = `⚠ API ${asOf} (${daysOld}д)`;
      badge.title = 'Нажми «Обновить» на localhost или запусти fetch';
    } else {
      badge.className = 'badge live';
      badge.textContent = `● API ${asOf}`;
    }
    const d = DATA.daily;
    if (d?.available) {
      document.getElementById('dateTo').max = d.as_of;
      document.getElementById('dateFrom').max = d.as_of;
      const minD = d.daily[0]?.date;
      if (minD) {
        document.getElementById('dateFrom').min = minD;
        document.getElementById('dateTo').min = minD;
      }
      syncDatesFromPeriod();
    }
  } catch (e) {
    document.getElementById('srcBadge').className = 'badge demo';
    document.getElementById('srcBadge').textContent = 'нет data.json';
    return;
  }
  const brands = [...new Set(DATA.skus_all.map(s => s.brand).filter(Boolean))].sort();
  const sel = document.getElementById('brandFilter');
  sel.innerHTML = '<option value="">Все бренды</option>';
  brands.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  updateRangeLabel();
  render();
}

async function refreshFromApi() {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true;
  btn.textContent = '⏳ API…';
  try {
    const r = await fetch('/api/refresh', { method: 'POST' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'refresh failed');
    await loadData();
    btn.textContent = '✓ Готово';
  } catch (e) {
    await loadData();
    btn.textContent = '↻ Обновить';
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      alert('На GitHub Pages API недоступен — данные обновляются при публикации.\n\nЛокально: python3 Дашборд/serve.py → кнопка «Обновить»\n\nИли: python3 scripts/wb_manager_fetch.py && publish_dashboard.py');
    } else {
      alert('Ошибка обновления: ' + (e.message || e));
    }
  }
  setTimeout(() => { btn.textContent = '↻ Обновить'; btn.disabled = false; }, 2000);
}

function renderToday() {
  const d = DATA.daily;
  const ps = getPeriodStats();
  const hero = document.getElementById('heroBanner');
  const sem = document.getElementById('semaphore');

  if (!d?.available || !ps) {
    hero.innerHTML = '<div class="title">Нет дневных данных</div><div class="sub">Запустите daily-brief/fetch.py</div>';
    sem.innerHTML = '';
    document.getElementById('kpiToday').innerHTML = '';
    return;
  }

  const periodLabel = state.period === 'yesterday' ? 'Вчера' : state.period === '7d' ? 'За 7 дней' : state.period === '30d' ? 'За 30 дней' : ps.label;
  hero.innerHTML = `<div class="title">${periodLabel}: выручка ${rub(ps.revenue)}, ${fmt(ps.orders)} заказов</div>
    <div class="sub">${ps.chg_revenue_pct != null ? trend(ps.chg_revenue_pct, 'к ' + (ps.compare_label || 'прошлому')) : `выкуп ${ps.buyout_pct || '—'}% · ДРР ${ps.drr}%`}</div>`;

  const alerts = d.alerts || [];
  if (alerts.length) {
    const a = alerts[0];
    sem.className = 'semaphore ' + a.level;
    sem.innerHTML = `<div class="dot"></div><div><strong>Светофор</strong> · ${a.text}</div>`;
    sem.style.display = 'flex';
  } else {
    sem.className = 'semaphore ok';
    sem.innerHTML = '<div class="dot"></div><div><strong>Светофор</strong> · критичных отклонений нет</div>';
    sem.style.display = 'flex';
  }

  const e = DATA.economics?.cabinet || {};
  document.getElementById('kpiToday').innerHTML = `
    <div class="kpi-card"><span class="icon">₽</span><div class="label">Выручка</div>
      <div class="value">${rub(ps.revenue)}</div>${ps.chg_revenue_pct != null ? trend(ps.chg_revenue_pct, '') : ''}</div>
    <div class="kpi-card"><span class="icon">📦</span><div class="label">Заказов</div>
      <div class="value">${fmt(ps.orders)}</div>${ps.orders_cancelled ? `<div class="hint">отмен ${ps.orders_cancelled}</div>` : ''}</div>
    <div class="kpi-card"><span class="icon">%</span><div class="label">Выкуп</div>
      <div class="value">${ps.buyout_pct || '—'}%</div></div>
    <div class="kpi-card"><span class="icon">🧾</span><div class="label">Средний чек</div>
      <div class="value">${rub(ps.avg_check)}</div></div>
    <div class="kpi-card"><span class="icon">📊</span><div class="label">ДРР</div>
      <div class="value" style="color:${ps.drr > 15 ? 'var(--red)' : 'inherit'}">${ps.drr}%</div>
      <div class="hint">реклама ${rub(ps.ad)}</div></div>
    <div class="kpi-card"><span class="icon">⚠</span><div class="label">В минусе</div>
      <div class="value" style="color:var(--red)">${e.minus_sku_count || 0}</div>
      <div class="hint">${rub(e.minus_total_w1)}</div></div>
    <div class="kpi-card"><span class="icon">📦</span><div class="label">Запас кабинета</div>
      <div class="value">${DATA.meta.cabinet_days_now || '—'}<span style="font-size:.9rem"> дн</span></div>
      <div class="hint">цель ${DATA.meta.target_days || 35} дн</div></div>
    <div class="kpi-card"><span class="icon">🚚</span><div class="label">К отгрузке</div>
      <div class="value">${fmt(DATA.meta.plan_batch)}</div>
      <div class="hint">${DATA.meta.plan_sku} SKU</div></div>`;

  const all = d.daily || [];
  const revRows = all.slice(-30);
  const drrRows = all.slice(-7);
  document.getElementById('chartRevTag').textContent = '30 дней';
  document.getElementById('chartDrrTag').textContent = '7 дней';
  drawLineChart(document.getElementById('chartRevenue'), revRows, ['revenue', 'sales'], ['#2563eb', '#94a3b8']);
  drawBarChart(document.getElementById('chartDrr'), drrRows, 'drr', r => r.drr > 15 ? '#dc2626' : '#2563eb');

  const allFocus = buildFocusForPeriod();
  const focus = allFocus.filter(f => f.level === 'critical').slice(0, 5);
  const more = allFocus.length - focus.length;
  document.getElementById('todayFocus').innerHTML = focus.length ? focus.map(f => `
    <div class="focus-item"><div class="focus-dot ${f.level}"></div>
      <div><strong>${f.title}</strong> · ${f.sku}<br><span style="color:var(--muted)">${f.action}</span></div></div>`).join('')
    + (more > 0 ? `<p class="note" style="margin-top:10px">Ещё ${more} задач → вкладка <b>Фокус</b></p>` : '')
    : '<p class="note">Нет срочных задач · смотри вкладку <b>Фокус</b></p>';
  updateRangeLabel();
}

function renderRnp() {
  const bounds = periodBounds();
  const cmp = getPeriodCompare();
  const labelEl = document.getElementById('rnpPeriodLabel');
  if (labelEl) labelEl.textContent = bounds ? `· ${bounds.label}` : '';

  const rnpKpi = document.getElementById('rnpKpi');
  if (rnpKpi && cmp) {
    rnpKpi.innerHTML = `
      <div class="kpi-card"><div class="label">Выручка</div>
        <div class="value">${rub(cmp.cur.revenue)}</div>
        <div class="hint">${delta(cmp.chg_rev)} vs ${cmp.label}</div></div>
      <div class="kpi-card"><div class="label">Заказы</div>
        <div class="value">${fmt(cmp.cur.orders)}</div>
        <div class="hint">${delta(cmp.chg_ord)}</div></div>
      <div class="kpi-card"><div class="label">ДРР</div>
        <div class="value">${cmp.cur.drr}%</div></div>
      <div class="kpi-card"><div class="label">Выкуп</div>
        <div class="value">${cmp.cur.buyout_pct != null ? cmp.cur.buyout_pct + '%' : '—'}</div></div>`;
  } else if (rnpKpi) rnpKpi.innerHTML = '';

  const wc = document.getElementById('weekCompare');
  if (wc) {
    if (cmp && bounds) {
      wc.innerHTML = `
        <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Сейчас: <b>${bounds.label}</b><br>Было: ${cmp.label}</p>
        <div class="compare">
          <div class="box"><div style="font-size:.72rem;color:var(--muted)">Прошлый период</div>
            <div style="font-size:1.2rem;font-weight:700">${rub(cmp.prev.revenue)}</div>
            <div style="font-size:.78rem">${fmt(cmp.prev.orders)} заказов</div></div>
          <div style="color:var(--muted)">→</div>
          <div class="box"><div style="font-size:.72rem;color:var(--muted)">Текущий</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--accent)">${rub(cmp.cur.revenue)}</div>
            <div style="font-size:.78rem">${fmt(cmp.cur.orders)} ${delta(cmp.chg_ord)}</div></div>
        </div>`;
    } else wc.innerHTML = '<p class="note">Нет данных за период</p>';
  }

  const allSku = buildAllSkuPeriod();
  const growing = allSku.filter(s => s.orders_chg_pct >= 15 && s.orders >= 3)
    .sort((a, b) => b.orders_chg_pct - a.orders_chg_pct);
  document.querySelector('#tableGrow tbody').innerHTML = filterBrand(growing).slice(0, 15).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders}</td>
    <td class="num z-green">+${s.orders_chg_pct}%</td><td class="num">${rub(s.revenue)}</td>
    <td style="font-size:.78rem">${s.grow_action || 'Усилить рекламу / запас'}</td></tr>`).join('')
    || '<tr><td colspan="5">Нет растущих за период</td></tr>';

  const list = qfilter(filterBrand(allSku), 'rnp').sort((a, b) => b.orders - a.orders);
  document.querySelector('#tableRnp tbody').innerHTML = list.slice(0, 80).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders}</td>
    <td class="num">${s.orders_chg_pct != null ? (s.orders_chg_pct > 0 ? '+' : '') + s.orders_chg_pct + '%' : '—'}</td>
    <td class="num">${s.sales}</td>
    <td class="num">${s.sales_chg_pct != null ? '<span class="' + (s.sales_chg_pct < 0 ? 'z-red' : 'z-green') + '">' + (s.sales_chg_pct > 0 ? '+' : '') + s.sales_chg_pct + '%</span>' : '—'}</td>
    <td class="num">${s.buyout_pct ? s.buyout_pct + '%' : '—'}</td>
    <td class="num">${s.drr ? s.drr + '%' : '—'}</td>
    <td>${zoneBadge(s.yard_zone)}</td></tr>`).join('');
}

function buildFocusForPeriod() {
  const bounds = periodBounds();
  if (!bounds || !DATA.sku_series?.available) return DATA.rnp?.focus_today || [];
  const { from, to } = bounds;
  const [pFrom, pTo] = prevPeriodRange(from, to);
  const items = [];
  const drrAvg = DATA.daily?.drr_avg_7d || 0;

  const ps = getPeriodStats();
  if (ps?.drr > Math.max(drrAvg * 1.2, 12) && ps.revenue) {
    items.push({
      level: 'critical',
      title: 'ДРР периода',
      sku: 'кабинет',
      action: `ДРР ${ps.drr}% при выручке ${rub(ps.revenue)} — проверить РК`,
    });
  }
  if (ps?.chg_revenue_pct != null && ps.chg_revenue_pct < -25) {
    items.push({
      level: 'critical',
      title: 'Просадка выручки',
      sku: 'кабинет',
      action: `−${Math.abs(ps.chg_revenue_pct)}% к ${ps.compare_label || 'прошлому периоду'}`,
    });
  }

  (DATA.urgent || []).slice(0, 4).forEach(s => {
    items.push({
      level: 'critical',
      title: 'Дефицит запаса',
      sku: s.sku || s.nm_id,
      action: `Остаток ${s.stock} шт · отгрузка ${s.batch || '—'} → ${s.warehouse_best || 'склад'}`,
    });
  });

  const skuRows = Object.values(DATA.sku_series.skus || {});
  const scored = skuRows.map(row => {
    const cur = sumSkuPeriod(row.nm_id, from, to);
    const prev = sumSkuPeriod(row.nm_id, pFrom, pTo);
    const o30 = sumSkuPeriod(row.nm_id,
      DATA.sku_series.from || from,
      to).orders;
    let chg = null;
    if (prev.orders > 0) chg = Math.round((cur.orders - prev.orders) / prev.orders * 100);
    else if (cur.orders > 0) chg = 100;
    return { row, cur, prev, chg, o30 };
  });

  scored
    .filter(x => x.cur.ad > 300 && x.cur.orders === 0)
    .sort((a, b) => b.cur.ad - a.cur.ad)
    .slice(0, 5)
    .forEach(x => items.push({
      level: 'critical',
      title: 'Реклама без заказов',
      sku: x.row.sku || x.row.nm_id,
      action: `Расход ${rub(x.cur.ad)} за период · стоп РК`,
    }));

  scored
    .filter(x => x.cur.drr > 18 && x.cur.revenue > 0)
    .sort((a, b) => b.cur.drr - a.cur.drr)
    .slice(0, 5)
    .forEach(x => items.push({
      level: 'critical',
      title: 'Высокий ДРР',
      sku: x.row.sku || x.row.nm_id,
      action: `ДРР ${x.cur.drr}% · ${x.cur.orders} зак · ${rub(x.cur.revenue)} выручка`,
    }));

  scored
    .filter(x => x.chg != null && x.chg < -30 && x.prev.orders >= 3)
    .sort((a, b) => a.chg - b.chg)
    .slice(0, 5)
    .forEach(x => items.push({
      level: 'warning',
      title: 'Просели заказы',
      sku: x.row.sku || x.row.nm_id,
      action: `${x.cur.orders} vs ${x.prev.orders} зак (−${Math.abs(x.chg)}%)`,
    }));

  scored
    .filter(x => x.cur.orders === 0 && x.o30 >= 5)
    .sort((a, b) => b.o30 - a.o30)
    .slice(0, 4)
    .forEach(x => items.push({
      level: 'warning',
      title: 'Нет заказов в периоде',
      sku: x.row.sku || x.row.nm_id,
      action: `0 зак за ${bounds.label || from + '…' + to} · было ${x.o30} за 60д`,
    }));

  scored
    .filter(x => x.cur.buyout && x.cur.buyout < 65 && x.cur.orders >= 5)
    .sort((a, b) => a.cur.buyout - b.cur.buyout)
    .slice(0, 3)
    .forEach(x => items.push({
      level: 'warning',
      title: 'Низкий выкуп',
      sku: x.row.sku || x.row.nm_id,
      action: `Выкуп ${x.cur.buyout}% · ${x.cur.orders} зак / ${x.cur.sales} выкуп`,
    }));

  scored
    .filter(x => x.chg != null && x.chg > 30 && x.cur.orders >= 3)
    .sort((a, b) => b.chg - a.chg)
    .slice(0, 3)
    .forEach(x => items.push({
      level: 'info',
      title: 'Рост заказов',
      sku: x.row.sku || x.row.nm_id,
      action: `+${x.chg}% · ${x.cur.orders} зак · ${rub(x.cur.revenue)}`,
    }));

  const week = DATA.rnp?.week_current || '';
  const [wFrom, wTo] = week.split(' — ');
  const isDefaultWeek = wFrom === from && wTo === to;
  if (isDefaultWeek) {
    (DATA.economics?.minus || []).slice(0, 4).forEach(s => {
      items.push({
        level: 'critical',
        title: 'В минусе',
        sku: s.sku || s.nm_id,
        action: `${rub(s.profit_w1)} · ${s.action || 'разбор экономики'}`,
      });
    });
  }

  const seen = new Set();
  return items.filter(it => {
    const k = `${it.title}|${it.sku}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 15);
}

function renderFocus() {
  const rnp = DATA.rnp || {};
  const bounds = periodBounds();
  const labelEl = document.getElementById('focusPeriodLabel');
  if (labelEl) labelEl.textContent = bounds ? `· ${bounds.label}` : '';

  const focus = buildFocusForPeriod();
  document.getElementById('focusCritical').innerHTML = focusHtml(focus.filter(f => f.level === 'critical'));
  document.getElementById('focusWarning').innerHTML = focusHtml(focus.filter(f => f.level === 'warning'));
  document.getElementById('focusGrowth').innerHTML = focusHtml(focus.filter(f => f.level === 'info'));

  const insNote = bounds
    ? `<p class="note" style="margin-bottom:8px">Инсайты daily-brief · фикс. окно W1 (${rnp.week_current || '—'})</p>`
    : '';
  document.getElementById('insightsList').innerHTML = insNote + ((rnp.insights || []).map(ins => `
    <div class="focus-item"><div class="focus-dot ${ins.priority === 'critical' ? 'critical' : ins.priority === 'warning' ? 'warning' : 'info'}"></div>
      <div><strong>${ins.title}</strong>${ins.sku ? ' · ' + ins.sku : ''}<br>
      <span style="color:var(--muted);font-size:.8rem">${ins.action.substring(0, 250)}</span></div></div>`).join('') || '<p class="note">Инсайты после fetch daily-brief</p>');
}

function strAction(cur, prev, ordersChg, salesChg) {
  const parts = [];
  if (ordersChg <= -30) parts.push('Спрос просел — карточка, цена, отзывы');
  else if (ordersChg <= -15) parts.push('Смотреть позиции и конверсию');
  if (cur.orders >= 3 && cur.buyout && cur.buyout < 65) parts.push(`Выкуп ${cur.buyout}%`);
  if (cur.ad > 300 && cur.orders === 0) parts.push('Стоп РК');
  if (salesChg != null && salesChg <= -30 && cur.orders >= prev.orders * 0.8) {
    parts.push('Выкупы отстают — проверить остатки/логистику');
  }
  return parts.join(' · ') || 'Разбор';
}

function buildStrScored() {
  const bounds = periodBounds();
  if (!bounds || !DATA.sku_series?.available) {
    return (DATA.rnp?.declining || []).map(s => ({
      sku: s.sku || s.nm_id,
      nm_id: s.nm_id,
      brand: s.brand,
      orders_cur: s.orders_w1,
      orders_prev: s.orders_w0,
      orders_chg_pct: s.orders_chg_pct,
      sales_cur: s.sales_w1,
      sales_prev: s.sales_w0,
      sales_chg_pct: s.sales_chg_pct,
      buyout: s.buyout_pct,
      action: (s.actions || []).join('; ') || 'Разбор',
    }));
  }
  const [pFrom, pTo] = prevPeriodRange(bounds.from, bounds.to);
  const rows = [];
  for (const row of Object.values(DATA.sku_series.skus)) {
    const cur = sumSkuPeriod(row.nm_id, bounds.from, bounds.to);
    const prev = sumSkuPeriod(row.nm_id, pFrom, pTo);
    if (prev.orders < 3 && cur.orders < 2) continue;
    const ordersChg = prev.orders > 0
      ? Math.round((cur.orders - prev.orders) / prev.orders * 100)
      : (cur.orders > 0 ? 100 : 0);
    const salesChg = prev.sales > 0
      ? Math.round((cur.sales - prev.sales) / prev.sales * 100)
      : (cur.sales > 0 ? 100 : null);
    rows.push({
      sku: row.sku || row.nm_id,
      nm_id: row.nm_id,
      brand: row.brand,
      orders_cur: cur.orders,
      orders_prev: prev.orders,
      orders_chg_pct: ordersChg,
      sales_cur: cur.sales,
      sales_prev: prev.sales,
      sales_chg_pct: salesChg,
      revenue_cur: cur.revenue,
      buyout: cur.buyout,
      action: strAction(cur, prev, ordersChg, salesChg),
    });
  }
  return rows;
}

function renderStr() {
  const bounds = periodBounds();
  const labelEl = document.getElementById('strPeriodLabel');
  if (labelEl) labelEl.textContent = bounds ? `· ${bounds.label}` : '';

  const scored = buildStrScored();
  const declining = scored.filter(r => r.orders_chg_pct <= -15 && r.orders_prev >= 3)
    .sort((a, b) => a.orders_chg_pct - b.orders_chg_pct);
  const growing = scored.filter(r => r.orders_chg_pct >= 15 && r.orders_cur >= 3)
    .sort((a, b) => b.orders_chg_pct - a.orders_chg_pct);

  const kpi = document.getElementById('strKpi');
  if (kpi) {
    kpi.innerHTML = `
      <div class="kpi-card"><div class="label">Просели STR</div>
        <div class="value z-red">${declining.length}</div>
        <div class="hint">заказы −15% и хуже</div></div>
      <div class="kpi-card"><div class="label">Растут</div>
        <div class="value z-green">${growing.length}</div>
        <div class="hint">заказы +15% и больше</div></div>
      <div class="kpi-card"><div class="label">Период</div>
        <div class="value" style="font-size:1rem">${bounds ? bounds.label : '—'}</div></div>`;
  }

  const list = qfilter(declining, 'str');
  document.querySelector('#tableStr tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num">${fmt(s.orders_cur)}</td><td class="num">${fmt(s.orders_prev)}</td>
    <td class="num z-red">${s.orders_chg_pct}%</td>
    <td class="num">${fmt(s.sales_cur)}</td><td class="num">${fmt(s.sales_prev)}</td>
    <td class="num">${s.sales_chg_pct != null ? (s.sales_chg_pct > 0 ? '+' : '') + s.sales_chg_pct + '%' : '—'}</td>
    <td class="num">${s.buyout ? s.buyout + '%' : '—'}</td>
    <td style="font-size:.78rem">${s.action}</td></tr>`).join('')
    || '<tr><td colspan="9">Нет просевших за выбранный период</td></tr>';

  const growList = filterBrand(growing).slice(0, 20);
  document.querySelector('#tableStrGrow tbody').innerHTML = growList.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num">${fmt(s.orders_cur)}</td><td class="num">${fmt(s.orders_prev)}</td>
    <td class="num z-green">+${s.orders_chg_pct}%</td>
    <td class="num">${rub(s.revenue_cur || 0)}</td>
    <td style="font-size:.78rem">Усилить рекламу / запас</td></tr>`).join('')
    || '<tr><td colspan="6">Нет растущих за период</td></tr>';
}

function renderFunnel() {
  const bounds = periodBounds();
  const cmp = getPeriodCompare();
  const allSku = buildAllSkuPeriod();
  const lowBuyout = allSku.filter(s => s.buyout_pct && s.buyout_pct < 70 && s.orders >= 5)
    .sort((a, b) => a.buyout_pct - b.buyout_pct);

  document.getElementById('funnelKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Выкуп за период</div>
      <div class="value">${cmp?.cur?.buyout_pct != null ? cmp.cur.buyout_pct + '%' : '—'}</div>
      <div class="hint">${bounds?.label || ''}</div></div>
    <div class="kpi-card"><div class="label">Заказы</div>
      <div class="value">${fmt(cmp?.cur?.orders)}</div></div>
    <div class="kpi-card"><div class="label">Низкий выкуп SKU</div>
      <div class="value z-red">${lowBuyout.length}</div>
      <div class="hint">&lt;70% при ≥5 заказах</div></div>`;

  document.querySelector('#tableBuyout tbody').innerHTML = filterBrand(lowBuyout).slice(0, 30).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num z-red">${s.buyout_pct}%</td>
    <td class="num">${s.orders}</td><td class="num">${Math.max(0, s.orders - s.sales)}</td></tr>`).join('')
    || '<tr><td colspan="4">Нет проблемных за период</td></tr>';

  const list = qfilter(filterBrand(allSku.filter(s => s.orders > 0)), 'funnel').sort((a, b) => b.orders - a.orders);
  document.querySelector('#tableFunnel tbody').innerHTML = list.slice(0, 60).map(s => {
    const avgCheck = s.orders ? Math.round(s.revenue / s.orders) : 0;
    return `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders}</td><td class="num">${s.sales}</td>
    <td class="num">${s.buyout_pct}%</td><td class="num">${Math.max(0, s.orders - s.sales)}</td>
    <td class="num">${rub(avgCheck)}</td></tr>`;
  }).join('');
}

function renderPlan() {
  const list = qfilter(filterBrand(DATA.skus_plan), 'plan');
  document.querySelector('#tablePlan tbody').innerHTML = list.map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td><td>${badge(s.status, s.status_label)}</td>
    <td class="num">${s.stock}</td><td class="num">${s.sold_30d}</td>
    <td>${daysCell(s.days_now, s.days_after)}</td>
    <td class="num"><strong>${s.batch || '—'}</strong></td>
    <td class="num">${rub(s.purchase_sum)}</td><td>${whTags(s.warehouses_rec)}</td></tr>`).join('');
  const m = DATA.meta;
  document.getElementById('planNote').innerHTML = `Итого: <b>${fmt(m.plan_batch)} шт</b> · закуп <b>${rub(m.purchase_sum)}</b>`;
}

function renderMinus() {
  const e = DATA.economics || {};
  const c = e.cabinet || {};
  if (!e.available) {
    document.getElementById('minusKpi').innerHTML = '<p class="note">Нет экономики</p>';
    return;
  }
  document.getElementById('minusKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Прибыль W1</div><div class="value">${rub(c.profit_w1)}</div></div>
    <div class="kpi-card"><div class="label">Минус SKU</div><div class="value z-red">${c.minus_sku_count}</div></div>
    <div class="kpi-card"><div class="label">Сумма минуса</div><div class="value z-red">${rub(c.minus_total_w1)}</div></div>
    <div class="kpi-card"><div class="label">В плюсе</div><div class="value z-green">${c.green_count}</div></div>`;
  const list = qfilter(filterBrand(e.minus || []), 'minus');
  document.querySelector('#tableMinus tbody').innerHTML = list.map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td>
    <td class="num z-red">${rub(s.profit_w1)}</td><td class="num">${rub(s.for_pay_w1)}</td>
    <td class="num">${rub(s.ad_w1)}</td><td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td>
    <td><span style="font-size:.78rem">${s.action}</span></td></tr>`).join('') || '<tr><td colspan="6">Нет минусовых</td></tr>';
  document.querySelector('#tableGreen tbody').innerHTML = (e.green || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num z-green">${rub(s.profit_w1)}</td>
    <td class="num">${s.sales_w1}</td><td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td></tr>`).join('');
  document.querySelector('#tableZero tbody').innerHTML = (e.zero_sales || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.stock}</td><td class="num">${rub(s.ad_w1)}</td>
    <td>Стоп РК</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';
  document.getElementById('minusNote').innerHTML = e.has_costs
    ? `Себестоимость: ${e.costs_loaded} SKU` : '⚠ Себестоимость не загружена — прибыль без COGS';
}

function renderAds() {
  const e = DATA.economics || {};
  const a = DATA.ads_detail || {};
  const c = a.cabinet || e.cabinet || {};
  const hasFs = a.has_fullstats;
  const adSkuMap = {};
  (a.skus || []).forEach(s => { adSkuMap[s.nm_id] = s; });
  document.getElementById('adsKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Реклама W1</div><div class="value">${rub(c.spend_w1 || e.cabinet?.ad_w1)}</div>
      <div class="hint">ДРР ${c.drr_w1 != null ? c.drr_w1 + '%' : '—'}</div></div>
    <div class="kpi-card"><div class="label">Показы W1</div><div class="value">${num(c.views_w1)}</div>
      <div class="hint">клики ${num(c.clicks_w1)}</div></div>
    <div class="kpi-card"><div class="label">CTR W1</div><div class="value">${pct2(c.ctr_w1)}</div>
      <div class="hint">CPC ${rubDec(c.cpc_w1)} · CPM ${rubDec(c.cpm_w1)}</div></div>
    <div class="kpi-card"><div class="label">Заказы W1</div><div class="value">${num(c.orders_w1)}</div>
      <div class="hint">корзины ${num(c.atbs_w1)} · CR ${pct2(c.cr_w1)}</div></div>
    <div class="kpi-card"><div class="label">ROAS W1</div><div class="value">${c.roas_w1 != null ? c.roas_w1 + '%' : '—'}</div>
      <div class="hint">CPO ${rubDec(c.cpo_w1)}</div></div>
    <div class="kpi-card"><div class="label">7 / 30 дней</div><div class="value">${rub(c.spend_7d)}</div>
      <div class="hint">30д ${rub(c.spend_30d)}</div></div>
    <div class="kpi-card"><div class="label">Кампаний</div><div class="value">${c.campaigns_total || (e.campaigns||[]).length}</div>
      <div class="hint">активных ${c.campaigns_active ?? '—'}</div></div>
    <div class="kpi-card"><div class="label">Слив</div><div class="value z-red">${(e.ad_bleed||[]).length}</div></div>`;
  document.getElementById('adsNote').textContent = a.note || 'Данные из списаний WB /adv/v1/upd';
  if (a.daily?.length) {
    drawBarChart(document.getElementById('chartAdDaily'),
      a.daily.map(d => ({ date: d.date, drr: d.spend })), 'drr', () => '#2563eb');
    const viewsCard = document.getElementById('adsStatsChartCard');
    if (hasFs && a.daily.some(d => d.views)) {
      viewsCard.style.display = '';
      drawDualBarChart(document.getElementById('chartAdViews'), a.daily);
    } else viewsCard.style.display = 'none';
  }
  document.querySelector('#tableAdBleed tbody').innerHTML = (e.ad_bleed || []).map(s => {
    const st = adSkuMap[s.nm_id] || {};
    return `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${rub(s.ad_w1)}</td>
    <td class="num">${num(st.views_w1)}</td><td class="num">${pct2(st.ctr_w1)}</td>
    <td class="num z-red">${rub(s.profit_w1)}</td><td class="num">${s.drr_w1}%</td>
    <td class="num">${s.roas_w1 ? s.roas_w1+'%' : '—'}</td>
    <td class="z-red">${s.action}</td></tr>`;
  }).join('') || '<tr><td colspan="8">—</td></tr>';
  const camps = a.campaigns || e.campaigns || [];
  document.querySelector('#tableCampaigns tbody').innerHTML = camps.slice(0, 40).map(c => `<tr>
    <td><span style="font-size:.72rem;color:var(--muted)">#${c.advert_id || '—'}</span><br>${(c.camp||'').slice(0,35)}</td>
    <td>${c.sku || c.nm_id || '—'}</td>
    <td class="num">${rub(c.spend_w1)}</td>
    <td class="num">${num(c.views_w1)}</td><td class="num">${num(c.clicks_w1)}</td>
    <td class="num">${pct2(c.ctr_w1)}</td><td class="num">${rubDec(c.cpc_w1)}</td>
    <td class="num">${num(c.orders_w1)}</td>
    <td class="num">${c.drr_w1 != null ? c.drr_w1+'%' : '—'}</td>
    <td>${c.type || '—'}</td><td>${c.status || '—'}</td></tr>`).join('') || '<tr><td colspan="11">—</td></tr>';
  const econMap = {};
  (e.skus || []).forEach(s => { econMap[s.nm_id] = s; });
  const adSkus = a.skus?.length ? a.skus : null;
  const list = qfilter(filterBrand(
    adSkus || DATA.skus_ads || DATA.skus_all.filter(s => s.ad_spend_30d > 0 || s.ad_w1 > 0)
  ), 'ads').sort((a, b) => (b.spend_30d || b.ad_spend_30d || b.ad_w1 || 0) - (a.spend_30d || a.ad_spend_30d || a.ad_w1 || 0));
  document.querySelector('#tableAds tbody').innerHTML = list.map(s => {
    const ec = econMap[s.nm_id] || {};
    const rec = ec.is_minus || s.stop_ads ? '<span class="z-red">СТОП</span>'
      : (ec.drr_w1 > 12 || s.drr_w1 > 12) ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>';
    return `<tr><td>${s.sku || s.nm_id}</td>
      <td class="num">${rub(s.spend_w1 ?? ec.ad_w1)}</td>
      <td class="num">${num(s.views_w1)}</td><td class="num">${num(s.clicks_w1)}</td>
      <td class="num">${pct2(s.ctr_w1)}</td><td class="num">${rubDec(s.cpc_w1)}</td>
      <td class="num">${num(s.orders_w1)}</td><td class="num">${rubDec(s.cpo_w1)}</td>
      <td class="num">${rub(s.revenue_w1 ?? ec.revenue_w1)}</td>
      <td class="num">${s.drr_w1 ?? ec.drr_w1 ? (s.drr_w1 ?? ec.drr_w1)+'%' : '—'}</td>
      <td class="num">${s.roas_w1 != null ? s.roas_w1+'%' : '—'}</td>
      <td class="num">${s.campaigns_count ?? '—'}</td>
      <td class="num" style="color:${(ec.profit_w1||0)<0?'var(--red)':'inherit'}">${rub(ec.profit_w1)}</td>
      <td>${rec}</td></tr>`;
  }).join('');
  const unmapped = a.unmapped || [];
  const umCard = document.getElementById('unmappedCard');
  if (unmapped.length) {
    umCard.style.display = 'block';
    document.querySelector('#tableUnmapped tbody').innerHTML = unmapped.map(c => `<tr>
      <td>${c.advert_id}</td><td>${(c.camp||'').slice(0,50)}</td>
      <td class="num">${rub(c.spend_30d)}</td></tr>`).join('');
  } else umCard.style.display = 'none';
}

function turnoverCell(days, target) {
  if (days == null) return '—';
  const cls = days < 14 ? 'z-red' : days > 90 ? 'z-yellow' : days <= (target || 35) + 10 ? 'z-green' : '';
  return `<span class="${cls}">${days}д</span>`;
}

function whBestCell(s) {
  if (!s.warehouse_best) return '—';
  const qty = s.warehouse_best_qty ? ` · ${s.warehouse_best_qty} шт` : '';
  return `<strong>${s.warehouse_best}</strong><span style="font-size:.72rem;color:var(--muted)">${qty}</span>`;
}

function renderStock() {
  const m = DATA.meta;
  const target = m.target_days || 35;
  document.getElementById('stockKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Запас кабинета</div>
      <div class="value">${m.cabinet_days_now || '—'}<span style="font-size:.85rem"> дн</span></div>
      <div class="hint">цель ${target} дн</div></div>
    <div class="kpi-card"><div class="label">К отгрузке</div>
      <div class="value">${fmt(m.plan_batch)}</div><div class="hint">${m.plan_sku} SKU</div></div>
    <div class="kpi-card"><div class="label">Срочно OOS/дефицит</div>
      <div class="value z-red">${m.urgent_count || 0}</div></div>
    <div class="kpi-card"><div class="label">ИЛ средний</div>
      <div class="value">${m.localization_avg ? (m.localization_avg * 100).toFixed(0) + '%' : '—'}</div></div>`;
  const tgtEl = document.getElementById('targetDaysNote');
  const plechoEl = document.getElementById('plechoNote');
  if (tgtEl) tgtEl.textContent = target;
  if (plechoEl) plechoEl.textContent = m.plecho_days || 20;

  document.querySelector('#tableUrgent tbody').innerHTML = (DATA.urgent || []).map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td>
    <td class="num">${s.stock}</td><td class="num">${s.sold_30d}</td>
    <td class="num">${turnoverCell(s.days_now, target)}</td>
    <td>${whBestCell(s)}</td>
    <td class="num"><strong>${s.batch || '—'}</strong></td></tr>`).join('') || '<tr><td colspan="6">Нет срочных</td></tr>';

  const whPlan = DATA.warehouses_plan || [];
  document.getElementById('whPlanSummary').innerHTML = whPlan.length ? whPlan.slice(0, 8).map(w => {
    const max = Math.max(...whPlan.map(x => x.qty), 1);
    return `<div class="bar-row"><div class="bar-label">${w.name}</div>
      <div class="bar-track"><div class="bar-fill ship" style="width:${w.qty / max * 100}%"></div></div>
      <div class="bar-num">${w.qty}</div></div>`;
  }).join('') : '<p class="note">Нет плана отгрузки</p>';

  const list = qfilter(filterBrand(DATA.skus_all), 'stock')
    .sort((a, b) => (a.days_now ?? 999) - (b.days_now ?? 999));
  document.querySelector('#tableStock tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num">${s.stock}</td><td class="num">${s.sold_30d}</td>
    <td class="num">${turnoverCell(s.days_now, target)}</td>
    <td class="num">${s.days_after != null ? turnoverCell(s.days_after, target) : '—'}</td>
    <td>${whBestCell(s)}<br><span style="font-size:.7rem;color:var(--muted)">${s.warehouse_best_reason || ''}</span></td>
    <td>${whTags(s.warehouses_rec)}</td>
    <td class="num">${s.localization_pct != null ? (s.localization_pct * 100).toFixed(0) + '%' : '—'}</td>
    <td>${badge(s.status, s.status_label)}</td></tr>`).join('');
}

function renderBars(id, items, cls) {
  const max = Math.max(...(items || []).map(i => i.qty), 1);
  document.getElementById(id).innerHTML = (items || []).slice(0, 12).map(i => `
    <div class="bar-row"><div class="bar-label">${i.name}</div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${i.qty / max * 100}%"></div></div>
    <div class="bar-num">${i.qty}</div></div>`).join('');
}

function renderWarehouses() {
  renderBars('barsStock', DATA.warehouses_stock, '');
  renderBars('barsShip', DATA.warehouses_plan, 'ship');
  const regs = DATA.cabinet?.regions || [];
  const max = Math.max(...regs.map(r => r.qty), 1);
  document.getElementById('regionBars').innerHTML = regs.map(r => `
    <div class="bar-row"><div class="bar-label">${r.region}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${r.qty / max * 100}%"></div></div>
    <div class="bar-num">${r.qty}</div></div>`).join('');
}

function renderStop() {
  document.querySelector('#tableStop tbody').innerHTML = (DATA.stop_list || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td>${badge(s.status, s.status_label)}</td>
    <td class="num">${s.stock}</td><td class="num">${s.sold_30d}</td></tr>`).join('');
}

const TITLES = { today: 'Сегодня', focus: 'Фокус', rnp: 'Динамика', minus: 'Минус / P&L',
  ads: 'Реклама', stock: 'Остатки / запас', str: 'STR', plan: 'Отгрузка', warehouses: 'Склады',
  funnel: 'Воронка', stop: 'Стоп' };

function render() {
  if (!DATA) return;
  document.getElementById('pageTitle').textContent = TITLES[state.tab] || 'WB Manager';
  renderGuides();
  renderToday(); renderFocus(); renderRnp(); renderStr(); renderFunnel();
  renderMinus(); renderPlan(); renderAds(); renderStock(); renderWarehouses(); renderStop();
}

function syncDatesFromPeriod() {
  const d = DATA.daily;
  if (!d?.available || state.period === 'custom') return;
  const p = d.presets?.[state.period];
  if (!p) return;
  state.dateFrom = p.from;
  state.dateTo = p.to;
  document.getElementById('dateFrom').value = p.from;
  document.getElementById('dateTo').value = p.to;
}

function setPeriod(p) {
  state.period = p;
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  if (!DATA?.daily?.available) return;
  syncDatesFromPeriod();
  render();
}

function applyCustomDates() {
  state.period = 'custom';
  state.dateFrom = document.getElementById('dateFrom').value;
  state.dateTo = document.getElementById('dateTo').value;
  if (state.dateFrom > state.dateTo) {
    const t = state.dateFrom; state.dateFrom = state.dateTo; state.dateTo = t;
    document.getElementById('dateFrom').value = state.dateFrom;
    document.getElementById('dateTo').value = state.dateTo;
  }
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
  render();
}

document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item[data-tab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    document.getElementById('pageTitle').textContent = TITLES[state.tab] || 'WB Manager';
  });
});

document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.period === 'custom') {
      state.period = 'custom';
      document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
      return;
    }
    setPeriod(btn.dataset.period);
  });
});

document.getElementById('btnApplyDates').addEventListener('click', applyCustomDates);
document.getElementById('btnRefresh').addEventListener('click', refreshFromApi);

['dateFrom', 'dateTo'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    state.period = 'custom';
    document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
  });
});

document.getElementById('brandFilter').addEventListener('change', e => { state.brand = e.target.value; render(); });
['searchRnp', 'searchPlan', 'searchAds', 'searchStock', 'searchFunnel', 'searchMinus', 'searchStr'].forEach(id => {
  const key = id.replace('search', '').toLowerCase();
  document.getElementById(id).addEventListener('input', e => { state.q[key] = e.target.value.toLowerCase(); render(); });
});

window.addEventListener('resize', () => { if (DATA) renderToday(); });
loadData();
