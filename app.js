let DATA = null;
let state = { brand: '', q: {} };

const fmt = n => Math.round(n || 0).toLocaleString('ru-RU');
const rub = n => (n == null || n === 0) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' ₽';
const pct = n => n == null ? '—' : (typeof n === 'number' && n > 1 ? n.toFixed(0) : (n * 100).toFixed(0)) + '%';
const delta = (v, suffix = '%') => {
  if (v == null) return '<span class="delta flat">—</span>';
  const cls = v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
  const sym = v > 1 ? '▲' : v < -1 ? '▼' : '■';
  return `<span class="delta ${cls}">${sym} ${v}${suffix}</span>`;
};

function badge(st, label) {
  return `<span class="badge-s b-${st}">${label}</span>`;
}
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
  if (after == null) return `<span style="color:var(--red)">${now}д</span>`;
  return `<span style="color:var(--red)">${now}д</span> → <span style="color:var(--green)">${after}д</span>`;
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

async function loadData() {
  try {
    const r = await fetch('data.json?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw 0;
    DATA = await r.json();
    const badge = document.getElementById('srcBadge');
    const m = DATA.meta;
    const rnp = DATA.rnp || {};
    const daysOld = m.snap_date ? Math.floor((Date.now() - new Date(m.snap_date)) / 86400000) : 0;
    if (daysOld > 3) {
      badge.className = 'badge stale';
      badge.textContent = `⚠ данные ${m.snap_date} (${daysOld}д назад) · обнови fetch`;
    } else {
      badge.className = 'badge live';
      badge.textContent = '● WB · ' + m.generated + ' · снимок ' + m.snap_date;
    }
    if (!rnp.available) {
      badge.textContent += ' · РНП: нет brief DB';
    }
  } catch (e) {
    document.getElementById('srcBadge').className = 'badge demo';
    document.getElementById('srcBadge').textContent = '⚠ нет data.json';
    return;
  }
  const brands = [...new Set(DATA.skus_all.map(s => s.brand).filter(Boolean))].sort();
  const sel = document.getElementById('brandFilter');
  sel.innerHTML = '<option value="">Все бренды</option>';
  brands.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  render();
}

function renderKpiMain() {
  const m = DATA.meta;
  const c = DATA.rnp?.cabinet || {};
  const e = DATA.economics?.cabinet || {};
  const rnpOk = DATA.rnp?.available;
  const econOk = DATA.economics?.available;
  document.getElementById('kpiMain').innerHTML = `
    <div class="kpi-card accent"><div class="label">Прибыль нед.</div>
      <div class="value" style="color:${(e.profit_w1||0)<0?'var(--red)':'var(--green)'}">${rub(e.profit_w1)}</div>
      <div class="hint">${econOk ? delta(e.profit_chg_pct) : '—'}</div></div>
    <div class="kpi-card"><div class="label">В минусе</div>
      <div class="value" style="color:var(--red)">${e.minus_sku_count || 0}</div>
      <div class="hint">${rub(e.minus_total_w1)} суммарно</div></div>
    <div class="kpi-card"><div class="label">Выручка нед.</div>
      <div class="value">${rub(c.revenue_w1)}</div>
      <div class="hint">${rnpOk ? delta(c.revenue_chg_pct) : '—'}</div></div>
    <div class="kpi-card"><div class="label">ДРР нед.</div>
      <div class="value">${c.drr_w1_pct || '—'}%</div>
      <div class="hint">реклама ${rub(e.ad_w1 || c.ad_w1)}</div></div>
    <div class="kpi-card"><div class="label">К отгрузке</div>
      <div class="value">${fmt(m.plan_batch)}</div><div class="hint">${m.plan_sku} SKU</div></div>
    <div class="kpi-card"><div class="label">STR просели</div>
      <div class="value" style="color:var(--orange)">${m.declining_count || 0}</div></div>
    <div class="kpi-card"><div class="label">Срочно OOS</div>
      <div class="value" style="color:var(--red)">${m.urgent_count}</div></div>`;

  const urg = DATA.urgent || [];
  const el = document.getElementById('urgentAlert');
  if (urg.length) {
    el.style.display = 'block';
    el.innerHTML = '<strong>🔴 OOS/дефицит:</strong> ' + urg.slice(0, 4).map(s => s.sku).join(', ');
  } else el.style.display = 'none';
}

function renderRnp() {
  const rnp = DATA.rnp || {};
  const c = rnp.cabinet || {};
  document.getElementById('weekCompare').innerHTML = rnp.available ? `
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">
      W1: ${rnp.week_current} · W0: ${rnp.week_prev} · as of ${rnp.as_of}</p>
    <div class="compare">
      <div class="box"><div style="font-size:.72rem;color:var(--muted)">Прошлая</div>
        <div style="font-size:1.2rem;font-weight:700">${rub(c.revenue_w0)}</div>
        <div style="font-size:.78rem">${fmt(c.orders_w0)} заказов</div></div>
      <div class="arrow">→</div>
      <div class="box"><div style="font-size:.72rem;color:var(--muted)">Текущая</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--accent)">${rub(c.revenue_w1)}</div>
        <div style="font-size:.78rem">${fmt(c.orders_w1)} заказов ${delta(c.orders_chg_pct)}</div></div>
    </div>` : '<p class="note">Нет wb_brief.db — запустите daily-brief/fetch.py</p>';

  const growing = filterBrand(rnp.growing || []);
  document.querySelector('#tableGrow tbody').innerHTML = growing.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders_w1}</td>
    <td class="num" style="color:var(--green)">+${s.orders_chg_pct}%</td>
    <td class="num">${rub(s.revenue_w1)}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';

  const list = qfilter(filterBrand(rnp.skus || []), 'rnp').sort((a, b) => (b.orders_w1 || 0) - (a.orders_w1 || 0));
  document.querySelector('#tableRnp tbody').innerHTML = list.slice(0, 80).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num">${s.orders_w1}</td>
    <td class="num">${s.orders_chg_pct != null ? (s.orders_chg_pct > 0 ? '+' : '') + s.orders_chg_pct + '%' : '—'}</td>
    <td class="num">${s.str_chg != null ? '<span class="' + (s.str_chg < 0 ? 'z-red' : 'z-green') + '">' + (s.str_chg * 100).toFixed(0) + '%</span>' : '—'}</td>
    <td class="num">${s.buyout_pct ? s.buyout_pct + '%' : '—'}</td>
    <td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td>
    <td>${zoneBadge(s.yard_zone)}</td></tr>`).join('');
}

function renderFocus() {
  const rnp = DATA.rnp || {};
  const focus = rnp.focus_today || [];
  document.getElementById('focusList').innerHTML = focus.length ? focus.map(f => `
    <div class="focus-item">
      <div class="focus-dot ${f.level}"></div>
      <div><strong>${f.title}</strong> · ${f.sku}<br>
      <span style="color:var(--muted)">${f.action}</span></div>
    </div>`).join('') : '<p class="note">Нет критичных задач — или обновите данные</p>';

  const insights = rnp.insights || [];
  document.getElementById('insightsList').innerHTML = insights.map(ins => `
    <div class="focus-item">
      <div class="focus-dot ${ins.priority === 'critical' ? 'critical' : ins.priority === 'warning' ? 'warning' : 'info'}"></div>
      <div><strong>${ins.title}</strong>${ins.sku ? ' · ' + ins.sku : ''}
      <span style="color:var(--muted);font-size:.78rem"> [${ins.role}]</span><br>
      <span style="color:var(--muted);font-size:.8rem">${ins.action.substring(0, 250)}</span></div>
    </div>`).join('') || '<p class="note">Инсайты появятся после fetch daily-brief</p>';
}

function renderStr() {
  const list = filterBrand(DATA.rnp?.declining || DATA.skus_declining || []);
  document.querySelector('#tableStr tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num">${s.sales_w1 ?? s.sold_30d ?? '—'}</td>
    <td class="num">${s.sales_w0 ?? '—'}</td>
    <td class="num" style="color:var(--red)">${s.str_chg != null ? (s.str_chg * 100).toFixed(0) + '%' : '—'}</td>
    <td class="num">${s.orders_chg_pct != null ? s.orders_chg_pct + '%' : '—'}</td>
    <td>${(s.actions || s.rnp_actions || []).join('; ') || (s.stop_ads ? 'Стоп РК' : 'Разбор')}</td>
  </tr>`).join('') || '<tr><td colspan="6">Нет просевших SKU</td></tr>';
}

function renderFunnel() {
  const c = DATA.rnp?.cabinet || {};
  document.getElementById('funnelKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Выкуп W1</div><div class="value">${c.buyout_w1_pct || '—'}%</div></div>
    <div class="kpi-card"><div class="label">Выкуп W0</div><div class="value">${c.buyout_w0_pct || '—'}%</div></div>
    <div class="kpi-card"><div class="label">Заказы 30д</div><div class="value">${fmt(DATA.meta.total_sold_30d)}</div></div>`;

  document.querySelector('#tableBuyout tbody').innerHTML = (DATA.rnp?.low_buyout || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num" style="color:var(--red)">${s.buyout_pct}%</td>
    <td class="num">${s.orders_30d}</td><td class="num">${s.refunds_30d}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';

  const list = qfilter(filterBrand((DATA.rnp?.skus || []).filter(s => s.orders_30d > 0)), 'funnel')
    .sort((a, b) => b.orders_30d - a.orders_30d);
  document.querySelector('#tableFunnel tbody').innerHTML = list.slice(0, 60).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.orders_30d}</td><td class="num">${s.sales_30d}</td>
    <td class="num">${s.buyout_pct}%</td><td class="num">${s.refunds_30d}</td>
    <td class="num">${rub(s.avg_check)}</td></tr>`).join('');
}

function renderPlan() {
  const list = qfilter(filterBrand(DATA.skus_plan), 'plan');
  document.querySelector('#tablePlan tbody').innerHTML = list.map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td><td>${badge(s.status, s.status_label)}</td>
    <td class="num">${s.stock}</td><td class="num">${s.sold_30d}</td>
    <td>${daysCell(s.days_now, s.days_after)}</td>
    <td class="num"><strong>${s.batch || '—'}</strong></td>
    <td class="num">${rub(s.purchase_sum)}</td>
    <td>${whTags(s.warehouses_rec)}</td></tr>`).join('');
  const m = DATA.meta;
  document.getElementById('planNote').innerHTML =
    `Итого: <b>${fmt(m.plan_batch)} шт</b> · закуп ~<b>${rub(m.purchase_sum)}</b> · ИЛ <b>${pct(m.localization_avg)}</b>`;
}

function renderLogistics() {
  const m = DATA.meta;
  document.getElementById('logKpi').innerHTML = `<p style="font-size:1.3rem;font-weight:700;color:var(--green)">${rub(m.savings_est)}</p>
    <p style="color:var(--muted);font-size:.82rem">экономия при правильном распределении</p>
    <p>Логистика 90д: <b>${rub(m.logistics_rub_90d)}</b></p>`;
  document.getElementById('locKpi').innerHTML = `<p style="font-size:1.3rem;font-weight:700">${pct(m.localization_avg)}</p>
    <p style="color:var(--muted);font-size:.82rem">индекс локализации · цель ↑ · ИРП → 0%</p>`;
  const list = qfilter(filterBrand(DATA.skus_all.filter(s => s.logistics_rub_90d > 0 || s.savings_est > 0)), 'log')
    .sort((a, b) => b.savings_est - a.savings_est).slice(0, 60);
  document.querySelector('#tableLog tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${rub(s.logistics_rub_90d)}</td>
    <td class="num">${s.logistics_per_unit != null ? s.logistics_per_unit + ' ₽' : '—'}</td>
    <td class="num">${pct(s.localization_pct)}</td>
    <td class="num" style="color:var(--green)">${rub(s.savings_est)}</td>
    <td>${whTags(s.warehouses_rec)}</td></tr>`).join('');
}

function renderMinus() {
  const e = DATA.economics || {};
  const c = e.cabinet || {};
  if (!e.available) {
    document.getElementById('minusKpi').innerHTML = '<p class="note">Нет данных экономики — обновите wb_brief</p>';
    return;
  }
  document.getElementById('minusKpi').innerHTML = `
    <div class="kpi-card accent"><div class="label">Прибыль W1</div><div class="value">${rub(c.profit_w1)}</div></div>
    <div class="kpi-card"><div class="label">Прибыль W0</div><div class="value">${rub(c.profit_w0)}</div></div>
    <div class="kpi-card"><div class="label">Минус SKU</div><div class="value z-red">${c.minus_sku_count}</div></div>
    <div class="kpi-card"><div class="label">Сумма минуса</div><div class="value z-red">${rub(c.minus_total_w1)}</div></div>
    <div class="kpi-card"><div class="label">В плюсе</div><div class="value z-green">${c.green_count}</div></div>`;

  const list = qfilter(filterBrand(e.minus || []), 'minus');
  document.querySelector('#tableMinus tbody').innerHTML = list.map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td>
    <td class="num" style="color:var(--red);font-weight:700">${rub(s.profit_w1)}</td>
    <td class="num">${rub(s.profit_w0)}</td>
    <td class="num">${rub(s.for_pay_w1)}</td>
    <td class="num">${rub(s.ad_w1)}</td>
    <td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td>
    <td class="num">${s.stock}</td>
    <td><span style="font-size:.78rem">${s.action}</span></td></tr>`).join('') || '<tr><td colspan="8">Нет минусовых 🎉</td></tr>';

  document.querySelector('#tableGreen tbody').innerHTML = (e.green || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td>
    <td class="num" style="color:var(--green)">${rub(s.profit_w1)}</td>
    <td class="num">${s.sales_w1}</td>
    <td class="num">${s.drr_w1 ? s.drr_w1 + '%' : '—'}</td>
    <td class="num">${s.roas_w1 ? s.roas_w1 + '%' : '—'}</td></tr>`).join('');

  document.querySelector('#tableZero tbody').innerHTML = (e.zero_sales || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.stock}</td>
    <td class="num">${rub(s.ad_w1)}</td>
    <td>Стоп РК · не довозить</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';

  document.getElementById('minusNote').innerHTML = e.has_costs
    ? `Себестоимость загружена (${e.costs_loaded} SKU) · прибыль = forPay − логистика − реклама − COGS`
    : `⚠ Себестоимость не найдена (положите Шаблон_Себестоимость_wb*.xlsx в ~/Downloads) · показан опер. результат без COGS`;
}

function renderAds() {
  const e = DATA.economics || {};
  const c = e.cabinet || {};
  document.getElementById('adsKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Реклама W1</div><div class="value">${rub(c.ad_w1 || DATA.meta.ad_spend_30d)}</div></div>
    <div class="kpi-card"><div class="label">Слив (ad bleed)</div><div class="value z-red">${(e.ad_bleed||[]).length}</div></div>
    <div class="kpi-card"><div class="label">Кампаний</div><div class="value">${(e.campaigns||[]).length}</div></div>`;

  document.querySelector('#tableAdBleed tbody').innerHTML = (e.ad_bleed || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${rub(s.ad_w1)}</td>
    <td class="num" style="color:var(--red)">${rub(s.profit_w1)}</td>
    <td class="num">${s.drr_w1}%</td><td class="num">${s.roas_w1 ? s.roas_w1+'%' : '—'}</td>
    <td><span class="z-red">${s.action}</span></td></tr>`).join('') || '<tr><td colspan="6">—</td></tr>';

  document.querySelector('#tableCampaigns tbody').innerHTML = (e.campaigns || []).slice(0, 25).map(c => `<tr>
    <td><span style="font-size:.72rem;color:var(--muted)">${(c.camp||'').slice(0,40)}</span><br>${c.sku||c.nm_id}</td>
    <td class="num">${rub(c.spend_w1)}</td><td class="num">${c.drr_w1 ? c.drr_w1+'%' : '—'}</td>
    <td class="num">${rub(c.profit_w1)}</td>
    <td>${c.action === 'СТОП' ? '<span class="z-red">СТОП</span>' : c.action === 'Срез' ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>'}</td></tr>`).join('') || '<tr><td colspan="5">—</td></tr>';

  const rnpMap = {};
  (DATA.rnp?.skus || []).forEach(s => { rnpMap[s.nm_id] = s; });
  const econMap = {};
  (e.skus || []).forEach(s => { econMap[s.nm_id] = s; });
  const list = qfilter(filterBrand(
    DATA.skus_ads || DATA.skus_all.filter(s => s.ad_spend_30d > 0 || s.ad_w1 > 0)
  ), 'ads').sort((a, b) => (b.ad_w1 || b.ad_spend_30d || 0) - (a.ad_w1 || a.ad_spend_30d || 0));

  document.querySelector('#tableAds tbody').innerHTML = list.map(s => {
    const ec = econMap[s.nm_id] || {};
    const rec = s.stop_ads || ec.is_minus ? '<span class="z-red">СТОП РК</span>'
      : (ec.drr_w1 > 12 || s.drr > 0.12) ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>';
    return `<tr><td>${s.sku || s.nm_id}</td>
      <td class="num">${rub(ec.ad_w1 || s.ad_w1)}</td>
      <td class="num">${rub(s.ad_spend_30d)}</td>
      <td class="num">${ec.drr_w1 ? ec.drr_w1+'%' : (s.drr ? pct(s.drr) : '—')}</td>
      <td class="num" style="color:${(ec.profit_w1||0)<0?'var(--red)':'inherit'}">${rub(ec.profit_w1)}</td>
      <td>${rec}</td></tr>`;
  }).join('');
}

function renderStock() {
  const list = qfilter(filterBrand(DATA.skus_all), 'stock').sort((a, b) => b.stock - a.stock);
  document.querySelector('#tableStock tbody').innerHTML = list.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td>${s.brand}</td><td class="num">${s.stock}</td>
    <td class="num">${s.in_way}</td><td class="num">${s.sold_30d}</td>
    <td class="num">${s.days_now != null ? s.days_now + 'д' : '—'}</td>
    <td>${badge(s.status, s.status_label)}</td><td>${whTags(s.warehouses_stock)}</td></tr>`).join('');
}

function renderYard() {
  const y = DATA.yard || {};
  document.getElementById('yardKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Зелёные</div><div class="value z-green">${y.green || 0}</div></div>
    <div class="kpi-card"><div class="label">Жёлтые</div><div class="value z-yellow">${y.yellow || 0}</div></div>
    <div class="kpi-card"><div class="label">Красные</div><div class="value z-red">${y.red || 0}</div></div>
    <div class="kpi-card"><div class="label">Стоп РК</div><div class="value">${y.stop_ads || 0}</div></div>`;
  document.getElementById('yardChecklist').innerHTML = `<ul style="padding-left:18px;font-size:.85rem;color:var(--muted);line-height:2">
    <li><b style="color:var(--text)">Стоп РК</b> на красных и аут-SKU</li>
    <li><b style="color:var(--text)">OOS</b> — приоритет отгрузки, не масштабировать РК</li>
    <li><b style="color:var(--text)">STR просели</b> — ${DATA.meta.declining_count} SKU</li>
    <li><b style="color:var(--text)">Связка остаток ↔ реклама</b></li>
    <li><b style="color:var(--text)">Лесенка ставок</b> после OOS, не max сразу</li>
    <li><b style="color:var(--text)">ИЛ высокий</b> → ИРП 0%</li></ul>`;
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

function render() {
  if (!DATA) return;
  renderKpiMain(); renderRnp(); renderFocus(); renderStr(); renderFunnel();
  renderMinus(); renderPlan(); renderLogistics(); renderAds(); renderStock(); renderYard();
  renderWarehouses(); renderStop();
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});
document.getElementById('brandFilter').addEventListener('change', e => { state.brand = e.target.value; render(); });
['searchRnp', 'searchPlan', 'searchLog', 'searchAds', 'searchStock', 'searchFunnel', 'searchMinus'].forEach(id => {
  const key = id.replace('search', '').toLowerCase();
  document.getElementById(id).addEventListener('input', e => { state.q[key] = e.target.value.toLowerCase(); render(); });
});

loadData();
