/* scopy v2 — 채용 시장 탐색 대시보드 */

(() => {
  const D = window.SCOPY_DATA;
  const CERT_DATA = window.SCOPY_CERTIFICATIONS || { items: [] };
  // 시장 개요·공고 탐색·기업 비교·북마크·추천은 원티드 실 API 데이터(LIVE)를 쓴다.
  // 권한이 없는 기업 인사이트 지표는 가상 값으로 채우지 않고 화면에서 제외한다.
  const LIVE = D.liveJobs || [];
  const CATEGORY_TOTALS = D.liveCategoryTotals || {};
  const $ = (sel) => document.querySelector(sel);
  const fmt = Charts.fmt;

  const EMPLOYMENT_LABEL = { regular: "정규직", contract: "계약직", intern: "인턴", freelancer: "프리랜서" };
  const NOW = new Date();

  const state = { view: "overview", search: "", category: "", career: "", sort: "latest" };
  const tableMode = {};
  const chartTables = {};

  const certCatalogMeta = document.querySelector("#certCatalogMeta");
  if (certCatalogMeta) {
    certCatalogMeta.textContent = `자격 데이터 ${fmt(CERT_DATA.items.length)}종 · 공식 통계가 있는 종목만 인기도·기업 우대 수치 표시`;
  }

  /* ── 북마크 (localStorage) ────────────────── */
  const bookmarks = new Set(JSON.parse(localStorage.getItem("scopy-bookmarks") || "[]"));
  const saveBookmarks = () => localStorage.setItem("scopy-bookmarks", JSON.stringify([...bookmarks]));

  /* ── 자소서 (localStorage) ────────────────── */
  const coverLetters = JSON.parse(localStorage.getItem("scopy-coverletters") || "[]");
  const saveCoverLetters = () => localStorage.setItem("scopy-coverletters", JSON.stringify(coverLetters));
  state.clSelectedId = null;
  const selectedCoverLetterText = () => {
    const selected = coverLetters.find((item) => item.id === state.clSelectedId);
    return selected?.content || selected?.fileName || "";
  };

  /* ── 최근 방문 공고 (localStorage) ─────────── */
  const recentViews = JSON.parse(localStorage.getItem("scopy-recent-views") || "[]"); // [{id, viewedAt}]
  function recordView(id) {
    const idx = recentViews.findIndex((v) => v.id === id);
    if (idx > -1) recentViews.splice(idx, 1);
    recentViews.unshift({ id, viewedAt: Date.now() });
    if (recentViews.length > 12) recentViews.length = 12;
    localStorage.setItem("scopy-recent-views", JSON.stringify(recentViews));
    renderRecentViews();
  }

  /* ── 마이페이지: 자격증 (localStorage) ─────── */
  const certifications = JSON.parse(localStorage.getItem("scopy-certifications") || "[]"); // [{id,name,issuer,date}]
  const saveCertifications = () => localStorage.setItem("scopy-certifications", JSON.stringify(certifications));
  state.selectedCertificate = null;

  /* ── 마이페이지: 외부활동 (localStorage) ───── */
  const activities = JSON.parse(localStorage.getItem("scopy-activities") || "[]");
  const saveActivities = () => localStorage.setItem("scopy-activities", JSON.stringify(activities));

  /* ── 마이페이지: 선호 직군 (localStorage) ──── */
  const PREF_CATEGORIES_KEY = "scopy-preferred-categories";

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
      onClick: (d) => openCompanySegmentModal(
        `${d.label} 직군 공고 기업`,
        `수집 표본 기준 — 전수 집계(${fmt(d.value)}건)와는 다를 수 있습니다`,
        (j) => j.category_title === d.label,
      ),
    });

    const bySkill = {};
    jobs.forEach((j) => JSON.parse(j.skill_titles || "[]").forEach((s) => { bySkill[s] = (bySkill[s] || 0) + 1; }));
    chartTables.skills = Charts.barChartH($("#chart-skills"), {
      items: Object.entries(bySkill).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })),
      onClick: (d) => openCompanySegmentModal(
        `"${d.label}" 스킬을 요구하는 기업`,
        `수집 표본 기준 · 공고 ${fmt(d.value)}건`,
        (j) => JSON.parse(j.skill_titles || "[]").includes(d.label),
      ),
    });

    const bands = [["신입 가능", (j) => j.annual_from === 0], ["1–2년", (j) => j.annual_from >= 1 && j.annual_from <= 2],
                   ["3–4년", (j) => j.annual_from >= 3 && j.annual_from <= 4], ["5년 이상", (j) => j.annual_from >= 5]];
    chartTables.career = Charts.barChartH($("#chart-career"), {
      items: bands.map(([label, test]) => ({ label, value: jobs.filter(test).length })),
      onClick: (d) => {
        const band = bands.find(([label]) => label === d.label);
        if (band) openCompanySegmentModal(`${d.label} 공고 기업`, `수집 표본 기준 · 공고 ${fmt(d.value)}건`, band[1]);
      },
    });

    const byLoc = {};
    jobs.forEach((j) => { const l = j.location || "기타"; byLoc[l] = (byLoc[l] || 0) + 1; });
    chartTables.location = Charts.barChartH($("#chart-location"), {
      items: Object.entries(byLoc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })),
      onClick: (d) => openCompanySegmentModal(
        `${d.label} 근무지 공고 기업`,
        `수집 표본 기준 · 공고 ${fmt(d.value)}건`,
        (j) => (j.location || "기타") === d.label,
      ),
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
      onClick: (d) => openCompanySegmentModal(
        `"${d.label}" 태그를 가진 기업`,
        `수집 표본 기준 · ${fmt(d.value)}개사`,
        (j) => JSON.parse(j.attraction_titles || "[]").includes(d.label),
      ),
    });

    for (const [key, on] of Object.entries(tableMode)) {
      const host = $(`#chart-${key}`);
      if (on && host && chartTables[key]) host.replaceChildren(chartTables[key]);
    }
  }

  /* ── 회사 로고 아바타 (원티드 실 API 이미지, 실패 시 이니셜로 대체) ── */
  function letterAvatar(j) {
    const avatar = document.createElement("span");
    avatar.className = "job-avatar";
    avatar.textContent = j.company_name.slice(0, 1);
    return avatar;
  }
  function companyAvatar(j) {
    if (!j.company_logo) return letterAvatar(j);
    const img = document.createElement("img");
    img.className = "job-avatar job-avatar-img";
    img.src = j.company_logo;
    img.alt = j.company_name;
    img.loading = "lazy";
    img.addEventListener("error", () => img.replaceWith(letterAvatar(j)), { once: true });
    return img;
  }

  /* ── 공고 리스트 항목 (마감 임박 · 최근 방문 공용) ─────────── */
  function jobRecoItem(j, rightText, urgent) {
    const item = document.createElement("a");
    item.className = "reco-item";
    item.href = j.url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.addEventListener("click", () => recordView(j.id));

    const left = document.createElement("div");
    left.className = "reco-left";
    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "job-company-name";
    name.textContent = j.name;
    const sub = document.createElement("div");
    sub.className = "job-company-sub";
    sub.textContent = `${j.company_name} · ${j.category_title}`;
    info.append(name, sub);
    left.append(companyAvatar(j), info);

    const right = document.createElement("span");
    right.className = "job-dday" + (urgent ? " urgent" : "");
    right.textContent = rightText;
    item.append(left, right);
    return item;
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
      const dd = dday(j);
      return jobRecoItem(j, `${j.due_time} · ${dd.text}`, dd.urgent);
    }));
  }

  /* ── 최근 방문 공고 ───────────────────────── */
  function renderRecentViews() {
    const list = $("#recentViewsList");
    if (!list) return;
    const rows = recentViews.map((v) => LIVE.find((j) => j.id === v.id)).filter(Boolean).slice(0, 8);
    if (!rows.length) {
      list.replaceChildren(emptyNote("아직 방문한 공고가 없습니다. 공고 카드를 클릭하면 여기에 쌓여요."));
      return;
    }
    list.replaceChildren(...rows.map((j) => jobRecoItem(j, j.location || "")));
  }

  /* ── 공고 카드 ───────────────────────────── */
  function jobCard(j) {
    const card = document.createElement("div");
    card.className = "job-card";
    card.addEventListener("click", (e) => {
      if (e.target.closest(".bookmark-btn")) return;
      openJobModal(j);
    });

    const top = document.createElement("div");
    top.className = "job-top";
    const co = document.createElement("div");
    co.className = "job-company";
    const coText = document.createElement("div");
    const coName = document.createElement("div");
    coName.className = "job-company-name";
    coName.textContent = j.company_name;
    const coSub = document.createElement("div");
    coSub.className = "job-company-sub";
    coSub.textContent = j.full_location || j.location || "";
    coText.append(coName, coSub);
    co.append(companyAvatar(j), coText);

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

  /* ── 공고 상세 모달 ───────────────────────────
     공고 카드를 클릭하면 표 이동 없이 여기서 요약·기업정보·매력도 레이더를 보여준다.
     레이더는 실 API 표본(LIVE) 안에서 이 공고의 실측 지표를 정규화해 그린다 — 아래
     "기업 비교" 레이더(companyRadarMetrics)와 같은 6개 축을 공고 단위로 계산한 버전. */
  const JOB_RADAR_AXES = [
    { key: "reward", label: "추천보상금", unit: "만원" },
    { key: "welfare", label: "복지·문화 태그", unit: "개" },
    { key: "skillCount", label: "요구 스킬", unit: "개" },
    { key: "minCareer", label: "최소 요구경력", unit: "년" },
    { key: "daysLeft", label: "지원 여유", unit: "일" },
    { key: "companyActive", label: "기업 진행중 공고", unit: "건" },
  ];

  function jobRadarMetrics(j) {
    const daysLeft = j.due_time ? Math.max(0, Math.ceil((new Date(j.due_time) - NOW) / 86400e3)) : 60;
    return {
      reward: (j.reward_total || 0) / 10000,
      welfare: JSON.parse(j.attraction_titles || "[]").length,
      skillCount: JSON.parse(j.skill_titles || "[]").length,
      minCareer: j.annual_from || 0,
      daysLeft,
      companyActive: LIVE.filter((x) => x.status === "active" && x.company_id === j.company_id).length,
    };
  }

  function renderJobRadar(host, j) {
    const pool = LIVE.filter((x) => x.status === "active").map(jobRadarMetrics);
    const maxOf = (key) => Math.max(1, ...pool.map((m) => m[key] || 0));
    const metrics = jobRadarMetrics(j);
    const axes = JOB_RADAR_AXES.map((ax) => ({ ...ax, max: maxOf(ax.key), value: metrics[ax.key] || 0 }));
    Charts.radarChart(host, { axes, series: { name: j.name, color: "var(--accent)" } });
  }

  function metaItem(label, value, urgent) {
    const item = document.createElement("div");
    item.className = "job-modal-meta-item";
    const l = document.createElement("div");
    l.className = "job-modal-meta-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "job-modal-meta-value" + (urgent ? " urgent" : "");
    v.textContent = value;
    item.append(l, v);
    return item;
  }

  const withProtocol = (link) => (!link ? "" : /^https?:\/\//.test(link) ? link : `https://${link}`);

  function jobModalContent(j) {
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.className = "job-modal-header";
    header.appendChild(companyAvatar(j));
    const headInfo = document.createElement("div");
    const title = document.createElement("div");
    title.className = "job-modal-title";
    title.id = "jobModalTitle";
    title.textContent = j.name;
    const company = document.createElement("div");
    company.className = "job-modal-company";
    company.textContent = j.company_name;
    const sub = document.createElement("div");
    sub.className = "job-modal-sub";
    sub.textContent = j.full_location || j.location || "";
    headInfo.append(title, company, sub);
    header.appendChild(headInfo);
    wrap.appendChild(header);

    const chipsSection = document.createElement("div");
    chipsSection.className = "job-modal-section";
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    [j.category_title, careerLabel(j), EMPLOYMENT_LABEL[j.employment_type]].forEach((c) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = c;
      chipRow.appendChild(chip);
    });
    JSON.parse(j.skill_titles || "[]").forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "chip chip-skill";
      chip.textContent = s;
      chipRow.appendChild(chip);
    });
    JSON.parse(j.attraction_titles || "[]").forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "chip chip-attraction";
      chip.textContent = s;
      chipRow.appendChild(chip);
    });
    chipsSection.appendChild(chipRow);
    wrap.appendChild(chipsSection);

    const summarySection = document.createElement("div");
    summarySection.className = "job-modal-section";
    const sTitle = document.createElement("div");
    sTitle.className = "job-modal-section-title";
    sTitle.textContent = "공고 요약";
    summarySection.appendChild(sTitle);
    const meta = document.createElement("div");
    meta.className = "job-modal-meta";
    const dd = dday(j);
    meta.appendChild(metaItem("보상금", j.reward_total ? `${fmt(j.reward_total / 10000)}만원` : "-"));
    meta.appendChild(metaItem("마감", dd.text, dd.urgent));
    meta.appendChild(metaItem("경력", careerLabel(j)));
    meta.appendChild(metaItem("근무 형태", EMPLOYMENT_LABEL[j.employment_type] || "-"));
    summarySection.appendChild(meta);
    wrap.appendChild(summarySection);

    const companySection = document.createElement("div");
    companySection.className = "job-modal-section";
    const cTitle = document.createElement("div");
    cTitle.className = "job-modal-section-title";
    cTitle.textContent = "기업 정보";
    companySection.appendChild(cTitle);
    const companyCard = document.createElement("div");
    companyCard.className = "job-modal-company-card";
    companyCard.appendChild(companyAvatar(j));
    const companyInfo = document.createElement("div");
    const cName = document.createElement("div");
    cName.className = "job-modal-company";
    cName.textContent = j.company_name;
    const cActive = document.createElement("div");
    cActive.className = "job-modal-sub";
    const activeCount = LIVE.filter((x) => x.status === "active" && x.company_id === j.company_id).length;
    cActive.textContent = `진행중 공고 ${fmt(activeCount)}건`;
    companyInfo.append(cName, cActive);
    if (j.company_link) {
      const link = document.createElement("a");
      link.className = "job-modal-company-link";
      link.href = withProtocol(j.company_link);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "기업 홈페이지 ↗";
      companyInfo.appendChild(link);
    }
    companyCard.appendChild(companyInfo);
    companySection.appendChild(companyCard);
    wrap.appendChild(companySection);

    const radarSection = document.createElement("div");
    radarSection.className = "job-modal-section";
    const rTitle = document.createElement("div");
    rTitle.className = "job-modal-section-title";
    rTitle.textContent = "공고 매력도 (수집 표본 기준)";
    radarSection.appendChild(rTitle);
    const radarHost = document.createElement("div");
    radarHost.className = "chart-body";
    radarSection.appendChild(radarHost);
    wrap.appendChild(radarSection);

    const applySection = document.createElement("div");
    applySection.className = "job-modal-section job-modal-apply";
    const applyBtn = document.createElement("button");
    applyBtn.className = "btn btn-primary";
    applyBtn.textContent = "신청사이트";
    applyBtn.disabled = !j.url;
    applyBtn.addEventListener("click", () => {
      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    });
    applySection.appendChild(applyBtn);
    wrap.appendChild(applySection);

    return { wrap, radarHost };
  }

  function showModalBody(node) {
    $("#jobModalBody").replaceChildren(node);
    $("#jobModalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#jobModalOverlay").hidden = true;
    document.body.style.overflow = "";
  }

  function openJobModal(j) {
    const { wrap, radarHost } = jobModalContent(j);
    showModalBody(wrap);
    renderJobRadar(radarHost, j);
    recordView(j.id);
  }

  /* ── 시장 개요 막대 클릭 → 해당 구간의 기업 목록 모달 ──────
     차트가 원티드 실 API 표본(LIVE, 200건)만 반영하므로, "전수 집계" 막대(직군)를
     클릭해도 목록은 표본 기준이라 막대 수치와 정확히 일치하지 않을 수 있다. */
  function companySegmentModalContent(title, subtitle, predicate) {
    const wrap = document.createElement("div");

    const header = document.createElement("div");
    header.className = "job-modal-header";
    const headInfo = document.createElement("div");
    const h = document.createElement("div");
    h.className = "job-modal-title";
    h.id = "jobModalTitle";
    h.textContent = title;
    const sub = document.createElement("div");
    sub.className = "job-modal-sub";
    sub.textContent = subtitle;
    headInfo.append(h, sub);
    header.appendChild(headInfo);
    wrap.appendChild(header);

    const section = document.createElement("div");
    section.className = "job-modal-section";

    const companies = new Map();
    LIVE.filter((j) => j.status === "active" && predicate(j)).forEach((j) => {
      const rec = companies.get(j.company_id) || { name: j.company_name, logo: j.company_logo, count: 0 };
      rec.count++;
      companies.set(j.company_id, rec);
    });
    const rows = [...companies.values()].sort((a, b) => b.count - a.count);

    if (!rows.length) {
      section.appendChild(emptyNote("수집 표본에서 일치하는 기업을 찾지 못했습니다."));
    } else {
      const list = document.createElement("div");
      list.className = "reco-list";
      rows.forEach((c) => {
        const item = document.createElement("div");
        item.className = "reco-item";
        const left = document.createElement("div");
        left.className = "reco-left";
        const info = document.createElement("div");
        const name = document.createElement("div");
        name.className = "job-company-name";
        name.textContent = c.name;
        info.appendChild(name);
        left.append(companyAvatar({ company_name: c.name, company_logo: c.logo }), info);
        const right = document.createElement("span");
        right.className = "job-dday";
        right.textContent = `공고 ${fmt(c.count)}건`;
        item.append(left, right);
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    wrap.appendChild(section);
    return wrap;
  }

  function openCompanySegmentModal(title, subtitle, predicate) {
    showModalBody(companySegmentModalContent(title, subtitle, predicate));
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

  /* ── 기업 비교 (원티드 실 API 데이터) ─────────
     기업 인사이트(/v1/insight/company)는 401 권한 없음이라 평균연봉·입사율·퇴사율·
     1인당매출·인원은 낼 수 없다. 대신 실 공고 표본(LIVE)을 기업 단위로 집계해
     진행중 공고수·추천보상금·복지태그·요구스킬·최소경력·지원여유를 뽑아 쓴다. */
  function companyAggregates() {
    const map = new Map();
    LIVE.filter((j) => j.status === "active").forEach((j) => {
      let rec = map.get(j.company_id);
      if (!rec) {
        rec = {
          id: j.company_id, name: j.company_name, logo: j.company_logo, link: j.company_link,
          location: "", activeJobs: 0, categoryCounts: new Map(),
          rewardSum: 0, rewardCount: 0, welfareTags: new Set(), skillTags: new Set(),
          minCareer: Infinity, maxDaysLeft: 0,
        };
        map.set(j.company_id, rec);
      }
      rec.activeJobs++;
      if (!rec.location && j.location) rec.location = j.location;
      rec.categoryCounts.set(j.category_title, (rec.categoryCounts.get(j.category_title) || 0) + 1);
      if (j.reward_total) { rec.rewardSum += j.reward_total; rec.rewardCount++; }
      JSON.parse(j.attraction_titles || "[]").forEach((t) => rec.welfareTags.add(t));
      JSON.parse(j.skill_titles || "[]").forEach((t) => rec.skillTags.add(t));
      rec.minCareer = Math.min(rec.minCareer, j.annual_from ?? 0);
      const daysLeft = j.due_time ? Math.max(0, Math.ceil((new Date(j.due_time) - NOW) / 86400e3)) : 60;
      rec.maxDaysLeft = Math.max(rec.maxDaysLeft, daysLeft);
    });
    return [...map.values()].map((rec) => ({
      id: rec.id, name: rec.name, logo: rec.logo, link: rec.link, location: rec.location,
      activeJobs: rec.activeJobs,
      topCategory: [...rec.categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "-",
      avgReward: rec.rewardCount ? Math.round(rec.rewardSum / rec.rewardCount / 10000) : 0,
      welfareTags: [...rec.welfareTags],
      welfareCount: rec.welfareTags.size,
      skillCount: rec.skillTags.size,
      minCareer: rec.minCareer === Infinity ? 0 : rec.minCareer,
      maxDaysLeft: rec.maxDaysLeft,
    }));
  }

  function companyRadarMetrics(c) {
    return {
      reward: c.avgReward, welfare: c.welfareCount, skillCount: c.skillCount,
      minCareer: c.minCareer, daysLeft: c.maxDaysLeft, companyActive: c.activeJobs,
    };
  }

  function renderCompanies() {
    const companies = companyAggregates();

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>기업</th><th>대표 직군</th><th class='num'>진행중 공고</th><th>복지·문화</th></tr>";
    const tbody = document.createElement("tbody");
    [...companies].sort((a, b) => b.activeJobs - a.activeJobs).forEach((c) => {
      const tr = document.createElement("tr");
      const slot = radarSelection.a === c.id ? "a" : radarSelection.b === c.id ? "b" : null;
      if (slot) tr.className = `tr-radar-${slot}`;
      tr.addEventListener("click", () => selectRadarCompany(c.id));

      const nameTd = document.createElement("td");
      const m = document.createElement("div");
      m.className = "cell-main";
      m.textContent = c.name;
      if (slot) {
        const badge = document.createElement("span");
        badge.className = `radar-badge radar-badge-${slot}`;
        badge.textContent = slot.toUpperCase();
        m.appendChild(badge);
      }
      nameTd.appendChild(m);
      const s = document.createElement("div");
      s.className = "cell-sub";
      s.textContent = c.location || "-";
      nameTd.appendChild(s);
      tr.appendChild(nameTd);

      const catTd = document.createElement("td");
      catTd.textContent = c.topCategory;
      tr.appendChild(catTd);

      const jobsTd = document.createElement("td");
      jobsTd.className = "num";
      jobsTd.textContent = fmt(c.activeJobs);
      tr.appendChild(jobsTd);

      const tagsTd = document.createElement("td");
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      c.welfareTags.slice(0, 3).forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "chip chip-attraction";
        chip.textContent = tag;
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
      grid.classList.add("is-empty");
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "저장한 공고가 없습니다. 공고 탐색에서 ☆를 눌러 저장하세요.";
      grid.replaceChildren(empty);
    } else {
      grid.classList.remove("is-empty");
      grid.replaceChildren(...rows.map(jobCard));
    }
    $("#bookmarkCount").textContent = `${fmt(rows.length)}건 저장됨`;
  }

  /* ── 기업 비교 레이더 (실 API 데이터 — 공고 매력도 프로필과 동일한 축) ──
     기업 인사이트 표 행을 클릭하면 그 기업이 A/B 슬롯에 들어가고, 두 기업은
     각자 독립된 육각형 그래프로 나란히 표시된다. 축은 공고 상세 모달의
     "공고 매력도"와 같은 6개(JOB_RADAR_AXES)를 기업 단위로 집계해서 쓴다 —
     평균연봉·입사율·퇴사율·1인당매출·인원은 /v1/insight/company가 401이라 제외. */
  // 처음부터 그래프가 보이도록 진행중 공고 상위 2곳을 기본 선택
  const defaultRadarPair = companyAggregates().sort((a, b) => b.activeJobs - a.activeJobs).slice(0, 2);
  const radarSelection = { a: defaultRadarPair[0]?.id ?? null, b: defaultRadarPair[1]?.id ?? null };

  function selectRadarCompany(id) {
    if (radarSelection.a === id) { radarSelection.a = null; }
    else if (radarSelection.b === id) { radarSelection.b = null; }
    else if (!radarSelection.a) { radarSelection.a = id; }
    else if (!radarSelection.b) { radarSelection.b = id; }
    else { radarSelection.a = radarSelection.b; radarSelection.b = id; } // A,B 순환 교체
    renderCompanies();
    renderRadarPair();
  }

  function renderOneRadar(hostId, titleId, id, color) {
    const host = $(hostId), titleEl = $(titleId);
    const companies = companyAggregates();
    const company = id != null ? companies.find((c) => c.id === id) : null;
    if (!company) {
      titleEl.textContent = titleId === "#radarATitle" ? "기업 A" : "기업 B";
      host.replaceChildren(emptyNote("아래 표에서 기업을 클릭해 선택하세요."));
      return;
    }
    titleEl.textContent = company.name;
    const metricsPool = companies.map(companyRadarMetrics);
    const maxOf = (key) => Math.max(1, ...metricsPool.map((m) => m[key] || 0));
    const metrics = companyRadarMetrics(company);
    const axes = JOB_RADAR_AXES.map((ax) => ({ ...ax, max: maxOf(ax.key), value: metrics[ax.key] || 0 }));
    const key = hostId.includes("radar-a") ? "radar-a" : "radar-b";
    chartTables[key] = Charts.radarChart(host, { axes, series: { name: company.name, color } });
    if (tableMode[key]) host.replaceChildren(chartTables[key]);
  }

  function renderRadarPair() {
    renderOneRadar("#chart-radar-a", "#radarATitle", radarSelection.a, "var(--accent)");
    renderOneRadar("#chart-radar-b", "#radarBTitle", radarSelection.b, "var(--c-docpass)");
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
  // 가상 태그 카탈로그(D.tags)는 더 이상 섞지 않는다 — 직군 ID 517/507 라벨이 실
  // 분류와 달라 실제로는 매칭되지 않는 잡음 키워드였다. 표본(LIVE)에 등장한 실
  // 직군·스킬·복지 키워드만 쓴다 — 표본 밖 키워드는 못 잡지만 전부 실 데이터다.
  const ALL_KEYWORDS = [...LIVE_KEYWORDS];
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
        name: j.company_name, link: j.company_link, logo: j.company_logo, activeJobs: 0, keywords: new Set(),
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

  /* ── 추천 기업 판단 로직 ─────────────────────
     네 가지 신호를 취합한다:
     1) 자소서 본문 — 자유 텍스트 키워드 매칭
     2) 자격증명·발급기관 — 자소서와 동일한 키워드 매칭 텍스트에 합쳐서 취급
     3) 외부활동 — 활동명·기관·유형을 키워드 매칭 텍스트에 포함
     4) 선호 직군 1~3순위 — 1순위일수록 큰 가중치를 부여 */
  const PREF_CATEGORY_WEIGHTS = [3, 2, 1];

  function certKeywordText() {
    return certifications.map((c) => `${c.name} ${c.issuer || ""}`).join(" ");
  }

  function activityKeywordText() {
    return activities.map((a) => `${a.type} ${a.title} ${a.org || ""}`).join(" ");
  }

  function preferredCategoryIds() {
    try { return JSON.parse(localStorage.getItem(PREF_CATEGORIES_KEY) || "[]").filter(Boolean).slice(0, 3); }
    catch { return []; }
  }

  function preferredCategoryTitles() {
    return preferredCategoryIds().map((id) => liveCategories.get(Number(id))).filter(Boolean);
  }

  function renderRecommendations(text) {
    const container = $("#clRecommend");
    const profileText = [text, certKeywordText(), activityKeywordText()].filter((t) => t && t.trim()).join(" ");
    const prefTitles = preferredCategoryTitles();
    const matched = ALL_KEYWORDS.filter((k) => textHasKeyword(profileText, k));

    if (!matched.length && !prefTitles.length) {
      container.replaceChildren(emptyNote("자소서·자격증·외부활동을 입력하거나 선호 직군을 선택하면 맞는 기업을 추천합니다."));
      return;
    }

    const sets = companyKeywordSets();
    const scored = Object.values(sets)
      .map((rec) => {
        const hits = matched.filter((k) => rec.keywords.has(k));
        const prefHits = prefTitles.map((title, index) => ({ title, rank: index + 1, weight: PREF_CATEGORY_WEIGHTS[index] }))
          .filter((pref) => rec.keywords.has(pref.title));
        return { rec, hits, prefHits, score: hits.length + prefHits.reduce((sum, pref) => sum + pref.weight, 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.rec.activeJobs - a.rec.activeJobs)
      .slice(0, 8);

    const wrap = document.createElement("div");
    wrap.className = "reco-wrap";

    const summaryGroup = document.createElement("div");
    summaryGroup.className = "reco-summary-group";
    if (matched.length) {
      const summary = document.createElement("div");
      summary.className = "reco-summary";
      summary.append("감지된 키워드 (자소서·자격증·외부활동)");
      const chipRow = document.createElement("span");
      chipRow.className = "chip-row";
      matched.slice(0, 14).forEach((k) => {
        const chip = document.createElement("span");
        chip.className = "chip chip-skill";
        chip.textContent = k;
        chipRow.appendChild(chip);
      });
      summary.appendChild(chipRow);
      summaryGroup.appendChild(summary);
    }
    if (prefTitles.length) {
      const summary = document.createElement("div");
      summary.className = "reco-summary";
      summary.append("선호 직군");
      prefTitles.forEach((title, index) => {
        const chip = document.createElement("span");
        chip.className = "chip chip-pref";
        chip.textContent = `${index + 1}순위 ${title}`;
        summary.appendChild(chip);
      });
      summaryGroup.appendChild(summary);
    }
    wrap.appendChild(summaryGroup);

    if (!scored.length) {
      wrap.appendChild(emptyNote("조건은 찾았지만 지금 채용 중인 기업 중에는 일치하는 곳이 없습니다."));
    } else {
      const list = document.createElement("div");
      list.className = "reco-list";
      scored.forEach(({ rec, hits, prefHits }) => {
        const item = document.createElement("a");
        item.className = "reco-item";
        item.href = withProtocol(rec.link);
        item.target = "_blank";
        item.rel = "noopener noreferrer";

        const left = document.createElement("div");
        left.className = "reco-left";
        const info = document.createElement("div");
        const name = document.createElement("div");
        name.className = "job-company-name";
        name.textContent = rec.name;
        const sub = document.createElement("div");
        sub.className = "job-company-sub";
        sub.textContent = `진행중 공고 ${fmt(rec.activeJobs)}건`;
        info.append(name, sub);
        left.append(companyAvatar({ company_name: rec.name, company_logo: rec.logo }), info);

        const hitChips = document.createElement("div");
        hitChips.className = "chip-row";
        prefHits.forEach((pref) => {
          const chip = document.createElement("span");
          chip.className = "chip chip-pref";
          chip.textContent = `${pref.rank}순위: ${pref.title}`;
          hitChips.appendChild(chip);
        });
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
      $("#clFile").value = "";
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
        d.textContent = [cl.fileName || "기존 작성본", new Date(cl.updatedAt).toLocaleDateString("ko-KR")].join(" · ");
        main.append(t, d);
        if (cl.fileData) {
          const fileLink = document.createElement("a");
          fileLink.className = "cert-file-link";
          fileLink.href = cl.fileData;
          fileLink.download = cl.fileName || "자소서";
          fileLink.textContent = "파일 내려받기 ↓";
          fileLink.addEventListener("click", (event) => event.stopPropagation());
          main.appendChild(fileLink);
        }
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
          renderCoverLetters();
        });
        item.append(main, del);
        return item;
      });
      listEl.replaceChildren(...items);
    }
    $("#clCount").textContent = `${fmt(coverLetters.length)}건 저장됨`;
    renderRecommendations(selectedCoverLetterText());
    if ($("#resumeTemplate")) renderResumeBuilder();
  }

  /* ── 마이페이지: 자격증 ───────────────────── */
  function deleteCertification(id) {
    const idx = certifications.findIndex((c) => c.id === id);
    if (idx > -1) certifications.splice(idx, 1);
    saveCertifications();
    renderCertifications();
    renderCertificationModal();
    renderBenchmarks();
    renderRecommendations(selectedCoverLetterText());
    renderResumeBuilder();
  }

  function certificationItem(c) {
    const item = document.createElement("div");
    item.className = "cl-item";
      const left = document.createElement("div");
      left.className = "cert-item-left";
      if (c.fileData && c.fileType && c.fileType.startsWith("image/")) {
        const thumb = document.createElement("img");
        thumb.className = "cert-thumb";
        thumb.src = c.fileData;
        thumb.alt = "";
        left.appendChild(thumb);
      }
      const main = document.createElement("div");
      main.className = "cl-item-main";
      const t = document.createElement("div");
      t.className = "cl-item-title";
      t.textContent = c.name;
      const d = document.createElement("div");
      d.className = "cl-item-date";
      d.textContent = [c.issuer, c.date].filter(Boolean).join(" · ");
      main.append(t, d);
      if (c.type || c.applications2024 || c.employerPreferenceRate) {
        const meta = document.createElement("div");
        meta.className = "cert-saved-meta";
        if (c.type) meta.appendChild(certBadge(c.type, "type"));
        if (c.applications2024) meta.appendChild(certBadge(`2024 접수 ${fmt(c.applications2024)}건`, "popular"));
        if (c.employerPreferenceRate) {
          meta.appendChild(certBadge(`${c.employerMetric || "기업 우대"} ${c.employerPreferenceRate}%`, "demand"));
        }
        main.appendChild(meta);
      }
      if (c.fileData) {
        const fileLink = document.createElement("a");
        fileLink.className = "cert-file-link";
        fileLink.href = c.fileData;
        fileLink.download = c.fileName || "attachment";
        fileLink.target = "_blank";
        fileLink.rel = "noopener noreferrer";
        fileLink.textContent = "첨부파일 보기 ↗";
        main.appendChild(fileLink);
      }
      left.appendChild(main);
      const del = document.createElement("button");
      del.className = "cl-item-del";
      del.setAttribute("aria-label", "삭제");
      del.textContent = "×";
      del.addEventListener("click", () => deleteCertification(c.id));
      item.append(left, del);
    return item;
  }

  function renderCertifications() {
    const listEl = $("#certList");
    if (!listEl) return;
    if (!certifications.length) {
      listEl.replaceChildren(emptyNote("등록한 자격증이 없습니다."));
      return;
    }
    const visible = certifications.slice(0, 3).map(certificationItem);
    if (certifications.length > 3) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "cert-more-btn";
      more.textContent = `외 ${fmt(certifications.length - 3)}개 전체 보기`;
      more.addEventListener("click", openCertificationModal);
      visible.push(more);
    }
    listEl.replaceChildren(...visible);
  }

  function renderCertificationModal() {
    const list = $("#certModalList");
    if (!list) return;
    $("#certModalCount").textContent = `총 ${fmt(certifications.length)}개`;
    if (!certifications.length) list.replaceChildren(emptyNote("등록한 자격증이 없습니다."));
    else list.replaceChildren(...certifications.map(certificationItem));
  }

  function openCertificationModal() {
    renderCertificationModal();
    $("#certModalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeCertificationModal() {
    $("#certModalOverlay").hidden = true;
    document.body.style.overflow = "";
  }

  /* ── 자격증 카탈로그 검색 ─────────────────── */
  function normalizedSearch(value) {
    return value.toLocaleLowerCase("ko-KR").replace(/[\s·()\-_/]/g, "");
  }

  function certBadge(text, kind) {
    const badge = document.createElement("span");
    badge.className = `cert-badge cert-badge-${kind}`;
    badge.textContent = text;
    return badge;
  }

  function certificateMatches(query) {
    const q = normalizedSearch(query);
    const items = [...CERT_DATA.items];
    if (!q) {
      return items
        .filter((item) => item.applications_2024)
        .sort((a, b) => b.applications_2024 - a.applications_2024)
        .slice(0, 7);
    }
    return items
      .map((item) => {
        const name = normalizedSearch(item.name);
        const haystack = normalizedSearch(`${item.name} ${item.issuer} ${item.type} ${item.category}`);
        const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : haystack.includes(q) ? 3 : 99;
        return { item, score };
      })
      .filter(({ score }) => score < 99)
      .sort((a, b) => a.score - b.score || (b.item.applications_2024 || 0) - (a.item.applications_2024 || 0))
      .slice(0, 8)
      .map(({ item }) => item);
  }

  function hideCertificateResults() {
    const results = $("#certSearchResults");
    results.hidden = true;
    $("#certName").setAttribute("aria-expanded", "false");
  }

  function renderSelectedCertificate() {
    const host = $("#certSelectedInfo");
    const cert = state.selectedCertificate;
    if (!cert) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }

    const top = document.createElement("div");
    top.className = "cert-info-top";
    const title = document.createElement("div");
    title.className = "cert-info-title";
    title.textContent = cert.name;
    const badges = document.createElement("div");
    badges.className = "cert-badge-row";
    badges.appendChild(certBadge(cert.type, "type"));
    if (cert.applications_2024) badges.appendChild(certBadge(`2024 접수 ${fmt(cert.applications_2024)}건`, "popular"));
    if (cert.employer_preference_rate) {
      badges.appendChild(certBadge(`${cert.employer_metric || "기업 우대"} ${cert.employer_preference_rate}%`, "demand"));
    }
    top.append(title, badges);

    const description = document.createElement("p");
    description.className = "cert-info-description";
    description.textContent = cert.description;
    const foot = document.createElement("div");
    foot.className = "cert-info-foot";
    foot.textContent = `${cert.issuer} · ${cert.category}`;
    host.replaceChildren(top, description, foot);
    host.hidden = false;
  }

  function selectCertificate(cert) {
    state.selectedCertificate = cert;
    $("#certName").value = cert.name;
    $("#certIssuer").value = cert.issuer;
    hideCertificateResults();
    renderSelectedCertificate();
  }

  function renderCertificateResults(query) {
    const host = $("#certSearchResults");
    const matches = certificateMatches(query);
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "cert-result-empty";
      empty.textContent = "목록에 없어요. 입력한 이름으로 직접 등록할 수 있습니다.";
      host.replaceChildren(empty);
    } else {
      host.replaceChildren(...matches.map((cert) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "cert-result";
        option.setAttribute("role", "option");
        const main = document.createElement("span");
        main.className = "cert-result-main";
        const name = document.createElement("strong");
        name.textContent = cert.name;
        const sub = document.createElement("span");
        sub.textContent = `${cert.issuer} · ${cert.type}`;
        main.append(name, sub);
        const metric = document.createElement("span");
        metric.className = "cert-result-metric";
        metric.textContent = cert.applications_2024 ? `접수 ${fmt(cert.applications_2024)}건` : cert.employer_preference_rate ? `기업 우대 ${cert.employer_preference_rate}%` : cert.category;
        option.append(main, metric);
        option.addEventListener("mousedown", (event) => event.preventDefault());
        option.addEventListener("click", () => selectCertificate(cert));
        return option;
      }));
    }
    host.hidden = false;
    $("#certName").setAttribute("aria-expanded", "true");
  }

  /* ── 외부활동 ─────────────────────────────── */
  function deleteActivity(id) {
    const idx = activities.findIndex((activity) => activity.id === id);
    if (idx > -1) activities.splice(idx, 1);
    saveActivities();
    renderActivities();
    renderActivityModal();
    renderBenchmarks();
    renderRecommendations(selectedCoverLetterText());
    renderResumeBuilder();
  }

  function activityItem(activity) {
      const item = document.createElement("div");
      item.className = "cl-item";
      const main = document.createElement("div");
      main.className = "cl-item-main";
      const title = document.createElement("div");
      title.className = "cl-item-title";
      title.textContent = activity.title;
      const meta = document.createElement("div");
      meta.className = "cl-item-date";
      meta.textContent = [activity.type, activity.org, activity.date].filter(Boolean).join(" · ");
      main.append(title, meta);
      const del = document.createElement("button");
      del.className = "cl-item-del";
      del.setAttribute("aria-label", "삭제");
      del.textContent = "×";
      del.addEventListener("click", () => deleteActivity(activity.id));
      item.append(main, del);
      return item;
  }

  function renderActivities() {
    const host = $("#activityList");
    if (!activities.length) {
      host.replaceChildren(emptyNote("등록한 외부활동이 없습니다."));
      return;
    }
    const visible = activities.slice(0, 3).map(activityItem);
    if (activities.length > 3) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "cert-more-btn";
      more.textContent = `외 ${fmt(activities.length - 3)}개 전체 보기`;
      more.addEventListener("click", openActivityModal);
      visible.push(more);
    }
    host.replaceChildren(...visible);
  }

  function renderActivityModal() {
    const list = $("#activityModalList");
    if (!list) return;
    $("#activityModalCount").textContent = `총 ${fmt(activities.length)}개`;
    if (!activities.length) list.replaceChildren(emptyNote("등록한 외부활동이 없습니다."));
    else list.replaceChildren(...activities.map(activityItem));
  }

  function openActivityModal() {
    renderActivityModal();
    $("#activityModalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeActivityModal() {
    $("#activityModalOverlay").hidden = true;
    document.body.style.overflow = "";
  }

  /* ── 직군별 준비도 벤치마크 ──────────────────
     공개 합격자 원본이 없으므로 실제 합격확률이 아니라, 직군별 대표 자격·활동과
     현재 프로필이 얼마나 겹치는지 보여주는 준비 체크리스트다. */
  const CAREER_BENCHMARKS = {
    "개발": {
      certs: ["정보처리기사", "SQL 개발자(SQLD)"], activities: ["프로젝트", "인턴", "교육"],
      activityIdeas: [
        { type: "프로젝트", title: "사용자 문제를 해결하는 웹·앱 서비스", detail: "기획부터 배포까지 진행하고 GitHub, 아키텍처, 담당 기능, 성능 개선 수치를 결과물로 남기세요." },
        { type: "공모전", title: "해커톤·오픈소스 기여", detail: "짧은 기간의 협업 과정과 이슈 해결 기록, Pull Request 또는 실제 시연 링크를 정리하면 좋습니다." },
        { type: "인턴", title: "개발 인턴·현업 연계 프로젝트", detail: "코드 리뷰, 테스트, 장애 대응처럼 실무 개발 과정에서 맡은 역할과 개선 전후 결과를 기록하세요." },
      ],
    },
    "경영·비즈니스": {
      certs: ["컴퓨터활용능력 1급", "데이터분석 준전문가(ADsP)", "사회조사분석사 2급"], activities: ["인턴", "프로젝트", "공모전"],
      activityIdeas: [
        { type: "프로젝트", title: "시장 조사와 신규 서비스 기획", detail: "고객 인터뷰·경쟁사 분석을 바탕으로 문제 정의, 핵심 지표, 실행 우선순위가 담긴 기획서를 만드세요." },
        { type: "공모전", title: "비즈니스 모델·케이스 분석 공모전", detail: "시장 규모, 수익 구조, 실행 계획을 숫자로 설명하고 발표 자료와 피드백 반영 과정을 남기세요." },
        { type: "인턴", title: "사업기획·운영 인턴", detail: "운영 지표 개선, 업무 자동화, 협업 프로세스 정리처럼 조직에 준 변화를 수치와 함께 기록하세요." },
      ],
    },
    "디자인": {
      certs: ["GTQ 그래픽기술자격", "컴퓨터그래픽기능사", "웹디자인개발기능사"], activities: ["프로젝트", "공모전", "대외활동"],
      activityIdeas: [
        { type: "프로젝트", title: "앱·웹 UX 개선 프로젝트", detail: "사용자 조사, 문제 정의, 와이어프레임, 프로토타입, 사용성 테스트까지 한 흐름으로 포트폴리오를 구성하세요." },
        { type: "공모전", title: "브랜딩·공공디자인 공모전", detail: "시각 결과물뿐 아니라 타깃과 콘셉트 도출 과정, 디자인 시스템과 실제 적용 예시를 함께 보여주세요." },
        { type: "대외활동", title: "스타트업·동아리 협업 디자인", detail: "기획자·개발자와 협업하며 요구사항을 조정한 과정과 출시 후 사용자 반응을 정리하세요." },
      ],
    },
    "엔지니어링·설계": {
      certs: ["일반기계기사", "전기기사", "산업안전기사"], activities: ["프로젝트", "인턴", "교육"],
      activityIdeas: [
        { type: "프로젝트", title: "캡스톤 설계·제작 프로젝트", detail: "요구조건, CAD·회로 설계, 해석 또는 시험 결과, 실패 원인과 개선 과정을 기술 문서로 남기세요." },
        { type: "프로젝트", title: "공정·품질 개선 분석", detail: "불량이나 병목 원인을 데이터로 분석하고 개선안 적용 전후의 생산성·품질 변화를 비교하세요." },
        { type: "인턴", title: "설계·생산·품질 현장실습", detail: "도면 검토, 장비 운용, 안전 관리 등 실제 현장에서 맡은 업무와 표준 준수 경험을 기록하세요." },
      ],
    },
    "HR": {
      certs: ["ERP정보관리사 인사", "직업상담사 2급", "사회조사분석사 2급"], activities: ["인턴", "대외활동", "봉사"],
      activityIdeas: [
        { type: "프로젝트", title: "채용·조직문화 개선 프로젝트", detail: "지원자 경험이나 구성원 설문을 분석해 문제를 정의하고 채용 프로세스·온보딩 개선안을 제안하세요." },
        { type: "인턴", title: "채용 운영·교육 인턴", detail: "지원자 관리, 교육 운영, 데이터 정리에서 정확도나 처리 시간을 어떻게 개선했는지 기록하세요." },
        { type: "대외활동", title: "커뮤니티 운영·멘토링 활동", detail: "사람을 모집하고 갈등을 조정하며 참여율을 높인 경험을 운영 지표와 함께 정리하세요." },
      ],
    },
    "마케팅·광고": {
      certs: ["사회조사분석사 2급", "GTQ 그래픽기술자격", "데이터분석 준전문가(ADsP)"], activities: ["공모전", "프로젝트", "대외활동"],
      activityIdeas: [
        { type: "프로젝트", title: "데이터 기반 캠페인 운영", detail: "타깃, 채널, 콘텐츠 가설을 정하고 도달·클릭·전환율을 측정해 다음 실험으로 개선한 과정을 남기세요." },
        { type: "공모전", title: "광고·브랜드 전략 공모전", detail: "소비자 인사이트, 핵심 메시지, 매체 전략과 기대 성과를 하나의 논리로 연결한 제안서를 만드세요." },
        { type: "대외활동", title: "브랜드 서포터즈·SNS 채널 운영", detail: "단순 게시물 수보다 팔로워 성장, 참여율, 유입 등 직접 만든 성과와 콘텐츠 개선 과정을 기록하세요." },
      ],
    },
    "미디어": {
      certs: ["GTQ 그래픽기술자격", "멀티미디어콘텐츠제작전문가", "컴퓨터그래픽기능사"], activities: ["프로젝트", "공모전", "대외활동"],
      activityIdeas: [
        { type: "프로젝트", title: "영상·콘텐츠 시리즈 제작", detail: "기획 의도, 대본, 촬영·편집 역할, 공개 채널의 조회·시청지속시간 등 반응 데이터를 함께 정리하세요." },
        { type: "공모전", title: "영상제·콘텐츠 공모전", detail: "주제 해석과 스토리텔링 과정, 제한된 일정·예산 안에서 품질을 확보한 방법을 보여주세요." },
        { type: "대외활동", title: "학교·기관 미디어 채널 운영", detail: "콘텐츠 캘린더를 만들고 타깃 반응을 분석해 포맷이나 업로드 전략을 개선한 경험을 남기세요." },
      ],
    },
    "영업": {
      certs: ["컴퓨터활용능력 1급", "텔레마케팅관리사", "사회조사분석사 2급"], activities: ["인턴", "대외활동", "프로젝트"],
      activityIdeas: [
        { type: "프로젝트", title: "고객 세분화·영업 전략 프로젝트", detail: "고객군별 니즈와 구매 가능성을 분석하고 접촉 순서, 제안 메시지, 목표 매출을 구체화하세요." },
        { type: "인턴", title: "B2B·매장 영업 인턴", detail: "고객 응대 건수, 전환율, 재구매 또는 신규 리드처럼 본인이 만든 영업 성과를 수치로 기록하세요." },
        { type: "대외활동", title: "행사 유치·후원 제안 활동", detail: "잠재 파트너 발굴, 제안서 작성, 협상과 관계 관리 과정을 실제 성사 결과와 함께 정리하세요." },
      ],
    },
  };

  function hasCertificate(target) {
    const normalizedTarget = normalizedSearch(target);
    return certifications.some((cert) => {
      const owned = normalizedSearch(cert.name);
      return owned.includes(normalizedTarget) || normalizedTarget.includes(owned);
    });
  }

  function renderBenchmarks() {
    const host = $("#benchmarkResults");
    const preferences = preferredCategoryTitles();
    if (!preferences.length) {
      host.replaceChildren(emptyNote("선호 직군을 한 개 이상 선택하면 준비도를 보여드립니다."));
      return;
    }
    host.replaceChildren(...preferences.map((title, index) => {
      const benchmark = CAREER_BENCHMARKS[title] || { certs: ["컴퓨터활용능력 1급"], activities: ["프로젝트", "인턴"] };
      const ownedCerts = benchmark.certs.filter(hasCertificate);
      const activityTypes = new Set(activities.map((activity) => activity.type));
      const ownedActivities = benchmark.activities.filter((type) => activityTypes.has(type));
      const certScore = benchmark.certs.length ? ownedCerts.length / benchmark.certs.length * 65 : 0;
      const activityScore = benchmark.activities.length ? ownedActivities.length / benchmark.activities.length * 35 : 0;
      const score = Math.round(certScore + activityScore);

      const card = document.createElement("article");
      card.className = "benchmark-card";
      const head = document.createElement("div");
      head.className = "benchmark-head";
      const name = document.createElement("div");
      const nameTitle = document.createElement("strong");
      nameTitle.textContent = `${index + 1}순위 · ${title}`;
      const nameSub = document.createElement("span");
      nameSub.textContent = "대표 역량 준비도";
      name.append(nameTitle, nameSub);
      const scoreEl = document.createElement("strong");
      scoreEl.className = "benchmark-score";
      scoreEl.textContent = `${score}%`;
      head.append(name, scoreEl);
      const track = document.createElement("div");
      track.className = "benchmark-track";
      const fill = document.createElement("span");
      fill.style.width = `${score}%`;
      track.appendChild(fill);

      const missing = benchmark.certs.filter((cert) => !hasCertificate(cert));
      const certGroup = document.createElement("div");
      certGroup.className = "benchmark-group";
      const certLabel = document.createElement("span");
      certLabel.textContent = missing.length ? "추가로 살펴볼 자격증" : "대표 자격증 충족";
      const certChips = document.createElement("div");
      certChips.className = "chip-row";
      (missing.length ? missing : ownedCerts).forEach((cert) => certChips.appendChild(certBadge(cert, missing.length ? "popular" : "demand")));
      certGroup.append(certLabel, certChips);

      const activityGroup = document.createElement("div");
      activityGroup.className = "benchmark-group";
      const activityLabel = document.createElement("span");
      activityLabel.textContent = "도움 되는 외부활동";
      const activityChips = document.createElement("div");
      activityChips.className = "chip-row";
      benchmark.activities.forEach((type) => {
        const chip = document.createElement("span");
        chip.className = `chip ${activityTypes.has(type) ? "chip-benchmark-owned" : ""}`;
        chip.textContent = `${activityTypes.has(type) ? "✓ " : ""}${type}`;
        activityChips.appendChild(chip);
      });
      activityGroup.append(activityLabel, activityChips);

      const ideaGroup = document.createElement("div");
      ideaGroup.className = "benchmark-ideas";
      const ideaLabel = document.createElement("span");
      ideaLabel.className = "benchmark-ideas-title";
      ideaLabel.textContent = "직무 맞춤 추천 프로젝트·대외활동";
      const ideaList = document.createElement("div");
      ideaList.className = "benchmark-idea-list";
      (benchmark.activityIdeas || []).forEach((idea) => {
        const ideaCard = document.createElement("article");
        ideaCard.className = `benchmark-idea${activityTypes.has(idea.type) ? " is-related" : ""}`;
        const ideaHead = document.createElement("div");
        ideaHead.className = "benchmark-idea-head";
        const type = document.createElement("span");
        type.className = "chip";
        type.textContent = `${activityTypes.has(idea.type) ? "✓ " : ""}${idea.type}`;
        const title = document.createElement("strong");
        title.textContent = idea.title;
        ideaHead.append(type, title);
        const detail = document.createElement("p");
        detail.textContent = idea.detail;
        ideaCard.append(ideaHead, detail);
        ideaList.appendChild(ideaCard);
      });
      ideaGroup.append(ideaLabel, ideaList);
      card.append(head, track, certGroup, activityGroup, ideaGroup);
      return card;
    }));
  }

  /* ── 프로필 기반 AI형 회사·공고 추천 ─────────
     별도 생성형 AI 서버 없이 선호 직군, 자격증, 대외활동, 자소서 키워드와
     실제 공고의 직군·스킬·기업 특성을 비교하는 설명 가능한 로컬 추천이다. */
  function renderAiJobRecommendations() {
    const host = $("#aiJobRecommendations");
    const prefTitles = preferredCategoryTitles();
    const profileText = [selectedCoverLetterText(), certKeywordText(), activityKeywordText()].filter(Boolean).join(" ");
    const profileKeywords = ALL_KEYWORDS.filter((keyword) => textHasKeyword(profileText, keyword));
    if (!prefTitles.length && !profileKeywords.length && !state.category) {
      host.replaceChildren(emptyNote("마이페이지에서 선호 직군이나 자격증·대외활동·자소서 파일을 등록하면 맞춤 회사와 공고를 추천할 수 있습니다."));
      host.hidden = false;
      return;
    }

    const scored = LIVE.filter((job) => job.status === "active").map((job) => {
      const jobText = [job.name, job.company_name, job.category_title, job.subcategory_titles, job.skill_titles, job.attraction_titles].join(" ");
      const matched = profileKeywords.filter((keyword) => textHasKeyword(jobText, keyword));
      const prefIndex = prefTitles.indexOf(job.category_title);
      const prefScore = prefIndex > -1 ? [12, 8, 4][prefIndex] : 0;
      const filterScore = state.category && String(job.category_tag_id) === state.category ? 6 : 0;
      return { job, matched, prefIndex, score: prefScore + filterScore + matched.length * 3 };
    }).filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || b.job.id - a.job.id);

    const companyCounts = new Map();
    const recommendations = [];
    for (const item of scored) {
      const count = companyCounts.get(item.job.company_id) || 0;
      if (count >= 2) continue;
      recommendations.push(item);
      companyCounts.set(item.job.company_id, count + 1);
      if (recommendations.length === 6) break;
    }

    const intro = document.createElement("div");
    intro.className = "job-ai-summary";
    const title = document.createElement("strong");
    title.textContent = `맞춤 회사 ${fmt(companyCounts.size)}곳 · 공고 ${fmt(recommendations.length)}건`;
    const reason = document.createElement("p");
    const signals = [prefTitles.length ? `선호 직군 ${prefTitles.join(" · ")}` : "", profileKeywords.length ? `프로필 키워드 ${profileKeywords.slice(0, 6).join(" · ")}` : ""].filter(Boolean);
    reason.textContent = `${signals.join(" / ")} 기준으로 추천 순위를 계산했습니다.`;
    intro.append(title, reason);

    const grid = document.createElement("div");
    grid.className = "job-grid ai-job-grid";
    recommendations.forEach(({ job, matched, prefIndex }) => {
      const card = jobCard(job);
      const reasons = document.createElement("div");
      reasons.className = "ai-match-reasons";
      if (prefIndex > -1) {
        const chip = document.createElement("span");
        chip.className = "chip chip-pref";
        chip.textContent = `${prefIndex + 1}순위 직군 일치`;
        reasons.appendChild(chip);
      }
      matched.slice(0, 4).forEach((keyword) => {
        const chip = document.createElement("span");
        chip.className = "chip chip-skill";
        chip.textContent = `역량 일치: ${keyword}`;
        reasons.appendChild(chip);
      });
      card.insertBefore(reasons, card.lastElementChild);
      grid.appendChild(card);
    });
    if (!recommendations.length) grid.appendChild(emptyNote("현재 수집된 공고 중 프로필과 일치하는 추천 결과가 없습니다."));

    const note = document.createElement("p");
    note.className = "job-ai-note";
    note.textContent = "현재 버전은 외부 생성형 AI 호출이 아닌 실 공고·사용자 프로필 기반 로컬 추천이며, 실제 채용 결과를 보장하지 않습니다.";
    host.replaceChildren(intro, grid, note);
    host.hidden = false;
  }

  /* ── 저장된 프로필로 자동 이력서 생성 ──────── */
  const RESUME_TEMPLATES = [
    { id: "developer", title: "개발", subtitle: "프로젝트와 기술 자격을 먼저 배치", activityHeading: "프로젝트·실무 경험", order: ["summary", "certs", "activities", "coverLetter"] },
    { id: "data", title: "데이터", subtitle: "분석 자격과 정량 경험을 먼저 배치", activityHeading: "분석·프로젝트 경험", order: ["summary", "activities", "certs", "coverLetter"] },
    { id: "business", title: "기획·비즈니스", subtitle: "문제 해결 활동과 자소서를 먼저 배치", activityHeading: "기획·대외활동 경험", order: ["summary", "activities", "coverLetter", "certs"] },
    { id: "marketing", title: "마케팅·광고", subtitle: "캠페인·공모전 경험을 먼저 배치", activityHeading: "캠페인·외부활동", order: ["summary", "activities", "coverLetter", "certs"] },
  ];
  const RESUME_PROFILE_KEY = "scopy-resume-profile";

  function escapeDocText(value) {
    return String(value || "").replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  }

  function paragraphHtml(value) {
    return escapeDocText(value).replace(/\n/g, "<br>");
  }

  function currentResumeModel() {
    const template = RESUME_TEMPLATES.find((item) => item.id === $("#resumeTemplate").value) || RESUME_TEMPLATES[0];
    const coverLetter = coverLetters.find((item) => String(item.id) === $("#resumeCoverLetter").value) || null;
    const selectedIds = (selector) => new Set([...document.querySelectorAll(`${selector} input:checked`)].map((input) => input.value));
    const certIds = selectedIds("#resumeCertChoices");
    const activityIds = selectedIds("#resumeActivityChoices");
    return {
      template, coverLetter,
      certifications: certifications.filter((item) => certIds.has(String(item.id))),
      activities: activities.filter((item) => activityIds.has(String(item.id))),
      name: $("#resumeName").value.trim() || "이름 미입력",
      email: $("#resumeEmail").value.trim(),
      phone: $("#resumePhone").value.trim(),
    };
  }

  function coverLetterResumeText(letter) {
    if (!letter) return "사용할 자소서를 선택해주세요.";
    if (letter.content) return letter.content;
    return `첨부 자소서 파일: ${letter.fileName || letter.title}`;
  }

  function resumeSectionHtml(key, model) {
    if (key === "summary") {
      const summary = coverLetterResumeText(model.coverLetter).split(/\n+/).filter(Boolean).slice(0, 2).join(" ");
      return `<section><h2>프로필</h2><p>${paragraphHtml(summary)}</p></section>`;
    }
    if (key === "certs") {
      const items = model.certifications.length
        ? model.certifications.map((cert) => `<li><strong>${escapeDocText(cert.name)}</strong>${[cert.issuer, cert.date].filter(Boolean).length ? ` · ${escapeDocText([cert.issuer, cert.date].filter(Boolean).join(" · "))}` : ""}</li>`).join("")
        : "<li>등록된 자격증이 없습니다.</li>";
      return `<section><h2>자격증·수상</h2><ul>${items}</ul></section>`;
    }
    if (key === "activities") {
      const items = model.activities.length
        ? model.activities.map((activity) => `<li><strong>${escapeDocText(activity.title)}</strong><span>${escapeDocText([activity.type, activity.org, activity.date].filter(Boolean).join(" · "))}</span></li>`).join("")
        : "<li>등록된 외부활동이 없습니다.</li>";
      return `<section><h2>${escapeDocText(model.template.activityHeading)}</h2><ul class="activity-items">${items}</ul></section>`;
    }
    if (key === "coverLetter") {
      return `<section><h2>${escapeDocText(model.coverLetter?.title || "자기소개서")}</h2><p>${paragraphHtml(coverLetterResumeText(model.coverLetter))}</p></section>`;
    }
    return "";
  }

  function resumeBodyHtml(model) {
    const contact = [model.email, model.phone].filter(Boolean).map(escapeDocText).join(" · ") || "연락처 미입력";
    return `<article class="generated-resume">
      <header><span>${escapeDocText(model.template.title)} 지원 이력서</span><h1>${escapeDocText(model.name)}</h1><p>${contact}</p></header>
      ${model.template.order.map((key) => resumeSectionHtml(key, model)).join("")}
    </article>`;
  }

  function renderResumePreview() {
    $("#resumePreview").innerHTML = resumeBodyHtml(currentResumeModel());
  }

  function defaultResumeTemplate() {
    const first = preferredCategoryTitles()[0] || "";
    if (/개발|엔지니어링/.test(first)) return "developer";
    if (/마케팅|미디어/.test(first)) return "marketing";
    if (/경영|영업|HR/.test(first)) return "business";
    return "data";
  }

  function renderResumeChoices(hostSelector, items, emptyText) {
    const host = $(hostSelector);
    const ready = host.dataset.ready === "true";
    const selected = new Set([...host.querySelectorAll("input:checked")].map((input) => input.value));
    if (!items.length) {
      host.replaceChildren(emptyNote(emptyText));
      host.dataset.ready = "true";
      return;
    }
    const rows = items.map((item) => {
      const label = document.createElement("label");
      label.className = "resume-choice-item";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = String(item.id);
      input.checked = !ready || selected.has(input.value);
      input.addEventListener("change", renderResumePreview);
      const text = document.createElement("span");
      text.textContent = item.name || item.title;
      label.append(input, text);
      return label;
    });
    host.replaceChildren(...rows);
    host.dataset.ready = "true";
  }

  function renderResumeBuilder() {
    const templateSelect = $("#resumeTemplate");
    if (!templateSelect.options.length) {
      RESUME_TEMPLATES.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = `${template.title} — ${template.subtitle}`;
        templateSelect.appendChild(option);
      });
      templateSelect.value = defaultResumeTemplate();
    }

    const coverSelect = $("#resumeCoverLetter");
    const previous = String(state.clSelectedId || coverSelect.value || "");
    coverSelect.replaceChildren(new Option("자소서 선택", ""), ...coverLetters.map((letter) => new Option(letter.title, String(letter.id))));
    coverSelect.value = coverLetters.some((letter) => String(letter.id) === previous) ? previous : String(coverLetters[0]?.id || "");

    renderResumeChoices("#resumeCertChoices", certifications, "등록한 자격증이 없습니다.");
    renderResumeChoices("#resumeActivityChoices", activities, "등록한 대외활동이 없습니다.");

    if (!$("#resumeName").dataset.ready) {
      let profile = {};
      try { profile = JSON.parse(localStorage.getItem(RESUME_PROFILE_KEY) || "{}"); } catch {}
      $("#resumeName").value = profile.name || "";
      $("#resumeEmail").value = profile.email || "";
      $("#resumePhone").value = profile.phone || "";
      $("#resumeName").dataset.ready = "true";
    }
    renderResumePreview();
  }

  function saveResumeProfile() {
    localStorage.setItem(RESUME_PROFILE_KEY, JSON.stringify({
      name: $("#resumeName").value.trim(), email: $("#resumeEmail").value.trim(), phone: $("#resumePhone").value.trim(),
    }));
    renderResumePreview();
  }

  async function downloadGeneratedResume() {
    const model = currentResumeModel();
    if (!model.coverLetter) { alert("자동 이력서에 넣을 자소서를 먼저 선택해주세요."); return; }
    if (!window.docx) {
      alert("문서 생성 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.");
      return;
    }

    const btn = $("#resumeDownloadBtn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "생성 중…";
    try {
      const { Document, Paragraph, TextRun, HeadingLevel } = window.docx;
      const paragraphs = [
        new Paragraph({ text: `${model.template.title} 지원 이력서`, heading: HeadingLevel.SUBTITLE }),
        new Paragraph({ text: model.name, heading: HeadingLevel.TITLE }),
        new Paragraph({ text: [model.email, model.phone].filter(Boolean).join(" · ") || "연락처 미입력" }),
      ];
      const addHeading = (text) => paragraphs.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1 }));
      const addLines = (text) => String(text || "").split(/\n/).forEach((line) => paragraphs.push(new Paragraph({ text: line })));

      model.template.order.forEach((section) => {
        if (section === "summary") {
          addHeading("프로필");
          const summary = coverLetterResumeText(model.coverLetter).split(/\n+/).filter(Boolean).slice(0, 2).join(" ");
          addLines(summary);
        } else if (section === "certs") {
          addHeading("자격증·수상");
          if (!model.certifications.length) addLines("등록된 자격증이 없습니다.");
          model.certifications.forEach((cert) => paragraphs.push(new Paragraph({
            children: [
              new TextRun({ text: cert.name, bold: true }),
              new TextRun({ text: [cert.issuer, cert.date].filter(Boolean).length ? ` · ${[cert.issuer, cert.date].filter(Boolean).join(" · ")}` : "" }),
            ],
            bullet: { level: 0 },
          })));
        } else if (section === "activities") {
          addHeading(model.template.activityHeading);
          if (!model.activities.length) addLines("등록된 외부활동이 없습니다.");
          model.activities.forEach((activity) => paragraphs.push(new Paragraph({
            children: [
              new TextRun({ text: activity.title, bold: true }),
              new TextRun({ text: [activity.type, activity.org, activity.date].filter(Boolean).length ? ` · ${[activity.type, activity.org, activity.date].filter(Boolean).join(" · ")}` : "" }),
            ],
            bullet: { level: 0 },
          })));
        } else if (section === "coverLetter") {
          addHeading(model.coverLetter.title || "자기소개서");
          addLines(coverLetterResumeText(model.coverLetter));
        }
      });

      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await window.docx.Packer.toBlob(doc);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `scopy_${model.template.title}_이력서_${model.name}.docx`.replace(/[\\/:*?"<>|]/g, "_");
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      alert("이력서 파일을 생성하지 못했습니다. 다시 시도해주세요.");
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /* ── 오케스트레이션 ───────────────────────── */
  const VIEW_META = {
    overview: ["시장 개요", `원티드 실시간 수집 데이터 · ${D.liveFetchedAt || "-"} 기준`],
    jobs: ["공고 탐색", "조건에 맞는 포지션을 찾아보세요"],
    companies: ["기업 비교", "실 채용 데이터로 기업의 공고 매력도를 비교하세요"],
    bookmarks: ["북마크", "관심 공고 모아보기"],
    mypage: ["마이페이지", "자격증·외부활동·선호 직군·자소서와 자동 이력서를 한곳에서 관리하세요"],
  };

  function render() {
    renderKpis();
    renderCharts();
    renderDueSoon();
    renderRecentViews();
    renderJobs();
    renderCompanies();
    renderRadarPair();
    renderBookmarks();
    renderCoverLetters();
    renderCertifications();
    renderActivities();
    renderBenchmarks();
    renderResumeBuilder();
  }

  // 모바일 오프캔버스 메뉴
  function openSidebar() {
    $("#sidebar").classList.add("is-open");
    $("#sidebarBackdrop").hidden = false;
    $("#mobileMenuBtn").setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeSidebar() {
    $("#sidebar").classList.remove("is-open");
    $("#sidebarBackdrop").hidden = true;
    $("#mobileMenuBtn").setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  $("#mobileMenuBtn").addEventListener("click", openSidebar);
  $("#sidebarClose").addEventListener("click", closeSidebar);
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("is-active", b === btn));
      document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${state.view}`));
      const [title, sub] = VIEW_META[state.view];
      $("#pageTitle").textContent = title;
      $("#pageSub").textContent = sub;
      $("#mypagePrefCompact").hidden = state.view !== "mypage";
      $(".topbar").classList.toggle("has-preferences", state.view === "mypage");
      if (state.view !== "mypage") closePreferenceMenu();
      closeSidebar();
    });
  });

  document.querySelectorAll(".table-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.target;
      tableMode[key] = !tableMode[key];
      btn.classList.toggle("is-active", tableMode[key]);
      if (tableMode[key]) $(`#chart-${key}`).replaceChildren(chartTables[key]);
      else { renderCharts(); renderCompanies(); renderRadarPair(); }
    });
  });

  $("#jobSearch").addEventListener("input", (e) => { state.search = e.target.value; renderJobs(); });
  $("#categoryFilter").addEventListener("change", (e) => { state.category = e.target.value; renderJobs(); });
  $("#careerFilter").addEventListener("change", (e) => { state.career = e.target.value; renderJobs(); });
  $("#sortOrder").addEventListener("change", (e) => { state.sort = e.target.value; renderJobs(); });
  $("#aiJobRecommendBtn").addEventListener("click", renderAiJobRecommendations);

  $("#clNewBtn").addEventListener("click", () => {
    state.clSelectedId = null;
    $("#clTitle").value = "";
    $("#clFile").value = "";
    renderCoverLetters();
  });
  const CL_FILE_MAX_BYTES = 2 * 1024 * 1024;
  const CERT_FILE_MAX_BYTES = 3 * 1024 * 1024; // 3MB — localStorage에 base64로 저장하므로 용량 한도를 둔다
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "utf-8");
    });
  }

  $("#clSaveBtn").addEventListener("click", async () => {
    const fileInput = $("#clFile");
    const file = fileInput.files[0];
    if (!file) { alert("등록할 자소서 파일을 선택해주세요."); return; }
    if (!file.name.toLowerCase().endsWith(".txt")) { alert("자소서는 TXT 파일만 등록할 수 있습니다."); return; }
    if (file.size > CL_FILE_MAX_BYTES) { alert("자소서 파일은 2MB 이하만 저장할 수 있습니다."); return; }
    const now = Date.now();
    const title = $("#clTitle").value.trim() || file.name.replace(/\.[^.]+$/, "");
    const next = {
      id: state.clSelectedId || now,
      title,
      content: await readFileAsText(file),
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: await readFileAsDataURL(file),
      updatedAt: now,
    };
    const index = coverLetters.findIndex((item) => item.id === state.clSelectedId);
    const previous = index > -1 ? coverLetters[index] : null;
    if (index > -1) coverLetters[index] = next;
    else coverLetters.unshift(next);
    try {
      saveCoverLetters();
    } catch {
      if (index > -1) coverLetters[index] = previous;
      else coverLetters.shift();
      alert("브라우저 저장 공간이 부족합니다. 더 작은 파일을 선택하거나 기존 파일을 삭제해주세요.");
      return;
    }
    state.clSelectedId = next.id;
    $("#clTitle").value = title;
    fileInput.value = "";
    renderCoverLetters();
  });

  $("#certName").addEventListener("focus", (e) => renderCertificateResults(e.target.value));
  $("#certName").addEventListener("input", (e) => {
    if (state.selectedCertificate && e.target.value !== state.selectedCertificate.name) {
      state.selectedCertificate = null;
      renderSelectedCertificate();
    }
    renderCertificateResults(e.target.value);
  });
  $("#certName").addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCertificateResults();
    if (e.key === "Enter" && !$("#certSearchResults").hidden) {
      const first = $("#certSearchResults .cert-result");
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".cert-combobox")) hideCertificateResults();
  });

  $("#certAddBtn").addEventListener("click", async () => {
    const name = $("#certName").value.trim();
    if (!name) return;
    const issuer = $("#certIssuer").value.trim();
    const fileInput = $("#certFile");
    const file = fileInput.files[0];
    if (file && file.size > CERT_FILE_MAX_BYTES) {
      alert("첨부파일은 3MB 이하만 저장할 수 있습니다.");
      return;
    }
    const catalog = state.selectedCertificate;
    const record = {
      id: Date.now(), name, issuer, date: $("#certDate").value,
      catalogId: catalog?.id || null,
      type: catalog?.type || null,
      category: catalog?.category || null,
      applications2024: catalog?.applications_2024 || null,
      employerPreferenceRate: catalog?.employer_preference_rate || null,
      employerMetric: catalog?.employer_metric || null,
    };
    if (file) {
      record.fileName = file.name;
      record.fileType = file.type;
      record.fileData = await readFileAsDataURL(file);
    }
    certifications.push(record);
    try {
      saveCertifications();
    } catch (err) {
      certifications.pop();
      alert("저장 공간이 부족해 첨부파일을 저장하지 못했습니다. 다른 자격증의 첨부파일을 정리하거나 더 작은 파일로 시도해보세요.");
      return;
    }
    $("#certName").value = "";
    $("#certIssuer").value = "";
    $("#certDate").value = "";
    fileInput.value = "";
    state.selectedCertificate = null;
    renderSelectedCertificate();
    hideCertificateResults();
    renderCertifications();
    renderBenchmarks();
    renderRecommendations(selectedCoverLetterText());
    renderResumeBuilder();
  });

  $("#activityAddBtn").addEventListener("click", () => {
    const title = $("#activityTitle").value.trim();
    if (!title) return;
    activities.unshift({
      id: Date.now(), type: $("#activityType").value, title,
      org: $("#activityOrg").value.trim(),
      date: $("#activityDate").value,
    });
    saveActivities();
    $("#activityTitle").value = "";
    $("#activityOrg").value = "";
    $("#activityDate").value = "";
    renderActivities();
    renderBenchmarks();
    renderRecommendations(selectedCoverLetterText());
    renderResumeBuilder();
  });

  $("#resumeDownloadBtn").addEventListener("click", downloadGeneratedResume);
  $("#resumeTemplate").addEventListener("change", renderResumePreview);
  $("#resumeCoverLetter").addEventListener("change", renderResumePreview);
  [$("#resumeName"), $("#resumeEmail"), $("#resumePhone")].forEach((input) => input.addEventListener("input", saveResumeProfile));
  $("#certModalClose").addEventListener("click", closeCertificationModal);
  $("#certModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "certModalOverlay") closeCertificationModal();
  });
  $("#activityModalClose").addEventListener("click", closeActivityModal);
  $("#activityModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "activityModalOverlay") closeActivityModal();
  });

  // 공고 상세 · 기업 목록 모달
  $("#jobModalClose").addEventListener("click", closeModal);
  $("#jobModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "jobModalOverlay") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#jobModalOverlay").hidden) closeModal();
    if (!$("#certModalOverlay").hidden) closeCertificationModal();
    if (!$("#activityModalOverlay").hidden) closeActivityModal();
    if (!$("#prefCompactMenu").hidden) closePreferenceMenu();
    if ($("#sidebar").classList.contains("is-open")) closeSidebar();
  });

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

  // 선호 직군 1~3순위 — 기존 단일 선택값은 1순위로 자동 이전한다.
  const prefSelects = [$("#prefCategory1"), $("#prefCategory2"), $("#prefCategory3")];
  const prefRankButtons = [$("#prefRankButton1"), $("#prefRankButton2"), $("#prefRankButton3")];
  const prefRankColors = ["#c75f36", "#5577bf", "#458b67"];
  let activePrefRank = 0;
  const categoryOptions = [...liveCategories.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  prefSelects.forEach((select) => categoryOptions.forEach(([id, title]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = title;
    select.appendChild(opt);
  }));
  const legacyPref = localStorage.getItem("scopy-preferred-category") || "";
  if (!localStorage.getItem(PREF_CATEGORIES_KEY) && legacyPref) {
    localStorage.setItem(PREF_CATEGORIES_KEY, JSON.stringify([legacyPref]));
  }
  const savedPrefs = preferredCategoryIds().map(String);
  prefSelects.forEach((select, index) => { select.value = savedPrefs[index] || ""; });
  if (savedPrefs[0]) {
    state.category = savedPrefs[0];
    catFilter.value = savedPrefs[0];
  }
  function closePreferenceMenu() {
    $("#prefCompactMenu").hidden = true;
    prefRankButtons.forEach((button) => button.classList.remove("is-open"));
  }

  function renderPreferenceCompact() {
    const selectedValues = prefSelects.map((select) => select.value);
    prefRankButtons.forEach((button, index) => {
      const locked = index > 0 && prefSelects.slice(0, index).some((select) => !select.value);
      const title = liveCategories.get(Number(prefSelects[index].value)) || "선택 안 함";
      button.disabled = locked;
      button.classList.toggle("has-value", Boolean(prefSelects[index].value));
      button.classList.toggle("is-open", !$("#prefCompactMenu").hidden && activePrefRank === index);
      button.title = `${index + 1}순위 · ${title}`;
      button.textContent = `${index + 1}순위 · ${title}`;
      button.setAttribute("aria-label", `${index + 1}순위 선호 직무: ${title}`);
    });

    if ($("#prefCompactMenu").hidden) return;
    const activeSelect = prefSelects[activePrefRank];
    const host = $("#prefCompactOptions");
    $("#prefCompactMenuTitle").textContent = `${activePrefRank + 1}순위 직무 선택`;
    $("#prefCompactMenu").style.setProperty("--rank-color", prefRankColors[activePrefRank]);
    const options = [];
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = `pref-compact-option${!activeSelect.value ? " is-selected" : ""}`;
    clear.textContent = "선택 안 함";
    clear.addEventListener("click", () => {
      activeSelect.value = "";
      activeSelect.dispatchEvent(new Event("change"));
      closePreferenceMenu();
    });
    options.push(clear);
    categoryOptions.forEach(([id, title]) => {
      const value = String(id);
      const option = document.createElement("button");
      option.type = "button";
      option.className = `pref-compact-option${activeSelect.value === value ? " is-selected" : ""}`;
      option.textContent = title;
      option.disabled = selectedValues.some((selected, index) => index !== activePrefRank && selected === value);
      option.addEventListener("click", () => {
        activeSelect.value = value;
        activeSelect.dispatchEvent(new Event("change"));
        closePreferenceMenu();
      });
      options.push(option);
    });
    host.replaceChildren(...options);
  }

  prefRankButtons.forEach((button, index) => button.addEventListener("click", () => {
    const opening = $("#prefCompactMenu").hidden || activePrefRank !== index;
    activePrefRank = index;
    $("#prefCompactMenu").hidden = !opening;
    renderPreferenceCompact();
  }));
  $("#prefCompactMenuClose").addEventListener("click", closePreferenceMenu);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".pref-inline")) closePreferenceMenu();
  });
  prefSelects.forEach((select) => select.addEventListener("change", (e) => {
    const changedIndex = prefSelects.indexOf(e.target);
    if (!e.target.value) prefSelects.slice(changedIndex + 1).forEach((item) => { item.value = ""; });
    if (e.target.value && changedIndex > 0 && prefSelects.slice(0, changedIndex).some((item) => !item.value)) {
      e.target.value = "";
      alert("앞 순위 직군부터 선택해주세요.");
    }
    const values = prefSelects.map((item) => item.value).filter(Boolean);
    if (new Set(values).size !== values.length) {
      e.target.value = "";
      alert("같은 직군은 한 번만 선택할 수 있습니다.");
    }
    const next = prefSelects.map((item) => item.value).filter(Boolean);
    localStorage.setItem(PREF_CATEGORIES_KEY, JSON.stringify(next));
    state.category = prefSelects[0].value;
    catFilter.value = state.category;
    renderJobs();
    renderBenchmarks();
    renderRecommendations(selectedCoverLetterText());
    renderPreferenceCompact();
  }));
  renderPreferenceCompact();

  $("#pageSub").textContent = VIEW_META.overview[1];
  render();
})();
