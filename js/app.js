/* scopy v2 — 채용 시장 탐색 대시보드 */

(() => {
  const D = window.SCOPY_DATA;
  // 시장 개요·공고 탐색·북마크·자소서 추천은 원티드 실 API 데이터(LIVE)를 쓴다.
  // 기업 비교만 가상 데이터(D.companies) — 기업 인사이트(/v1/insight/company)가
  // 401 권한 없음이라 평균연봉·퇴사율 실 지표를 못 가져옴.
  const LIVE = D.liveJobs || [];
  const CATEGORY_TOTALS = D.liveCategoryTotals || {};
  const $ = (sel) => document.querySelector(sel);
  const fmt = Charts.fmt;

  const EMPLOYMENT_LABEL = { regular: "정규직", contract: "계약직", intern: "인턴", freelancer: "프리랜서" };
  const NOW = new Date();

  const state = { view: "overview", search: "", category: "", career: "", sort: "latest" };
  const tableMode = {};
  const chartTables = {};

  /* ── 북마크 (localStorage) ────────────────── */
  const bookmarks = new Set(JSON.parse(localStorage.getItem("scopy-bookmarks") || "[]"));
  const saveBookmarks = () => localStorage.setItem("scopy-bookmarks", JSON.stringify([...bookmarks]));

  /* ── 자소서 (localStorage) ────────────────── */
  const coverLetters = JSON.parse(localStorage.getItem("scopy-coverletters") || "[]");
  const saveCoverLetters = () => localStorage.setItem("scopy-coverletters", JSON.stringify(coverLetters));
  state.clSelectedId = null;

  const careerLabel = (j) =>
    j.annual_from === 0 && j.annual_to <= 1 ? "신입" :
    j.annual_from === 0 ? `신입–${j.annual_to}년` : `${j.annual_from}–${j.annual_to}년`;

  function dday(j) {
    if (!j.due_time) return { text: "상시", urgent: false };
    const left = Math.ceil((new Date(j.due_time) - NOW) / 86400e3);
    if (left < 0) return { text: "마감", urgent: false };
    return { text: left === 0 ? "D-day" : `D-${left}`, urgent: left <= 7 };
  }

  /* ── KPI ─────────────────────────────────── */
  function kpiTile({ label, value, suffix = "", delta, spark }) {
    const el = document.createElement("div");
    el.className = "kpi";
    const lab = document.createElement("div");
    lab.className = "kpi-label";
    lab.textContent = label;
    const meta = document.createElement("div");
    meta.className = "kpi-meta";
    const val = document.createElement("div");
    val.className = "kpi-value";
    val.textContent = `${fmt(value)}${suffix}`;
    meta.appendChild(val);
    if (delta != null && isFinite(delta)) {
      const d = document.createElement("span");
      d.className = "kpi-delta" + (delta > 0 ? " up" : "");
      d.textContent = `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${Math.abs(Math.round(delta))}% vs 이전 기간`;
      meta.appendChild(d);
    }
    el.append(lab, meta);
    if (spark) el.appendChild(Charts.sparkline(spark));
    return el;
  }

  /* ── 시장 개요 (원티드 실 API 데이터) ────────
     직군별 공고 수는 8개 직군 전수 집계(CATEGORY_TOTALS), 나머지 차트는
     상세 표본(LIVE) 기준. 실 API가 공고 등록일시를 안 줘서 시계열(신규 공고
     추이)·기간 필터는 제공하지 않는다. */
  function renderKpis() {
    const jobs = LIVE.filter((j) => j.status === "active");
    const totalAll = Object.values(CATEGORY_TOTALS).reduce((s, t) => s + t.total, 0);
    const companies = new Set(jobs.map((j) => j.company_id)).size;
    const rewarded = jobs.filter((j) => j.reward_total > 0);
    const avgReward = rewarded.length ? rewarded.reduce((s, j) => s + j.reward_total, 0) / rewarded.length / 10000 : 0;
    const entry = jobs.filter((j) => j.annual_from === 0).length;

    $("#kpiRow").replaceChildren(
      kpiTile({ label: "진행중 공고 (8개 직군 전수)", value: totalAll }),
      kpiTile({ label: "채용 기업 (표본)", value: companies }),
      kpiTile({ label: "평균 추천 보상금 (표본)", value: Math.round(avgReward), suffix: "만원" }),
      kpiTile({ label: "신입 가능 공고 (표본)", value: entry }),
    );
  }

  function renderCharts() {
    const jobs = LIVE.filter((j) => j.status === "active");

    chartTables.category = Charts.barChartH($("#chart-category"), {
      items: Object.values(CATEGORY_TOTALS)
        .sort((a, b) => b.total - a.total)
        .map((t) => ({ label: t.title, value: t.total })),
    });

    const bySkill = {};
    jobs.forEach((j) => JSON.parse(j.skill_titles || "[]").forEach((s) => { bySkill[s] = (bySkill[s] || 0) + 1; }));
    chartTables.skills = Charts.barChartH($("#chart-skills"), {
      items: Object.entries(bySkill).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })),
    });

    const bands = [["신입 가능", (j) => j.annual_from === 0], ["1–2년", (j) => j.annual_from >= 1 && j.annual_from <= 2],
                   ["3–4년", (j) => j.annual_from >= 3 && j.annual_from <= 4], ["5년 이상", (j) => j.annual_from >= 5]];
    chartTables.career = Charts.barChartH($("#chart-career"), {
      items: bands.map(([label, test]) => ({ label, value: jobs.filter(test).length })),
    });

    const byLoc = {};
    jobs.forEach((j) => { const l = j.location || "기타"; byLoc[l] = (byLoc[l] || 0) + 1; });
    chartTables.location = Charts.barChartH($("#chart-location"), {
      items: Object.entries(byLoc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })),
    });

    // 복지·문화 태그 — 공고 수가 많은 기업이 과대 반영되지 않게 기업 단위로 센다
    const companyTags = new Map();
    jobs.forEach((j) => {
      if (!companyTags.has(j.company_id)) companyTags.set(j.company_id, JSON.parse(j.attraction_titles || "[]"));
    });
    const byTag = {};
    companyTags.forEach((tags) => tags.forEach((t) => { byTag[t] = (byTag[t] || 0) + 1; }));
    chartTables.welfare = Charts.barChartH($("#chart-welfare"), {
      items: Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })),
      unit: "개사",
    });

    for (const [key, on] of Object.entries(tableMode)) {
      const host = $(`#chart-${key}`);
      if (on && host && chartTables[key]) host.replaceChildren(chartTables[key]);
    }
  }

  function renderDueSoon() {
    const rows = LIVE.filter((j) => j.status === "active" && j.due_time && new Date(j.due_time) >= NOW)
      .sort((a, b) => a.due_time.localeCompare(b.due_time))
      .slice(0, 8);
    const list = $("#dueSoonList");
    if (!rows.length) {
      list.replaceChildren(emptyNote("마감일이 지정된 공고가 없습니다."));
      return;
    }
    list.replaceChildren(...rows.map((j) => {
      const item = document.createElement("a");
      item.className = "reco-item";
      item.href = j.url;
      item.target = "_blank";
      item.rel = "noopener noreferrer";

      const left = document.createElement("div");
      left.className = "reco-left";
      const avatar = document.createElement("span");
      avatar.className = "job-avatar";
      avatar.textContent = j.company_name.slice(0, 1);
      const info = document.createElement("div");
      const name = document.createElement("div");
      name.className = "job-company-name";
      name.textContent = j.name;
      const sub = document.createElement("div");
      sub.className = "job-company-sub";
      sub.textContent = `${j.company_name} · ${j.category_title}`;
      info.append(name, sub);
      left.append(avatar, info);

      const dd = dday(j);
      const right = document.createElement("span");
      right.className = "job-dday" + (dd.urgent ? " urgent" : "");
      right.textContent = `${j.due_time} · ${dd.text}`;
      item.append(left, right);
      return item;
    }));
  }

  /* ── 공고 카드 ───────────────────────────── */
  function jobCard(j) {
    const card = document.createElement("a");
    card.className = "job-card";
    if (j.url) {
      card.href = j.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }

    const top = document.createElement("div");
    top.className = "job-top";
    const co = document.createElement("div");
    co.className = "job-company";
    const avatar = document.createElement("span");
    avatar.className = "job-avatar";
    avatar.textContent = j.company_name.slice(0, 1);
    const coText = document.createElement("div");
    const coName = document.createElement("div");
    coName.className = "job-company-name";
    coName.textContent = j.company_name;
    const coSub = document.createElement("div");
    coSub.className = "job-company-sub";
    coSub.textContent = j.full_location || j.location || "";
    coText.append(coName, coSub);
    co.append(avatar, coText);

    const bm = document.createElement("button");
    bm.className = "bookmark-btn" + (bookmarks.has(j.id) ? " is-on" : "");
    bm.setAttribute("aria-label", "북마크");
    bm.textContent = bookmarks.has(j.id) ? "★" : "☆";
    bm.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      bookmarks.has(j.id) ? bookmarks.delete(j.id) : bookmarks.add(j.id);
      saveBookmarks();
      renderJobs();
      renderBookmarks();
    });
    top.append(co, bm);

    const title = document.createElement("h3");
    title.className = "job-title";
    title.textContent = j.name;

    const chips = document.createElement("div");
    chips.className = "chip-row";
    const mainChips = [j.category_title, careerLabel(j), EMPLOYMENT_LABEL[j.employment_type]];
    mainChips.forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = c;
      chips.appendChild(chip);
    });
    JSON.parse(j.skill_titles || "[]").slice(0, 3).forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "chip chip-skill";
      chip.textContent = s;
      chips.appendChild(chip);
    });
    JSON.parse(j.attraction_titles || "[]").slice(0, 2).forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "chip chip-attraction";
      chip.textContent = s;
      chips.appendChild(chip);
    });

    const foot = document.createElement("div");
    foot.className = "job-foot";
    const left = document.createElement("span");
    left.className = "job-reward";
    left.textContent = j.reward_total ? `보상금 ${fmt(j.reward_total / 10000)}만원` : "";
    const right = document.createElement("span");
    const dd = dday(j);
    right.className = "job-dday" + (dd.urgent ? " urgent" : "");
    right.textContent = `${j.location} · ${dd.text}`;
    foot.append(left, right);

    card.append(top, title, chips, foot);
    return card;
  }

  /* ── 공고 탐색 (원티드 실 API 데이터) ───────── */
  function renderJobs() {
    let rows = LIVE.filter((j) => j.status === "active");
    if (state.category) rows = rows.filter((j) => String(j.category_tag_id) === state.category);
    if (state.career === "new") rows = rows.filter((j) => j.annual_from === 0);
    if (state.career === "junior") rows = rows.filter((j) => j.annual_from <= 3);
    if (state.career === "senior") rows = rows.filter((j) => j.annual_from >= 5);
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter((j) =>
        j.name.toLowerCase().includes(q) || j.company_name.toLowerCase().includes(q) ||
        (j.skill_titles || "").toLowerCase().includes(q));
    }
    // 실 API는 공고 등록일시를 안 줘서 최신순은 공고 ID(클수록 최신) 기준으로 근사
    if (state.sort === "latest") rows.sort((a, b) => b.id - a.id);
    if (state.sort === "reward") rows.sort((a, b) => b.reward_total - a.reward_total);
    if (state.sort === "due") rows.sort((a, b) => (a.due_time || "9999") .localeCompare(b.due_time || "9999"));

    const grid = $("#jobGrid");
    grid.replaceChildren(...rows.slice(0, 60).map(jobCard));
    $("#jobCount").textContent = `원티드 실시간 데이터 · 진행 중 공고 ${fmt(rows.length)}건${rows.length > 60 ? " · 상위 60건 표시" : ""}`;
  }

  /* ── 기업 비교 ───────────────────────────── */
  function renderCompanies() {
    const hiring = D.companies.filter((c) => c.active_jobs > 0);

    chartTables.salary = Charts.barChartH($("#chart-salary"), {
      items: [...hiring].sort((a, b) => b.average_salary - a.average_salary).slice(0, 10)
        .map((c) => ({ label: c.name, value: c.average_salary })),
      unit: "만원",
    });
    chartTables.hiring = Charts.barChartH($("#chart-hiring"), {
      items: [...hiring].sort((a, b) => b.active_jobs - a.active_jobs).slice(0, 10)
        .map((c) => ({ label: c.name, value: c.active_jobs })),
    });
    for (const [key, on] of Object.entries(tableMode)) {
      const host = $(`#chart-${key}`);
      if (on && host && chartTables[key]) host.replaceChildren(chartTables[key]);
    }

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>기업</th><th>산업</th><th class='num'>인원</th><th class='num'>평균연봉</th>" +
      "<th class='num'>신규입사자 연봉</th><th class='num'>입사율</th><th class='num'>퇴사율</th>" +
      "<th class='num'>1인당 매출</th><th class='num'>진행중 공고</th><th>복지·문화</th></tr>";
    const tbody = document.createElement("tbody");
    [...D.companies].sort((a, b) => b.active_jobs - a.active_jobs).forEach((c) => {
      const tr = document.createElement("tr");
      const cells = [
        [c.name, false, true, `${c.address} · 업력 ${c.age}년`],
        [c.industry_name, false], [`${fmt(c.employee_count)}명`, true],
        [`${fmt(c.average_salary)}만원`, true], [`${fmt(c.hired_salary)}만원`, true],
        [`${c.hire_rate}%`, true], [`${c.left_rate}%`, true],
        [`${fmt(c.sales_per_person)}백만원`, true], [fmt(c.active_jobs), true],
      ];
      cells.forEach(([text, num, main, sub]) => {
        const td = document.createElement("td");
        if (num) td.className = "num";
        if (main) {
          const m = document.createElement("div");
          m.className = "cell-main";
          m.textContent = text;
          td.appendChild(m);
          const s = document.createElement("div");
          s.className = "cell-sub";
          s.textContent = sub;
          td.appendChild(s);
        } else td.textContent = text;
        tr.appendChild(td);
      });
      const tagsTd = document.createElement("td");
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      JSON.parse(c.attraction_titles || "[]").slice(0, 3).forEach((s) => {
        const chip = document.createElement("span");
        chip.className = "chip chip-attraction";
        chip.textContent = s;
        chipRow.appendChild(chip);
      });
      tagsTd.appendChild(chipRow);
      tr.appendChild(tagsTd);
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    $("#companiesTable").replaceChildren(table);
  }

  /* ── 북마크 ──────────────────────────────── */
  function renderBookmarks() {
    const rows = LIVE.filter((j) => bookmarks.has(j.id));
    const grid = $("#bookmarkGrid");
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "저장한 공고가 없습니다. 공고 탐색에서 ☆를 눌러 저장하세요.";
      grid.replaceChildren(empty);
    } else {
      grid.replaceChildren(...rows.map(jobCard));
    }
    $("#bookmarkCount").textContent = `${fmt(rows.length)}건 저장됨`;
  }

  /* ── 자소서 관리 · 기업 추천 (원티드 실 API 데이터) ── */
  // 자소서 문구와 직군/스킬/복지 태그를 로컬 키워드 매칭 — 원티드 AI 서류합격예측 API는
  // 별도 계약 전용(POST /ai/pass/text-prediction/async)이라 이 키로는 호출 불가.
  // 추천 대상은 LIVE(실 공고)라 실제로 지원 가능한 기업만 뜬다.
  const LIVE_KEYWORDS = new Set();
  LIVE.forEach((j) => {
    LIVE_KEYWORDS.add(j.category_title);
    JSON.parse(j.subcategory_titles || "[]").forEach((t) => LIVE_KEYWORDS.add(t));
    JSON.parse(j.skill_titles || "[]").forEach((t) => LIVE_KEYWORDS.add(t));
    JSON.parse(j.attraction_titles || "[]").forEach((t) => LIVE_KEYWORDS.add(t));
  });
  const ALL_KEYWORDS = [...new Set([...D.tags.map((t) => t.title), ...LIVE_KEYWORDS])];
  const ASCII_TOKEN = /^[A-Za-z0-9.+#]+$/;

  function textHasKeyword(text, keyword) {
    if (ASCII_TOKEN.test(keyword)) {
      const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${esc}\\b`, "i").test(text);
    }
    return text.includes(keyword);
  }

  function companyKeywordSets() {
    const map = {};
    LIVE.filter((j) => j.status === "active").forEach((j) => {
      const rec = map[j.company_id] || (map[j.company_id] = {
        name: j.company_name, link: j.company_link, activeJobs: 0, keywords: new Set(),
      });
      rec.activeJobs++;
      rec.keywords.add(j.category_title);
      JSON.parse(j.subcategory_titles || "[]").forEach((t) => rec.keywords.add(t));
      JSON.parse(j.skill_titles || "[]").forEach((t) => rec.keywords.add(t));
      JSON.parse(j.attraction_titles || "[]").forEach((t) => rec.keywords.add(t));
    });
    return map;
  }

  function emptyNote(text) {
    const p = document.createElement("p");
    p.className = "empty-note";
    p.textContent = text;
    return p;
  }

  function renderRecommendations(text) {
    const container = $("#clRecommend");
    if (!text || !text.trim()) {
      container.replaceChildren(emptyNote("자소서를 작성하면 맞는 기업을 추천합니다."));
      return;
    }
    const matched = ALL_KEYWORDS.filter((k) => textHasKeyword(text, k));
    if (!matched.length) {
      container.replaceChildren(emptyNote("직군·스킬·복지 키워드를 찾지 못했습니다. 기술 스택이나 직무명, 원하는 근무 방식을 구체적으로 써보세요."));
      return;
    }
    const sets = companyKeywordSets();
    const scored = Object.values(sets)
      .map((rec) => {
        const hits = matched.filter((k) => rec.keywords.has(k));
        return { rec, hits, score: hits.length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.rec.activeJobs - a.rec.activeJobs)
      .slice(0, 6);

    const wrap = document.createElement("div");
    wrap.className = "reco-wrap";

    const summary = document.createElement("div");
    summary.className = "reco-summary";
    summary.append("감지된 키워드");
    const chipRow = document.createElement("span");
    chipRow.className = "chip-row";
    matched.slice(0, 14).forEach((k) => {
      const chip = document.createElement("span");
      chip.className = "chip chip-skill";
      chip.textContent = k;
      chipRow.appendChild(chip);
    });
    summary.appendChild(chipRow);
    wrap.appendChild(summary);

    if (!scored.length) {
      wrap.appendChild(emptyNote("키워드는 찾았지만 지금 채용 중인 기업 중에는 일치하는 곳이 없습니다."));
    } else {
      const list = document.createElement("div");
      list.className = "reco-list";
      scored.forEach(({ rec, hits }) => {
        const item = document.createElement("a");
        item.className = "reco-item";
        item.href = rec.link;
        item.target = "_blank";
        item.rel = "noopener noreferrer";

        const left = document.createElement("div");
        left.className = "reco-left";
        const avatar = document.createElement("span");
        avatar.className = "job-avatar";
        avatar.textContent = rec.name.slice(0, 1);
        const info = document.createElement("div");
        const name = document.createElement("div");
        name.className = "job-company-name";
        name.textContent = rec.name;
        const sub = document.createElement("div");
        sub.className = "job-company-sub";
        sub.textContent = `진행중 공고 ${fmt(rec.activeJobs)}건`;
        info.append(name, sub);
        left.append(avatar, info);

        const hitChips = document.createElement("div");
        hitChips.className = "chip-row";
        hits.slice(0, 5).forEach((k) => {
          const chip = document.createElement("span");
          chip.className = "chip chip-skill";
          chip.textContent = k;
          hitChips.appendChild(chip);
        });
        item.append(left, hitChips);
        list.appendChild(item);
      });
      wrap.appendChild(list);
    }
    container.replaceChildren(wrap);
  }

  function deleteCoverLetter(id) {
    const idx = coverLetters.findIndex((c) => c.id === id);
    if (idx > -1) coverLetters.splice(idx, 1);
    saveCoverLetters();
    if (state.clSelectedId === id) {
      state.clSelectedId = null;
      $("#clTitle").value = "";
      $("#clContent").value = "";
    }
    renderCoverLetters();
  }

  function renderCoverLetters() {
    const listEl = $("#clList");
    if (!coverLetters.length) {
      listEl.replaceChildren(emptyNote("저장한 자소서가 없습니다. 왼쪽에서 작성 후 저장하세요."));
    } else {
      const items = [...coverLetters].sort((a, b) => b.updatedAt - a.updatedAt).map((cl) => {
        const item = document.createElement("div");
        item.className = "cl-item" + (state.clSelectedId === cl.id ? " is-active" : "");
        const main = document.createElement("div");
        main.className = "cl-item-main";
        const t = document.createElement("div");
        t.className = "cl-item-title";
        t.textContent = cl.title;
        const d = document.createElement("div");
        d.className = "cl-item-date";
        d.textContent = new Date(cl.updatedAt).toLocaleDateString("ko-KR");
        main.append(t, d);
        const del = document.createElement("button");
        del.className = "cl-item-del";
        del.setAttribute("aria-label", "삭제");
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteCoverLetter(cl.id);
        });
        item.addEventListener("click", () => {
          state.clSelectedId = cl.id;
          $("#clTitle").value = cl.title;
          $("#clContent").value = cl.content;
          renderCoverLetters();
        });
        item.append(main, del);
        return item;
      });
      listEl.replaceChildren(...items);
    }
    $("#clCount").textContent = `${fmt(coverLetters.length)}건 저장됨`;
    renderRecommendations($("#clContent").value);
  }

  /* ── 오케스트레이션 ───────────────────────── */
  const VIEW_META = {
    overview: ["시장 개요", `원티드 실시간 수집 데이터 · ${D.liveFetchedAt || "-"} 기준`],
    jobs: ["공고 탐색", "조건에 맞는 포지션을 찾아보세요"],
    companies: ["기업 비교", "연봉·퇴사율·성장성으로 회사를 비교하세요"],
    bookmarks: ["북마크", "관심 공고 모아보기"],
    coverletters: ["자소서 관리", "자소서를 저장하고 맞는 기업을 추천받으세요"],
  };

  function render() {
    renderKpis();
    renderCharts();
    renderDueSoon();
    renderJobs();
    renderCompanies();
    renderBookmarks();
    renderCoverLetters();
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b === btn));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${state.view}`));
      const [title, sub] = VIEW_META[state.view];
      $("#pageTitle").textContent = title;
      $("#pageSub").textContent = sub;
    });
  });

  document.querySelectorAll(".table-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.target;
      tableMode[key] = !tableMode[key];
      btn.classList.toggle("is-active", tableMode[key]);
      if (tableMode[key]) $(`#chart-${key}`).replaceChildren(chartTables[key]);
      else { renderCharts(); renderCompanies(); }
    });
  });

  $("#jobSearch").addEventListener("input", (e) => { state.search = e.target.value; renderJobs(); });
  $("#categoryFilter").addEventListener("change", (e) => { state.category = e.target.value; renderJobs(); });
  $("#careerFilter").addEventListener("change", (e) => { state.career = e.target.value; renderJobs(); });
  $("#sortOrder").addEventListener("change", (e) => { state.sort = e.target.value; renderJobs(); });

  $("#clNewBtn").addEventListener("click", () => {
    state.clSelectedId = null;
    $("#clTitle").value = "";
    $("#clContent").value = "";
    renderCoverLetters();
  });
  $("#clSaveBtn").addEventListener("click", () => {
    const content = $("#clContent").value;
    if (!content.trim()) return;
    const title = $("#clTitle").value.trim() || "제목 없음";
    if (state.clSelectedId) {
      const item = coverLetters.find((c) => c.id === state.clSelectedId);
      if (item) { item.title = title; item.content = content; item.updatedAt = Date.now(); }
    } else {
      const id = Date.now();
      coverLetters.unshift({ id, title, content, updatedAt: id });
      state.clSelectedId = id;
    }
    saveCoverLetters();
    renderCoverLetters();
  });
  $("#clContent").addEventListener("input", (e) => renderRecommendations(e.target.value));

  // 다크 모드
  const savedTheme = localStorage.getItem("scopy-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    $("#themeLabel").textContent = theme === "dark" ? "라이트 모드" : "다크 모드";
  };
  applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("scopy-theme", next);
    applyTheme(next);
  });

  /* ── 초기화 ──────────────────────────────── */
  // 공고 탐색은 LIVE(실 API) 데이터를 필터링하므로, 드롭다운도 실 카테고리 타이틀을 써야
  // 정합성이 맞다 — 가상 데이터(D.tags)는 태그 ID 517/507에 원티드 실 분류와 다른
  // 이름("데이터"/"기획·PM")을 붙여놔서 그대로 쓰면 라벨이 실제 결과와 어긋난다.
  const catFilter = $("#categoryFilter");
  const liveCategories = new Map();
  LIVE.forEach((j) => {
    if (!liveCategories.has(j.category_tag_id)) liveCategories.set(j.category_tag_id, j.category_title);
  });
  [...liveCategories.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, title]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = title;
    catFilter.appendChild(opt);
  });
  $("#pageSub").textContent = VIEW_META.overview[1];
  render();
})();
