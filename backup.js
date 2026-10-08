(() => {
  const RECORDS_KEY = "twilight-life-log-v1";
  const CHAT_KEY = "twilight-life-log-review-chat-v1";
  const GIST_SETTINGS_KEY = "twilight-life-log-gist-settings-v1";
  const $ = (selector) => document.querySelector(selector);
  const fields = { token: $("#github-token"), gistId: $("#gist-id"), fileName: $("#gist-file-name"), auto: $("#auto-backup-enabled"), minutes: $("#auto-backup-minutes") };
  let autoTimer = null;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.id); toast.id = setTimeout(() => node.classList.remove("show"), 3000); }
  function status(message, type = "") { const node = $("#gist-status"); node.textContent = message; node.className = `gist-status ${type}`; }
  function backupPayload() {
    return { schemaVersion: 1, app: "twilight-life-log", exportedAt: new Date().toISOString(), records: read(RECORDS_KEY, {}), reviewChat: read(CHAT_KEY, { range: null, messages: [] }) };
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `暮光记录完整备份_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); toast("已导出完整备份文件");
  }
  function mergeRecords(local, incoming) {
    const result = { ...local };
    Object.entries(incoming || {}).forEach(([date, remote]) => {
      const here = result[date];
      if (!here) { result[date] = remote; return; }
      const known = new Set((here.entries || []).map((entry) => entry.id));
      const entries = [...(here.entries || []), ...(remote.entries || []).filter((entry) => !known.has(entry.id))].sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));
      result[date] = { entries, summary: remote.summary || here.summary || null };
    });
    return result;
  }
  function importPayload(payload) {
    if (!payload || payload.app !== "twilight-life-log" || !payload.records || typeof payload.records !== "object") throw new Error("这不是有效的暮光记录备份文件");
    const merged = mergeRecords(read(RECORDS_KEY, {}), payload.records);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(merged));
    if (payload.reviewChat?.messages?.length) localStorage.setItem(CHAT_KEY, JSON.stringify(payload.reviewChat));
    toast(`已合并导入 ${Object.keys(payload.records).length} 天记录，刷新页面后即可查看`);
  }
  async function importFile(file) {
    try { importPayload(JSON.parse(await file.text())); } catch (error) { toast(`导入失败：${error.message}`); }
  }
  function getConfig() {
    return { token: fields.token.value.trim(), gistId: fields.gistId.value.trim(), fileName: fields.fileName.value.trim() || "twilight-life-log-backup.json", auto: fields.auto.checked, minutes: Math.max(5, Number(fields.minutes.value) || 30) };
  }
  function saveConfig() {
    const config = getConfig();
    localStorage.setItem(GIST_SETTINGS_KEY, JSON.stringify(config));
    configureAutoBackup(config);
    status(config.gistId ? `已保存配置 · Gist ${config.gistId}` : "已保存配置；首次备份时会创建私密 Gist", "success");
    toast("GitHub 配置已保存在当前浏览器");
    return config;
  }
  function headers(token) { return { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }; }
  async function github(url, options, token) {
    const response = await fetch(`https://api.github.com${url}`, { ...options, headers: { ...headers(token), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `GitHub 返回 ${response.status}`);
    return data;
  }
  async function upload() {
    const config = getConfig();
    if (!config.token) return toast("请先填写 GitHub Token");
    const button = $("#sync-to-github"); button.disabled = true; button.textContent = "正在备份…";
    try {
      const content = JSON.stringify(backupPayload(), null, 2);
      let gist;
      if (config.gistId) gist = await github(`/gists/${encodeURIComponent(config.gistId)}`, { method: "PATCH", body: JSON.stringify({ files: { [config.fileName]: { content } } }) }, config.token);
      else gist = await github("/gists", { method: "POST", body: JSON.stringify({ description: "暮光记录 · 私密日记备份", public: false, files: { [config.fileName]: { content } } }) }, config.token);
      fields.gistId.value = gist.id;
      localStorage.setItem(GIST_SETTINGS_KEY, JSON.stringify({ ...config, gistId: gist.id }));
      status(`上次备份成功 · ${new Date().toLocaleString("zh-CN")} · Gist ${gist.id}`, "success");
      toast("已安全备份到你的 GitHub Gist");
    } catch (error) { status(`备份失败：${error.message}`, "error"); toast(`备份失败：${error.message}`); }
    finally { button.disabled = false; button.textContent = "备份到 GitHub"; }
  }
  async function importGist() {
    const config = getConfig();
    if (!config.token || !config.gistId) return toast("请填写 GitHub Token 和 Gist ID");
    const button = $("#import-from-github"); button.disabled = true; button.textContent = "正在导入…";
    try {
      const gist = await github(`/gists/${encodeURIComponent(config.gistId)}`, { method: "GET" }, config.token);
      const file = gist.files?.[config.fileName] || Object.values(gist.files || {})[0];
      if (!file) throw new Error("Gist 中没有找到备份文件");
      const content = file.truncated ? await (await fetch(file.raw_url, { headers: headers(config.token) })).text() : file.content;
      importPayload(JSON.parse(content));
      status(`导入成功 · ${new Date().toLocaleString("zh-CN")}`, "success");
    } catch (error) { status(`导入失败：${error.message}`, "error"); toast(`导入失败：${error.message}`); }
    finally { button.disabled = false; button.textContent = "从 GitHub 导入"; }
  }
  function configureAutoBackup(config) {
    clearInterval(autoTimer); autoTimer = null;
    if (config.auto && config.token) { autoTimer = setInterval(upload, config.minutes * 60_000); status(`自动备份已开启：每 ${config.minutes} 分钟一次`, "success"); }
  }
  const saved = read(GIST_SETTINGS_KEY, {});
  fields.token.value = saved.token || ""; fields.gistId.value = saved.gistId || ""; fields.fileName.value = saved.fileName || "twilight-life-log-backup.json"; fields.auto.checked = Boolean(saved.auto); fields.minutes.value = saved.minutes || 30;
  configureAutoBackup(saved);
  $("#backup-export").addEventListener("click", downloadBackup);
  $("#backup-import").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", (event) => { if (event.target.files[0]) importFile(event.target.files[0]); event.target.value = ""; });
  $("#save-github-config").addEventListener("click", saveConfig);
  $("#sync-to-github").addEventListener("click", upload);
  $("#import-from-github").addEventListener("click", importGist);
})();
