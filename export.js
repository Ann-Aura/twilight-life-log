(() => {
  const RECORDS_KEY = "twilight-life-log-v1";
  const $ = (selector) => document.querySelector(selector);
  const start = $("#export-start-date"), end = $("#export-end-date"), includeRaw = $("#include-raw-records");
  const records = () => { try { return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {}; } catch { return {}; } };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.id); toast.id = setTimeout(() => node.classList.remove("show"), 2600); }
  function today() { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 10); }
  function selectedDays() {
    if (!start.value || !end.value) throw new Error("请先选择开始和结束日期");
    if (start.value > end.value) throw new Error("开始日期不能晚于结束日期");
    const data = records();
    return Object.keys(data).filter((date) => date >= start.value && date <= end.value && (data[date].entries?.length || data[date].summary)).sort().map((date) => ({ date, ...data[date] }));
  }
  function asText(days) {
    const lines = ["暮光记录", `导出范围：${start.value} 至 ${end.value}`, `导出时间：${new Date().toLocaleString("zh-CN")}`, ""];
    days.forEach((day) => { lines.push(`## ${day.date}`, "", "【AI 整理】", day.summary?.text || "（这一天尚未进行 AI 整理）"); if (includeRaw.checked) lines.push("", "【原始碎片】", ...(day.entries || []).slice().reverse().map((entry) => `- ${entry.text}`)); lines.push(""); });
    return lines.join("\n");
  }
  function asHtml(days) {
    const articles = days.map((day) => { const summary = escapeHtml(day.summary?.text || "（这一天尚未进行 AI 整理）").replace(/\n/g, "<br>"); const raw = includeRaw.checked ? `<section><h3>原始碎片</h3><ul>${(day.entries || []).slice().reverse().map((entry) => `<li>${escapeHtml(entry.text)}</li>`).join("") || "<li>（无）</li>"}</ul></section>` : ""; return `<article><h2>${day.date}</h2><section><h3>AI 整理</h3><p>${summary}</p></section>${raw}</article>`; }).join("\n");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>暮光记录 ${start.value} 至 ${end.value}</title><style>body{max-width:760px;margin:0 auto;padding:48px 24px;background:#f8efe5;color:#332c28;font:16px/1.8 -apple-system,"Microsoft YaHei",sans-serif}h1,h2{font-family:Georgia,"Noto Serif SC",serif}header{padding-bottom:22px;border-bottom:1px solid #e2cfc0}header p{color:#82746c}article{margin:30px 0;padding:24px;border:1px solid #e2cfc0;border-radius:12px;background:#fffaf4}article h2{margin:0 0 18px;color:#a95437}h3{margin:17px 0 6px;font-size:13px;color:#82746c}p{margin:0}ul{margin:5px 0;padding-left:20px}li{margin:6px 0}</style></head><body><header><h1>暮光记录</h1><p>导出范围：${start.value} 至 ${end.value}<br>导出时间：${escapeHtml(new Date().toLocaleString("zh-CN"))}</p></header>${articles}</body></html>`;
  }
  function download(type) {
    try { const days = selectedDays(); if (!days.length) throw new Error("这段时间没有可导出的日记"); const html = type === "html"; const blob = new Blob([html ? asHtml(days) : asText(days)], { type: html ? "text/html;charset=utf-8" : "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `暮光记录_${start.value}_至_${end.value}.${html ? "html" : "txt"}`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); toast(`已导出 ${days.length} 天日记`); } catch (error) { toast(error.message); }
  }
  const dates = Object.keys(records()).sort(); start.value = dates[0] || today(); end.value = dates.at(-1) || today();
  $("#export-txt").addEventListener("click", () => download("txt")); $("#export-html").addEventListener("click", () => download("html"));
})();
