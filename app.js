(function () {
  const ENGINE_BASE = "./engine/";
  const ENGINE_SCRIPT = `${ENGINE_BASE}pikafish.js`;
  const DEFAULT_WASM = "pikafish.wasm";
  const IOS_WASM = "pikafish-ios.wasm";
  const TIMEOUT_MS = 15000;

  const elements = {
    diagHref: document.getElementById("diagHref"),
    diagSecure: document.getElementById("diagSecure"),
    diagIso: document.getElementById("diagIso"),
    diagSab: document.getElementById("diagSab"),
    diagThreads: document.getElementById("diagThreads"),
    diagProfile: document.getElementById("diagProfile"),
    diagWasm: document.getElementById("diagWasm"),
    diagUa: document.getElementById("diagUa"),
    statusBadge: document.getElementById("statusBadge"),
    loadScriptButton: document.getElementById("loadScriptButton"),
    initConfigButton: document.getElementById("initConfigButton"),
    initRawButton: document.getElementById("initRawButton"),
    uciButton: document.getElementById("uciButton"),
    startposButton: document.getElementById("startposButton"),
    goButton: document.getElementById("goButton"),
    goTimedButton: document.getElementById("goTimedButton"),
    stopButton: document.getElementById("stopButton"),
    threadsInput: document.getElementById("threadsInput"),
    setThreadsButton: document.getElementById("setThreadsButton"),
    clearButton: document.getElementById("clearButton"),
    copyEnvButton: document.getElementById("copyEnvButton"),
    logOutput: document.getElementById("logOutput")
  };

  const state = {
    scriptLoaded: false,
    instance: null,
    activeMode: null,
    activeVariant: null,
    lastError: null
  };

  function log(message, type = "info") {
    const stamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    const prefix = `[${type}]`;
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
    elements.goTimedButton.disabled = !enabled;
    elements.stopButton.disabled = !enabled;
    elements.setThreadsButton.disabled = !enabled;
  }

  function detectEngineVariant() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const isAppleMobile = /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isWebKitFamily = /AppleWebKit/i.test(ua) && !/Android/i.test(ua);
    const isIOSWebKit = isAppleMobile && isWebKitFamily;

    if (isIOSWebKit) {
      return {
        key: "ios",
        label: "iOS / iPadOS WebKit",
        wasm: IOS_WASM,
        reason: "偵測到 iPhone / iPad WebKit，先用 iPhone 相容版 wasm。"
      };
    }

    return {
      key: "default",
      label: "Default",
      wasm: DEFAULT_WASM,
      reason: "非 iOS WebKit，先用預設 wasm。"
    };
  }

  function updateDiagnostics() {
    const variant = detectEngineVariant();
    const threads = navigator.hardwareConcurrency || 4;
    elements.diagHref.textContent = window.location.href;
    elements.diagSecure.textContent = window.isSecureContext ? "是" : "否";
    elements.diagIso.textContent = window.crossOriginIsolated ? "是" : "否";
    elements.diagSab.textContent = typeof SharedArrayBuffer !== "undefined" ? "可用" : "不可用";
    elements.diagThreads.textContent = String(threads || "unknown");
    elements.diagProfile.textContent = `${variant.label} (${variant.key})`;
    elements.diagWasm.textContent = `${ENGINE_BASE}${variant.wasm}`;
    elements.diagUa.textContent = navigator.userAgent;
    elements.threadsInput.value = String(Math.max(1, Math.min(threads, 4)));
  }

  function copyEnvironment() {
    const variant = detectEngineVariant();
    const payload = {
      href: window.location.href,
      secureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      userAgent: navigator.userAgent,
      chosenVariant: variant
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
      script.src = `${ENGINE_SCRIPT}?v=minimal-lab-2`;
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
      log("已接上 addMessageListener。", "info");
      return;
    }

    log("instance 沒有 addMessageListener，改走 stdout/stderr。", "info");
  }

  function getFactory() {
    return window.Pikafish || window.FairyStockfish;
  }

  function resolveVariantFile(path, variant) {
    if (path.endsWith(".wasm")) {
      return `${ENGINE_BASE}${variant.wasm}?v=minimal-lab-2`;
    }
    return `${ENGINE_BASE}${path}?v=minimal-lab-2`;
  }

  async function createConfiguredInstance(variant) {
    const factory = getFactory();
    if (typeof factory !== "function") {
      throw new Error("找不到 Pikafish 工廠函式。");
    }

    log(`選用 variant=${variant.key}，wasm=${variant.wasm}`);
    log(variant.reason);

    const options = {
      locateFile: (path) => resolveVariantFile(path, variant),
      mainScriptUrlOrBlob: `${ENGINE_SCRIPT}?v=minimal-lab-2`,
      setStatus: (text) => log(`status: ${text}`),
      onReceiveStdout: (line) => log(`stdout: ${line}`),
      onReceiveStderr: (line) => log(`stderr: ${line}`, "error"),
      onRuntimeInitialized: () => log("onRuntimeInitialized fired")
    };

    return factory(options);
  }

  async function createRawInstance() {
    const factory = getFactory();
    if (typeof factory !== "function") {
      throw new Error("找不到 Pikafish 工廠函式。");
    }
    return factory();
  }

  function isSimdCompileError(message) {
    return /CompileError|invalid extended simd op|WebAssembly\.Module doesn't parse/i.test(message);
  }

  async function initEngine(mode) {
    try {
      setStatus(`初始化中 (${mode})`, "running");
      setActionState(false);
      state.instance = null;
      state.lastError = null;
      await loadScript();

      state.activeMode = mode;
      log(`開始初始化，mode=${mode}`);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`初始化超過 ${TIMEOUT_MS / 1000} 秒`)), TIMEOUT_MS);
      });

      let instance;
      if (mode === "raw") {
        state.activeVariant = { key: "raw", label: "Raw", wasm: "factory default" };
        instance = await Promise.race([createRawInstance(), timeoutPromise]);
      } else {
        const preferred = detectEngineVariant();
        state.activeVariant = preferred;

        try {
          instance = await Promise.race([createConfiguredInstance(preferred), timeoutPromise]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          state.lastError = message;

          if (preferred.key !== "ios" && isSimdCompileError(message)) {
            const fallback = {
              key: "ios-fallback",
              label: "iOS fallback",
              wasm: IOS_WASM,
              reason: "初始化遇到 SIMD / wasm parse 錯誤，改試 iPhone 相容版 wasm。"
            };
            state.activeVariant = fallback;
            log(`預設 variant 失敗：${message}`, "error");
            log("啟動 fallback，改試 pikafish-ios.wasm");
            instance = await Promise.race([createConfiguredInstance(fallback), timeoutPromise]);
          } else {
            throw error;
          }
        }
      }

      state.instance = instance;
      log("Pikafish promise resolved。", "info");
      describeInstance(instance);
      if (mode === "raw") {
        attachRawListener(instance);
      }

      setActionState(true);
      setStatus("初始化完成", "ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastError = message;
      setStatus("初始化失敗", "error");
      log(message, "error");
    }
  }

  function sendCommand(command) {
    if (!state.instance) {
      log("引擎尚未初始化。", "error");
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

  function getRequestedThreads() {
    const maxThreads = Math.max(1, navigator.hardwareConcurrency || 4);
    const parsed = Number.parseInt(elements.threadsInput.value, 10);
    if (Number.isNaN(parsed)) {
      return 1;
    }
    return Math.max(1, Math.min(parsed, maxThreads));
  }

  function applyThreads() {
    if (!state.instance) {
      log("引擎尚未初始化，不能設定 Threads。", "error");
      return;
    }

    const threads = getRequestedThreads();
    elements.threadsInput.value = String(threads);
    log(`準備設定 Threads=${threads}`);
    sendCommand("uci");
    sendCommand(`setoption name Threads value ${threads}`);
    sendCommand("isready");
  }

  function runTimedSearch() {
    if (!state.instance) {
      log("引擎尚未初始化，不能開始測試。", "error");
      return;
    }

    const threads = getRequestedThreads();
    log(`開始 3 秒測試，Threads=${threads}`);
    sendCommand(`setoption name Threads value ${threads}`);
    sendCommand("isready");
    sendCommand("position startpos");
    sendCommand("go movetime 3000");
  }

  elements.loadScriptButton.addEventListener("click", async () => {
    try {
      await loadScript();
      setStatus("腳本已就緒", "neutral");
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
  elements.goTimedButton.addEventListener("click", runTimedSearch);
  elements.stopButton.addEventListener("click", () => sendCommand("stop"));
  elements.setThreadsButton.addEventListener("click", applyThreads);
  elements.clearButton.addEventListener("click", () => {
    elements.logOutput.textContent = "[bootstrap] log cleared";
  });
  elements.copyEnvButton.addEventListener("click", copyEnvironment);

  registerGlobalErrorHooks();
  updateDiagnostics();
  setActionState(false);
  log(`secure=${window.isSecureContext}, coi=${window.crossOriginIsolated}, sab=${typeof SharedArrayBuffer !== "undefined"}`);
  log(`preferred variant=${detectEngineVariant().key}, wasm=${detectEngineVariant().wasm}`);
})();
