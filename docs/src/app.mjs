import {
  buildMergedSub2ApiDocument,
  convertCPARecord,
} from "./converter.mjs";

const state = {
  seenKeys: new Set(),
  totalImported: 0,
  converted: [],
  skipped: [],
};

const elements = {
  clearResults: document.querySelector("#clear-results"),
  convertedBody: document.querySelector("#converted-body"),
  convertedHint: document.querySelector("#converted-hint"),
  downloadIndividual: document.querySelector("#download-individual"),
  downloadMerged: document.querySelector("#download-merged"),
  dropzone: document.querySelector("#dropzone"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  issuesList: document.querySelector("#issues-list"),
  pickFiles: document.querySelector("#pick-files"),
  pickFolder: document.querySelector("#pick-folder"),
  skippedHint: document.querySelector("#skipped-hint"),
  statSkipped: document.querySelector("#stat-skipped"),
  statSuccess: document.querySelector("#stat-success"),
  summaryText: document.querySelector("#summary-text"),
};

function getFileKey(file) {
  const relative = file.webkitRelativePath || "";
  return `${relative}|${file.name}|${file.size}|${file.lastModified}`;
}

function createDownload(text, fileName) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function buildSummary() {
  if (state.totalImported === 0) {
    return "还没有导入文件。";
  }

  return `共读取 ${state.totalImported} 个文件，成功转换 ${state.converted.length} 个账号，跳过 ${state.skipped.length} 个文件。`;
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
      return "Codex";
    case "claude":
      return "Claude";
    case "antigravity":
      return "Antigravity";
    case "gemini":
      return "Gemini";
    default:
      return providerLabel || "未知来源";
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

function renderConvertedTable() {
  if (!state.converted.length) {
    elements.convertedBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">导入后会在这里列出可导出的 sub2api 文件。</td>
      </tr>
    `;
    elements.convertedHint.textContent = "等待导入";
    return;
  }

  elements.convertedHint.textContent = `已生成 ${state.converted.length} 个单文件结果`;
  elements.convertedBody.innerHTML = state.converted
    .map(
      (item, index) => {
        const fileName = getFileName(item.sourceName);
        const fileFolder = getFileFolder(item.sourceName);
        const sourceLabel = getSourceLabel(item.sourceType, item.providerLabel);
        const displayDate = formatDisplayDate(item.expiresAt);

        return `
        <tr>
          <td class="file-cell">
            <div class="file-meta">
              <span class="file-name" title="${escapeHtml(item.sourceName || fileName)}">${escapeHtml(fileName)}</span>
              ${fileFolder ? `<span class="file-path" title="${escapeHtml(fileFolder)}">${escapeHtml(fileFolder)}</span>` : ""}
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
      },
    )
    .join("");
}

function renderSkippedList() {
  if (!state.skipped.length) {
    elements.skippedHint.textContent = "";
    elements.issuesList.innerHTML = `<li class="issue-empty">暂无问题</li>`;
    return;
  }

  elements.skippedHint.textContent = `共跳过 ${state.skipped.length} 个文件`;
  elements.issuesList.innerHTML = state.skipped
    .map(
      (item) => `
        <li>
          <span class="issue-file">${escapeHtml(item.sourceName || "未命名文件")}</span>
          <span class="issue-reason">${escapeHtml(item.reason)}</span>
        </li>
      `,
    )
    .join("");
}

function renderState() {
  elements.statSuccess.textContent = String(state.converted.length);
  elements.statSkipped.textContent = String(state.skipped.length);
  elements.summaryText.textContent = buildSummary();
  elements.downloadMerged.disabled = state.converted.length === 0;
  elements.downloadIndividual.disabled = state.converted.length === 0;
  renderConvertedTable();
  renderSkippedList();
}

function resetState() {
  state.seenKeys.clear();
  state.totalImported = 0;
  state.converted = [];
  state.skipped = [];
  renderState();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function processFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".json"));
  if (!files.length) {
    return;
  }

  state.totalImported += files.length;

  const results = await Promise.all(
    files.map(async (file) => {
      const key = getFileKey(file);
      const sourceName = file.webkitRelativePath || file.name;

      if (state.seenKeys.has(key)) {
        return { kind: "skipped", sourceName, reason: "重复导入，已忽略" };
      }

      state.seenKeys.add(key);

      try {
        const text = await file.text();
        const record = JSON.parse(text);
        const converted = convertCPARecord(record, { sourceName });
        return { kind: "converted", ...converted };
      } catch (error) {
        return {
          kind: "skipped",
          sourceName,
          reason: error instanceof Error ? error.message : "无法解析该文件",
        };
      }
    }),
  );

  for (const result of results) {
    if (result.kind === "converted") {
      state.converted.push(result);
    } else {
      state.skipped.push(result);
    }
  }

  renderState();
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
  if (!state.converted.length) {
    return;
  }

  const merged = buildMergedSub2ApiDocument(state.converted);
  createDownload(JSON.stringify(merged, null, 2), "sub2api-merged.json");
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

  elements.clearResults.addEventListener("click", resetState);
  elements.downloadMerged.addEventListener("click", () => {
    void downloadMergedDocument();
  });
  elements.downloadIndividual.addEventListener("click", () => {
    void saveIndividualFiles(state.converted);
  });
  elements.convertedBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-index]");
    if (!button) {
      return;
    }

    const index = Number(button.getAttribute("data-download-index"));
    const item = state.converted[index];
    if (!item) {
      return;
    }

    createDownload(JSON.stringify(item.document, null, 2), item.outputFileName);
  });
}

bindEvents();
renderState();
