// scopy — 개인 지원 현황 보드
(function () {
  const STORAGE_KEY = "scopy-applications";
  const LIVE = window.SCOPY_DATA?.liveJobs || [];
  const STATUS = [
    ["planned", "지원 예정"],
    ["applied", "지원 완료"],
    ["document", "서류 진행"],
    ["interview", "면접"],
    ["offer", "최종 합격"],
    ["rejected", "종료·불합격"],
  ];
  const statusMap = Object.fromEntries(STATUS);
  let applications = [];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) applications = saved;
  } catch {}

  const $ = (selector) => document.querySelector(selector);
  const fmt = (value) => new Intl.NumberFormat("ko-KR").format(value || 0);
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
  const activeJob = (id) => LIVE.find((job) => String(job.id) === String(id));
  const snapshotOf = (job) => ({
    id: job.id, name: job.name, company_name: job.company_name,
    due_time: job.due_time, url: job.url, category_title: job.category_title,
  });
  const jobOf = (item) => activeJob(item.jobId) || item.job || {};

  function dateText(value) {
    if (!value) return "상시";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  }

  function daysLeft(value) {
    if (!value) return null;
    return Math.ceil((new Date(value).setHours(23, 59, 59, 999) - Date.now()) / 86400000);
  }

  function persistAndRender() {
    save();
    render();
    document.dispatchEvent(new CustomEvent("scopy:applications-updated"));
  }

  function add(jobId, status = "planned") {
    const job = activeJob(jobId);
    if (!job) return;
    const existing = applications.find((item) => String(item.jobId) === String(job.id));
    if (existing) {
      if (status !== "planned") existing.status = status;
      existing.updatedAt = Date.now();
    } else {
      applications.unshift({
        id: Date.now(), jobId: job.id, job: snapshotOf(job), status,
        appliedAt: status === "planned" ? "" : new Date().toISOString().slice(0, 10),
        note: "", createdAt: Date.now(), updatedAt: Date.now(),
      });
    }
    persistAndRender();
  }

  function kpi(label, value, sub) {
    const node = document.createElement("div");
    node.className = "kpi application-kpi";
    const l = document.createElement("div");
    l.className = "kpi-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "kpi-value";
    v.textContent = fmt(value);
    const s = document.createElement("div");
    s.className = "kpi-delta";
    s.textContent = sub;
    node.append(l, v, s);
    return node;
  }

  function renderKpis() {
    const host = $("#applicationKpis");
    if (!host) return;
    const applied = applications.filter((item) => item.status !== "planned").length;
    const interview = applications.filter((item) => ["interview", "offer"].includes(item.status)).length;
    const offers = applications.filter((item) => item.status === "offer").length;
    const upcoming = applications.filter((item) => {
      const left = daysLeft(jobOf(item).due_time);
      return item.status === "planned" && left !== null && left >= 0 && left <= 7;
    }).length;
    host.replaceChildren(
      kpi("관리 중", applications.length, "전체 지원 공고"),
      kpi("지원 완료", applied, applications.length ? `전체의 ${Math.round((applied / applications.length) * 100)}%` : "지원 기록 없음"),
      kpi("면접 진입", interview, applied ? `지원 대비 ${Math.round((interview / applied) * 100)}%` : "지원 후 집계"),
      kpi("7일 내 마감", upcoming, offers ? `최종 합격 ${offers}건` : "지원 예정 확인"),
    );
  }

  function applicationCard(item) {
    const job = jobOf(item);
    const card = document.createElement("article");
    card.className = "application-card";
    const company = document.createElement("span");
    company.className = "application-company";
    company.textContent = job.company_name || "기업 정보 없음";
    const title = document.createElement("strong");
    title.textContent = job.name || "공고 정보 없음";
    const deadline = document.createElement("span");
    deadline.className = "application-deadline";
    const left = daysLeft(job.due_time);
    deadline.textContent = job.due_time ? `마감 ${dateText(job.due_time)}${left !== null && left >= 0 ? ` · D-${left}` : ""}` : "상시 채용";
    if (left !== null && left >= 0 && left <= 7) deadline.classList.add("urgent");

    const status = document.createElement("select");
    status.className = "select application-status-select";
    STATUS.forEach(([value, label]) => status.appendChild(new Option(label, value)));
    status.value = item.status;
    status.addEventListener("change", () => {
      item.status = status.value;
      if (!item.appliedAt && item.status !== "planned") item.appliedAt = new Date().toISOString().slice(0, 10);
      item.updatedAt = Date.now();
      persistAndRender();
    });

    const appliedAt = document.createElement("input");
    appliedAt.type = "date";
    appliedAt.className = "search-input application-date";
    appliedAt.value = item.appliedAt || "";
    appliedAt.setAttribute("aria-label", "지원일");
    appliedAt.addEventListener("change", () => {
      item.appliedAt = appliedAt.value;
      item.updatedAt = Date.now();
      save();
    });

    const note = document.createElement("textarea");
    note.className = "application-note";
    note.placeholder = "담당자·면접 일정·준비 메모";
    note.value = item.note || "";
    note.addEventListener("change", () => {
      item.note = note.value.trim();
      item.updatedAt = Date.now();
      save();
    });

    const details = document.createElement("details");
    details.className = "application-details";
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = item.note ? "지원일·메모 확인" : "지원일·메모 입력";
    const dateField = document.createElement("label");
    dateField.className = "application-detail-field";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = "지원일";
    dateField.append(dateLabel, appliedAt);
    details.append(detailsSummary, dateField, note);

    const actions = document.createElement("div");
    actions.className = "application-card-actions";
    if (job.url) {
      const link = document.createElement("a");
      link.href = job.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "공고 보기 ↗";
      actions.appendChild(link);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => {
      applications = applications.filter((saved) => saved.id !== item.id);
      window.ScopyApplications.items = applications;
      persistAndRender();
    });
    actions.appendChild(remove);
    card.append(company, title, deadline, status, details, actions);
    return card;
  }

  function renderBoard() {
    const host = $("#applicationBoard");
    if (!host) return;
    host.replaceChildren(...STATUS.map(([value, label]) => {
      const column = document.createElement("section");
      column.className = `application-column status-${value}`;
      const rows = applications.filter((item) => item.status === value);
      const head = document.createElement("div");
      head.className = "application-column-head";
      const title = document.createElement("strong");
      title.textContent = label;
      const count = document.createElement("span");
      count.textContent = fmt(rows.length);
      head.append(title, count);
      const list = document.createElement("div");
      list.className = "application-column-list";
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "application-empty";
        empty.textContent = "공고 없음";
        list.appendChild(empty);
      } else {
        list.append(...rows.map(applicationCard));
      }
      column.append(head, list);
      return column;
    }));
  }

  function renderOverview() {
    const host = $("#applicationOverviewSummary");
    if (!host) return;
    if (!applications.length) {
      const empty = document.createElement("p");
      empty.className = "personal-summary-empty";
      empty.textContent = "아직 관리 중인 지원 공고가 없습니다. 공고 탐색에서 ‘지원 관리에 추가’를 눌러 시작하세요.";
      host.replaceChildren(empty);
      return;
    }
    const pipeline = document.createElement("div");
    pipeline.className = "personal-pipeline";
    STATUS.slice(0, 5).forEach(([value, label]) => {
      const item = document.createElement("div");
      const count = applications.filter((saved) => saved.status === value).length;
      item.innerHTML = `<strong>${fmt(count)}</strong><span>${label}</span>`;
      pipeline.appendChild(item);
    });
    const upcoming = applications
      .filter((item) => item.status === "planned" && daysLeft(jobOf(item).due_time) !== null && daysLeft(jobOf(item).due_time) >= 0)
      .sort((a, b) => new Date(jobOf(a).due_time) - new Date(jobOf(b).due_time))[0];
    const note = document.createElement("p");
    note.className = "personal-summary-note";
    note.textContent = upcoming
      ? `가장 가까운 마감: ${jobOf(upcoming).company_name} · ${jobOf(upcoming).name} (${dateText(jobOf(upcoming).due_time)})`
      : "등록된 지원 예정 공고 중 확정된 마감일이 없습니다.";
    host.replaceChildren(pipeline, note);
  }

  function populateJobs() {
    const select = $("#applicationJobSelect");
    if (!select) return;
    const previous = select.value;
    const jobs = LIVE.filter((job) => job.status === "active").sort((a, b) => b.id - a.id);
    select.replaceChildren(new Option("공고 선택", ""), ...jobs.map((job) => new Option(`${job.company_name} · ${job.name}`, String(job.id))));
    select.value = previous;
  }

  function render() {
    renderKpis();
    renderBoard();
    renderOverview();
    populateJobs();
  }

  $("#applicationAddBtn")?.addEventListener("click", () => {
    const jobId = $("#applicationJobSelect").value;
    if (!jobId) {
      alert("추가할 공고를 선택해주세요.");
      return;
    }
    add(jobId);
  });
  $("#openApplicationsBtn")?.addEventListener("click", () => {
    document.querySelector('.nav-item[data-view="applications"]')?.click();
  });

  window.ScopyApplications = { add, render, items: applications, statusMap };
  render();
})();
