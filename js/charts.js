/* scopy 차트 엔진 — 의존성 없는 SVG 렌더러
   스펙: 라인 2px · 바 두께 ≤24px · 데이터 끝 4px 라운드(베이스라인은 직각)
   헤어라인 솔리드 그리드 · 스택 세그먼트 사이 2px 서페이스 갭
   라인 차트는 크로스헤어 툴팁, 바 차트는 마크 단위 툴팁 · 모든 차트에 표 뷰 제공 */

const Charts = (() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const tooltipEl = () => document.getElementById("tooltip");

  const fmt = (n) => Number(n).toLocaleString("ko-KR");
  const pct = (n) => `${Math.round(n * 100)}%`;

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function showTooltip(x, y, title, rows) {
    const tt = tooltipEl();
    tt.replaceChildren();
    const t = document.createElement("div");
    t.className = "tt-title";
    t.textContent = title;
    tt.appendChild(t);
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tt-row";
      if (r.color) {
        const key = document.createElement("span");
        key.className = "tt-key";
        key.style.background = r.color;
        row.appendChild(key);
      }
      const val = document.createElement("span");
      val.className = "tt-val";
      val.textContent = r.value;
      row.appendChild(val);
      if (r.name) {
        const name = document.createElement("span");
        name.className = "tt-name";
        name.textContent = r.name;
        row.appendChild(name);
      }
      tt.appendChild(row);
    }
    tt.hidden = false;
    const rect = tt.getBoundingClientRect();
    const px = Math.min(x + 14, window.innerWidth - rect.width - 12);
    const py = Math.max(8, y - rect.height - 12);
    tt.style.left = `${px}px`;
    tt.style.top = `${py}px`;
  }

  function hideTooltip() {
    tooltipEl().hidden = true;
  }

  // 깔끔한 y축 눈금 (0 포함, 최대 4개)
  function niceTicks(maxVal) {
    if (maxVal <= 0) return [0, 1];
    const rough = maxVal / 3;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) || mag * 10;
    const ticks = [];
    for (let v = 0; v <= maxVal + step * 0.999; v += step) ticks.push(v);
    return ticks;
  }

  // 수평 바 path — 오른쪽(데이터 끝)만 4px 라운드, 베이스라인은 직각
  function hBarPath(x, y, w, h) {
    const r = Math.min(4, w);
    return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  }

  function buildTable(headers, rows) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    headers.forEach((h, i) => {
      const th = document.createElement("th");
      if (i > 0) th.className = "num";
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      r.forEach((c, i) => {
        const td = document.createElement("td");
        if (i > 0) td.className = "num";
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ── 라인 차트 (단일 시리즈 · 크로스헤어 툴팁) ───────────── */
  function lineChart(container, { labels, values, seriesName }) {
    container.replaceChildren();
    const W = 560, H = 230, padL = 40, padR = 16, padT = 14, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = Math.max(...values, 1);
    const ticks = niceTicks(maxV);
    const top = ticks[ticks.length - 1];
    const xAt = (i) => padL + (values.length === 1 ? plotW / 2 : (i / (values.length - 1)) * plotW);
    const yAt = (v) => padT + plotH - (v / top) * plotH;

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    for (const t of ticks) {
      svg.appendChild(svgEl("line", { x1: padL, x2: W - padR, y1: yAt(t), y2: yAt(t), stroke: "var(--grid)", "stroke-width": 1 }));
      const lbl = svgEl("text", { x: padL - 8, y: yAt(t) + 4, "text-anchor": "end", class: "axis-text" });
      lbl.textContent = fmt(t);
      svg.appendChild(lbl);
    }

    const step = Math.max(1, Math.ceil(labels.length / 6));
    labels.forEach((l, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const lbl = svgEl("text", { x: xAt(i), y: H - 8, "text-anchor": "middle", class: "axis-text" });
      lbl.textContent = l;
      svg.appendChild(lbl);
    });

    const pts = values.map((v, i) => `${xAt(i)},${yAt(v)}`);
    svg.appendChild(svgEl("path", {
      d: `M${pts.join(" L")} L${xAt(values.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`,
      fill: "var(--accent)", opacity: 0.1,
    }));
    svg.appendChild(svgEl("path", {
      d: `M${pts.join(" L")}`,
      fill: "none", stroke: "var(--accent)", "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));

    // 끝점 마커 (2px 서페이스 링) + 직접 레이블은 끝점에만
    const lastX = xAt(values.length - 1), lastY = yAt(values[values.length - 1]);
    svg.appendChild(svgEl("circle", { cx: lastX, cy: lastY, r: 5, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2 }));
    const endLbl = svgEl("text", { x: lastX - 2, y: lastY - 10, "text-anchor": "end", class: "mark-label strong" });
    endLbl.textContent = fmt(values[values.length - 1]);
    svg.appendChild(endLbl);

    // 크로스헤어 레이어
    const cross = svgEl("line", { y1: padT, y2: padT + plotH, stroke: "var(--baseline)", "stroke-width": 1, visibility: "hidden" });
    const dot = svgEl("circle", { r: 5, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" });
    svg.append(cross, dot);

    const hit = svgEl("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "transparent" });
    hit.addEventListener("pointermove", (e) => {
      const box = svg.getBoundingClientRect();
      const mx = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(values.length - 1,
        Math.round(((mx - padL) / plotW) * (values.length - 1))));
      cross.setAttribute("x1", xAt(i));
      cross.setAttribute("x2", xAt(i));
      cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", xAt(i));
      dot.setAttribute("cy", yAt(values[i]));
      dot.setAttribute("visibility", "visible");
      showTooltip(e.clientX, e.clientY, labels[i],
        [{ color: "var(--accent)", value: `${fmt(values[i])}건`, name: seriesName }]);
    });
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      hideTooltip();
    });
    svg.appendChild(hit);
    container.appendChild(svg);

    return buildTable(["구간", `${seriesName} (건)`], labels.map((l, i) => [l, fmt(values[i])]));
  }

  /* ── 수평 바 차트 (단일 색상 · 값은 바 끝에) ─────────────── */
  function barChartH(container, { items, color = "var(--accent)", unit = "건" }) {
    container.replaceChildren();
    const rowH = 34, barH = 18, padL = 8, padR = 52, labelW = 150;
    const W = 560, H = items.length * rowH + 8;
    const maxV = Math.max(...items.map((d) => d.value), 1);
    const plotW = W - padL - labelW - padR;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    items.forEach((d, i) => {
      const y = 4 + i * rowH;
      const w = Math.max(2, (d.value / maxV) * plotW);
      const name = svgEl("text", { x: padL + labelW - 12, y: y + barH / 2 + 4, "text-anchor": "end", class: "mark-label" });
      name.textContent = d.label.length > 13 ? d.label.slice(0, 12) + "…" : d.label;
      svg.appendChild(name);

      const bar = svgEl("path", { d: hBarPath(padL + labelW, y, w, barH), fill: color });
      bar.style.cursor = "default";
      const onMove = (e) => {
        bar.setAttribute("opacity", "0.82");
        showTooltip(e.clientX, e.clientY, d.label, [{ color, value: `${fmt(d.value)}${unit}`, name: d.sub || "" }]);
      };
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerleave", () => { bar.removeAttribute("opacity"); hideTooltip(); });
      svg.appendChild(bar);

      const val = svgEl("text", { x: padL + labelW + w + 8, y: y + barH / 2 + 4, class: "mark-label strong" });
      val.textContent = fmt(d.value);
      svg.appendChild(val);
    });
    container.appendChild(svg);

    return buildTable(["포지션", `지원 (${unit})`], items.map((d) => [d.label, fmt(d.value)]));
  }

  /* ── 퍼널 (순차 블루 램프 · 전환율 표기) ─────────────────── */
  function funnel(container, { stages }) {
    container.replaceChildren();
    const ramp = ["var(--ramp-1)", "var(--ramp-2)", "var(--ramp-3)", "var(--ramp-4)"];
    const rowH = 46, barH = 22, padL = 8, labelW = 92, padR = 120;
    const W = 560, H = stages.length * rowH + 4;
    const maxV = Math.max(...stages.map((s) => s.value), 1);
    const plotW = W - padL - labelW - padR;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    stages.forEach((s, i) => {
      const y = 6 + i * rowH;
      const w = Math.max(2, (s.value / maxV) * plotW);
      const color = ramp[Math.min(i, ramp.length - 1)];

      const name = svgEl("text", { x: padL + labelW - 12, y: y + barH / 2 + 4, "text-anchor": "end", class: "mark-label" });
      name.textContent = s.label;
      svg.appendChild(name);

      const bar = svgEl("path", { d: hBarPath(padL + labelW, y, w, barH), fill: color });
      bar.addEventListener("pointermove", (e) => {
        bar.setAttribute("opacity", "0.82");
        const rows = [{ color, value: `${fmt(s.value)}건`, name: s.label }];
        if (i > 0) rows.push({ value: pct(s.value / (stages[i - 1].value || 1)), name: "이전 단계 대비" });
        showTooltip(e.clientX, e.clientY, "채용 퍼널", rows);
      });
      bar.addEventListener("pointerleave", () => { bar.removeAttribute("opacity"); hideTooltip(); });
      svg.appendChild(bar);

      const val = svgEl("text", { x: padL + labelW + w + 8, y: y + barH / 2 + 4, class: "mark-label strong" });
      val.textContent = fmt(s.value);
      svg.appendChild(val);

      if (i > 0) {
        const conv = svgEl("text", { x: padL + labelW + w + 8 + String(fmt(s.value)).length * 7 + 10, y: y + barH / 2 + 4, class: "axis-text" });
        conv.textContent = `↓ ${pct(s.value / (stages[i - 1].value || 1))}`;
        svg.appendChild(conv);
      }
    });
    container.appendChild(svg);

    return buildTable(["단계", "건수", "이전 단계 대비"], stages.map((s, i) =>
      [s.label, fmt(s.value), i === 0 ? "—" : pct(s.value / (stages[i - 1].value || 1))]));
  }

  /* ── 스택 수평 바 (직군 × 상태 · 2px 서페이스 갭 · 범례) ──── */
  function stackedBarH(container, { items, series }) {
    container.replaceChildren();
    const rowH = 38, barH = 18, padL = 8, labelW = 96, padR = 48;
    const W = 560, H = items.length * rowH + 6;
    const maxV = Math.max(...items.map((d) => d.values.reduce((a, b) => a + b, 0)), 1);
    const plotW = W - padL - labelW - padR;
    const GAP = 2;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    items.forEach((d, i) => {
      const y = 5 + i * rowH;
      const total = d.values.reduce((a, b) => a + b, 0);
      const name = svgEl("text", { x: padL + labelW - 12, y: y + barH / 2 + 4, "text-anchor": "end", class: "mark-label" });
      name.textContent = d.label;
      svg.appendChild(name);

      let x = padL + labelW;
      d.values.forEach((v, si) => {
        if (v <= 0) return;
        const w = Math.max(1.5, (v / maxV) * plotW - GAP);
        const isLast = si === d.values.length - 1 || d.values.slice(si + 1).every((n) => n <= 0);
        const seg = isLast
          ? svgEl("path", { d: hBarPath(x, y, w, barH), fill: series[si].color })
          : svgEl("rect", { x, y, width: w, height: barH, fill: series[si].color });
        seg.addEventListener("pointermove", (e) => {
          seg.setAttribute("opacity", "0.82");
          showTooltip(e.clientX, e.clientY, d.label,
            series.map((s, k) => ({ color: s.color, value: `${fmt(d.values[k])}건`, name: s.name })));
        });
        seg.addEventListener("pointerleave", () => { seg.removeAttribute("opacity"); hideTooltip(); });
        svg.appendChild(seg);
        x += w + GAP;
      });

      const val = svgEl("text", { x: x + 6, y: y + barH / 2 + 4, class: "mark-label strong" });
      val.textContent = fmt(total);
      svg.appendChild(val);
    });
    container.appendChild(svg);

    // 범례 (시리즈 ≥ 2 → 항상 표시)
    const legend = document.createElement("div");
    legend.className = "legend";
    series.forEach((s) => {
      const key = document.createElement("span");
      key.className = "legend-key";
      const sw = document.createElement("span");
      sw.className = "legend-swatch";
      sw.style.background = s.color;
      const label = document.createElement("span");
      label.textContent = s.name;
      key.append(sw, label);
      legend.appendChild(key);
    });
    container.appendChild(legend);

    return buildTable(["직군", ...series.map((s) => s.name), "합계"], items.map((d) =>
      [d.label, ...d.values.map(fmt), fmt(d.values.reduce((a, b) => a + b, 0))]));
  }

  /* ── 스파크라인 (KPI 타일용 · 12포인트) ──────────────────── */
  function sparkline(values, { width = 96, height = 28 } = {}) {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const xAt = (i) => (i / (values.length - 1)) * (width - 6) + 3;
    const yAt = (v) => height - 4 - ((v - min) / span) * (height - 8);
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, width, height, class: "kpi-spark", "aria-hidden": "true" });
    const pts = values.map((v, i) => `${xAt(i)},${yAt(v)}`);
    svg.appendChild(svgEl("path", {
      d: `M${pts.join(" L")}`, fill: "none",
      stroke: "var(--baseline)", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    const li = values.length - 1;
    svg.appendChild(svgEl("circle", { cx: xAt(li), cy: yAt(values[li]), r: 3, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 1.5 }));
    return svg;
  }

  return { lineChart, barChartH, funnel, stackedBarH, sparkline, fmt };
})();
