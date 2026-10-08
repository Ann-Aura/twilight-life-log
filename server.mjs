import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);
const env = await loadEnv();
const config = {
  baseUrl: (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  apiKey: env.OPENAI_API_KEY || "",
  model: env.OPENAI_MODEL || "gpt-4o-mini",
};
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };

createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/summarize") return summarize(request, response);
  if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "Method Not Allowed");
  const safePath = request.url === "/" ? "index.html" : normalize(decodeURIComponent(request.url || "")).replace(/^([/\\])+/, "");
  if (!["index.html", "styles.css", "app.js"].includes(safePath)) return send(response, 404, "Not Found");
  try {
    const content = await readFile(join(ROOT, safePath));
    response.writeHead(200, { "Content-Type": mimeTypes[extname(safePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch { send(response, 404, "Not Found"); }
}).listen(PORT, () => console.log(`暮光记录已启动：http://localhost:${PORT}`));

async function summarize(request, response) {
  if (!config.apiKey) return sendJson(response, 500, { error: "未配置 OPENAI_API_KEY，请先创建并填写 .env 文件。" });
  try {
    const body = await readJson(request);
    if (!Array.isArray(body.entries) || body.entries.length === 0) return sendJson(response, 400, { error: "没有可整理的记录。" });
    const content = body.entries.map((text) => `- ${String(text).slice(0, 1000)}`).join("\n");
    const aiResponse = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature: 0.7, messages: [
        { role: "system", content: "你是一位温柔、克制的生活记录整理者。请根据用户今天的碎片记录，写一段简短的中文日记式总结。不要捏造事实。可用【今日片段】【心情或感受】【值得留意】三个小标题；如果没有相应内容请自然省略。长度控制在 180 字以内。" },
        { role: "user", content: `今天的原始记录：\n${content}` }
      ] }),
    });
    const data = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) return sendJson(response, aiResponse.status, { error: data.error?.message || `AI 接口返回 ${aiResponse.status}` });
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) return sendJson(response, 502, { error: "AI 没有返回可用内容。" });
    sendJson(response, 200, { summary });
  } catch (error) { sendJson(response, 500, { error: `整理失败：${error.message}` }); }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; if (raw.length > 30_000) request.destroy(); });
    request.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("请求格式不正确")); } });
    request.on("error", reject);
  });
}
function send(response, status, text) { response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }); response.end(text); }
function sendJson(response, status, data) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); response.end(JSON.stringify(data)); }
async function loadEnv() {
  const path = join(ROOT, ".env");
  try { await access(path, constants.R_OK); } catch { return {}; }
  const content = await readFile(path, "utf8");
  return Object.fromEntries(content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => { const i = line.indexOf("="); return i < 0 ? [line, ""] : [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
}
