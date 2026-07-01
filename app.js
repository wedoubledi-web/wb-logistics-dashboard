let DATA = null;
let state = { brand: '', q: {}, period: 'yesterday', dateFrom: '', dateTo: '', tab: 'today' };

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const rub = n => (n == null || n === 0) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const pct = n => n == null ? '—' : (typeof n === 'number' && n > 1 ? n.toFixed(0) : (n * 100).toFixed(0)) + '%';

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
function qfilter(list, key, fields = ['sku']) {
  const q = state.q[key] || '';
  if (!q) return list;
  return list.filter(s => fields.some(f => String(s[f] || s.nm_id || '').toLowerCase().includes(q)));
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

async function loadData() {
  try {
    const r = await fetch('data.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw 0;
    DATA = await r.json();
    const badge = document.getElementById('srcBadge');
    const m = DATA.meta;
    const daysOld = m.snap_date ? Math.floor((Date.now() - new Date(m.snap_date)) / 86400000) : 0;
    if (daysOld > 3) {
      badge.className = 'badge stale';
      badge.textContent = `данные ${m.snap_date}`;
    } else {
      badge.className = 'badge live';
      badge.textContent = '● ' + m.snap_date;
    }
    const d = DATA.daily;
    if (d?.available) {
      state.dateTo = d.as_of;
      state.dateFrom = d.as_of;
      document.getElementById('dateTo').value = d.as_of;
      document.getElementById('dateFrom').value = d.as_of;
      document.getElementById('dateTo').max = d.as_of;
      document.getElementById('dateFrom').max = d.as_of;
      const minD = d.daily[0]?.date;
      if (minD) { document.getElementById('dateFrom').min = minD; document.getElementById('dateTo').min = minD; }
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
  render();
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
  hero.innerHTML = `<div class="title">${periodLabel}: выручка ${rub(ps.revenue)}, продано ${fmt(ps.sales)} шт</div>
    <div class="sub">${ps.chg_revenue_pct != null ? trend(ps.chg_revenue_pct, 'к ' + (ps.compare_label || 'прошлому')) : `${fmt(ps.orders)} заказов · ДРР ${ps.drr}%`}</div>`;

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
    <div class="kpi-card"><span class="icon">📦</span><div class="label">Выкуплено</div>
      <div class="value">${fmt(ps.sales)} шт</div>${ps.chg_sales_pct != null ? trend(ps.chg_sales_pct, '') : ''}</div>
    <div class="kpi-card"><span class="icon">%</span><div class="label">Выкуп</div>
      <div class="value">${ps.buyout_pct || '—'}%</div></div>
    <div class="kpi-card"><span class="icon">🧾</span><div class="label">Средний чек</div>
      <div class="value">${rub(ps.avg_check)}</div></div>
    <div class="kpi-card"><span class="icon">📊</span><div class="label">ДРР</div>
      <div class="value" style="color:${ps.drr > 15 ? 'var(--red)' : 'inherit'}">${ps.drr}%</div>
      <div class="hint">реклама ${rub(ps.ad)}</div></div>
    <div class="kpi-card"><span class="icon">⚠</span><div class="label">В минусе</div>
      <div class="value" style="color:var(--red)">${e.minus_sku_count || 0}</div>
      <div class="hint">${rub(e.minus_total_w1)}</div></div>`;

  const all = d.daily || [];
  const revRows = all.slice(-30);
  const drrRows = all.slice(-7);
  document.getElementById('chartRevTag').textContent = '30 дней';
  document.getElementById('chartDrrTag').textContent = '7 дней';
  drawLineChart(document.getElementById('chartRevenue'), revRows, ['revenue', 'sales'], ['#2563eb', '#94a3b8']);
  drawBarChart(document.getElementById('chartDrr'), drrRows, 'drr', r => r.drr > 15 ? '#dc2626' : '#2563eb');

  const focus = (DATA.rnp?.focus_today || []).slice(0, 5);
  document.getElementById('todayFocus').innerHTML = focus.length ? focus.map(f => `
    <div class="focus-item"><div class="focus-dot ${f.level}"></div>
      <div><strong>${f.title}</strong> · ${f.sku}<br><span style="color:var(--muted)">${f.action}</span></div></div>`).join('')
    : '<p class="note">Нет срочных задач</p>';
}

function renderRnp() {
  const rnp = DATA.rnp || {};
  const c = rnp.cabinet || {};
  document.getElementById('weekCompare').innerHTML = rnp.available ? `
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">W1: ${rnp.week_current}</p>
    <div class="compare">
      <div class="box"><div style="font-size:.72rem;color:var(--muted)">Прошлая</div>
        <div style="font-size:1.2rem;font-weight:700">${rub(c.revenue_w0)}</div>
        <div style="font-size:.78rem">${fmt(c.orders_w0)} заказов</div></div>
      <div style="color:var(--muted)">→</div>
      <div class="box"><div style="font-size:.72rem;color:var(--muted)">Текущая</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--accent)">${rub(c.revenue_w1)}</div>
        <div style="font-size:.78rem">${fmt(c.orders_w1)} ${delta(c.orders_chg_pct)}</div></div>
    </div>` : '<p class="note">Нет wb_brief.db</p>';

  document.querySelector('#tableGrow tbody').innerHTML = filterBrand(rnp.growing || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders_w1}</td>
    <td class="num z-green">+${s.orders_chg_pct}%</td><td class="num">${rub(s.revenue_w1)}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';

  const list = qfilter(filterBrand(rnp.skus || []), 'rnp').sort((a, b) => (b.orders_w1 || 0) - (a.orders_w1 || 0));
  document.querySelector('#tableRnp tbody').innerHTML = list.slice(0, 80).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders_w1}</td>
    <td class="num">${s.orders_chg_pct != null ? (s.orders_chg_pct > 0 ? '+' : '') + s.orders_chg_pct + '%' : '—'}</td>
    <td class="num">${s.str_chg != null ? '<span class="' + (s.str_chg < 0 ? 'z-red' : 'z-green') + '">' + (s.str_chg * 100).toFixed(0) + '%</span>' : '—'}</td>
    <td class="num">${s.buyout_pct ? s.buyout_pct + '%' : '—'}</td>
    <td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td>
    <td>${zoneBadge(s.yard_zone)}</td></tr>`).join('');
}

function renderFocus() {
  const rnp = DATA.rnp || {};
  document.getElementById('focusList').innerHTML = (rnp.focus_today || []).length ? (rnp.focus_today || []).map(f => `
    <div class="focus-item"><div class="focus-dot ${f.level}"></div>
      <div><strong>${f.title}</strong> · ${f.sku}<br><span style="color:var(--muted)">${f.action}</span></div></div>`).join('')
    : '<p class="note">Нет критичных задач</p>';
  document.getElementById('insightsList').innerHTML = (rnp.insights || []).map(ins => `
    <div class="focus-item"><div class="focus-dot ${ins.priority === 'critical' ? 'critical' : ins.priority === 'warning' ? 'warning' : 'info'}"></div>
      <div><strong>${ins.title}</strong>${ins.sku ? ' · ' + ins.sku : ''}<br>
      <span style="color:var(--muted);font-size:.8rem">${ins.action.substring(0, 250)}</span></div></div>`).join('') || '<p class="note">Инсайты после fetch daily-brief</p>';
}

function renderStr() {
  const list = filterBrand(DATA.rnp?.declining || DATA.skus_declining || []);
  document.querySelector('#tableStr tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.sales_w1 ?? '—'}</td><td class="num">${s.sales_w0 ?? '—'}</td>
    <td class="num z-red">${s.str_chg != null ? (s.str_chg * 100).toFixed(0) + '%' : '—'}</td>
    <td class="num">${s.orders_chg_pct != null ? s.orders_chg_pct + '%' : '—'}</td>
    <td>${(s.actions || []).join('; ') || 'Разбор'}</td></tr>`).join('') || '<tr><td colspan="6">Нет просевших</td></tr>';
}

function renderFunnel() {
  const c = DATA.rnp?.cabinet || {};
  document.getElementById('funnelKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Выкуп W1</div><div class="value">${c.buyout_w1_pct || '—'}%</div></div>
    <div class="kpi-card"><div class="label">Заказы 30д</div><div class="value">${fmt(DATA.meta.total_sold_30d)}</div></div>`;
  document.querySelector('#tableBuyout tbody').innerHTML = (DATA.rnp?.low_buyout || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num z-red">${s.buyout_pct}%</td>
    <td class="num">${s.orders_30d}</td><td class="num">${s.refunds_30d}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';
  const list = qfilter(filterBrand((DATA.rnp?.skus || []).filter(s => s.orders_30d > 0)), 'funnel').sort((a, b) => b.orders_30d - a.orders_30d);
  document.querySelector('#tableFunnel tbody').innerHTML = list.slice(0, 60).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders_30d}</td><td class="num">${s.sales_30d}</td>
    <td class="num">${s.buyout_pct}%</td><td class="num">${s.refunds_30d}</td><td class="num">${rub(s.avg_check)}</td></tr>`).join('');
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
  const c = e.cabinet || {};
  document.getElementById('adsKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Реклама W1</div><div class="value">${rub(c.ad_w1)}</div></div>
    <div class="kpi-card"><div class="label">Слив</div><div class="value z-red">${(e.ad_bleed||[]).length}</div></div>
    <div class="kpi-card"><div class="label">Кампаний</div><div class="value">${(e.campaigns||[]).length}</div></div>`;
  document.querySelector('#tableAdBleed tbody').innerHTML = (e.ad_bleed || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${rub(s.ad_w1)}</td>
    <td class="num z-red">${rub(s.profit_w1)}</td><td class="num">${s.drr_w1}%</td>
    <td class="z-red">${s.action}</td></tr>`).join('') || '<tr><td colspan="5">—</td></tr>';
  document.querySelector('#tableCampaigns tbody').innerHTML = (e.campaigns || []).slice(0, 25).map(c => `<tr>
    <td><span style="font-size:.72rem;color:var(--muted)">${(c.camp||'').slice(0,35)}</span><br>${c.sku||c.nm_id}</td>
    <td class="num">${rub(c.spend_w1)}</td><td class="num">${c.drr_w1 ? c.drr_w1+'%' : '—'}</td>
    <td class="num">${rub(c.profit_w1)}</td>
    <td>${c.action === 'СТОП' ? '<span class="z-red">СТОП</span>' : c.action === 'Срез' ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>'}</td></tr>`).join('') || '<tr><td colspan="5">—</td></tr>';
  const econMap = {};
  (e.skus || []).forEach(s => { econMap[s.nm_id] = s; });
  const list = qfilter(filterBrand(DATA.skus_ads || DATA.skus_all.filter(s => s.ad_spend_30d > 0 || s.ad_w1 > 0)), 'ads')
    .sort((a, b) => (b.ad_w1 || b.ad_spend_30d || 0) - (a.ad_w1 || a.ad_spend_30d || 0));
  document.querySelector('#tableAds tbody').innerHTML = list.map(s => {
    const ec = econMap[s.nm_id] || {};
    const rec = s.stop_ads || ec.is_minus ? '<span class="z-red">СТОП</span>'
      : (ec.drr_w1 > 12) ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>';
    return `<tr><td>${s.sku || s.nm_id}</td><td class="num">${rub(ec.ad_w1)}</td>
      <td class="num">${rub(s.ad_spend_30d)}</td><td class="num">${ec.drr_w1 ? ec.drr_w1+'%' : '—'}</td>
      <td class="num" style="color:${(ec.profit_w1||0)<0?'var(--red)':'inherit'}">${rub(ec.profit_w1)}</td><td>${rec}</td></tr>`;
  }).join('');
}

function renderStock() {
  const list = qfilter(filterBrand(DATA.skus_all), 'stock').sort((a, b) => b.stock - a.stock);
  document.querySelector('#tableStock tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td>${s.brand}</td><td class="num">${s.stock}</td>
    <td class="num">${s.sold_30d}</td><td class="num">${s.days_now != null ? s.days_now + 'д' : '—'}</td>
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
  ads: 'Реклама', stock: 'Остатки', str: 'STR', plan: 'Отгрузка', warehouses: 'Склады',
  funnel: 'Воронка', stop: 'Стоп' };

function render() {
  if (!DATA) return;
  document.getElementById('pageTitle').textContent = TITLES[state.tab] || 'WB Manager';
  renderToday(); renderFocus(); renderRnp(); renderStr(); renderFunnel();
  renderMinus(); renderPlan(); renderAds(); renderStock(); renderWarehouses(); renderStop();
}

function setPeriod(p) {
  state.period = p;
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === p));
  const d = DATA.daily;
  if (!d?.available) return;
  if (p === 'yesterday') {
    state.dateFrom = state.dateTo = d.as_of;
    document.getElementById('dateFrom').value = d.as_of;
    document.getElementById('dateTo').value = d.as_of;
  } else if (p === '7d') {
    const to = d.as_of;
    const from = d.daily[Math.max(0, d.daily.length - 7)]?.date || to;
    state.dateFrom = from; state.dateTo = to;
    document.getElementById('dateFrom').value = from;
    document.getElementById('dateTo').value = to;
  } else if (p === '30d') {
    const to = d.as_of;
    const from = d.daily[Math.max(0, d.daily.length - 30)]?.date || to;
    state.dateFrom = from; state.dateTo = to;
    document.getElementById('dateFrom').value = from;
    document.getElementById('dateTo').value = to;
  }
  renderToday();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    document.getElementById('pageTitle').textContent = TITLES[state.tab] || 'WB Manager';
    const showDates = state.tab === 'today';
    document.getElementById('periodPills').style.display = showDates ? 'flex' : 'none';
    document.getElementById('dateFrom').style.display = showDates ? 'inline-block' : 'none';
    document.getElementById('dateTo').style.display = showDates ? 'inline-block' : 'none';
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

['dateFrom', 'dateTo'].forEach(id => {
  document.getElementById(id).addEventListener('change', e => {
    state.period = 'custom';
    state.dateFrom = document.getElementById('dateFrom').value;
    state.dateTo = document.getElementById('dateTo').value;
    document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
    renderToday();
  });
});

document.getElementById('brandFilter').addEventListener('change', e => { state.brand = e.target.value; render(); });
['searchRnp', 'searchPlan', 'searchAds', 'searchStock', 'searchFunnel', 'searchMinus'].forEach(id => {
  const key = id.replace('search', '').toLowerCase();
  document.getElementById(id).addEventListener('input', e => { state.q[key] = e.target.value.toLowerCase(); render(); });
});

window.addEventListener('resize', () => { if (DATA) renderToday(); });
loadData();
