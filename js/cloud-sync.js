// scopy — Supabase 계정별 작업공간 동기화
// 관리자 SQL이 아직 적용되지 않은 환경에서는 localStorage만 사용한다.
(function () {
  const PREFIX = "scopy-";
  const INTERNAL_USER_KEY = "scopy-cloud-user-id";
  const LOCAL_ONLY_KEYS = new Set([INTERNAL_USER_KEY, "scopy-theme"]);
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;
  let currentUser = null;
  let ready = false;
  let suppressSync = false;
  let syncTimer = null;

  function isWorkspaceKey(key) {
    return typeof key === "string" && key.startsWith(PREFIX) && !LOCAL_ONLY_KEYS.has(key);
  }

  function workspaceKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (isWorkspaceKey(key)) keys.push(key);
    }
    return keys.sort();
  }

  function collectWorkspace() {
    return Object.fromEntries(workspaceKeys().map((key) => [key, localStorage.getItem(key)]));
  }

  function normalized(value) {
    const source = value && typeof value === "object" ? value : {};
    return JSON.stringify(Object.fromEntries(Object.keys(source).sort().map((key) => [key, source[key]])));
  }

  function setStatus(text, kind = "") {
    const node = document.getElementById("cloudSyncStatus");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("is-synced", kind === "synced");
    node.classList.toggle("is-error", kind === "error");
  }

  function announceReady(mode) {
    document.dispatchEvent(new CustomEvent("scopy:cloud-ready", { detail: { mode } }));
  }

  function clearWorkspace() {
    suppressSync = true;
    workspaceKeys().forEach((key) => originalRemoveItem.call(localStorage, key));
    suppressSync = false;
  }

  function applyWorkspace(payload) {
    suppressSync = true;
    workspaceKeys().forEach((key) => originalRemoveItem.call(localStorage, key));
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (isWorkspaceKey(key) && typeof value === "string") originalSetItem.call(localStorage, key, value);
    });
    suppressSync = false;
  }

  async function saveWorkspace() {
    if (!ready || !currentUser) return;
    clearTimeout(syncTimer);
    setStatus("저장 중…");
    const client = window.Auth.getClient();
    const { error } = await client.from("user_workspaces").upsert({
      user_id: currentUser.id,
      payload: collectWorkspace(),
    }, { onConflict: "user_id" });
    if (error) {
      console.warn("[scopy cloud sync]", error.message);
      setStatus("이 기기에 저장 중", "error");
      return;
    }
    setStatus("계정에 저장됨", "synced");
  }

  function scheduleSave() {
    if (!ready || !currentUser || suppressSync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(saveWorkspace, 700);
  }

  Storage.prototype.setItem = function (key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && isWorkspaceKey(key)) scheduleSave();
  };

  Storage.prototype.removeItem = function (key) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && isWorkspaceKey(key)) scheduleSave();
  };

  Storage.prototype.clear = function () {
    const shouldSync = this === localStorage && workspaceKeys().length > 0;
    originalClear.call(this);
    if (shouldSync) scheduleSave();
  };

  async function connect(user) {
    currentUser = user;
    ready = false;
    if (!user) {
      setStatus("");
      return;
    }

    setStatus("계정 데이터 확인 중…");
    const client = window.Auth.getClient();
    let result;
    try {
      result = await client
        .from("user_workspaces")
        .select("payload, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
    } catch (requestError) {
      console.warn("[scopy cloud sync]", requestError);
      setStatus("이 기기에 저장 중", "error");
      announceReady("local");
      return;
    }
    const { data, error } = result;

    if (error) {
      console.warn("[scopy cloud sync]", error.message);
      ready = false;
      setStatus("이 기기에 저장 중", "error");
      announceReady("local");
      return;
    }

    const previousUserId = localStorage.getItem(INTERNAL_USER_KEY);
    if (data?.payload) {
      const remotePayload = data.payload;
      const localPayload = collectWorkspace();
      originalSetItem.call(localStorage, INTERNAL_USER_KEY, user.id);
      if (normalized(remotePayload) !== normalized(localPayload)) {
        applyWorkspace(remotePayload);
        window.location.reload();
        return;
      }
    } else {
      if (previousUserId && previousUserId !== user.id) clearWorkspace();
      originalSetItem.call(localStorage, INTERNAL_USER_KEY, user.id);
    }

    ready = true;
    if (!data) await saveWorkspace();
    else setStatus("계정에 저장됨", "synced");
    announceReady(data ? "cloud" : "migrated");
  }

  window.Auth.onChange((user) => { connect(user); });
  window.ScopyCloudSync = { saveNow: saveWorkspace, collectWorkspace };
})();
