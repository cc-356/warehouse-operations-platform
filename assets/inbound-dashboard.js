
(() => {
  const payload = window.INBOUND_DATA || { days: [], history: [], availableDates: [] };
  const params = new URLSearchParams(location.search);
  const brandColors = { "陈陈": "#6ee7d2", "鹭青一": "#9cc7ff", "周淼": "#e8c170", "未识别": "#ffb19b" };
  const businessTypes = ["成衣", "加工", "外采", "未标注"];
  const brands = ["陈陈", "鹭青一", "周淼"];
  const state = {
    selectedDate: params.get("date") || payload.selectedDate,
    range: params.get("range") || "today",
    customStart: params.get("start") || "",
    customEnd: params.get("end") || "",
    brand: params.get("brand") || "",
    businessType: params.get("businessType") || "",
    supplier: params.get("supplier") || "",
    hour: "",
    keyword: params.get("keyword") || "",
    qtyMin: "",
    qtyMax: "",
    trendMetric: "quantity",
    brandCompareMetric: "quantity",
    supplierSort: "quantity",
    sortKey: "warehouseTime",
    sortDir: "desc",
    calendarYear: Number((params.get("date") || payload.selectedDate || "").slice(0, 4)) || new Date().getFullYear(),
    calendarMonth: Number((params.get("date") || payload.selectedDate || "").slice(5, 7)) || (new Date().getMonth() + 1),
    page: 1,
    pageSize: 20,
    notice: ""
  };

  const $ = id => document.getElementById(id);
  const fmt = value => Number(value || 0).toLocaleString("zh-CN");
  const pct = (part, total) => total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const uniq = values => [...new Set(values.filter(Boolean))];
  const dayByDate = date => payload.days.find(day => day.date === date) || payload.days[0] || { records: [], warnings: [] };
  const currentDay = () => dayByDate(state.selectedDate);
  const hourOf = record => (record.warehouseTime || "").slice(11, 13);
  const setSelectedDate = date => {
    state.selectedDate = date || payload.selectedDate;
    const parts = String(state.selectedDate || "").split("-").map(Number);
    state.calendarYear = parts[0] || state.calendarYear;
    state.calendarMonth = parts[1] || state.calendarMonth;
  };
  const by = (records, key) => records.reduce((map, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(item);
    return map;
  }, new Map());

  function recordsForDateRange() {
    if (!payload.days.length) return [];
    const selected = currentDay().date;
    let dates = [selected];
    if (state.range === "7d") dates = payload.availableDates.slice(0, 7);
    if (state.range === "month") dates = payload.availableDates.filter(date => date.slice(0, 7) === selected.slice(0, 7));
    if (state.range === "custom" && state.customStart && state.customEnd) {
      dates = payload.availableDates.filter(date => date >= state.customStart && date <= state.customEnd);
    }
    return payload.days.filter(day => dates.includes(day.date)).flatMap(day => day.records);
  }

  function filteredRecords() {
    let rows = filterRecords(recordsForDateRange());
    return rows;
  }

  function filterRecords(records, options = {}) {
    let rows = [...records];
    if (state.brand && !options.ignoreBrand) rows = rows.filter(row => row.brand === state.brand);
    if (state.businessType && !options.ignoreBusinessType) rows = rows.filter(row => row.businessType === state.businessType);
    if (state.supplier && !options.ignoreSupplier) rows = rows.filter(row => row.supplier.includes(state.supplier));
    if (state.hour) rows = rows.filter(row => hourOf(row) === state.hour);
    if (state.keyword) {
      const term = state.keyword.trim().toLowerCase();
      rows = rows.filter(row => [row.inboundOrderNo, row.styleNo].some(value => String(value).toLowerCase().includes(term)));
    }
    if (state.qtyMin !== "") rows = rows.filter(row => row.quantity >= Number(state.qtyMin));
    if (state.qtyMax !== "") rows = rows.filter(row => row.quantity <= Number(state.qtyMax));
    return rows;
  }

  function clearInvalidSupplier() {
    if (!state.supplier || !state.brand) return;
    const valid = recordsForDateRange().some(row => row.brand === state.brand && row.supplier.includes(state.supplier));
    if (!valid) {
      state.supplier = "";
      state.notice = "已清除不属于当前品牌的供应商条件";
    }
  }

  function summary(records) {
    const quantity = records.reduce((sum, row) => sum + row.quantity, 0);
    const orders = uniq(records.map(row => row.inboundOrderNo)).length;
    const styles = uniq(records.map(row => row.styleNo)).length;
    const suppliers = uniq(records.map(row => row.supplier)).length;
    return { quantity, orders, styles, suppliers, records: records.length, avgPerOrder: orders ? quantity / orders : 0 };
  }

  function groupedSummary(records, key) {
    return [...by(records, key)].map(([name, rows]) => ({ name, ...summary(rows), rows }));
  }

  function renderImportStatus() {
    const day = currentDay();
    const file = (day.sourceFile || "").split(/[\\/]/).pop();
    $("importStatus").innerHTML = `
      <span title="${esc(day.sourceFile || "")}">文件：${esc(file || "-")}</span>
      <span>导入时间：${esc(day.importedAt || "-")}</span>
      <span>成功记录：${fmt(day.importedCount)}</span>
      <span>警告记录：${fmt(day.warningCount)}</span>
      <span>跳过记录：${fmt(day.skippedCount)}</span>
      <span>状态：已生成</span>
    `;
  }

  function renderDateControls() {
    $("dateSelect").innerHTML = payload.availableDates.map(date => `<option value="${date}">${date}</option>`).join("");
    $("dateSelect").value = state.selectedDate;
    [...$("rangeButtons").querySelectorAll("button")].forEach(button => button.classList.toggle("active", button.dataset.range === state.range));
    $("startDate").value = state.customStart;
    $("endDate").value = state.customEnd;
    renderDateNavigator();
  }

  function renderDateNavigator() {
    const container = $("dateList");
    if (!container) return;
    const year = state.calendarYear;
    const month = state.calendarMonth;
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstOffset = (monthStart.getDay() + 6) % 7;
    const daysByDate = new Map(payload.days.map(day => [day.date, day]));
    const selectedDay = currentDay();
    const monthRecords = payload.availableDates.filter(date => String(date).startsWith(monthPrefix)).length;
    const cells = [];

    for (let index = 0; index < firstOffset; index += 1) {
      cells.push(`<span class="calendar-day" aria-hidden="true"></span>`);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateText = `${monthPrefix}-${String(day).padStart(2, "0")}`;
      const dayData = daysByDate.get(dateText);
      const sum = dayData ? summary(dayData.records || []) : null;
      const className = `calendar-day${dayData ? " has-data" : ""}${dateText === state.selectedDate ? " active" : ""}`;
      const label = dayData ? `${dateText}，入库数量 ${fmt(sum.quantity)}，明细 ${fmt(sum.records)}` : `${dateText}，无数据`;
      cells.push(dayData
        ? `<button class="${className}" type="button" data-date="${esc(dateText)}" aria-label="${esc(label)}">${day}</button>`
        : `<span class="${className}" aria-label="${esc(label)}">${day}</span>`);
    }

    const selectedSummary = summary(selectedDay.records || []);
    container.innerHTML = `
      <div class="calendar-shell">
        <div class="calendar-monthbar">
          <div class="calendar-heading">
            <strong class="calendar-title">${year}年${String(month).padStart(2, "0")}月</strong>
            <span class="calendar-summary">${fmt(monthRecords)} 天记录</span>
          </div>
          <div class="calendar-controls">
            <button class="calendar-nav" type="button" data-shift="year-prev" aria-label="上一年">‹‹</button>
            <button class="calendar-nav" type="button" data-shift="month-prev" aria-label="上一月">‹</button>
            <button class="calendar-nav" type="button" data-shift="month-next" aria-label="下一月">›</button>
            <button class="calendar-nav" type="button" data-shift="year-next" aria-label="下一年">››</button>
          </div>
        </div>
        <div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
        <div class="calendar-grid">${cells.join("")}</div>
        <div class="calendar-detail">
          <span class="calendar-meta">${esc(state.selectedDate || "-")}</span>
          <span class="calendar-badge">${fmt(selectedSummary.quantity)} 件 / ${fmt(selectedSummary.records)} 明细</span>
        </div>
      </div>
    `;

    container.querySelectorAll(".calendar-nav").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.shift;
        if (action === "year-prev") state.calendarYear -= 1;
        if (action === "year-next") state.calendarYear += 1;
        if (action === "month-prev") {
          state.calendarMonth -= 1;
          if (state.calendarMonth < 1) {
            state.calendarMonth = 12;
            state.calendarYear -= 1;
          }
        }
        if (action === "month-next") {
          state.calendarMonth += 1;
          if (state.calendarMonth > 12) {
            state.calendarMonth = 1;
            state.calendarYear += 1;
          }
        }
        renderDateNavigator();
      });
    });

    container.querySelectorAll(".calendar-day.has-data").forEach(button => {
      button.addEventListener("click", () => {
        setSelectedDate(button.dataset.date);
        state.range = "today";
        state.page = 1;
        render();
      });
    });
  }

  function renderActiveFilters() {
    const rows = filteredRecords();
    const data = summary(rows);
    const chips = [{ key: "date", label: `日期：${state.selectedDate}` }];
    if (state.brand) chips.push({ key: "brand", label: `品牌：${state.brand}` });
    if (state.supplier) chips.push({ key: "supplier", label: `供应商：${state.supplier}` });
    if (state.businessType) chips.push({ key: "businessType", label: `业务类型：${state.businessType}` });
    if (state.keyword) chips.push({ key: "keyword", label: `搜索：${state.keyword}` });
    $("activeFilters").innerHTML = chips.map(item => `
      <span class="filter-chip">${esc(item.label)}${item.key === "date" ? "" : `<button type="button" data-clear-filter="${item.key}" aria-label="清除${esc(item.label)}">×</button>`}</span>
    `).join("");
    $("filterResult").textContent = rows.length
      ? `当前筛选结果：共${fmt(data.orders)}个入库单，${fmt(data.styles)}个款号，入库数量${fmt(data.quantity)}件`
      : "当前条件下暂无入库数据，请调整品牌、供应商或日期范围。";
    $("filterNotice").textContent = state.notice || "";
  }

  function renderBrandCards(records) {
    const total = summary(records).quantity;
    const rows = brands.map(brand => {
      const brandRows = records.filter(row => row.brand === brand);
      return { brand, ...summary(brandRows) };
    });
    renderDonut("brandDonut", rows.map(item => ({
      name: item.brand,
      value: item.quantity,
      color: brandColors[item.brand]
    })), {
      title: "品牌占比",
      center: fmt(total),
      sub: "入库数量"
    });
    $("brandCards").innerHTML = rows.map(item => `
      <button class="brand-card ${state.brand === item.brand ? "active" : ""} ${item.quantity ? "" : "is-empty"}" type="button" data-brand="${esc(item.brand)}" style="--brand-color:${brandColors[item.brand] || "var(--accent)"}">
        <div class="brand-top"><h3><span class="brand-dot" style="background:${brandColors[item.brand]}"></span>${esc(item.brand)}</h3><span class="tag">${pct(item.quantity, total)}</span></div>
        <div class="brand-metrics">
          <div><span>入库数量</span><strong>${fmt(item.quantity)}</strong></div>
          <div><span>入库单数</span><strong>${fmt(item.orders)}</strong></div>
          <div><span>款数</span><strong>${fmt(item.styles)}</strong></div>
          <div><span>供应商</span><strong>${fmt(item.suppliers)}</strong></div>
        </div>
      </button>
    `).join("");
  }

  function renderBars(id, rows, options = {}) {
    const max = Math.max(1, ...rows.map(row => row.value));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const displayRows = options.hideZero ? rows.filter(row => row.value > 0) : rows;
    $(id).innerHTML = displayRows.length ? displayRows.map(row => `
      <div class="bar-row">
        <span>${esc(row.name)}</span>
        <button class="bar-track" type="button" data-bar="${esc(row.name)}" style="border:0;padding:0;text-align:left">
          <span class="bar-fill" style="display:block;width:${Math.max(2, row.value / max * 100)}%;background:${row.color || "var(--accent)"}"></span>
        </button>
        <strong>${fmt(row.value)} <small>${pct(row.value, total)}</small></strong>
      </div>
    `).join("") : `<p class="muted">暂无数据</p>`;
  }

  function renderDonut(id, rows, options = {}) {
    const filtered = rows.filter(row => row.value > 0);
    const total = filtered.reduce((sum, row) => sum + row.value, 0);
    if (!total) {
      const emptyLegend = options.hideLegend ? "" : rows.map(row => `
        <div class="legend-row is-empty">
          <span class="legend-dot" style="background:${row.color || "var(--accent)"}"></span>
          <span>${esc(row.name)}</span>
          <strong>0 · 0.0%</strong>
        </div>
      `).join("");
      $(id).innerHTML = `
        <div class="donut-chart${options.hideLegend ? " no-legend" : ""}" aria-label="${esc(options.title || "占比图")}">
          <svg viewBox="0 0 200 200" role="img">
            <circle cx="100" cy="100" r="78" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="28"></circle>
            <circle cx="100" cy="100" r="50" fill="rgba(7,11,13,.86)"></circle>
            <text class="donut-center" x="100" y="96">${esc(options.center || "0")}</text>
            <text class="donut-sub" x="100" y="114">${esc(options.sub || "合计")}</text>
          </svg>
          ${options.hideLegend ? "" : `<div class="donut-legend">${emptyLegend}</div>`}
        </div>
      `;
      return;
    }
    const radius = 78;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = filtered.map(row => {
      const length = row.value / total * circumference;
      const segment = `
        <circle cx="100" cy="100" r="${radius}" fill="none" stroke="${row.color || "var(--accent)"}" stroke-width="28"
          stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)">
          <title>${esc(row.name)} ${fmt(row.value)}，占比 ${pct(row.value, total)}</title>
        </circle>`;
      offset += length;
      return segment;
    }).join("");
    const legendRows = rows.length ? rows : filtered;
    const legend = options.hideLegend ? "" : legendRows.map(row => `
      <div class="legend-row ${row.value > 0 ? "" : "is-empty"}">
        <span class="legend-dot" style="background:${row.color || "var(--accent)"}"></span>
        <span>${esc(row.name)}</span>
        <strong>${fmt(row.value)} · ${pct(row.value, total)}</strong>
      </div>
    `).join("");
    $(id).innerHTML = `
      <div class="donut-chart${options.hideLegend ? " no-legend" : ""}" aria-label="${esc(options.title || "占比图")}">
        <svg viewBox="0 0 200 200" role="img">
          <circle cx="100" cy="100" r="${radius}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="28"></circle>
          ${segments}
          <circle cx="100" cy="100" r="50" fill="rgba(7,11,13,.86)"></circle>
          <text class="donut-center" x="100" y="96">${esc(options.center || fmt(total))}</text>
          <text class="donut-sub" x="100" y="114">${esc(options.sub || "合计")}</text>
        </svg>
        ${options.hideLegend ? "" : `<div class="donut-legend">${legend}</div>`}
      </div>
    `;
  }

  function renderHourlyTrend(records) {
    const buckets = [];
    for (let hour = 0; hour < 24; hour++) {
      const key = String(hour).padStart(2, "0");
      const rows = records.filter(row => hourOf(row) === key);
      const data = summary(rows);
      buckets.push({ hour: key, rows, value: data[state.trendMetric], ...data });
    }
    const max = Math.max(1, ...buckets.map(item => item.value));
    const peak = buckets.reduce((best, item) => item.value > best.value ? item : best, buckets[0]);
    $("hourlyTrend").innerHTML = `
      <svg viewBox="0 0 760 260" role="img" aria-label="分时入库趋势" style="width:100%;height:260px;display:block">
        <line x1="44" y1="216" x2="736" y2="216" stroke="rgba(210,235,225,.18)" />
        ${buckets.map((item, index) => {
          const width = 20;
          const x = 48 + index * 29;
          const height = Math.max(2, item.value / max * 170);
          const y = 216 - height;
          const color = item.hour === peak.hour ? "var(--warn)" : "var(--accent)";
          return `<g><rect class="hour-bar" data-hour="${item.hour}" x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="${color}" opacity=".86"><title>${item.hour}:00 入库数量 ${item.quantity}，入库单 ${item.orders}，款数 ${item.styles}</title></rect>${index % 2 === 0 ? `<text x="${x + 10}" y="238" text-anchor="middle" fill="#8a9a96" font-size="10">${item.hour}</text>` : ""}</g>`;
        }).join("")}
      </svg>
      <p class="muted">峰值时段：${peak.hour}:00，${metricName(state.trendMetric)} ${fmt(peak.value)}。点击柱形可联动筛选明细。</p>
    `;
  }

  function metricName(metric) {
    return ({ quantity: "入库数量", orders: "入库单数", styles: "款数", suppliers: "供应商数" })[metric] || metric;
  }

  function renderBrandCompare(records) {
    const rows = brands.map(brand => {
      const item = summary(records.filter(row => row.brand === brand));
      return { name: brand, value: item[state.brandCompareMetric], color: brandColors[brand] };
    });
    renderBars("brandCompare", rows);
  }

  function renderBusiness(records) {
    const rows = businessTypes.map(type => {
      const item = summary(records.filter(row => row.businessType === type));
      const color = ({ "成衣": "#6ee7d2", "加工": "#9cc7ff", "外采": "#e8c170", "未标注": "#ffb19b" })[type] || "var(--accent)";
      return { name: type, value: item.quantity, color };
    });
    renderDonut("businessDonut", rows, {
      title: "业务类型占比",
      center: fmt(summary(records).quantity),
      sub: "入库数量",
      hideLegend: true
    });
    renderBars("businessBars", rows, { hideZero: true });
    const unmarked = records.filter(row => row.businessType === "未标注").length;
    $("businessHint").textContent = unmarked ? `部分原始数据未标注业务类型，共 ${unmarked} 条，请检查数据源格式。` : "所有记录均已识别业务类型。";
  }

  function renderWeeklyTrend() {
    const selectedIndex = Math.max(0, payload.availableDates.indexOf(state.selectedDate));
    const dates = payload.availableDates.slice(selectedIndex, selectedIndex + 7).reverse();
    const buckets = dates.map(date => {
      const day = dayByDate(date);
      const rows = filterRecords(day.records || []);
      const data = summary(rows);
      return { date, ...data };
    });
    const maxQuantity = Math.max(1, ...buckets.map(item => item.quantity));
    const maxOrders = Math.max(1, ...buckets.map(item => item.orders));
    const chartLeft = 84;
    const chartRight = 724;
    const chartTop = 26;
    const chartBottom = 232;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const step = buckets.length > 1 ? chartWidth / (buckets.length - 1) : chartWidth;
    const barWidth = Math.min(54, Math.max(24, step * 0.42));
    const points = buckets.map((item, index) => {
      const x = buckets.length > 1 ? chartLeft + index * step : chartLeft + chartWidth / 2;
      const y = chartBottom - (item.orders / maxOrders) * chartHeight;
      return { ...item, x, y };
    });
    const total = {
      quantity: buckets.reduce((sum, item) => sum + item.quantity, 0),
      orders: buckets.reduce((sum, item) => sum + item.orders, 0)
    };
    $("weeklyTrend").innerHTML = buckets.length ? `
      <svg viewBox="0 0 780 300" role="img" aria-label="近7日入库数量和入库单数趋势">
        <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="rgba(210,235,225,.18)" />
        <line x1="${chartLeft}" y1="${chartTop}" x2="${chartLeft}" y2="${chartBottom}" stroke="rgba(210,235,225,.12)" />
        ${[0, .25, .5, .75, 1].map(rate => {
          const y = chartBottom - rate * chartHeight;
          return `<line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="rgba(210,235,225,.07)" /><text x="${chartLeft - 36}" y="${y + 4}" text-anchor="end" fill="#8a9a96" font-size="10">${fmt(Math.round(maxQuantity * rate))}</text>`;
        }).join("")}
        ${buckets.map((item, index) => {
          const x = buckets.length > 1 ? chartLeft + index * step : chartLeft + chartWidth / 2;
          const height = Math.max(2, (item.quantity / maxQuantity) * chartHeight);
          const y = chartBottom - height;
          return `<g class="week-group" data-week-date="${esc(item.date)}">
            <rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${height}" rx="6" fill="var(--accent)" opacity=".78">
              <title>${esc(item.date)} 入库数量 ${fmt(item.quantity)}，入库单 ${fmt(item.orders)}，款数 ${fmt(item.styles)}</title>
            </rect>
            <text x="${x}" y="264" text-anchor="middle" fill="#8a9a96" font-size="11">${esc(item.date.slice(5))}</text>
          </g>`;
        }).join("")}
        <polyline points="${points.map(item => `${item.x},${item.y}`).join(" ")}" fill="none" stroke="var(--warn)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map(item => `<circle cx="${item.x}" cy="${item.y}" r="5" fill="var(--warn)" stroke="#071012" stroke-width="2"><title>${esc(item.date)} 入库单 ${fmt(item.orders)}</title></circle>`).join("")}
      </svg>
      <div class="weekly-legend">
        <span><span class="legend-dot" style="background:var(--accent)"></span>柱：入库数量</span>
        <span><span class="legend-line"></span>线：入库单数</span>
        <span>近7日合计：${fmt(total.quantity)} 件 / ${fmt(total.orders)} 单</span>
      </div>
    ` : `<p class="muted">暂无近7日数据</p>`;
  }

  function renderMatrix(records) {
    const totalByBrand = Object.fromEntries(brands.map(brand => [brand, summary(records.filter(row => row.brand === brand)).quantity]));
    $("brandBusinessMatrix").innerHTML = `
      <table><thead><tr><th>品牌</th>${businessTypes.map(type => `<th>${type}</th>`).join("")}<th>合计</th></tr></thead>
      <tbody>${brands.map(brand => `<tr><td><span class="brand-dot" style="background:${brandColors[brand]}"></span>${brand}</td>${businessTypes.map(type => {
        const qty = records.filter(row => row.brand === brand && row.businessType === type).reduce((sum, row) => sum + row.quantity, 0);
        return `<td>${fmt(qty)} <span class="muted">${pct(qty, totalByBrand[brand])}</span></td>`;
      }).join("")}<td>${fmt(totalByBrand[brand])}</td></tr>`).join("")}</tbody></table>
    `;
  }

  function renderQuality(day) {
    const records = day.records || [];
    const counts = {
      "无法识别品牌": records.filter(row => row.brand === "未识别").length,
      "未标注业务类型": records.filter(row => row.businessType === "未标注").length,
      "缺少入库单号": records.filter(row => !row.inboundOrderNo).length,
      "缺少款号": records.filter(row => !row.styleNo).length,
      "数量异常或非数字": records.filter(row => row.warnings.includes("数量异常或非数字")).length,
      "工厂字段格式不规范": records.filter(row => row.warnings.includes("工厂字段格式不规范")).length
    };
    $("qualitySummary").innerHTML = Object.entries(counts).map(([label, count]) => `<div class="quality-line"><span>${label}</span><strong>${fmt(count)}</strong></div>`).join("");
  }

  function renderSuppliers(records) {
    const total = summary(records).quantity;
    const rows = groupedSummary(records, "supplier").map(item => ({
      ...item,
      brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别")
    })).sort((a, b) => b[state.supplierSort] - a[state.supplierSort]).slice(0, 10);
    $("supplierBody").innerHTML = rows.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><button class="link-cell" type="button" data-supplier="${esc(item.name)}">${esc(item.name)}</button></td>
        <td>${item.brands.map(brand => `<span class="tag">${esc(brand)}</span>`).join(" ") || "-"}</td>
        <td>${fmt(item.quantity)}</td><td>${fmt(item.orders)}</td><td>${fmt(item.styles)}</td><td>${pct(item.quantity, total)}</td>
      </tr>
    `).join("");
  }

  function renderFilterOptions(records) {
    const brandBase = filterRecords(records, { ignoreBrand: true });
    const brandRows = [{ name: "", label: "全部", quantity: summary(brandBase).quantity }].concat(brands.map(brand => ({
      name: brand,
      label: brand,
      quantity: summary(brandBase.filter(row => row.brand === brand)).quantity
    })));
    $("brandQuick").innerHTML = brandRows.map(item => `
      <button type="button" data-brand-value="${esc(item.name)}" class="${state.brand === item.name ? "active" : ""}">
        ${esc(item.label)} ${fmt(item.quantity)}
      </button>
    `).join("");

    const supplierBase = filterRecords(records, { ignoreSupplier: true });
    const supplierRows = groupedSummary(supplierBase, "supplier")
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        brands: uniq(item.rows.map(row => row.brand)).filter(brand => brand !== "未识别")
      }))
      .sort((a, b) => b.quantity - a.quantity);
    $("supplierOptions").innerHTML = supplierRows.map(item => `
      <option value="${esc(item.name)}" label="${esc(item.name)}｜${esc(item.brands.join("、") || "-")}｜${fmt(item.quantity)}件"></option>
    `).join("");
    $("supplierSearch").value = state.supplier;

    $("businessFilter").innerHTML = `<option value="">全部业务类型</option>${businessTypes.map(type => `<option value="${type}">${type}</option>`).join("")}`;
    $("businessFilter").value = state.businessType;
    $("keyword").value = state.keyword;
  }

  function sortedDetails(records) {
    return [...records].sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      const result = state.sortKey === "quantity" ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), "zh-CN");
      return state.sortDir === "asc" ? result : -result;
    });
  }

  function renderDetails(records) {
    const rows = sortedDetails(records);
    const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    $("detailBody").innerHTML = pageRows.length ? pageRows.map(row => `
      <tr>
        <td>${esc(row.warehouseTime)}</td><td>${esc(row.date)}</td><td><span class="tag">${esc(row.brand)}</span></td>
        <td>${esc(row.supplier)}</td><td>${esc(row.businessType)}</td>
        <td><button class="link-cell" type="button" data-order="${esc(row.inboundOrderNo)}">${esc(row.inboundOrderNo)}</button></td>
        <td>${esc(row.styleNo)}</td><td>${fmt(row.quantity)}</td>
        <td><button class="ghost-button" type="button" data-order="${esc(row.inboundOrderNo)}">查看详情</button></td>
      </tr>
    `).join("") : `<tr class="empty-row"><td colspan="9">当前条件下暂无入库数据，请调整品牌、供应商或日期范围。</td></tr>`;
    $("pagerInfo").textContent = `第 ${state.page} / ${pageCount} 页，共 ${fmt(rows.length)} 条`;
  }

  function openOrder(orderNo) {
    const records = filteredRecords().filter(row => row.inboundOrderNo === orderNo);
    const data = summary(records);
    $("drawerTitle").textContent = `入库单 ${orderNo}`;
    $("drawerContent").innerHTML = `
      <div class="drawer-list">
        <div class="drawer-item">品牌：${uniq(records.map(row => row.brand)).join("、") || "-"}</div>
        <div class="drawer-item">供应商：${uniq(records.map(row => row.supplier)).join("、") || "-"}</div>
        <div class="drawer-item">业务类型：${uniq(records.map(row => row.businessType)).join("、") || "-"}</div>
        <div class="drawer-item">入库总数量：${fmt(data.quantity)}，款号数：${fmt(data.styles)}</div>
        ${records.map(row => `<div class="drawer-item"><strong>${esc(row.styleNo)}</strong><br>数量 ${fmt(row.quantity)} · 入仓时间 ${esc(row.warehouseTime)}</div>`).join("")}
      </div>
    `;
    showDrawer("orderDrawer");
  }

  function openQuality() {
    const day = currentDay();
    const warnings = (day.warnings || []).filter(item => item.type !== "skipped-total-row");
    $("qualityContent").innerHTML = warnings.length ? `<div class="drawer-list">${warnings.map(item => `<div class="drawer-item">第 ${item.rowNumber} 行 · ${esc(item.type)}<br><span class="muted">${esc((item.raw || []).join(" | "))}</span></div>`).join("")}</div>` : `<p class="muted">当前日期没有需要排查的数据质量警告。</p>`;
    showDrawer("qualityDrawer");
  }

  function showDrawer(id) {
    $("drawerBackdrop").classList.add("open");
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
  }

  function closeDrawers() {
    $("drawerBackdrop").classList.remove("open");
    ["orderDrawer", "qualityDrawer"].forEach(id => {
      $(id).classList.remove("open");
      $(id).setAttribute("aria-hidden", "true");
    });
  }

  function exportCsv(records) {
    const header = ["入仓时间", "日期", "品牌", "供应商", "业务类型", "入库单号", "款号", "数量"];
    const lines = [header, ...sortedDetails(records).map(row => [row.warehouseTime, row.date, row.brand, row.supplier, row.businessType, row.inboundOrderNo, row.styleNo, row.quantity])];
    const csv = lines.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inbound-${state.selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncUrl() {
    const url = new URL(location.href);
    const entries = {
      date: state.selectedDate,
      range: state.range,
      start: state.customStart,
      end: state.customEnd,
      brand: state.brand,
      supplier: state.supplier,
      businessType: state.businessType,
      keyword: state.keyword
    };
    url.searchParams.delete("startTime");
    url.searchParams.delete("endTime");
    Object.entries(entries).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    history.replaceState(null, "", url);
  }

  function render() {
    syncUrl();
    const day = currentDay();
    const rangeRecords = recordsForDateRange();
    const rows = filteredRecords();
    renderImportStatus();
    renderDateControls();
    renderFilterOptions(rangeRecords);
    renderActiveFilters();
    renderBrandCards(rows);
    renderWeeklyTrend();
    renderHourlyTrend(rows);
    renderBrandCompare(rows);
    renderBusiness(rows);
    renderMatrix(rows);
    renderQuality(day);
    renderSuppliers(rows);
    renderDetails(rows);
  }

  function bindEvents() {
    const dateSidebar = $("dateSidebar");
    const datePanelToggle = $("datePanelToggle");
    if (dateSidebar && datePanelToggle) {
      datePanelToggle.addEventListener("click", () => {
        const open = !dateSidebar.classList.contains("is-open");
        dateSidebar.classList.toggle("is-open", open);
        datePanelToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    const filterSidebar = $("filterSidebar");
    const filterPanelToggle = $("filterPanelToggle");
    if (filterSidebar && filterPanelToggle) {
      filterPanelToggle.addEventListener("click", () => {
        const open = !filterSidebar.classList.contains("is-open");
        filterSidebar.classList.toggle("is-open", open);
        filterPanelToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    $("dateSelect").addEventListener("change", event => { state.notice = ""; setSelectedDate(event.target.value); state.range = "today"; state.page = 1; render(); });
    $("rangeButtons").addEventListener("click", event => {
      const button = event.target.closest("button[data-range]");
      if (!button) return;
      state.notice = "";
      state.range = button.dataset.range;
      state.page = 1;
      render();
    });
    $("startDate").addEventListener("change", event => { state.notice = ""; state.customStart = event.target.value; state.range = "custom"; state.page = 1; render(); });
    $("endDate").addEventListener("change", event => { state.notice = ""; state.customEnd = event.target.value; state.range = "custom"; state.page = 1; render(); });
    $("brandQuick").addEventListener("click", event => {
      const button = event.target.closest("[data-brand-value]");
      if (!button) return;
      state.notice = "";
      state.brand = button.dataset.brandValue;
      clearInvalidSupplier();
      state.page = 1;
      render();
    });
    $("supplierSearch").addEventListener("input", event => {
      state.notice = "";
      state.supplier = event.target.value.trim();
      const supplierRows = recordsForDateRange().filter(row => row.supplier === state.supplier);
      const supplierBrands = uniq(supplierRows.map(row => row.brand)).filter(Boolean);
      if (!state.brand && supplierBrands.length === 1) state.brand = supplierBrands[0];
      state.page = 1;
      render();
    });
    $("allBrands").addEventListener("click", () => { state.notice = ""; state.brand = ""; state.page = 1; render(); });
    $("brandCards").addEventListener("click", event => {
      const card = event.target.closest("[data-brand]");
      if (!card) return;
      state.notice = "";
      state.brand = state.brand === card.dataset.brand ? "" : card.dataset.brand;
      clearInvalidSupplier();
      state.page = 1;
      render();
    });
    $("trendMetric").addEventListener("change", event => { state.trendMetric = event.target.value; render(); });
    $("brandCompareMetric").addEventListener("change", event => { state.brandCompareMetric = event.target.value; render(); });
    $("supplierSort").addEventListener("change", event => { state.supplierSort = event.target.value; render(); });
    $("supplierBody").addEventListener("click", event => {
      const target = event.target.closest("[data-supplier]");
      if (!target) return;
      state.notice = "";
      state.supplier = target.dataset.supplier;
      $("supplierSearch").value = state.supplier;
      state.page = 1;
      render();
      $("detailBody").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("hourlyTrend").addEventListener("click", event => {
      const target = event.target.closest("[data-hour]");
      if (!target) return;
      state.notice = "";
      state.hour = state.hour === target.dataset.hour ? "" : target.dataset.hour;
      state.page = 1;
      render();
    });
    $("weeklyTrend").addEventListener("click", event => {
      const target = event.target.closest("[data-week-date]");
      if (!target) return;
      state.notice = "";
      setSelectedDate(target.dataset.weekDate);
      state.range = "today";
      state.hour = "";
      state.page = 1;
      render();
    });
    $("keyword").addEventListener("input", event => { state.notice = ""; state.keyword = event.target.value; state.page = 1; render(); });
    $("businessFilter").addEventListener("change", event => { state.notice = ""; state.businessType = event.target.value; state.page = 1; render(); });
    $("activeFilters").addEventListener("click", event => {
      const button = event.target.closest("[data-clear-filter]");
      if (!button) return;
      state.notice = "";
      const key = button.dataset.clearFilter;
      if (key === "brand") state.brand = "";
      if (key === "supplier") state.supplier = "";
      if (key === "businessType") state.businessType = "";
      if (key === "keyword") state.keyword = "";
      state.page = 1;
      render();
    });
    $("clearFilters").addEventListener("click", () => {
      Object.assign(state, {
        selectedDate: payload.selectedDate,
        range: "today",
        customStart: "",
        customEnd: "",
        brand: "",
        businessType: "",
        supplier: "",
        hour: "",
        keyword: "",
        qtyMin: "",
        qtyMax: "",
        notice: "",
        page: 1
      });
      setSelectedDate(payload.selectedDate);
      render();
    });
    $("detailBody").addEventListener("click", event => {
      const target = event.target.closest("[data-order]");
      if (target) openOrder(target.dataset.order);
    });
    document.addEventListener("click", event => {
      const target = event.target.closest("[data-sort]");
      if (!target) return;
      if (state.sortKey === target.dataset.sort) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else { state.sortKey = target.dataset.sort; state.sortDir = "asc"; }
      render();
    });
    $("prevPage").addEventListener("click", () => { state.page = Math.max(1, state.page - 1); render(); });
    $("nextPage").addEventListener("click", () => { state.page += 1; render(); });
    $("qualityButton").addEventListener("click", openQuality);
    $("exportButton").addEventListener("click", () => exportCsv(filteredRecords()));
    $("importButton").addEventListener("click", () => alert(`当前静态版本已读取数据文件：${currentDay().sourceFile}`));
    $("drawerBackdrop").addEventListener("click", closeDrawers);
    document.querySelectorAll("[data-close-drawer]").forEach(button => button.addEventListener("click", closeDrawers));
  }

  bindEvents();
  render();
})();
