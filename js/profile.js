// scopy — 경력·프로젝트·기술·포트폴리오 프로필 관리
(function () {
  const KEYS = {
    careers: "scopy-careers",
    projects: "scopy-projects",
    skills: "scopy-skills",
    links: "scopy-profile-links",
  };

  function load(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  const data = {
    careers: load(KEYS.careers),
    projects: load(KEYS.projects),
    skills: load(KEYS.skills),
    links: load(KEYS.links),
  };

  const $ = (selector) => document.querySelector(selector);
  const save = (name) => {
    localStorage.setItem(KEYS[name], JSON.stringify(data[name]));
    document.dispatchEvent(new CustomEvent("scopy:profile-updated"));
  };

  function empty(text) {
    const node = document.createElement("p");
    node.className = "empty-note";
    node.textContent = text;
    return node;
  }

  function deleteButton(onDelete) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cl-item-del";
    button.setAttribute("aria-label", "삭제");
    button.textContent = "×";
    button.addEventListener("click", onDelete);
    return button;
  }

  function profileItem(titleText, metaText, detailText, onDelete) {
    const item = document.createElement("div");
    item.className = "profile-detail-item";
    const main = document.createElement("div");
    main.className = "profile-detail-main";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const meta = document.createElement("span");
    meta.textContent = metaText;
    main.append(title, meta);
    if (detailText) {
      const detail = document.createElement("p");
      detail.textContent = detailText;
      main.appendChild(detail);
    }
    item.append(main, deleteButton(onDelete));
    return item;
  }

  function renderCareers() {
    const host = $("#careerList");
    if (!host) return;
    if (!data.careers.length) {
      host.replaceChildren(empty("등록한 경력이 없습니다."));
      return;
    }
    host.replaceChildren(...data.careers.map((item) => profileItem(
      [item.company, item.position].filter(Boolean).join(" · "),
      [item.start, item.end || "재직 중"].filter(Boolean).join(" – "),
      item.summary,
      () => {
        data.careers.splice(data.careers.findIndex((entry) => entry.id === item.id), 1);
        save("careers");
        renderCareers();
      },
    )));
  }

  function renderProjects() {
    const host = $("#projectList");
    if (!host) return;
    if (!data.projects.length) {
      host.replaceChildren(empty("등록한 프로젝트가 없습니다."));
      return;
    }
    host.replaceChildren(...data.projects.map((item) => profileItem(
      item.title,
      [item.role, item.period].filter(Boolean).join(" · "),
      item.result,
      () => {
        data.projects.splice(data.projects.findIndex((entry) => entry.id === item.id), 1);
        save("projects");
        renderProjects();
      },
    )));
  }

  function renderSkills() {
    const host = $("#skillList");
    if (!host) return;
    if (!data.skills.length) {
      host.replaceChildren(empty("등록한 기술·도구가 없습니다."));
      return;
    }
    host.replaceChildren(...data.skills.map((skill) => {
      const chip = document.createElement("span");
      chip.className = "profile-skill-chip";
      const label = document.createElement("span");
      label.textContent = skill;
      const del = document.createElement("button");
      del.type = "button";
      del.setAttribute("aria-label", `${skill} 삭제`);
      del.textContent = "×";
      del.addEventListener("click", () => {
        data.skills.splice(data.skills.indexOf(skill), 1);
        save("skills");
        renderSkills();
      });
      chip.append(label, del);
      return chip;
    }));
  }

  function renderLinks() {
    const host = $("#linkList");
    if (!host) return;
    if (!data.links.length) {
      host.replaceChildren(empty("등록한 포트폴리오 링크가 없습니다."));
      return;
    }
    host.replaceChildren(...data.links.map((item) => {
      const row = profileItem(item.label || "포트폴리오", item.url, "", () => {
        data.links.splice(data.links.findIndex((entry) => entry.id === item.id), 1);
        save("links");
        renderLinks();
      });
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "profile-link-open";
      link.textContent = "열기 ↗";
      row.querySelector(".profile-detail-main").appendChild(link);
      return row;
    }));
  }

  $("#careerAddBtn")?.addEventListener("click", () => {
    const company = $("#careerCompany").value.trim();
    const position = $("#careerPosition").value.trim();
    if (!company || !position) {
      alert("회사명과 직무·직책을 입력해주세요.");
      return;
    }
    data.careers.unshift({
      id: Date.now(), company, position,
      start: $("#careerStart").value,
      end: $("#careerEnd").value,
      summary: $("#careerSummary").value.trim(),
    });
    save("careers");
    ["#careerCompany", "#careerPosition", "#careerStart", "#careerEnd", "#careerSummary"].forEach((id) => { $(id).value = ""; });
    renderCareers();
  });

  $("#projectAddBtn")?.addEventListener("click", () => {
    const title = $("#projectTitle").value.trim();
    if (!title) {
      alert("프로젝트명을 입력해주세요.");
      return;
    }
    data.projects.unshift({
      id: Date.now(), title,
      role: $("#projectRole").value.trim(),
      period: $("#projectPeriod").value.trim(),
      result: $("#projectResult").value.trim(),
    });
    save("projects");
    ["#projectTitle", "#projectRole", "#projectPeriod", "#projectResult"].forEach((id) => { $(id).value = ""; });
    renderProjects();
  });

  $("#skillAddBtn")?.addEventListener("click", () => {
    const next = $("#skillInput").value.split(",").map((item) => item.trim()).filter(Boolean);
    next.forEach((skill) => {
      if (!data.skills.some((saved) => saved.toLowerCase() === skill.toLowerCase())) data.skills.push(skill);
    });
    $("#skillInput").value = "";
    save("skills");
    renderSkills();
  });

  $("#linkAddBtn")?.addEventListener("click", () => {
    const label = $("#linkLabel").value.trim();
    let url = $("#linkUrl").value.trim();
    if (!url) {
      alert("링크 주소를 입력해주세요.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch {
      alert("올바른 링크 주소를 입력해주세요.");
      return;
    }
    data.links.unshift({ id: Date.now(), label: label || "포트폴리오", url });
    $("#linkLabel").value = "";
    $("#linkUrl").value = "";
    save("links");
    renderLinks();
  });

  renderCareers();
  renderProjects();
  renderSkills();
  renderLinks();
  window.SCOPY_PROFILE_DETAILS = data;
})();
