(function () {
  const ENGINE_BASE = "./engine/";
  const ENGINE_SCRIPT = `${ENGINE_BASE}pikafish.js`;
  const TIMEOUT_MS = 15000;

  const elements = {
    diagHref: document.getElementById("diagHref"),
    diagSecure: document.getElementById("diagSecure"),
    diagIso: document.getElementById("diagIso"),
    diagSab: document.getElementById("diagSab"),
    diagThreads: document.getElementById("diagThreads"),
    diagUa: document.getElementById("diagUa"),
    statusBadge: document.getElementById("statusBadge"),
    loadScriptButton: document.getElementById("loadScriptButton"),
    initConfigButton: document.getElementById("initConfigButton"),
    initRawButton: document.getElementById("initRawButton"),
    uciButton: document.getElementById("uciButton"),
    startposButton: document.getElementById("startposButton"),
    goButton: document.getElementById("goButton"),
    stopButton: document.getElementById("stopButton"),
    clearButton: document.getElementById("clearButton"),
    copyEnvButton: document.getElementById("copyEnvButton"),
    logOutput: document.getElementById("logOutput")
  };

  const state = {
    scriptLoaded: false,
    instance: null,
    activeMode: null
  };

  function log(message, type) {
    const stamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    const prefix = type ? `[${type}]` : "[info]";
    elements.logOutput.textContent += `\n${stamp} ${prefix} ${message}`;
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
    console.log(`${prefix} ${message}`);
  }

  function setStatus(text, tone) {
    elements.statusBadge.textContent = text;
    elements.statusBadge.className = `badge ${tone}`;
  }

  function setActionState(enabled) {
    elements.uciButton.disabled = !enabled;
    elements.startposButton.disabled = !enabled;
    elements.goButton.disabled = !enabled;
    elements.stopButton.disabled = !enabled;
  }

  function updateDiagnostics() {
    elements.diagHref.textContent = window.location.href;
    elements.diagSecure.textContent = window.isSecureContext ? "是" : "否";
    elements.diagIso.textContent = window.crossOriginIsolated ? "是" : "否";
    elements.diagSab.textContent = typeof SharedArrayBuffer !== "undefined" ? "可用" : "不可用";
    elements.diagThreads.textContent = String(navigator.hardwareConcurrency || "unknown");
    elements.diagUa.textContent = navigator.userAgent;
  }

  function copyEnvironment() {
    const payload = {
      href: window.location.href,
      secureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      userAgent: navigator.userAgent
    };

    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      .then(() => log("環境資訊已複製。"))
      .catch((error) => log(`複製失敗：${error}`, "error"));
  }

  function registerGlobalErrorHooks() {
    window.addEventListener("error", (event) => {
      log(`window error: ${event.message} @ ${event.filename}:${event.lineno}`, "error");
    });

    window.addEventListener("unhandledrejection", (event) => {
      log(`unhandled rejection: ${event.reason}`, "error");
    });
  }

  function loadScript() {
    if (state.scriptLoaded || typeof window.Pikafish === "function" || typeof window.FairyStockfish === "function") {
      state.scriptLoaded = true;
      log("pikafish.js 已存在，略過重複載入。");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${ENGINE_SCRIPT}?v=minimal-lab-1`;
      script.async = true;
      script.onload = () => {
        state.scriptLoaded = true;
        log("pikafish.js 載入完成。");
        resolve();
      };
      script.onerror = () => {
        reject(new Error("無法載入 pikafish.js"));
      };
      document.body.appendChild(script);
    });
  }

  function describeInstance(instance) {
    const keys = Object.keys(instance).sort();
    log(`instance keys: ${keys.slice(0, 40).join(", ") || "(none)"}`);
    log(`sendCommand=${typeof instance.sendCommand}, postMessage=${typeof instance.postMessage}, addMessageListener=${typeof instance.addMessageListener}`);
  }

  function attachRawListener(instance) {
    if (typeof instance.addMessageListener === "function") {
      instance.addMessageListener((msg) => log(`listener: ${msg}`));
      log("已掛上 addMessageListener。");
      return;
    }

    log("instance 不含 addMessageListener，改用手動指令模式觀察。");
  }

  function sendCommand(command) {
    if (!state.instance) {
      log("尚未取得引擎實例。", "error");
      return;
    }

    log(command, "command");

    if (typeof state.instance.sendCommand === "function") {
      state.instance.sendCommand(command);
      return;
    }

    if (typeof state.instance.postMessage === "function") {
      state.instance.postMessage(command);
      return;
    }

    log("instance 沒有 sendCommand / postMessage。", "error");
  }

  async function initEngine(mode) {
    try {
      setStatus(`初始化中 (${mode})`, "running");
      await loadScript();

      const factory = window.Pikafish || window.FairyStockfish;
      if (typeof factory !== "function") {
        throw new Error("找不到 Pikafish 工廠函式。");
      }

      state.activeMode = mode;
      log(`開始初始化，mode=${mode}`);

      const options = {
        locateFile: (path) => `${ENGINE_BASE}${path}?v=minimal-lab-1`,
        mainScriptUrlOrBlob: `${ENGINE_SCRIPT}?v=minimal-lab-1`,
        setStatus: (text) => log(`status: ${text}`),
        onReceiveStdout: (line) => log(`stdout: ${line}`),
        onReceiveStderr: (line) => log(`stderr: ${line}`, "error"),
        onRuntimeInitialized: () => log("onRuntimeInitialized fired")
      };

      const initPromise = mode === "raw" ? factory() : factory(options);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`初始化超時 ${TIMEOUT_MS / 1000} 秒`)), TIMEOUT_MS);
      });

      const instance = await Promise.race([initPromise, timeoutPromise]);
      state.instance = instance;

      log("Pikafish promise resolved。");
      describeInstance(instance);
      if (mode === "raw") {
        attachRawListener(instance);
      }

      setActionState(true);
      setStatus("初始化完成", "ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus("初始化失敗", "error");
      log(message, "error");
    }
  }

  elements.loadScriptButton.addEventListener("click", async () => {
    try {
      await loadScript();
      setStatus("腳本已載入", "neutral");
    } catch (error) {
      log(error instanceof Error ? error.message : String(error), "error");
      setStatus("腳本載入失敗", "error");
    }
  });

  elements.initConfigButton.addEventListener("click", () => initEngine("config"));
  elements.initRawButton.addEventListener("click", () => initEngine("raw"));
  elements.uciButton.addEventListener("click", () => sendCommand("uci"));
  elements.startposButton.addEventListener("click", () => sendCommand("position startpos"));
  elements.goButton.addEventListener("click", () => sendCommand("go depth 10"));
  elements.stopButton.addEventListener("click", () => sendCommand("stop"));
  elements.clearButton.addEventListener("click", () => {
    elements.logOutput.textContent = "[bootstrap] log cleared";
  });
  elements.copyEnvButton.addEventListener("click", copyEnvironment);

  registerGlobalErrorHooks();
  updateDiagnostics();
  setActionState(false);
  log(`secure=${window.isSecureContext}, coi=${window.crossOriginIsolated}, sab=${typeof SharedArrayBuffer !== "undefined"}`);
})();
