const state = {
  projects: [],
  activeProjectId: undefined,
  routes: [],
  setup: undefined
};

const AGENTS = [
  "visual-engineering",
  "ultrabrain",
  "deep",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "sisyphus",
  "hephaestus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "prometheus",
  "metis",
  "momus",
  "atlas",
  "sisyphus-junior"
];

const els = {
  healthLine: document.querySelector("#health-line"),
  apiPill: document.querySelector("#api-pill"),
  refreshAll: document.querySelector("#refresh-all"),
  themeToggle: document.querySelector("#theme-toggle"),
  activeProject: document.querySelector("#active-project"),
  projectList: document.querySelector("#project-list"),
  projectForm: document.querySelector("#project-form"),
  projectName: document.querySelector("#project-name"),
  projectRoot: document.querySelector("#project-root"),
  refreshProjects: document.querySelector("#refresh-projects"),
  chatFeed: document.querySelector("#chat-feed"),
  chatForm: document.querySelector("#chat-form"),
  task: document.querySelector("#task"),
  runMode: document.querySelector("#run-mode"),
  fixedAgent: document.querySelector("#fixed-agent"),
  executeTask: document.querySelector("#execute-task"),
  diffLines: document.querySelector("#diff-lines"),
  openFiles: document.querySelector("#open-files"),
  changedFiles: document.querySelector("#changed-files"),
  routeButton: document.querySelector("#route-button"),
  chatButton: document.querySelector("#chat-button"),
  setupStatus: document.querySelector("#setup-status"),
  apiSetupForm: document.querySelector("#api-setup-form"),
  routerProvider: document.querySelector("#router-provider"),
  routerModel: document.querySelector("#router-model"),
  routerBaseUrlRow: document.querySelector("#router-base-url-row"),
  routerBaseUrl: document.querySelector("#router-base-url"),
  routerApiKey: document.querySelector("#router-api-key"),
  executionProvider: document.querySelector("#execution-provider"),
  executionModel: document.querySelector("#execution-model"),
  executionApiKeyRow: document.querySelector("#execution-api-key-row"),
  executionApiKey: document.querySelector("#execution-api-key"),
  opencodeGoRow: document.querySelector("#opencode-go-row"),
  opencodeGoBaseUrl: document.querySelector("#opencode-go-base-url"),
  openAgentConfig: document.querySelector("#openagent-config"),
  confirmApi: document.querySelector("#confirm-api"),
  saveApi: document.querySelector("#save-api"),
  commandInput: document.querySelector("#command-input"),
  runCommand: document.querySelector("#run-command"),
  copyCommandOutput: document.querySelector("#copy-command-output"),
  commandOutput: document.querySelector("#command-output"),
  routeFilter: document.querySelector("#route-filter"),
  routesList: document.querySelector("#routes-list"),
  refreshRoutes: document.querySelector("#refresh-routes"),
  exportJson: document.querySelector("#export-json"),
  exportCsv: document.querySelector("#export-csv"),
  toastRegion: document.querySelector("#toast-region")
};

setTheme(localStorage.getItem("abot-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
renderAgentOptions();
renderEmptyFeed();
bindEvents();
await refreshAll().catch((error) => showToast(getErrorMessage(error), "error"));

function bindEvents() {
  els.themeToggle.addEventListener("click", toggleTheme);
  bindAsync(els.refreshAll, "click", refreshAll);
  bindAsync(els.refreshProjects, "click", loadProjects);
  bindAsync(els.projectForm, "submit", addProject);
  bindAsync(els.routeButton, "click", routeTask);
  bindAsync(els.chatForm, "submit", sendChat);
  bindAsync(els.apiSetupForm, "submit", saveApiSetup);
  bindAsync(els.confirmApi, "click", confirmApiSetup);
  bindAsync(els.runCommand, "click", runCommand);
  bindAsync(els.copyCommandOutput, "click", copyCommandOutput);
  bindAsync(els.refreshRoutes, "click", loadRoutes);
  els.exportJson.addEventListener("click", () => exportRoutes("json"));
  els.exportCsv.addEventListener("click", () => exportRoutes("csv"));
  els.routeFilter.addEventListener("input", () => renderRoutes(state.routes));
  els.routerProvider.addEventListener("change", syncSetupFields);
  els.executionProvider.addEventListener("change", syncSetupFields);

  window.addEventListener("unhandledrejection", (event) => {
    showToast(getErrorMessage(event.reason), "error");
  });
  window.addEventListener("error", (event) => {
    showToast(event.message, "error");
  });
}

async function refreshAll() {
  await loadHealth();
  await loadProjects();
  await loadSetup();
  await loadRoutes();
}

async function loadHealth() {
  const health = await api("/api/health");
  els.healthLine.textContent = health.routerLlmConfigured
    ? `${health.routerProvider || "router"} / ${health.routerModel || "model"}`
    : "Router missing";
}

async function loadProjects() {
  const result = await api("/api/projects");
  state.projects = result.projects;
  state.activeProjectId ||= state.projects[0]?.id;
  renderProjects();
  await loadRoutes();
}

async function addProject(event) {
  event.preventDefault();
  if (!els.projectRoot.value.trim()) return;

  await withButtonBusy(els.projectForm.querySelector("button[type='submit']"), "Saving", async () => {
    const result = await api("/api/projects", {
      method: "POST",
      body: {
        name: els.projectName.value.trim() || undefined,
        rootPath: els.projectRoot.value.trim()
      }
    });
    state.activeProjectId = result.project.id;
    els.projectName.value = "";
    els.projectRoot.value = "";
    await loadProjects();
    showToast("Folder ready", "success");
  });
}

async function loadSetup() {
  const setup = await api("/api/setup");
  state.setup = setup;
  renderSetup(setup);
}

async function saveApiSetup(event) {
  event.preventDefault();
  await withButtonBusy(els.saveApi, "Saving", async () => {
    const result = await api("/api/setup", {
      method: "POST",
      body: {
        routerProvider: els.routerProvider.value,
        routerModel: els.routerModel.value.trim(),
        routerBaseUrl: els.routerBaseUrl.value.trim(),
        routerApiKey: els.routerApiKey.value.trim(),
        executionProvider: els.executionProvider.value,
        executionModel: els.executionModel.value.trim(),
        executionApiKey: els.executionApiKey.value.trim(),
        opencodeGoBaseUrl: els.opencodeGoBaseUrl.value.trim(),
        openAgentConfig: els.openAgentConfig.value.trim()
      }
    });
    els.routerApiKey.value = "";
    els.executionApiKey.value = "";
    renderSetup(result.setup);
    await loadHealth();
    showToast("Saved to .env.local", "success");
  });
}

async function confirmApiSetup() {
  await withButtonBusy(els.confirmApi, "Checking", async () => {
    const result = await api("/api/setup/confirm", { method: "POST" });
    renderSetup(result.setup);
    await loadHealth();
    const routerOk = Boolean(result.setup?.router?.configured);
    const routerProbeOk = result.setup?.routerProbe?.skipped ? routerOk : Boolean(result.setup?.routerProbe?.ok);
    const executionOk = Boolean(result.setup?.execution?.configured);
    const executionProbeOk = result.setup?.executionProbe?.skipped ? executionOk : Boolean(result.setup?.executionProbe?.ok);
    const ready = routerOk && routerProbeOk && executionOk && executionProbeOk;
    showToast(ready ? "API ready" : "API needs attention", ready ? "success" : "error");
  });
}

async function routeTask() {
  if (!els.task.value.trim()) return;
  await withButtonBusy(els.routeButton, "Routing", async () => {
    const result = await api("/api/route", {
      method: "POST",
      body: buildTaskPayload()
    });
    renderMessages([
      {
        role: "assistant",
        createdAt: new Date().toISOString(),
        content: routeSummary(result)
      }
    ]);
    await loadRoutes();
  });
}

async function sendChat(event) {
  event.preventDefault();
  if (!els.task.value.trim()) return;

  await withButtonBusy(els.chatButton, els.executeTask.checked ? "Executing" : "Sending", async () => {
    const result = await api("/api/chat", {
      method: "POST",
      body: buildTaskPayload()
    });
    renderMessages(result.messages);
    els.task.value = "";
    await loadRoutes();
  });
}

async function runCommand() {
  if (!state.activeProjectId || !els.commandInput.value.trim()) return;
  els.commandOutput.textContent = "Running...";
  await withButtonBusy(els.runCommand, "Running", async () => {
    const result = await api("/api/workspace/command", {
      method: "POST",
      body: {
        projectId: state.activeProjectId,
        command: els.commandInput.value.trim(),
        cwd: ".",
        timeoutMs: 60000
      }
    });
    els.commandOutput.textContent = [
      `cwd: ${result.cwd}`,
      `exit: ${result.exitCode ?? "null"} duration: ${result.durationMs}ms timedOut: ${result.timedOut}`,
      "",
      result.stdout,
      result.stderr ? `\n[stderr]\n${result.stderr}` : ""
    ].join("\n");
  });
}

async function copyCommandOutput() {
  const text = els.commandOutput.textContent.trim();
  if (!text) return;
  await copyText(text);
  flashButtonLabel(els.copyCommandOutput, "Copied");
}

async function loadRoutes() {
  if (!state.activeProjectId) return;
  const result = await api(`/api/routes?projectId=${encodeURIComponent(state.activeProjectId)}&limit=80`);
  state.routes = result.routes;
  renderRoutes(state.routes);
}

function exportRoutes(format) {
  if (!state.activeProjectId) return;
  window.open(`/api/export/routes?projectId=${encodeURIComponent(state.activeProjectId)}&limit=1000&format=${format}`, "_blank", "noopener,noreferrer");
}

function renderProjects() {
  const active = state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0];
  if (active) {
    state.activeProjectId = active.id;
    els.activeProject.textContent = active.rootPath;
  } else {
    els.activeProject.textContent = "No folder";
  }

  els.projectList.innerHTML = "";
  for (const project of state.projects.slice(0, 4)) {
    const button = document.createElement("button");
    button.className = `project-item${project.id === state.activeProjectId ? " active" : ""}`;
    button.type = "button";
    button.textContent = project.name || project.rootPath;
    button.title = project.rootPath;
    button.addEventListener("click", async () => {
      state.activeProjectId = project.id;
      renderProjects();
      await loadRoutes();
    });
    els.projectList.append(button);
  }
}

function renderSetup(setup) {
  state.setup = setup;
  const router = setup.router || {};
  const execution = setup.execution || {};
  const routerConfigured = Boolean(router.configured);
  const executionConfigured = Boolean(execution.configured);

  const routerProbeFailed = setup.routerProbe && !setup.routerProbe.ok && !setup.routerProbe.skipped;
  const probeFailed = setup.executionProbe && !setup.executionProbe.ok && !setup.executionProbe.skipped;
  const probesReady = Boolean(setup.routerProbe && setup.executionProbe);
  const probesOk = probesReady && !routerProbeFailed && !probeFailed;
  els.apiPill.textContent = !routerConfigured ? "API missing" : !probesReady ? "API saved" : routerProbeFailed ? "Router blocked" : probeFailed ? "Exec blocked" : "API ready";
  els.apiPill.className = `status-pill ${routerConfigured && probesOk ? "ok" : "warn"}`;
  els.routerProvider.value = router.provider === "gemini" ? "gemini" : "openai-compatible";
  els.routerModel.value = router.model || els.routerModel.value || "gemini-3.1-flash-lite";
  els.routerBaseUrl.value = router.provider === "gemini" ? "" : router.baseUrl || els.routerBaseUrl.value;
  els.openAgentConfig.value = execution.openAgentConfigPath || els.openAgentConfig.value;
  els.executionProvider.value = execution.adapter === "auto"
    ? "auto"
    : execution.adapter === "codex-cli"
    ? "codex-cli"
    : executionProviderFromModel(execution.modelOverride) || els.executionProvider.value || "gemini";
  els.executionModel.value = execution.codexModel || stripProviderPrefix(execution.modelOverride || els.executionModel.value || router.model || "gpt-5.5");
  syncSetupFields();

  els.setupStatus.innerHTML = [
    statusLine("Router", routerConfigured, router.model || router.provider || "missing"),
    statusLine(execution.adapter === "auto" ? "Primary" : "Single Model", Boolean(execution.modelOverride), execution.modelOverride || "OpenAgent chain"),
    execution.adapter === "auto" ? statusLine("Fallback", Boolean(execution.fallbackModel), execution.fallbackModel || "Gemini not set") : "",
    statusLine("Execution", executionConfigured, execution.openAgentConfigExists ? "config found" : "config missing"),
    setup.routerProbe ? statusLine("Router Test", Boolean(setup.routerProbe.ok), formatProbe(setup.routerProbe)) : "",
    setup.executionProbe ? statusLine("Live Test", Boolean(setup.executionProbe.ok), formatProbe(setup.executionProbe)) : "",
    statusLine(".env.local", Boolean(setup.envFileIgnored), setup.envFileIgnored ? "ignored" : "check gitignore")
  ].filter(Boolean).join("");
}

function statusLine(label, ok, detail) {
  const safeDetail = escapeHtml(detail);
  return `
    <div class="status-line">
      <span>${escapeHtml(label)}</span>
      <span class="status-pill ${ok ? "ok" : "warn"}" title="${safeDetail}">${safeDetail}</span>
    </div>
  `;
}

function syncSetupFields() {
  const geminiRouter = els.routerProvider.value === "gemini";
  els.routerBaseUrlRow.hidden = geminiRouter;
  if (geminiRouter && !els.routerModel.value.trim()) {
    els.routerModel.value = "gemini-3.1-flash-lite";
  }
  if (els.executionProvider.value === "gemini" && !els.executionModel.value.trim()) {
    els.executionModel.value = "gemini-3.1-flash-lite";
  }
  if ((els.executionProvider.value === "codex-cli" || els.executionProvider.value === "auto") && !els.executionModel.value.trim()) {
    els.executionModel.value = "gpt-5.5";
  }
  els.executionApiKeyRow.hidden = els.executionProvider.value === "codex-cli";
  els.opencodeGoRow.hidden = els.executionProvider.value !== "opencode-go";
}

function stripProviderPrefix(model) {
  const value = String(model || "");
  const slashIndex = value.indexOf("/");
  return slashIndex === -1 ? value : value.slice(slashIndex + 1);
}

function executionProviderFromModel(model) {
  const provider = String(model || "").split("/")[0];
  switch (provider) {
    case "google":
    case "gemini":
      return "gemini";
    case "openai":
    case "openrouter":
    case "opencode-go":
      return provider;
    case "codex":
      return "codex-cli";
    default:
      return "";
  }
}

function formatProbe(probe) {
  if (probe.ok) {
    const attempts = Array.isArray(probe.attemptedModels) ? probe.attemptedModels.length : 0;
    const suffix = attempts > 1 ? ` ${attempts} tries` : "";
    return `${probe.provider || "provider"} ${Number(probe.latencyMs || 0).toFixed(0)}ms${suffix}`;
  }
  if (probe.skipped) return probe.message || "not tested";
  return probe.statusCode ? `failed ${probe.statusCode}` : probe.message || "not tested";
}

function renderMessages(messages) {
  clearEmptyFeed();
  for (const message of messages) {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    item.innerHTML = `
      <div class="message-head">
        <span>${escapeHtml(message.role)} - ${formatDate(message.createdAt)}</span>
        <button class="copy-button" type="button">Copy</button>
      </div>
      <div class="message-body">${escapeHtml(message.content)}</div>
    `;
    const copyButton = item.querySelector(".copy-button");
    copyButton.addEventListener("click", async () => {
      await copyText(message.content);
      flashButtonLabel(copyButton, "Copied");
    });
    els.chatFeed.append(item);
  }
  els.chatFeed.scrollTop = els.chatFeed.scrollHeight;
}

function renderEmptyFeed() {
  if (els.chatFeed.children.length > 0) return;
  const item = document.createElement("article");
  item.className = "empty-feed";
  item.textContent = "Ready";
  els.chatFeed.append(item);
}

function clearEmptyFeed() {
  els.chatFeed.querySelector(".empty-feed")?.remove();
}

function renderRoutes(routes) {
  const query = els.routeFilter.value.trim().toLowerCase();
  const filtered = query
    ? routes.filter((route) => {
        const decision = route.decision || {};
        const verdict = route.verdict || {};
        return [route.task, decision.agent, verdict.intent, verdict.complexity, route.mode]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
    : routes;

  els.routesList.innerHTML = "";
  if (filtered.length === 0) {
    els.routesList.innerHTML = `<div class="empty-row">No logs</div>`;
    return;
  }

  for (const route of filtered) {
    const decision = route.decision || {};
    const verdict = route.verdict || {};
    const metrics = route.metrics || {};
    const row = document.createElement("article");
    row.className = "route-row";
    row.innerHTML = `
      <div class="route-task">${escapeHtml(route.task)}</div>
      <div class="route-meta">${escapeHtml(decision.agent || "unknown")} - ${escapeHtml(verdict.intent || "intent")} - ${Number(route.timings?.totalRequestMs || 0).toFixed(1)}ms</div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(route.mode || "orchestrated")}</span>
        <span class="badge">${escapeHtml(verdict.complexity || "complexity")}</span>
        <span class="badge">in ${Number(route.estimatedInputTokens || 0)}</span>
        <span class="badge">out ${Number(route.estimatedOutputTokens || 0)}</span>
        ${metrics.executionStatus ? `<span class="badge ${metrics.executionStatus === "success" ? "ok" : "warn"}">${escapeHtml(metrics.executionStatus)}</span>` : ""}
      </div>
    `;
    els.routesList.append(row);
  }
}

function renderAgentOptions() {
  els.fixedAgent.innerHTML = "";
  for (const agent of AGENTS) {
    const option = document.createElement("option");
    option.value = agent;
    option.textContent = agent;
    if (agent === "atlas") option.selected = true;
    els.fixedAgent.append(option);
  }
}

function buildTaskPayload() {
  return {
    projectId: state.activeProjectId,
    task: els.task.value,
    mode: els.runMode.value,
    fixedAgent: els.fixedAgent.value,
    openFiles: lines(els.openFiles.value),
    changedFiles: lines(els.changedFiles.value),
    diffLines: Number(els.diffLines.value || 0),
    execute: Boolean(els.executeTask.checked)
  };
}

function routeSummary(result) {
  const { verdict, decision, contextEstimateTokens, contextBudgetWarning } = result.planned;
  const route = result.route;
  const warnings = decision.warnings.length ? `\nWarnings: ${decision.warnings.join(", ")}` : "";
  return [
    `Agent: ${decision.agent}`,
    `Mode: ${route.mode}${route.fixedAgent ? ` (${route.fixedAgent})` : ""}`,
    `Intent: ${verdict.intent}`,
    `Complexity: ${verdict.complexity}`,
    `Phase: ${decision.phase}`,
    `Cost units: ${decision.costUnits}`,
    `Estimated input/output tokens: ${route.estimatedInputTokens}/${route.estimatedOutputTokens}`,
    `Total time: ${Number(route.timings?.totalRequestMs || 0).toFixed(3)}ms`,
    `Context estimate: ${contextEstimateTokens}${contextBudgetWarning ? " over budget" : ""}`,
    `Reason: ${decision.reason}${warnings}`
  ].join("\n");
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function bindAsync(element, event, handler) {
  element.addEventListener(event, (nativeEvent) => {
    Promise.resolve(handler(nativeEvent)).catch((error) => {
      showToast(getErrorMessage(error), "error");
    });
  });
}

async function withButtonBusy(button, label, callback) {
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = label;
  }

  try {
    return await callback();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path for local browser contexts that block clipboard writes.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy failed");
}

function flashButtonLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function toggleTheme() {
  setTheme(document.body.dataset.theme === "light" ? "dark" : "light");
}

function setTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = normalized;
  localStorage.setItem("abot-theme", normalized);
  if (els.themeToggle) {
    els.themeToggle.textContent = normalized === "light" ? "Dark" : "Light";
  }
}

function showToast(message, tone = "info") {
  if (!message) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  els.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Something went wrong");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
