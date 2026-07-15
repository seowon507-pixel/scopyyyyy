// scopy — localStorage 기반 취업 데이터 백업·복원
(function () {
  const PREFIX = "scopy-";
  const exportBtn = document.getElementById("exportWorkspaceBtn");
  const importInput = document.getElementById("importWorkspaceFile");

  function scopyKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    return keys;
  }

  exportBtn?.addEventListener("click", () => {
    const workspace = {};
    scopyKeys().forEach((key) => { workspace[key] = localStorage.getItem(key); });
    const payload = {
      format: "scopy-workspace",
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scopy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("file too large");
      const payload = JSON.parse(await file.text());
      if (payload?.format !== "scopy-workspace" || !payload.workspace || typeof payload.workspace !== "object") {
        throw new Error("invalid format");
      }
      const entries = Object.entries(payload.workspace).filter(([key, value]) => key.startsWith(PREFIX) && typeof value === "string");
      if (!entries.length) throw new Error("empty workspace");
      if (!confirm(`백업 데이터 ${entries.length}개 항목으로 현재 저장 내용을 덮어쓸까요?`)) return;
      scopyKeys().forEach((key) => localStorage.removeItem(key));
      entries.forEach(([key, value]) => localStorage.setItem(key, value));
      alert("백업을 복원했습니다. 화면을 새로고침합니다.");
      window.location.reload();
    } catch {
      alert("올바른 scopy 백업 파일이 아닙니다.");
    } finally {
      importInput.value = "";
    }
  });
})();
