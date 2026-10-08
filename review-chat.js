(() => {
  const RECORDS_KEY = "twilight-life-log-v1";
  const SETTINGS_KEY = "twilight-life-log-settings-v1";
  const CHAT_KEY = "twilight-life-log-review-chat-v1";
  const $ = (selector) => document.querySelector(selector);
  const start = $("#review-start-date");
  const end = $("#review-end-date");
  const history = $("#chat-history");
  const note = $("#review-range-note");
  const form = $("#chat-form");
  const input = $("#chat-input");
  const send = $("#send-chat");
  let conversation = read(CHAT_KEY, { range: null, messages: [] });

  function dateKey(date) {
    const copy = new Date(date);
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  }
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function save() { localStorage.setItem(CHAT_KEY, JSON.stringify(conversation)); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function selectedRange() { return { start: start.value, end: end.value }; }
  function rangeText(range) { return `${range.start.replaceAll("-", ".")} — ${range.end.replaceAll("-", ".")}`; }
  function isCurrentRange() {
    const range = selectedRange();
    return conversation.range && conversation.range.start === range.start && conversation.range.end === range.end;
  }
  function setChatEnabled(enabled) { input.disabled = !enabled; send.disabled = !enabled; }
  function render() {
    if (!conversation.messages.length) {
      history.innerHTML = '<div class="chat-empty">选好时间后点击「开始回顾」。<br>AI 会先读完这段日记，再陪你继续聊。</div>';
      return;
    }
    history.innerHTML = conversation.messages.map((message) => `
      <article class="chat-message ${message.role === "assistant" ? "ai" : "user"}">
        <span class="chat-label">${message.role === "assistant" ? "AI 回顾" : "你"}</span>${escapeHtml(message.content)}
      </article>`).join("");
    history.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function journalForRange(range) {
    const records = read(RECORDS_KEY, {});
    const dates = Object.keys(records).filter((date) => date >= range.start && date <= range.end).sort();
    const days = dates.map((date) => {
      const record = records[date];
      const entries = (record.entries || []).map((entry) => `- ${entry.text}`).join("\n");
      return `【${date}】\n原始记录：\n${entries || "（无）"}${record.summary ? `\nAI 当日整理：\n${record.summary.text}` : ""}`;
    });
    return { dates, content: days.join("\n\n") };
  }
  function configOrGuide() {
    const config = read(SETTINGS_KEY, {});
    if (config.baseUrl && config.apiKey && config.model) return config;
    document.querySelector('[data-settings-target="ai-configuration"]')?.click();
    showToast("请先完成 AI 配置");
    return null;
  }
  async function requestAi(config, messages) {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.65, messages }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `接口返回 ${response.status}`);
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI 没有返回可用内容");
    return content;
  }
  function coreInstructions() {
    return "你是用户的私人生活回顾助手。只能依据提供的日记资料回答，不能编造或过度推测。回答使用温暖、具体、克制的中文。用户可以继续追问这段时间的生活、习惯、情绪、事件和线索；如果资料不足，要坦诚说明。";
  }
  function baseMessages(range, journal) {
    return [
      { role: "system", content: coreInstructions() },
      { role: "user", content: `以下是我在 ${rangeText(range)} 的全部日记资料，请阅读并在后续对话中以此为准：\n\n${journal}` },
    ];
  }
  async function startReview() {
    const range = selectedRange();
    if (!range.start || !range.end) return showToast("请先选择开始和结束日期");
    if (range.start > range.end) return showToast("开始日期不能晚于结束日期");
    const config = configOrGuide();
    if (!config) return;
    const journal = journalForRange(range);
    if (!journal.dates.length) return showToast("这段时间还没有日记记录");
    if (journal.content.length > 60_000) return showToast("这段记录太多，请缩短日期范围后再回顾");
    const button = $("#start-review");
    button.disabled = true; button.textContent = "正在回顾…";
    conversation = { range, messages: [] };
    history.innerHTML = '<div class="chat-message ai pending">AI 正在阅读这段时间的日记…</div>';
    setChatEnabled(false);
    try {
      const prompt = "请先做一次整体回顾：这段时间我主要在做什么？有哪些值得注意的事情、变化或反复出现的主题？请分点表达，并在最后给出 2 个你认为值得我继续聊的问题。";
      const answer = await requestAi(config, [...baseMessages(range, journal.content), { role: "user", content: prompt }]);
      conversation.messages = [{ role: "assistant", content: answer }];
      save(); render(); setChatEnabled(true);
      note.textContent = `已读取 ${journal.dates.length} 天记录 · ${rangeText(range)}`;
    } catch (error) {
      conversation = { range: null, messages: [] }; render();
      showToast(`回顾失败：${error.message}`);
    } finally { button.disabled = false; button.textContent = "开始回顾"; }
  }
  async function continueChat(question) {
    const range = selectedRange();
    if (!isCurrentRange() || !conversation.messages.length) return startReview();
    const config = configOrGuide();
    if (!config) return;
    const journal = journalForRange(range);
    const past = conversation.messages.map((message) => ({ role: message.role, content: message.content }));
    input.disabled = true; send.disabled = true;
    conversation.messages.push({ role: "user", content: question }); render();
    try {
      const answer = await requestAi(config, [...baseMessages(range, journal.content), ...past, { role: "user", content: question }]);
      conversation.messages.push({ role: "assistant", content: answer });
      save(); render();
    } catch (error) {
      conversation.messages.pop(); render();
      showToast(`发送失败：${error.message}`);
    } finally { setChatEnabled(true); input.focus(); }
  }

  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6);
  start.value = conversation.range?.start || dateKey(weekAgo);
  end.value = conversation.range?.end || dateKey(now);
  if (conversation.range && conversation.messages.length) {
    note.textContent = `已读取的范围 · ${rangeText(conversation.range)}`;
    setChatEnabled(true);
  } else setChatEnabled(false);
  render();
  $("#start-review").addEventListener("click", startReview);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return input.focus();
    input.value = "";
    continueChat(question);
  });
  $("#clear-chat").addEventListener("click", () => {
    conversation = { range: null, messages: [] };
    localStorage.removeItem(CHAT_KEY);
    setChatEnabled(false); render(); note.textContent = "请选择一段有记录的时间。";
    showToast("已清除本次回顾对话");
  });
})();
