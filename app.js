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
  return list.filter(s => brandOf(s) === state.brand);
}

function brandOf(s) {
  if (s.brand) return s.brand;
  const nm = s.nm_id;
  if (!nm || !DATA?.skus_all) return '';
  const row = DATA.skus_all.find(x => x.nm_id === nm);
  return row?.brand || '';
}

function brandNmIds() {
  if (!state.brand || !DATA?.skus_all) return null;
  return new Set(DATA.skus_all.filter(s => s.brand === state.brand).map(s => s.nm_id));
}

function sumSkuPeriodBrand(from, to) {
  const nms = brandNmIds();
  if (!nms || !DATA.sku_series?.available) return null;
  let orders = 0, revenue = 0, sales = 0, ad = 0;
  for (const nm of nms) {
    const s = sumSkuPeriod(nm, from, to);
    orders += s.orders;
    revenue += s.revenue;
    sales += s.sales;
    ad += s.ad;
  }
  return {
    orders, revenue, sales, ad,
    drr: revenue ? Math.round(ad / revenue * 1000) / 10 : 0,
    buyout_pct: orders ? Math.round(sales / orders * 1000) / 10 : 0,
    avg_check: orders ? Math.round(revenue / orders) : 0,
  };
}

function canApiRefresh() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
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
  const d = DATA?.daily;
  let from, to, label;
  if (d?.available && state.period !== 'custom' && d.presets?.[state.period]) {
    const p = d.presets[state.period];
    from = p.from;
    to = p.to;
    label = p.label;
  } else if (state.dateFrom && state.dateTo) {
    from = state.dateFrom;
    to = state.dateTo;
    label = `${from} — ${to}`;
  } else if (d?.available && d.presets?.yesterday) {
    const p = d.presets.yesterday;
    from = p.from;
    to = p.to;
    label = p.label;
  } else return null;
  if (state.brand) label = `${label} · ${state.brand}`;
  return { from, to, label };
}

function buildCabinetDailySeries(from, to) {
  if (!from || !to) return [];
  if (state.brand && DATA.sku_series?.available) {
    const nms = brandNmIds();
    const byDate = {};
    for (const nm of nms || []) {
      const row = DATA.sku_series.skus[String(nm)];
      if (!row?.days) continue;
      for (const [d, v] of Object.entries(row.days)) {
        if (d < from || d > to) continue;
        const r = byDate[d] || { date: d, revenue: 0, sales: 0, ad: 0, drr: 0 };
        r.revenue += v.r || 0;
        r.sales += v.s || 0;
        r.ad += v.ad || 0;
        byDate[d] = r;
      }
    }
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(r => ({
      ...r,
      drr: r.revenue ? Math.round(r.ad / r.revenue * 1000) / 10 : 0,
    }));
  }
  return (DATA.daily?.daily || []).filter(r => r.date >= from && r.date <= to);
}

function updateFilterStateLabel() {
  const el = document.getElementById('filterStateLabel');
  const b = periodBounds();
  if (el) el.textContent = b ? `Показано: ${b.label}` : '';
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
  if (!ps || !bounds?.from || !bounds?.to) return null;
  const [pFrom, pTo] = prevPeriodRange(bounds.from, bounds.to);
  const prev = state.brand
    ? (sumSkuPeriodBrand(pFrom, pTo) || { revenue: 0, orders: 0, sales: 0, ad: 0, drr: 0, buyout_pct: 0 })
    : sumDaily((DATA.daily?.daily || []).filter(r => r.date >= pFrom && r.date <= pTo));
  const chg = v => prev[v] ? Math.round((ps[v] - prev[v]) / prev[v] * 1000) / 10 : null;
  let chg_rev = chg('revenue');
  let chg_ord = chg('orders');
  let label = `${pFrom} — ${pTo}`;
  if (!state.brand && state.period !== 'custom' && DATA.daily?.presets?.[state.period]) {
    const p = DATA.daily.presets[state.period];
    if (p.chg_revenue_pct != null) chg_rev = p.chg_revenue_pct;
    if (p.chg_orders_pct != null) chg_ord = p.chg_orders_pct;
    if (p.compare_label) label = p.compare_label;
  }
  return { cur: ps, prev, label, chg_rev, chg_ord };
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
  }).filter(s => s.orders > 0 || s.orders_prev >= 2 || s.ad > 100)
    .filter(s => !state.brand || s.brand === state.brand);
}

function renderGuides() {
  const b = periodBounds();
  const pl = b ? `<b>${b.label}</b>` : 'выбранный период';
  setGuide('today', 'С чего начать', [
    'Светофор — есть ли пожар по кабинету',
    `KPI за ${pl} — выручка, заказы, ДРР`,
    'Быстрые задачи ниже → полный список на вкладке <b>Фокус</b>',
  ], 'Период сверху влияет на все вкладки');
  setGuide('focus', 'Фокус по заказам', [
    'Сравнение только: <b>вчера</b> vs <b>тот же день недели назад</b>',
    '🔴 сильная просадка · 🟡 умеренная · 🟢 рост',
    'Период сверху на эту вкладку не влияет',
  ], 'Только заказы, без рекламы и P&L');
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
    'KPI прибыли и минусов за выбранный период',
    '«В минусе» — стоп/срез по action',
    '«Залежи» — реклама при нуле продаж',
  ], `P&L за ${pl} · себестоимость из Jam`);
  setGuide('ads', 'Реклама', [
    '1. Слив — минус + реклама → стоп РК',
    '2. ДРР >15% или CPO высокий → срез ставок',
    '3. Кампании без SKU — привязать артикул',
  ], `KPI и таблицы за ${pl} · fullstats API`);
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

function econAction(s) {
  const actions = [];
  if (s.profit < 0) {
    if (s.ad > 200 && s.drr > 15) actions.push('СТОП РК');
    else if (s.ad > 0 && s.drr > 12) actions.push('Срез РК −30%');
    if (s.sales === 0 && s.stock > 20) actions.push('Залежь — не довозить');
    if (s.sales === 0) actions.push('0 продаж — стоп всего');
    else if (s.logistics > s.for_pay * 0.3) actions.push('Логистика жрёт — проверить ИЛ');
    if (!actions.length) actions.push('Разбор экономики / цена');
  } else if (s.profit_after_ad < 0 && s.ad > 0) {
    actions.push('Реклама съедает маржу');
  }
  return actions.join('; ') || 'Ок';
}

function economicsBrandSlice(ep) {
  if (!ep || !state.brand) return ep;
  const minus = (ep.minus || []).filter(s => brandOf(s) === state.brand);
  const green = (ep.green || []).filter(s => brandOf(s) === state.brand);
  const zero_sales = (ep.zero_sales || []).filter(s => brandOf(s) === state.brand);
  const tracked = [...minus, ...green];
  return {
    ...ep,
    minus,
    green,
    zero_sales,
    cabinet: {
      profit: Math.round(tracked.reduce((a, s) => a + (s.profit || 0), 0)),
      minus_sku_count: minus.length,
      minus_total: Math.round(minus.reduce((a, s) => a + (s.profit || 0), 0)),
      green_count: green.length,
      ad: Math.round(tracked.concat(zero_sales).reduce((a, s) => a + (s.ad || 0), 0)),
    },
  };
}

function buildEconomicsForPeriod() {
  const bounds = periodBounds();
  const e = DATA.economics || {};
  if (!bounds || !e.available) return null;

  let ep;
  if (state.period !== 'custom' && e.periods?.[state.period]) {
    const p = e.periods[state.period];
    ep = {
      bounds: { ...bounds, from: p.from, to: p.to },
      cabinet: p.cabinet,
      minus: p.minus,
      green: p.green,
      zero_sales: p.zero_sales,
      has_costs: e.has_costs,
      costs_loaded: e.costs_loaded,
      source: 'server',
    };
  } else {
    const costMap = {};
    const stockMap = {};
    const metaMap = {};
    (e.skus || []).forEach(s => {
      costMap[s.nm_id] = s.cost_unit || 0;
      stockMap[s.nm_id] = s.stock;
      metaMap[s.nm_id] = s;
    });

    if (!DATA.sku_series?.available) {
      ep = {
        bounds,
        cabinet: {
          profit: e.cabinet?.profit_w1,
          minus_sku_count: e.cabinet?.minus_sku_count,
          minus_total: e.cabinet?.minus_total_w1,
          green_count: e.cabinet?.green_count,
        },
        minus: (e.minus || []).map(s => ({
          ...s, profit: s.profit_w1, for_pay: s.for_pay_w1, ad: s.ad_w1, sales: s.sales_w1,
        })),
        green: (e.green || []).map(s => ({
          ...s, profit: s.profit_w1, sales: s.sales_w1, drr: s.drr_w1,
        })),
        zero_sales: (e.zero_sales || []).map(s => ({ ...s, ad: s.ad_w1 })),
        has_costs: e.has_costs,
        costs_loaded: e.costs_loaded,
        fallback: true,
      };
    } else {
      const skus = [];
      const nms = brandNmIds();
      for (const base of (e.skus || [])) {
        const nm = base.nm_id;
        if (nms && !nms.has(nm)) continue;
        const row = DATA.sku_series.skus[String(nm)];
        if (!row?.days) continue;
        let fp = 0, sales = 0, ad = 0, rev = 0, lg = 0, st = 0;
        for (const [d, v] of Object.entries(row.days)) {
          if (d >= bounds.from && d <= bounds.to) {
            fp += v.fp || 0;
            sales += v.s || 0;
            ad += v.ad || 0;
            rev += v.r || 0;
            lg += v.lg || 0;
            st += v.st || 0;
          }
        }
        if (!fp && !sales && !ad && !rev && !lg && !st) continue;
        const cost = costMap[nm] || 0;
        const cogs = cost >= 5 ? cost * sales : 0;
        const oper = fp - lg - st - ad;
        const profit = cogs ? oper - cogs : oper;
        const drr = rev ? Math.round(ad / rev * 1000) / 10 : 0;
        const rec = {
          nm_id: nm,
          sku: row.sku || base.sku || nm,
          brand: row.brand || base.brand,
          stock: stockMap[nm] || 0,
          for_pay: Math.round(fp),
          profit: Math.round(profit),
          ad: Math.round(ad),
          sales,
          drr,
          logistics: Math.round(lg),
          oper_profit: Math.round(oper),
          profit_after_ad: Math.round(oper),
        };
        rec.is_minus = profit < 0 && (sales > 0 || ad > 100);
        rec.is_green = profit > 500 && sales >= 3;
        rec.action = econAction(rec);
        skus.push(rec);
      }

      const minus = skus.filter(s => s.is_minus).sort((a, b) => a.profit - b.profit);
      const green = skus.filter(s => s.is_green).sort((a, b) => b.profit - a.profit).slice(0, 20);
      const zero_sales = skus.filter(s => s.sales === 0 && s.stock > 5)
        .sort((a, b) => b.stock - a.stock).slice(0, 25);

      ep = {
        bounds,
        cabinet: {
          profit: Math.round(skus.reduce((a, s) => a + s.profit, 0)),
          minus_sku_count: minus.length,
          minus_total: Math.round(minus.reduce((a, s) => a + s.profit, 0)),
          green_count: green.length,
          ad: Math.round(skus.reduce((a, s) => a + s.ad, 0)),
        },
        minus,
        green,
        zero_sales,
        has_costs: e.has_costs,
        costs_loaded: e.costs_loaded,
      };
    }
  }
  return economicsBrandSlice(ep);
}

function filterDailyByPeriod(rows, from, to) {
  if (!rows?.length || !from || !to) return [];
  return rows.filter(r => r.date >= from && r.date <= to);
}

function sumAdDailyRows(rows) {
  const m = { spend: 0, views: 0, clicks: 0, orders: 0, atbs: 0 };
  for (const r of rows) {
    m.spend += r.spend || 0;
    m.views += r.views || 0;
    m.clicks += r.clicks || 0;
    m.orders += r.orders || 0;
    m.atbs += r.atbs || 0;
  }
  return aggAdMetrics(m);
}

function aggAdMetrics(m) {
  const spend = m.spend || 0;
  const views = m.views || 0;
  const clicks = m.clicks || 0;
  const orders = m.orders || 0;
  const atbs = m.atbs || 0;
  const revenue = m.revenue || 0;
  return {
    spend: Math.round(spend),
    views, clicks, orders, atbs,
    revenue,
    ctr: views ? Math.round(clicks / views * 10000) / 100 : null,
    cpc: clicks ? Math.round(spend / clicks * 100) / 100 : null,
    cpm: views ? Math.round(spend / views * 100000) / 100 : null,
    cr: clicks ? Math.round(orders / clicks * 10000) / 100 : null,
    cpo: orders ? Math.round(spend / orders * 100) / 100 : null,
    roas: spend && revenue ? Math.round(revenue / spend * 1000) / 10 : null,
    drr: revenue && spend ? Math.round(spend / revenue * 1000) / 10 : null,
  };
}

function buildAdsForPeriod() {
  const bounds = periodBounds();
  const a = DATA.ads_detail || {};
  if (!bounds) return null;

  const { from, to } = bounds;
  let dailyChart = filterDailyByPeriod(a.daily || [], from, to);
  let cab;

  if (state.brand) {
    const bs = sumSkuPeriodBrand(from, to) || { ad: 0, revenue: 0, orders: 0, sales: 0 };
    dailyChart = buildCabinetDailySeries(from, to).map(r => ({
      date: r.date,
      spend: r.ad,
      views: 0,
      clicks: 0,
      orders: 0,
    }));
    cab = aggAdMetrics({
      spend: bs.ad,
      views: 0,
      clicks: 0,
      orders: 0,
      atbs: 0,
      revenue: bs.revenue,
    });
  } else if (dailyChart.length) {
    cab = sumAdDailyRows(dailyChart);
  } else {
    const drows = filterDailyByPeriod(DATA.daily?.daily || [], from, to);
    const spend = drows.reduce((s, r) => s + (r.ad || 0), 0);
    const revenue = drows.reduce((s, r) => s + (r.revenue || 0), 0);
    cab = aggAdMetrics({ spend, views: 0, clicks: 0, orders: 0, atbs: 0, revenue });
    dailyChart = drows.map(r => ({ date: r.date, spend: r.ad || 0 }));
  }

  if (!state.brand) {
    const revCab = filterDailyByPeriod(DATA.daily?.daily || [], from, to)
      .reduce((s, r) => s + (r.revenue || 0), 0);
    if (revCab) {
      cab.revenue = revCab;
      cab.drr = cab.spend ? Math.round(cab.spend / revCab * 1000) / 10 : null;
      cab.roas = cab.spend ? Math.round(revCab / cab.spend * 1000) / 10 : null;
    }
  }

  const adSkuMeta = {};
  (a.skus || []).forEach(s => { adSkuMeta[s.nm_id] = s; });

  const skus = [];
  const pushSku = (nmId, skuName, dailyRows, meta = {}) => {
    const filtered = filterDailyByPeriod(dailyRows || [], from, to);
    let metrics;
    if (filtered.length) {
      metrics = sumAdDailyRows(filtered);
    } else {
      const cur = sumSkuPeriod(nmId, from, to);
      if (!cur.ad) return;
      metrics = aggAdMetrics({
        spend: cur.ad, views: 0, clicks: 0, orders: 0, atbs: 0, revenue: cur.revenue,
      });
    }
    const cur = sumSkuPeriod(nmId, from, to);
    if (cur.revenue) {
      metrics.revenue = cur.revenue;
      metrics.drr = metrics.spend ? Math.round(metrics.spend / cur.revenue * 1000) / 10 : null;
      metrics.roas = metrics.spend ? Math.round(cur.revenue / metrics.spend * 1000) / 10 : null;
    }
    if (!metrics.spend && !metrics.views) return;
    skus.push({
      nm_id: nmId,
      sku: skuName,
      campaigns_count: meta.campaigns_count,
      ...metrics,
    });
  };

  if (DATA.sku_series?.available) {
    for (const row of Object.values(DATA.sku_series.skus)) {
      if (state.brand && row.brand !== state.brand) continue;
      const adRow = adSkuMeta[row.nm_id];
      if (adRow) pushSku(row.nm_id, row.sku || adRow.sku, adRow.daily, { campaigns_count: adRow.campaigns_count });
      else pushSku(row.nm_id, row.sku, null);
    }
  } else {
    (a.skus || []).forEach(s => pushSku(s.nm_id, s.sku, s.daily, { campaigns_count: s.campaigns_count }));
  }
  skus.sort((x, y) => y.spend - x.spend);

  const campaigns = (a.campaigns || DATA.economics?.campaigns || []).map(c => {
    const filtered = filterDailyByPeriod(c.daily || [], from, to);
    if (filtered.length) {
      const m = sumAdDailyRows(filtered);
      const rev = c.nm_id ? sumSkuPeriod(c.nm_id, from, to).revenue : 0;
      return {
        ...c,
        spend: m.spend,
        views: m.views,
        clicks: m.clicks,
        orders: m.orders,
        ctr: m.ctr,
        cpc: m.cpc,
        cpo: m.cpo,
        drr: rev && m.spend ? Math.round(m.spend / rev * 1000) / 10 : null,
        fallback: false,
      };
    }
    if (c.nm_id) {
      const cur = sumSkuPeriod(c.nm_id, from, to);
      if (!cur.ad) return null;
      const rev = cur.revenue;
      return {
        ...c,
        spend: Math.round(cur.ad),
        views: 0,
        clicks: 0,
        orders: cur.orders,
        ctr: null,
        cpc: null,
        cpo: cur.orders ? Math.round(cur.ad / cur.orders) : null,
        drr: rev && cur.ad ? Math.round(cur.ad / rev * 1000) / 10 : null,
        fallback: false,
      };
    }
    return null;
  }).filter(Boolean).filter(c => c.spend > 0)
    .filter(c => !state.brand || brandOf(c) === state.brand).sort((x, y) => y.spend - x.spend);

  const ep = buildEconomicsForPeriod();
  const econMap = {};
  (ep?.minus || []).concat(ep?.zero_sales || []).forEach(s => { econMap[s.nm_id] = s; });
  const adBleed = (ep?.minus || []).filter(s => s.ad > 200).map(s => {
    const adRow = adSkuMeta[s.nm_id];
    const filtered = adRow ? filterDailyByPeriod(adRow.daily || [], from, to) : [];
    const adM = filtered.length ? sumAdDailyRows(filtered) : aggAdMetrics({ spend: s.ad, views: 0, clicks: 0, orders: 0, atbs: 0 });
    const cur = sumSkuPeriod(s.nm_id, from, to);
    return {
      ...s,
      views: adM.views,
      ctr: adM.ctr,
      drr: cur.drr,
      roas: adM.spend && cur.revenue ? Math.round(cur.revenue / adM.spend * 1000) / 10 : null,
    };
  });

  const unmapped = (a.unmapped || []).map(c => {
    const filtered = filterDailyByPeriod(c.daily || [], from, to);
    const spend = filtered.length
      ? filtered.reduce((s, r) => s + (r.spend || 0), 0)
      : (c.spend_30d || 0);
    return { ...c, spend };
  }).filter(c => c.spend > 0);

  const meta = a.cabinet || {};
  return {
    bounds,
    cabinet: cab,
    dailyChart,
    skus,
    campaigns,
    adBleed,
    unmapped,
    has_fullstats: a.has_fullstats,
    note: a.note,
    campaigns_total: meta.campaigns_total || campaigns.length,
    campaigns_active: meta.campaigns_active,
    fallback: campaigns.some(c => c.fallback) && !dailyChart.length,
  };
}

function qfilter(list, key, fields = ['sku']) {
  const q = state.q[key] || '';
  let out = list;
  if (state.brand) out = out.filter(s => brandOf(s) === state.brand);
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

  let from, to, label, compareLabel, presetChg;
  if (state.period !== 'custom' && d.presets?.[state.period]) {
    const p = d.presets[state.period];
    from = p.from;
    to = p.to;
    label = p.label;
    compareLabel = p.compare_label;
    presetChg = {
      chg_revenue_pct: p.chg_revenue_pct,
      chg_orders_pct: p.chg_orders_pct,
      chg_sales_pct: p.chg_sales_pct,
    };
    if (!state.brand) {
      return { ...p.stats, ...presetChg, compare_label: compareLabel, label, from, to };
    }
  } else {
    from = state.dateFrom;
    to = state.dateTo;
    label = `${from} — ${to}`;
    const rows = getDailyRows();
    if (!rows.length) return null;
    if (!state.brand) {
      const s = sumDaily(rows);
      const [pFrom, pTo] = prevPeriodRange(from, to);
      const prevRows = (DATA.daily?.daily || []).filter(r => r.date >= pFrom && r.date <= pTo);
      const prev = sumDaily(prevRows);
      const chg = v => prev[v] ? Math.round((s[v] - prev[v]) / prev[v] * 1000) / 10 : null;
      return {
        ...s,
        label,
        from,
        to,
        chg_revenue_pct: chg('revenue'),
        chg_orders_pct: chg('orders'),
        chg_sales_pct: chg('sales'),
        compare_label: `${pFrom} — ${pTo}`,
      };
    }
  }

  const brandStats = sumSkuPeriodBrand(from, to);
  if (!brandStats) return null;
  const [pFrom, pTo] = prevPeriodRange(from, to);
  const prevBrand = sumSkuPeriodBrand(pFrom, pTo) || { revenue: 0, orders: 0, sales: 0 };
  const chg = v => prevBrand[v] ? Math.round((brandStats[v] - prevBrand[v]) / prevBrand[v] * 1000) / 10 : null;
  return {
    ...brandStats,
    label: `${label} · ${state.brand}`,
    from,
    to,
    chg_revenue_pct: chg('revenue'),
    chg_orders_pct: chg('orders'),
    chg_sales_pct: chg('sales'),
    compare_label: compareLabel || `${pFrom} — ${pTo}`,
  };
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
  const prevBrand = state.brand || sel.value;
  sel.innerHTML = '<option value="">Все бренды</option>';
  brands.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  if (prevBrand && brands.includes(prevBrand)) {
    sel.value = prevBrand;
    state.brand = prevBrand;
  } else if (prevBrand) {
    state.brand = '';
  }
  setupRefreshUi();
  updateRangeLabel();
  render();
}

function setupRefreshUi() {
  const btn = document.getElementById('btnRefresh');
  if (!btn) return;
  if (canApiRefresh()) {
    btn.disabled = false;
    btn.title = 'Подтянуть данные с WB API (локальный serve.py)';
    btn.classList.remove('btn-refresh-off');
  } else {
    btn.disabled = true;
    btn.title = 'На GitHub Pages данные обновляются при публикации (fetch + publish_dashboard.py)';
    btn.classList.add('btn-refresh-off');
  }
}

async function refreshFromApi() {
  if (!canApiRefresh()) return;
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
    alert('Ошибка обновления: ' + (e.message || e));
  }
  setTimeout(() => { setupRefreshUi(); btn.textContent = '↻ Обновить'; }, 2000);
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

  const ep = buildEconomicsForPeriod();
  const ec = ep?.cabinet || {};
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
      <div class="value" style="color:var(--red)">${ec.minus_sku_count || 0}</div>
      <div class="hint">${rub(ec.minus_total)}</div></div>
    <div class="kpi-card"><span class="icon">📦</span><div class="label">Запас кабинета</div>
      <div class="value">${DATA.meta.cabinet_days_now || '—'}<span style="font-size:.9rem"> дн</span></div>
      <div class="hint">цель ${DATA.meta.target_days || 35} дн</div></div>
    <div class="kpi-card"><span class="icon">🚚</span><div class="label">К отгрузке</div>
      <div class="value">${fmt(DATA.meta.plan_batch)}</div>
      <div class="hint">${DATA.meta.plan_sku} SKU</div></div>`;

  const all = d.daily || [];
  const bounds = periodBounds();
  const chartRows = bounds ? buildCabinetDailySeries(bounds.from, bounds.to) : all.slice(-30);
  const drrRows = chartRows.length > 7 ? chartRows.slice(-7) : chartRows;
  const chartLabel = bounds?.label || '30 дней';
  document.getElementById('chartRevTag').textContent = chartLabel;
  document.getElementById('chartDrrTag').textContent = chartLabel;
  drawLineChart(document.getElementById('chartRevenue'), chartRows, ['revenue', 'sales'], ['#2563eb', '#94a3b8']);
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
    if (cmp?.prev && bounds) {
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

function focusYesterdayBounds() {
  const d = DATA.daily;
  if (!d?.available) return null;
  const p = d.presets?.yesterday;
  const yDay = p?.from || d.as_of;
  const dt = new Date(yDay + 'T12:00:00');
  dt.setDate(dt.getDate() - 7);
  const weekAgo = dt.toISOString().slice(0, 10);
  return {
    yDay,
    weekAgo,
    label: p?.label || yDay,
    compareLabel: p?.compare_label || weekAgo,
  };
}

function buildFocusForPeriod() {
  const b = focusYesterdayBounds();
  if (!b || !DATA.sku_series?.available) return [];

  const { yDay, weekAgo, compareLabel } = b;
  const items = [];
  const yPreset = DATA.daily.presets?.yesterday;
  const yStats = yPreset?.stats;
  const prevStats = yPreset?.compare;

  if (yStats && prevStats?.orders > 0 && !state.brand) {
    const chg = Math.round((yStats.orders - prevStats.orders) / prevStats.orders * 100);
    if (chg <= -25) {
      items.push({
        level: 'critical',
        title: 'Заказы кабинета',
        sku: 'кабинет',
        action: `${yStats.orders} vs ${prevStats.orders} вчера (−${Math.abs(chg)}% к неделе назад)`,
      });
    } else if (chg >= 25) {
      items.push({
        level: 'info',
        title: 'Заказы кабинета',
        sku: 'кабинет',
        action: `${yStats.orders} vs ${prevStats.orders} вчера (+${chg}%)`,
      });
    }
  }

  Object.values(DATA.sku_series.skus || {}).forEach(row => {
    if (state.brand && row.brand !== state.brand) return;
    const cur = sumSkuPeriod(row.nm_id, yDay, yDay).orders;
    const prev = sumSkuPeriod(row.nm_id, weekAgo, weekAgo).orders;
    if (cur === 0 && prev === 0) return;

    const sku = row.sku || row.nm_id;
    let chg = null;
    if (prev > 0) chg = Math.round((cur - prev) / prev * 100);
    else if (cur > 0) chg = 100;

    if (cur === 0 && prev >= 3) {
      items.push({
        level: 'critical',
        title: 'Нет заказов вчера',
        sku,
        action: `0 vs ${prev} (${compareLabel || weekAgo})`,
      });
    } else if (chg != null && chg <= -30 && prev >= 3) {
      items.push({
        level: 'critical',
        title: 'Просадка заказов',
        sku,
        action: `${cur} vs ${prev} вчера (−${Math.abs(chg)}%)`,
      });
    } else if (chg != null && chg <= -15 && prev >= 2) {
      items.push({
        level: 'warning',
        title: 'Просадка заказов',
        sku,
        action: `${cur} vs ${prev} вчера (−${Math.abs(chg)}%)`,
      });
    } else if (chg != null && chg >= 15 && cur >= 2) {
      items.push({
        level: 'info',
        title: 'Рост заказов',
        sku,
        action: `${cur} vs ${prev} вчера (+${chg}%)`,
      });
    }
  });

  const seen = new Set();
  return items.filter(it => {
    const k = `${it.title}|${it.sku}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return (rank[a.level] ?? 9) - (rank[b.level] ?? 9);
  }).slice(0, 20);
}

function renderFocus() {
  const b = focusYesterdayBounds();
  const labelEl = document.getElementById('focusPeriodLabel');
  if (labelEl) {
    labelEl.textContent = b
      ? `Сравнение заказов: вчера (${b.yDay}) vs ${b.compareLabel || b.weekAgo}`
      : '';
  }

  const focus = buildFocusForPeriod();
  document.getElementById('focusCritical').innerHTML = focusHtml(focus.filter(f => f.level === 'critical'));
  document.getElementById('focusWarning').innerHTML = focusHtml(focus.filter(f => f.level === 'warning'));
  document.getElementById('focusGrowth').innerHTML = focusHtml(focus.filter(f => f.level === 'info'));
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
    if (state.brand && brandOf(row) !== state.brand) continue;
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
  const ep = buildEconomicsForPeriod();
  const labelEl = document.getElementById('minusPeriodLabel');
  if (labelEl) labelEl.textContent = ep?.bounds ? `· ${ep.bounds.label}` : '';

  if (!e.available || !ep) {
    document.getElementById('minusKpi').innerHTML = '<p class="note">Нет экономики</p>';
    return;
  }
  const c = ep.cabinet;
  document.getElementById('minusKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Прибыль</div>
      <div class="value ${c.profit < 0 ? 'z-red' : 'z-green'}">${rub(c.profit)}</div>
      <div class="hint">за период</div></div>
    <div class="kpi-card"><div class="label">Минус SKU</div>
      <div class="value z-red">${c.minus_sku_count}</div></div>
    <div class="kpi-card"><div class="label">Сумма минуса</div>
      <div class="value z-red">${rub(c.minus_total)}</div></div>
    <div class="kpi-card"><div class="label">В плюсе</div>
      <div class="value z-green">${c.green_count}</div>
      <div class="hint">реклама ${rub(c.ad)}</div></div>`;

  const list = qfilter(filterBrand(ep.minus || []), 'minus');
  document.querySelector('#tableMinus tbody').innerHTML = list.map(s => `<tr>
    <td><strong>${s.sku || s.nm_id}</strong></td>
    <td class="num z-red">${rub(s.profit)}</td><td class="num">${rub(s.for_pay)}</td>
    <td class="num">${rub(s.ad)}</td><td class="num">${s.drr ? s.drr + '%' : '—'}</td>
    <td><span style="font-size:.78rem">${s.action}</span></td></tr>`).join('')
    || '<tr><td colspan="6">Нет минусовых за период</td></tr>';

  document.querySelector('#tableGreen tbody').innerHTML = filterBrand(ep.green || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num z-green">${rub(s.profit)}</td>
    <td class="num">${s.sales}</td><td class="num">${s.drr ? s.drr + '%' : '—'}</td></tr>`).join('')
    || '<tr><td colspan="4">Нет в плюсе за период</td></tr>';

  document.querySelector('#tableZero tbody').innerHTML = filterBrand(ep.zero_sales || []).map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${s.stock}</td><td class="num">${rub(s.ad)}</td>
    <td>Стоп РК</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';

  const costNote = ep.has_costs
    ? `Себестоимость: ${ep.costs_loaded} SKU`
    : '⚠ Себестоимость не загружена — прибыль без COGS';
  document.getElementById('minusNote').innerHTML = ep.fallback
    ? `${costNote} · <span class="note">нет дневных рядов — показан W1</span>`
    : ep.source === 'server'
      ? `${costNote} · P&L из БД: forPay − логистика − хранение − реклама − COGS`
      : `${costNote} · P&L: forPay − логистика − хранение − реклама − COGS (свой период)`;
}

function renderAds() {
  const ap = buildAdsForPeriod();
  const a = DATA.ads_detail || {};
  const e = DATA.economics || {};
  const bounds = periodBounds();
  const pl = bounds?.label || '—';
  if (!ap) {
    document.getElementById('adsKpi').innerHTML = '<p class="note">Нет данных за период</p>';
    document.getElementById('adsNote').textContent = '';
    document.querySelector('#tableAds tbody').innerHTML = '<tr><td colspan="14">—</td></tr>';
    document.querySelector('#tableCampaigns tbody').innerHTML = '<tr><td colspan="11">—</td></tr>';
    document.querySelector('#tableAdBleed tbody').innerHTML = '<tr><td colspan="8">—</td></tr>';
    return;
  }
  const { cabinet: c, dailyChart, skus, campaigns, adBleed, unmapped } = ap;
  const hasFs = ap.has_fullstats;
  const ep = buildEconomicsForPeriod();
  const econMap = {};
  (ep?.minus || []).concat(ep?.zero_sales || []).forEach(s => { econMap[s.nm_id] = s; });
  (e.skus || []).forEach(s => { if (!econMap[s.nm_id]) econMap[s.nm_id] = s; });

  document.getElementById('adsKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Реклама · ${pl}</div><div class="value">${rub(c.spend)}</div>
      <div class="hint">ДРР ${c.drr != null ? c.drr + '%' : '—'}</div></div>
    <div class="kpi-card"><div class="label">Показы</div><div class="value">${num(c.views)}</div>
      <div class="hint">клики ${num(c.clicks)}</div></div>
    <div class="kpi-card"><div class="label">CTR</div><div class="value">${pct2(c.ctr)}</div>
      <div class="hint">CPC ${rubDec(c.cpc)} · CPM ${rubDec(c.cpm)}</div></div>
    <div class="kpi-card"><div class="label">Заказы</div><div class="value">${num(c.orders)}</div>
      <div class="hint">корзины ${num(c.atbs)} · CR ${pct2(c.cr)}</div></div>
    <div class="kpi-card"><div class="label">ROAS</div><div class="value">${c.roas != null ? c.roas + '%' : '—'}</div>
      <div class="hint">CPO ${rubDec(c.cpo)}</div></div>
    <div class="kpi-card"><div class="label">Выручка</div><div class="value">${rub(c.revenue)}</div>
      <div class="hint">за период</div></div>
    <div class="kpi-card"><div class="label">Кампаний</div><div class="value">${ap.campaigns_total}</div>
      <div class="hint">активных ${ap.campaigns_active ?? '—'}</div></div>
    <div class="kpi-card"><div class="label">Слив</div><div class="value z-red">${adBleed.length}</div></div>`;

  const chartTag = document.getElementById('chartAdDailyTag');
  const viewsTag = document.getElementById('chartAdViewsTag');
  if (chartTag) chartTag.textContent = pl;
  if (viewsTag) viewsTag.textContent = pl;

  const noteExtra = ap.fallback ? ' · нет дневных рядов за период — часть таблиц по W1' : '';
  document.getElementById('adsNote').textContent = (ap.note || a.note || 'Данные из списаний WB /adv/v1/upd') + noteExtra;

  if (dailyChart.length) {
    drawBarChart(document.getElementById('chartAdDaily'),
      dailyChart.map(d => ({ date: d.date, drr: d.spend })), 'drr', () => '#2563eb');
    const viewsCard = document.getElementById('adsStatsChartCard');
    if (hasFs && dailyChart.some(d => d.views)) {
      viewsCard.style.display = '';
      drawDualBarChart(document.getElementById('chartAdViews'), dailyChart);
    } else viewsCard.style.display = 'none';
  }

  document.querySelector('#tableAdBleed tbody').innerHTML = adBleed.map(s => `<tr>
    <td>${s.sku || s.nm_id}</td><td class="num">${rub(s.ad)}</td>
    <td class="num">${num(s.views)}</td><td class="num">${pct2(s.ctr)}</td>
    <td class="num z-red">${rub(s.profit)}</td><td class="num">${s.drr != null ? s.drr + '%' : '—'}</td>
    <td class="num">${s.roas != null ? s.roas + '%' : '—'}</td>
    <td class="z-red">${s.action || econAction(s)}</td></tr>`).join('') || '<tr><td colspan="8">—</td></tr>';

  document.querySelector('#tableCampaigns tbody').innerHTML = campaigns.slice(0, 40).map(camp => `<tr>
    <td><span style="font-size:.72rem;color:var(--muted)">#${camp.advert_id || '—'}</span><br>${(camp.camp||'').slice(0,35)}</td>
    <td>${camp.sku || camp.nm_id || '—'}</td>
    <td class="num">${rub(camp.spend)}</td>
    <td class="num">${num(camp.views)}</td><td class="num">${num(camp.clicks)}</td>
    <td class="num">${pct2(camp.ctr)}</td><td class="num">${rubDec(camp.cpc)}</td>
    <td class="num">${num(camp.orders)}</td>
    <td class="num">${camp.drr != null ? camp.drr + '%' : '—'}</td>
    <td>${camp.type || '—'}</td><td>${camp.status || '—'}</td></tr>`).join('') || '<tr><td colspan="11">—</td></tr>';

  const list = qfilter(filterBrand(skus), 'ads').sort((a, b) => b.spend - a.spend);
  document.querySelector('#tableAds tbody').innerHTML = list.map(s => {
    const ec = econMap[s.nm_id] || {};
    const profit = ec.profit ?? ec.profit_w1;
    const rec = ec.is_minus || s.stop_ads ? '<span class="z-red">СТОП</span>'
      : (s.drr > 12 || ec.drr > 12) ? '<span class="z-yellow">Срез</span>' : '<span class="z-green">Ок</span>';
    return `<tr><td>${s.sku || s.nm_id}</td>
      <td class="num">${rub(s.spend)}</td>
      <td class="num">${num(s.views)}</td><td class="num">${num(s.clicks)}</td>
      <td class="num">${pct2(s.ctr)}</td><td class="num">${rubDec(s.cpc)}</td>
      <td class="num">${num(s.orders)}</td><td class="num">${rubDec(s.cpo)}</td>
      <td class="num">${rub(s.revenue)}</td>
      <td class="num">${s.drr != null ? s.drr + '%' : '—'}</td>
      <td class="num">${s.roas != null ? s.roas + '%' : '—'}</td>
      <td class="num">${s.campaigns_count ?? '—'}</td>
      <td class="num" style="color:${(profit || 0) < 0 ? 'var(--red)' : 'inherit'}">${rub(profit)}</td>
      <td>${rec}</td></tr>`;
  }).join('') || '<tr><td colspan="14">—</td></tr>';

  const umCard = document.getElementById('unmappedCard');
  if (unmapped.length) {
    umCard.style.display = 'block';
    document.querySelector('#tableUnmapped tbody').innerHTML = unmapped.map(c => `<tr>
      <td>${c.advert_id}</td><td>${(c.camp||'').slice(0,50)}</td>
      <td class="num">${rub(c.spend)}</td></tr>`).join('');
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
  const urgent = filterBrand(DATA.urgent || []);
  document.getElementById('stockKpi').innerHTML = `
    <div class="kpi-card"><div class="label">Запас кабинета</div>
      <div class="value">${m.cabinet_days_now || '—'}<span style="font-size:.85rem"> дн</span></div>
      <div class="hint">цель ${target} дн</div></div>
    <div class="kpi-card"><div class="label">К отгрузке</div>
      <div class="value">${fmt(m.plan_batch)}</div><div class="hint">${m.plan_sku} SKU</div></div>
    <div class="kpi-card"><div class="label">Срочно OOS/дефицит</div>
      <div class="value z-red">${state.brand ? urgent.length : (m.urgent_count || 0)}</div></div>
    <div class="kpi-card"><div class="label">ИЛ средний</div>
      <div class="value">${m.localization_avg ? (m.localization_avg * 100).toFixed(0) + '%' : '—'}</div></div>`;
  const tgtEl = document.getElementById('targetDaysNote');
  const plechoEl = document.getElementById('plechoNote');
  if (tgtEl) tgtEl.textContent = target;
  if (plechoEl) plechoEl.textContent = m.plecho_days || 20;

  document.querySelector('#tableUrgent tbody').innerHTML = urgent.map(s => `<tr>
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

function safeRender(fn, name) {
  try {
    fn();
  } catch (e) {
    console.error('render failed:', name, e);
  }
}

function render() {
  if (!DATA) return;
  document.getElementById('pageTitle').textContent = TITLES[state.tab] || 'WB Manager';
  updateFilterStateLabel();
  updateRangeLabel();
  renderGuides();
  safeRender(renderToday, 'today');
  safeRender(renderFocus, 'focus');
  safeRender(renderRnp, 'rnp');
  safeRender(renderStr, 'str');
  safeRender(renderFunnel, 'funnel');
  safeRender(renderMinus, 'minus');
  safeRender(renderPlan, 'plan');
  safeRender(renderAds, 'ads');
  safeRender(renderStock, 'stock');
  safeRender(renderWarehouses, 'warehouses');
  safeRender(renderStop, 'stop');
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
    render();
  });
});

document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.period === 'custom') {
      state.period = 'custom';
      document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
      if (state.dateFrom && state.dateTo) render();
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
    state.dateFrom = document.getElementById('dateFrom').value;
    state.dateTo = document.getElementById('dateTo').value;
    if (state.dateFrom && state.dateTo && state.dateFrom > state.dateTo) {
      const t = state.dateFrom; state.dateFrom = state.dateTo; state.dateTo = t;
      document.getElementById('dateFrom').value = state.dateFrom;
      document.getElementById('dateTo').value = state.dateTo;
    }
    document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.period === 'custom'));
    render();
  });
});

document.getElementById('brandFilter').addEventListener('change', e => { state.brand = e.target.value; render(); });
['searchRnp', 'searchPlan', 'searchAds', 'searchStock', 'searchFunnel', 'searchMinus', 'searchStr'].forEach(id => {
  const key = id.replace('search', '').toLowerCase();
  document.getElementById(id).addEventListener('input', e => { state.q[key] = e.target.value.toLowerCase(); render(); });
});

window.addEventListener('resize', () => { if (DATA) renderToday(); });
loadData();
