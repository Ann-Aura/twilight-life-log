(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.querySelector("#voice-button");
  const input = document.querySelector("#entry-input");
  const count = document.querySelector("#character-count");
  if (!SpeechRecognition) { button.hidden = true; return; }
  let recognition = null;
  let listening = false;
  let originalText = "";
  function toast(message) {
    const node = document.querySelector("#toast");
    node.textContent = message; node.classList.add("show");
    clearTimeout(toast.id); toast.id = setTimeout(() => node.classList.remove("show"), 2600);
  }
  function update(text) {
    input.value = text.slice(0, 1000);
    count.textContent = `${input.value.length} / 1000`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function stop() { if (recognition && listening) recognition.stop(); }
  button.addEventListener("click", () => {
    if (listening) return stop();
    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    originalText = input.value.trim();
    recognition.onstart = () => { listening = true; button.classList.add("listening"); button.textContent = "● 正在听…"; };
    recognition.onresult = (event) => {
      let words = "";
      for (let index = 0; index < event.results.length; index++) words += event.results[index][0].transcript;
      update(`${originalText}${originalText && words ? " " : ""}${words}`);
    };
    recognition.onerror = (event) => {
      const messages = { "not-allowed": "未获得麦克风权限", "no-speech": "没有听到声音，请再试一次", "network": "语音识别服务连接失败" };
      if (event.error !== "aborted") toast(messages[event.error] || `语音输入失败：${event.error}`);
    };
    recognition.onend = () => { listening = false; button.classList.remove("listening"); button.textContent = "◉ 语音输入"; };
    try { recognition.start(); } catch { toast("语音识别正在关闭，请稍后再试"); }
  });
})();
