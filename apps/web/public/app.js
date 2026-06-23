const state = {
  projects: [],
  activeProjectId: undefined,
  toolsConfig: undefined
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
  projectList: document.querySelector("#project-list"),
  activeProject: document.querySelector("#active-project"),
  projectForm: document.querySelector("#project-form"),
  projectName: document.querySelector("#project-name"),
  projectRoot: document.querySelector("#project-root"),
  addContext: document.querySelector(".plus-button"),
  chatForm: document.querySelector("#chat-form"),
  task: document.querySelector("#task"),
  openFiles: document.querySelector("#open-files"),
  changedFiles: document.querySelector("#changed-files"),
  diffLines: document.querySelector("#diff-lines"),
  runMode: document.querySelector("#run-mode"),
  fixedAgent: document.querySelector("#fixed-agent"),
  routeButton: document.querySelector("#route-button"),
  chatFeed: document.querySelector("#chat-feed"),
  routesList: document.querySelector("#routes-list"),
  toolsStatus: document.querySelector("#tools-status"),
  toolsEditor: document.querySelector("#tools-editor"),
  refreshTree: document.querySelector("#refresh-tree"),
  treePath: document.querySelector("#tree-path"),
  openTreePath: document.querySelector("#open-tree-path"),
  fileTree: document.querySelector("#file-tree"),
  filePath: document.querySelector("#file-path"),
  fileEditor: document.querySelector("#file-editor"),
  saveFile: document.querySelector("#save-file"),
  commandInput: document.querySelector("#command-input"),
  runCommand: document.querySelector("#run-command"),
  copyCommandOutput: document.querySelector("#copy-command-output"),
  commandOutput: document.querySelector("#command-output")
};

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll(".rail-tab").forEach((button) => {
  button.addEventListener("click", () => setPanel(button.dataset.panel));
});

document.querySelector("#refresh-projects").addEventListener("click", loadProjects);
document.querySelector("#refresh-routes").addEventListener("click", loadRoutes);
document.querySelector("#export-json").addEventListener("click", () => exportRoutes("json"));
document.querySelector("#export-csv").addEventListener("click", () => exportRoutes("csv"));
document.querySelector("#save-tools").addEventListener("click", saveTools);
els.refreshTree.addEventListener("click", () => loadTree(els.treePath.value || "."));
els.openTreePath.addEventListener("click", () => loadTree(els.treePath.value || "."));
els.saveFile.addEventListener("click", saveFile);
els.runCommand.addEventListener("click", runCommand);
els.copyCommandOutput.addEventListener("click", copyCommandOutput);
els.addContext.addEventListener("click", addCurrentFileToContext);
els.routeButton.addEventListener("click", routeTask);
els.chatForm.addEventListener("submit", sendChat);
els.projectForm.addEventListener("submit", addProject);

await init();

async function init() {
  renderAgentOptions();
  await loadHealth();
  await loadProjects();
  await loadTools();
  await loadRoutes();
  await loadTree(".");
}

async function loadHealth() {
  const health = await api("/api/health");
  els.healthLine.textContent = health.routerLlmConfigured
    ? `Router LLM configured: ${health.routerProvider || "provider"} / ${health.routerModel || "model"}`
    : "Router LLM not configured";
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
  const project = await api("/api/projects", {
    method: "POST",
    body: {
      name: els.projectName.value.trim(),
      rootPath: els.projectRoot.value.trim()
    }
  });
  state.activeProjectId = project.project.id;
  els.projectName.value = "";
  els.projectRoot.value = "";
  await loadProjects();
}

async function routeTask() {
  const result = await api("/api/route", {
    method: "POST",
    body: buildTaskPayload()
  });
  renderRoutePreview(result);
  await loadRoutes();
}

async function sendChat(event) {
  event.preventDefault();
  if (!els.task.value.trim()) return;

  const result = await api("/api/chat", {
    method: "POST",
    body: buildTaskPayload()
  });

  renderMessages(result.messages);
  els.task.value = "";
  await loadRoutes();
}

async function loadRoutes() {
  if (!state.activeProjectId) return;
  const result = await api(`/api/routes?projectId=${encodeURIComponent(state.activeProjectId)}&limit=50`);
  renderRoutes(result.routes);
}

function exportRoutes(format) {
  if (!state.activeProjectId) return;
  const url = `/api/export/routes?projectId=${encodeURIComponent(state.activeProjectId)}&limit=1000&format=${format}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function loadTools() {
  const result = await api("/api/tools");
  state.toolsConfig = result.config;
  els.toolsEditor.value = JSON.stringify(result.config, null, 2);
  renderTools(result.tools);
}

async function saveTools() {
  try {
    const parsed = JSON.parse(els.toolsEditor.value);
    const result = await api("/api/tools", {
      method: "PUT",
      body: parsed
    });
    state.toolsConfig = result.config;
    els.toolsEditor.value = JSON.stringify(result.config, null, 2);
    renderTools(result.tools);
  } catch (error) {
    els.toolsStatus.innerHTML = `<div class="route-row"><div class="badge danger">${escapeHtml(error.message)}</div></div>`;
  }
}

function renderProjects() {
  els.projectList.innerHTML = "";
  for (const project of state.projects) {
    const button = document.createElement("button");
    button.className = `project-item${project.id === state.activeProjectId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span class="project-root">${escapeHtml(project.rootPath)}</span>
    `;
    button.addEventListener("click", async () => {
      state.activeProjectId = project.id;
      renderProjects();
      await loadRoutes();
      await loadTree(".");
    });
    els.projectList.append(button);
  }

  const active = state.projects.find((project) => project.id === state.activeProjectId);
  els.activeProject.textContent = active?.name ?? "AboT";
}

async function loadTree(path = ".") {
  if (!state.activeProjectId) return;
  const result = await api(`/api/workspace/tree?projectId=${encodeURIComponent(state.activeProjectId)}&path=${encodeURIComponent(path)}`);
  els.treePath.value = result.path;
  renderTree(result.entries);
}

function renderTree(entries) {
  els.fileTree.innerHTML = "";
  if (!entries.length) {
    els.fileTree.innerHTML = `<div class="route-meta">Empty folder</div>`;
    return;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.className = "file-entry";
    button.type = "button";
    button.innerHTML = `<span>${entry.type === "directory" ? "[D]" : "[F]"}</span><span>${escapeHtml(entry.name)}</span>`;
    button.addEventListener("click", async () => {
      if (entry.type === "directory") {
        await loadTree(entry.path);
      } else {
        await loadFile(entry.path);
      }
    });
    els.fileTree.append(button);
  }
}

async function loadFile(path) {
  if (!state.activeProjectId) return;
  const result = await api(`/api/workspace/file?projectId=${encodeURIComponent(state.activeProjectId)}&path=${encodeURIComponent(path)}`);
  els.filePath.value = result.path;
  els.fileEditor.value = result.content;
}

async function saveFile() {
  if (!state.activeProjectId || !els.filePath.value.trim()) return;
  const result = await api("/api/workspace/file", {
    method: "PUT",
    body: {
      projectId: state.activeProjectId,
      path: els.filePath.value.trim(),
      content: els.fileEditor.value
    }
  });
  els.commandOutput.textContent = `Saved ${result.path} (${result.bytes} bytes)`;
  await loadTree(els.treePath.value || ".");
}

async function runCommand() {
  if (!state.activeProjectId || !els.commandInput.value.trim()) return;
  els.commandOutput.textContent = "Running...";
  els.copyCommandOutput.textContent = "Copy";
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
}

async function copyCommandOutput() {
  const text = els.commandOutput.textContent.trim();
  if (!text) return;

  await copyText(text);
  flashButtonLabel(els.copyCommandOutput, "Copied");
}

function addCurrentFileToContext() {
  setPanel("settings");
  const currentFile = els.filePath.value.trim();
  if (currentFile) {
    const existing = new Set(lines(els.openFiles.value));
    if (!existing.has(currentFile)) {
      els.openFiles.value = [...existing, currentFile].join("\n");
    }
  }
  els.openFiles.focus();
}

function renderRoutePreview(result) {
  renderMessages([
    {
      role: "assistant",
      createdAt: new Date().toISOString(),
      content: routeSummary(result)
    }
  ]);
}

function renderMessages(messages) {
  for (const message of messages) {
    const item = document.createElement("article");
    item.className = `message ${message.role}`;
    item.innerHTML = `
      <div class="message-meta">${escapeHtml(message.role)} - ${formatDate(message.createdAt)}</div>
      <div class="message-body">${escapeHtml(message.content)}</div>
    `;
    els.chatFeed.prepend(item);
  }
}

function renderRoutes(routes) {
  els.routesList.innerHTML = "";
  if (routes.length === 0) {
    els.routesList.innerHTML = `<div class="route-row"><div class="route-meta">No routes yet</div></div>`;
    return;
  }

  for (const route of routes) {
    const decision = route.decision || {};
    const verdict = route.verdict || {};
    const row = document.createElement("article");
    row.className = "route-row";
    row.innerHTML = `
      <div class="route-top">
        <div>
          <div class="route-task">${escapeHtml(route.task)}</div>
          <div class="route-meta">${formatDate(route.createdAt)}</div>
        </div>
        <span class="badge agent">${escapeHtml(decision.agent || "unknown")}</span>
      </div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(verdict.intent || "unknown")}</span>
        <span class="badge">${escapeHtml(verdict.complexity || "unknown")}</span>
        <span class="badge">${escapeHtml(decision.phase || "unknown")}</span>
        <span class="badge">${escapeHtml(route.mode || "orchestrated")}</span>
        ${route.fixedAgent ? `<span class="badge">fixed ${escapeHtml(route.fixedAgent)}</span>` : ""}
        <span class="badge">cost ${Number(decision.costUnits || 0)}</span>
        <span class="badge">in ${Number(route.estimatedInputTokens || 0)}</span>
        <span class="badge">out ${Number(route.estimatedOutputTokens || 0)}</span>
        <span class="badge">time ${Number(route.timings?.totalRequestMs || 0).toFixed(1)}ms</span>
        <span class="badge ${route.contextBudgetWarning ? "danger" : ""}">ctx ${Number(route.contextEstimateTokens || 0)}</span>
        ${renderWarnings(decision.warnings || [])}
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

function renderWarnings(warnings) {
  return warnings.map((warning) => `<span class="badge warn">${escapeHtml(warning)}</span>`).join("");
}

function renderTools(tools) {
  els.toolsStatus.innerHTML = "";
  for (const tool of tools) {
    const row = document.createElement("article");
    row.className = "tool-row";
    row.innerHTML = `
      <div class="route-top">
        <div>
          <div class="route-task">${escapeHtml(tool.label)}</div>
          <div class="route-meta">${escapeHtml(tool.kind)}</div>
        </div>
        <span class="badge ${tool.configured ? "agent" : "warn"}">${tool.configured ? "configured" : "missing env"}</span>
      </div>
      <div class="badge-row">
        <span class="badge">${tool.enabled ? "enabled" : "disabled"}</span>
        ${tool.missingEnv.map((name) => `<span class="badge warn">${escapeHtml(name)}</span>`).join("")}
      </div>
    `;
    els.toolsStatus.append(row);
  }
}

function setView(view) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active-view", section.id === `view-${view}`);
  });
}

function setPanel(panel) {
  document.querySelectorAll(".rail-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panel);
  });
  document.querySelectorAll(".rail-panel").forEach((section) => {
    section.classList.toggle("active-panel", section.id === `panel-${panel}`);
  });
}

function buildTaskPayload() {
  return {
    projectId: state.activeProjectId,
    task: els.task.value,
    mode: els.runMode.value,
    fixedAgent: els.fixedAgent.value,
    openFiles: lines(els.openFiles.value),
    changedFiles: lines(els.changedFiles.value),
    diffLines: Number(els.diffLines.value || 0)
  };
}

function routeSummary(result) {
  const { verdict, decision, contextEstimateTokens, contextBudgetWarning } = result.planned;
  const route = result.route;
  const warningText = decision.warnings.length ? `\nWarnings: ${decision.warnings.join(", ")}` : "";
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
    `Reason: ${decision.reason}${warningText}`
  ].join("\n");
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function flashButtonLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
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
