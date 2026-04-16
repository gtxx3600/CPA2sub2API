import {
  buildMergedSub2ApiDocument,
  convertCPARecord,
  convertSub2ApiDocument,
} from "./converter.mjs";
import { buildZipArchive } from "./archive.mjs";

const MODES = {
  cpaToSub2Api: {
    browserTitle: "CPA -> sub2api",
    titleLines: ["批量转换", "CPA 到 sub2api", "不离开浏览器"],
    heroCopy: "将 CPA（CLIProxyApi）的认证 JSON 转成 sub2api 导入格式。支持 Codex、Claude、Antigravity、Gemini，整个过程只在当前浏览器本地完成，不发请求，不上传任何 token。",
    heroTags: ["CPA 输入", "sub2api 输出", "纯前端"],
    importTitle: "导入 CPA 文件",
    importSubtitle: "支持多文件拖拽，也支持目录导入。",
    sourcePills: ["`type: codex`", "`type: claude`", "`type: antigravity`", "`type: gemini`"],
    importCopy: "文件只在当前浏览器本地解析，不上传，不请求接口。",
    dropzoneTitle: "拖拽 CPA `*.json` 到这里",
    dropzoneCopy: "页面不会上传任何认证数据，所有内容都只在当前浏览器中解析。",
    individualLabel: "导出 sub2api 单文件",
    mergedLabel: "下载合并 sub2api JSON",
    emptyText: "导入后会在这里列出可导出的 sub2api 文件。",
    resultLabel: "sub2api 文件",
    convertedHint(count) {
      return `已生成 ${count} 个 sub2api 结果`;
    },
    getMergedFileName() {
      return buildTargetFileName("sub2api", "json");
    },
    buildMerged(records) {
      return buildMergedSub2ApiDocument(records);
    },
  },
  sub2apiToCpa: {
    browserTitle: "sub2api -> CPA",
    titleLines: ["批量转换", "sub2api 到 CPA", "不离开浏览器"],
    heroCopy: "将 sub2api 配置里的账号反向拆成 CPA（CLIProxyApi）认证 JSON。支持 OAuth 账号导出为 Codex、Claude、Antigravity、Gemini，整个过程只在当前浏览器本地完成。",
    heroTags: ["sub2api 输入", "CPA 输出", "反向转换"],
    importTitle: "导入 sub2api 配置",
    importSubtitle: "支持单账号文件，也支持包含多个 accounts 的合并配置。",
    sourcePills: ["`platform: openai`", "`platform: anthropic`", "`platform: antigravity`", "`platform: gemini`"],
    importCopy: "如果一个 sub2api 文件里有多个 accounts，会自动拆成多个 CPA 文件。",
    dropzoneTitle: "拖拽 sub2api `*.json` 到这里",
    dropzoneCopy: "页面只在本地解析 account.credentials，不会上传任何 token。",
    individualLabel: "导出 CPA 单文件",
    mergedLabel: "下载 CPA ZIP 包",
    emptyText: "导入后会在这里列出可导出的 CPA 文件。",
    resultLabel: "CPA 文件",
    convertedHint(count) {
      return `已生成 ${count} 个 CPA 结果`;
    },
    getMergedFileName() {
      return buildTargetFileName("cpa", "zip");
    },
    buildMergedBlob(records) {
      return buildZipArchive(
        records.map((item) => ({
          fileName: item.outputFileName,
          text: JSON.stringify(item.document, null, 2),
        })),
      );
    },
  },
};

function createPageState() {
  return {
    seenKeys: new Set(),
    totalImported: 0,
    converted: [],
    skipped: [],
  };
}

const state = {
  isFlipping: false,
  mode: "cpaToSub2Api",
  pages: {
    cpaToSub2Api: createPageState(),
    sub2apiToCpa: createPageState(),
  },
};

const elements = {
  clearResults: document.querySelector("#clear-results"),
  convertedBody: document.querySelector("#converted-body"),
  convertedHint: document.querySelector("#converted-hint"),
  downloadIndividual: document.querySelector("#download-individual"),
  downloadMerged: document.querySelector("#download-merged"),
  dropzone: document.querySelector("#dropzone"),
  dropzoneCopy: document.querySelector("#dropzone-copy"),
  dropzoneTitle: document.querySelector("#dropzone-title"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  heroCopy: document.querySelector("#hero-copy"),
  heroTags: document.querySelector("#hero-tags"),
  heroTitle: document.querySelector("#hero-title"),
  importCopy: document.querySelector("#import-copy"),
  importSubtitle: document.querySelector("#import-subtitle"),
  importTitle: document.querySelector("#import-title"),
  issuesList: document.querySelector("#issues-list"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode-switch]")),
  pageShell: document.querySelector("#page-shell"),
  pickFiles: document.querySelector("#pick-files"),
  pickFolder: document.querySelector("#pick-folder"),
  skippedHint: document.querySelector("#skipped-hint"),
  sourceList: document.querySelector("#source-list"),
  statSkipped: document.querySelector("#stat-skipped"),
  statSuccess: document.querySelector("#stat-success"),
  summaryText: document.querySelector("#summary-text"),
};

function getPageState(mode = state.mode) {
  return state.pages[mode];
}

function getModeConfig(mode = state.mode) {
  return MODES[mode];
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function getFileKey(file) {
  const relative = file.webkitRelativePath || "";
  return `${relative}|${file.name}|${file.size}|${file.lastModified}`;
}

function getTimestampToken(date = new Date()) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}_${padNumber(date.getHours())}-${padNumber(date.getMinutes())}-${padNumber(date.getSeconds())}`;
}

function buildTargetFileName(target, extension) {
  return `${target}-${getTimestampToken()}.${extension}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createDownload(text, fileName) {
  downloadBlob(new Blob([text], { type: "application/json;charset=utf-8" }), fileName);
}

async function saveIndividualFiles(records) {
  if (!records.length) {
    return;
  }

  if (window.showDirectoryPicker) {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });

    for (const record of records) {
      const handle = await directory.getFileHandle(record.outputFileName, { create: true });
      const writer = await handle.createWritable();
      await writer.write(JSON.stringify(record.document, null, 2));
      await writer.close();
    }

    return;
  }

  records.forEach((record, index) => {
    setTimeout(() => {
      createDownload(JSON.stringify(record.document, null, 2), record.outputFileName);
    }, index * 120);
  });
}

function buildSummary(pageState, config) {
  if (pageState.totalImported === 0) {
    return "还没有导入文件。";
  }

  return `共读取 ${pageState.totalImported} 个文件，生成 ${pageState.converted.length} 个${config.resultLabel}，跳过 ${pageState.skipped.length} 项。`;
}

function getFileName(sourceName) {
  const normalized = String(sourceName || "").replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || "未命名文件";
}

function getFileFolder(sourceName) {
  const normalized = String(sourceName || "").replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "";
  }
  return segments.slice(0, -1).join("/");
}

function getSourceLabel(sourceType, providerLabel) {
  switch (sourceType) {
    case "codex":
    case "openai":
      return "Codex";
    case "claude":
    case "anthropic":
      return "Claude";
    case "antigravity":
      return "Antigravity";
    case "gemini":
      return "Gemini";
    default:
      return providerLabel || "未知平台";
  }
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatDisplayDate(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatIssueLabel(item) {
  const fileLabel = item.sourceName ? item.sourceName : "未命名文件";
  if (!item.entryLabel) {
    return fileLabel;
  }

  return `${fileLabel} · ${item.entryLabel}`;
}

function renderConvertedTable(pageState, config) {
  if (!pageState.converted.length) {
    elements.convertedBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">${escapeHtml(config.emptyText)}</td>
      </tr>
    `;
    elements.convertedHint.textContent = "等待导入";
    return;
  }

  elements.convertedHint.textContent = config.convertedHint(pageState.converted.length);
  elements.convertedBody.innerHTML = pageState.converted
    .map((item, index) => {
      const fileName = getFileName(item.sourceName);
      const fileFolder = getFileFolder(item.sourceName);
      const sourceLabel = getSourceLabel(item.sourceType, item.providerLabel);
      const displayDate = formatDisplayDate(item.expiresAt);
      const entryLabel = item.entryLabel && item.entryLabel !== fileName
        ? `<span class="file-entry" title="${escapeHtml(item.entryLabel)}">${escapeHtml(item.entryLabel)}</span>`
        : "";

      return `
        <tr>
          <td class="file-cell">
            <div class="file-meta">
              <span class="file-name" title="${escapeHtml(item.sourceName || fileName)}">${escapeHtml(fileName)}</span>
              ${fileFolder ? `<span class="file-path" title="${escapeHtml(fileFolder)}">${escapeHtml(fileFolder)}</span>` : ""}
              ${entryLabel}
            </div>
          </td>
          <td class="source-cell">
            <div class="source-meta">
              <span class="source-chip">${escapeHtml(sourceLabel)}</span>
              ${item.planType ? `<span class="plan-chip" title="${escapeHtml(item.planType)}">${escapeHtml(item.planType)}</span>` : ""}
            </div>
          </td>
          <td class="email-cell">
            ${item.email
              ? `<span class="email-value" title="${escapeHtml(item.email)}">${escapeHtml(item.email)}</span>`
              : `<span class="cell-muted">未解析到邮箱</span>`}
          </td>
          <td class="expiry-cell">
            ${displayDate
              ? `<span class="expiry-value" title="${escapeHtml(item.expiresAt)}">${escapeHtml(displayDate)}</span>`
              : `<span class="cell-muted">未提供</span>`}
          </td>
          <td>
            <div class="row-actions">
              <button class="inline-button" type="button" data-download-index="${index}">
                下载
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderSkippedList(pageState) {
  if (!pageState.skipped.length) {
    elements.skippedHint.textContent = "";
    elements.issuesList.innerHTML = `<li class="issue-empty">暂无问题</li>`;
    return;
  }

  elements.skippedHint.textContent = `共跳过 ${pageState.skipped.length} 项`;
  elements.issuesList.innerHTML = pageState.skipped
    .map((item) => `
        <li>
          <span class="issue-file">${escapeHtml(formatIssueLabel(item))}</span>
          <span class="issue-reason">${escapeHtml(item.reason)}</span>
        </li>
      `)
    .join("");
}

function renderState() {
  const pageState = getPageState();
  const config = getModeConfig();

  elements.statSuccess.textContent = String(pageState.converted.length);
  elements.statSkipped.textContent = String(pageState.skipped.length);
  elements.summaryText.textContent = buildSummary(pageState, config);
  elements.downloadMerged.disabled = pageState.converted.length === 0;
  elements.downloadIndividual.disabled = pageState.converted.length === 0;
  renderConvertedTable(pageState, config);
  renderSkippedList(pageState);
}

function resetState(mode = state.mode) {
  state.pages[mode] = createPageState();
  if (mode === state.mode) {
    renderState();
  }
}

function renderMode() {
  const config = getModeConfig();

  document.title = config.browserTitle;
  elements.heroTitle.innerHTML = config.titleLines
    .map((line) => `<span class="hero-line">${escapeHtml(line)}</span>`)
    .join("");
  elements.heroCopy.textContent = config.heroCopy;
  elements.heroTags.innerHTML = config.heroTags
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  elements.importTitle.textContent = config.importTitle;
  elements.importSubtitle.textContent = config.importSubtitle;
  elements.sourceList.innerHTML = config.sourcePills
    .map((pill) => `<span class="source-pill">${escapeHtml(pill)}</span>`)
    .join("");
  elements.importCopy.textContent = config.importCopy;
  elements.dropzoneTitle.textContent = config.dropzoneTitle;
  elements.dropzoneCopy.textContent = config.dropzoneCopy;
  elements.downloadIndividual.textContent = config.individualLabel;
  elements.downloadMerged.textContent = config.mergedLabel;

  elements.modeButtons.forEach((button) => {
    const active = button.getAttribute("data-mode-switch") === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  renderState();
}

async function processFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".json"));
  if (!files.length) {
    return;
  }

  const mode = state.mode;
  const pageState = getPageState(mode);
  pageState.totalImported += files.length;

  const results = await Promise.all(
    files.map(async (file) => {
      const key = getFileKey(file);
      const sourceName = file.webkitRelativePath || file.name;

      if (pageState.seenKeys.has(key)) {
        return {
          converted: [],
          skipped: [{ sourceName, reason: "重复导入，已忽略" }],
        };
      }

      pageState.seenKeys.add(key);

      try {
        const text = await file.text();
        const record = JSON.parse(text);

        if (mode === "cpaToSub2Api") {
          return {
            converted: [convertCPARecord(record, { sourceName })],
            skipped: [],
          };
        }

        return convertSub2ApiDocument(record, { sourceName });
      } catch (error) {
        return {
          converted: [],
          skipped: [{
            sourceName,
            reason: error instanceof Error ? error.message : "无法解析该文件",
          }],
        };
      }
    }),
  );

  for (const result of results) {
    pageState.converted.push(...result.converted);
    pageState.skipped.push(...result.skipped);
  }

  if (state.mode === mode) {
    renderState();
  }
}

function handleDrop(event) {
  event.preventDefault();
  elements.dropzone.classList.remove("is-dragover");
  void processFiles(event.dataTransfer?.files || []);
}

function handleDragState(event) {
  event.preventDefault();
  elements.dropzone.classList.add("is-dragover");
}

function clearDragState() {
  elements.dropzone.classList.remove("is-dragover");
}

async function downloadMergedDocument() {
  const pageState = getPageState();
  if (!pageState.converted.length) {
    return;
  }

  const config = getModeConfig();
  const mergedFileName = typeof config.getMergedFileName === "function"
    ? config.getMergedFileName(pageState.converted)
    : config.mergedFileName;

  if (typeof config.buildMergedBlob === "function") {
    downloadBlob(config.buildMergedBlob(pageState.converted), mergedFileName);
    return;
  }

  const merged = config.buildMerged(pageState.converted);
  createDownload(JSON.stringify(merged, null, 2), mergedFileName);
}

function switchMode(targetMode) {
  if (!MODES[targetMode] || targetMode === state.mode || state.isFlipping) {
    return;
  }

  const applyMode = () => {
    state.mode = targetMode;
    clearDragState();
    renderMode();
  };

  if (prefersReducedMotion()) {
    applyMode();
    return;
  }

  state.isFlipping = true;
  elements.pageShell.classList.remove("is-flip-in", "is-flip-out");
  void elements.pageShell.offsetWidth;
  elements.pageShell.classList.add("is-flip-out");

  const handleFlipOut = (event) => {
    if (event.animationName !== "pageFlipOut") {
      return;
    }

    elements.pageShell.removeEventListener("animationend", handleFlipOut);
    applyMode();
    elements.pageShell.classList.remove("is-flip-out");
    void elements.pageShell.offsetWidth;
    elements.pageShell.classList.add("is-flip-in");

    const handleFlipIn = (innerEvent) => {
      if (innerEvent.animationName !== "pageFlipIn") {
        return;
      }

      elements.pageShell.removeEventListener("animationend", handleFlipIn);
      elements.pageShell.classList.remove("is-flip-in");
      state.isFlipping = false;
    };

    elements.pageShell.addEventListener("animationend", handleFlipIn);
  };

  elements.pageShell.addEventListener("animationend", handleFlipOut);
}

function bindEvents() {
  elements.pickFiles.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.fileInput.click();
  });
  elements.pickFolder.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.folderInput.click();
  });
  elements.fileInput.addEventListener("change", (event) => {
    void processFiles(event.target.files || []);
    event.target.value = "";
  });
  elements.folderInput.addEventListener("change", (event) => {
    void processFiles(event.target.files || []);
    event.target.value = "";
  });

  elements.dropzone.addEventListener("dragenter", handleDragState);
  elements.dropzone.addEventListener("dragover", handleDragState);
  elements.dropzone.addEventListener("dragleave", clearDragState);
  elements.dropzone.addEventListener("drop", handleDrop);
  elements.dropzone.addEventListener("click", () => elements.fileInput.click());
  elements.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });

  elements.clearResults.addEventListener("click", () => {
    resetState();
  });
  elements.downloadMerged.addEventListener("click", () => {
    void downloadMergedDocument();
  });
  elements.downloadIndividual.addEventListener("click", () => {
    void saveIndividualFiles(getPageState().converted);
  });
  elements.convertedBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-index]");
    if (!button) {
      return;
    }

    const index = Number(button.getAttribute("data-download-index"));
    const item = getPageState().converted[index];
    if (!item) {
      return;
    }

    createDownload(JSON.stringify(item.document, null, 2), item.outputFileName);
  });
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetMode = button.getAttribute("data-mode-switch");
      if (targetMode) {
        switchMode(targetMode);
      }
    });
  });
}

bindEvents();
renderMode();
