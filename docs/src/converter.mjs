function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob === "function") {
    return atob(padded);
  }

  return Buffer.from(padded, "base64").toString("utf8");
}

export function parseJwtPayload(token) {
  if (typeof token !== "string" || token.trim() === "") {
    return undefined;
  }

  const segments = token.split(".");
  if (segments.length < 2) {
    return undefined;
  }

  try {
    return JSON.parse(decodeBase64Url(segments[1]));
  } catch {
    return undefined;
  }
}

function getOpenAIAuthSection(payload) {
  if (!isPlainObject(payload)) {
    return undefined;
  }

  const auth = payload["https://api.openai.com/auth"];
  return isPlainObject(auth) ? auth : undefined;
}

function getOpenAIProfileSection(payload) {
  if (!isPlainObject(payload)) {
    return undefined;
  }

  const profile = payload["https://api.openai.com/profile"];
  return isPlainObject(profile) ? profile : undefined;
}

function normalizeTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeUnixSecondsString(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) {
    return undefined;
  }

  return String(Math.floor(new Date(normalized).getTime() / 1000));
}

function timestampFromUnixSeconds(value) {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value * 1000).toISOString();
}

function deriveOrganizationId(idAuth, accessAuth) {
  const sources = [idAuth, accessAuth];

  for (const source of sources) {
    if (!isPlainObject(source) || !Array.isArray(source.organizations)) {
      continue;
    }

    const preferred = source.organizations.find((org) => org && org.is_default && org.id);
    if (preferred?.id) {
      return preferred.id;
    }

    const first = source.organizations.find((org) => org && org.id);
    if (first?.id) {
      return first.id;
    }
  }

  return undefined;
}

function stripUnavailable(value) {
  if (Array.isArray(value)) {
    return value.map(stripUnavailable).filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, stripUnavailable(item)])
      .filter(([, item]) => item !== undefined);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}

function getExpiresIn(expiresAt, now) {
  if (!expiresAt) {
    return undefined;
  }

  const expiresMs = new Date(expiresAt).getTime();
  const nowMs = now.getTime();

  if (Number.isNaN(expiresMs) || Number.isNaN(nowMs)) {
    return undefined;
  }

  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

function toEmailKey(email) {
  return typeof email === "string"
    ? email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : undefined;
}

function joinScopes(value) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item) => typeof item === "string" && item.trim() !== "")
      .map((item) => item.trim());
    return normalized.length ? normalized.join(" ") : undefined;
  }
  return undefined;
}

function sanitizeBaseName(name) {
  return name
    .replace(/\.[^.]+$/u, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildOutputFileName(sourceName, email) {
  const sourceBase = typeof sourceName === "string" && sourceName.trim() !== ""
    ? sanitizeBaseName(sourceName.split("/").pop())
    : "";

  const emailBase = typeof email === "string" && email.trim() !== ""
    ? sanitizeBaseName(email)
    : "";

  const base = sourceBase || emailBase || "converted-account";
  return `${base}.sub2api.json`;
}

function buildCommonExtra(record, email) {
  return stripUnavailable({
    email,
    email_key: toEmailKey(email),
    last_refresh: normalizeTimestamp(record.last_refresh),
  });
}

function parseOpenAIRecord(record, options) {
  if (typeof record.access_token !== "string" || record.access_token.trim() === "") {
    throw new Error("缺少 access_token");
  }

  if (typeof record.refresh_token !== "string" || record.refresh_token.trim() === "") {
    throw new Error("缺少 refresh_token");
  }

  if (typeof record.id_token !== "string" || record.id_token.trim() === "") {
    throw new Error("缺少 id_token");
  }

  const accessPayload = parseJwtPayload(record.access_token);
  const idPayload = parseJwtPayload(record.id_token);

  if (!accessPayload) {
    throw new Error("access_token 不是有效 JWT");
  }

  if (!idPayload) {
    throw new Error("id_token 不是有效 JWT");
  }

  const accessAuth = getOpenAIAuthSection(accessPayload);
  const idAuth = getOpenAIAuthSection(idPayload);
  const accessProfile = getOpenAIProfileSection(accessPayload);
  const now = options.now instanceof Date ? options.now : new Date();
  const email = firstNonEmpty(
    record.email,
    accessProfile?.email,
    accessPayload.email,
    idPayload.email,
  );
  const expiresAt = firstNonEmpty(
    normalizeTimestamp(record.expired),
    timestampFromUnixSeconds(accessPayload.exp),
  );
  const planType = firstNonEmpty(
    record.plan_type,
    accessAuth?.chatgpt_plan_type,
    idAuth?.chatgpt_plan_type,
  );
  const chatgptAccountId = firstNonEmpty(
    record.account_id,
    accessAuth?.chatgpt_account_id,
    idAuth?.chatgpt_account_id,
  );
  const chatgptUserId = firstNonEmpty(
    accessAuth?.chatgpt_user_id,
    idAuth?.chatgpt_user_id,
    accessAuth?.user_id,
    idAuth?.user_id,
  );

  return {
    providerLabel: "Codex / OpenAI",
    platform: "openai",
    accountType: "oauth",
    email,
    planType,
    expiresAt,
    credentials: stripUnavailable({
      access_token: record.access_token,
      chatgpt_account_id: chatgptAccountId,
      chatgpt_user_id: chatgptUserId,
      email,
      expires_at: expiresAt,
      expires_in: getExpiresIn(expiresAt, now),
      id_token: record.id_token,
      organization_id: deriveOrganizationId(idAuth, accessAuth),
      plan_type: planType,
      refresh_token: record.refresh_token,
    }),
    extra: buildCommonExtra(record, email),
  };
}

function parseClaudeRecord(record) {
  if (typeof record.access_token !== "string" || record.access_token.trim() === "") {
    throw new Error("缺少 access_token");
  }

  const email = firstNonEmpty(record.email);
  const expiresAt = normalizeTimestamp(record.expired);

  return {
    providerLabel: "Claude",
    platform: "anthropic",
    accountType: "oauth",
    email,
    planType: undefined,
    expiresAt,
    credentials: stripUnavailable({
      access_token: record.access_token,
      email_address: email,
      expires_at: normalizeUnixSecondsString(expiresAt),
      id_token: firstNonEmpty(record.id_token),
      refresh_token: firstNonEmpty(record.refresh_token),
    }),
    extra: buildCommonExtra(record, email),
  };
}

function parseAntigravityRecord(record) {
  if (typeof record.access_token !== "string" || record.access_token.trim() === "") {
    throw new Error("缺少 access_token");
  }

  const derivedExpiresAt = (() => {
    const explicit = normalizeTimestamp(record.expired);
    if (explicit) {
      return explicit;
    }

    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)
      && typeof record.expires_in === "number" && Number.isFinite(record.expires_in)) {
      return new Date(record.timestamp + (record.expires_in * 1000)).toISOString();
    }

    return undefined;
  })();

  const email = firstNonEmpty(record.email);

  return {
    providerLabel: "Antigravity",
    platform: "antigravity",
    accountType: "oauth",
    email,
    planType: firstNonEmpty(record.plan_type),
    expiresAt: derivedExpiresAt,
    credentials: stripUnavailable({
      access_token: record.access_token,
      email,
      expires_at: normalizeUnixSecondsString(derivedExpiresAt),
      expires_in: typeof record.expires_in === "number" ? record.expires_in : undefined,
      project_id: firstNonEmpty(record.project_id),
      refresh_token: firstNonEmpty(record.refresh_token),
      token_type: firstNonEmpty(record.token_type),
      plan_type: firstNonEmpty(record.plan_type),
    }),
    extra: buildCommonExtra(record, email),
  };
}

function parseGeminiRecord(record) {
  const rawToken = isPlainObject(record.token) ? record.token : undefined;
  if (!rawToken) {
    throw new Error("缺少 token 对象");
  }

  const accessToken = firstNonEmpty(rawToken.access_token, rawToken.accessToken);
  if (!accessToken) {
    throw new Error("token 中缺少 access_token");
  }

  const expiresAt = firstNonEmpty(
    normalizeTimestamp(rawToken.expiry),
    normalizeTimestamp(rawToken.expires_at),
    normalizeTimestamp(rawToken.expiration),
    timestampFromUnixSeconds(Number(rawToken.expires_in_abs)),
  );
  const projectId = firstNonEmpty(record.project_id);
  const oauthType = projectId ? "code_assist" : undefined;
  const email = firstNonEmpty(record.email);

  return {
    providerLabel: "Gemini",
    platform: "gemini",
    accountType: "oauth",
    email,
    planType: undefined,
    expiresAt,
    credentials: stripUnavailable({
      access_token: accessToken,
      expires_at: normalizeUnixSecondsString(expiresAt),
      oauth_type: oauthType,
      project_id: projectId,
      refresh_token: firstNonEmpty(rawToken.refresh_token, rawToken.refreshToken),
      scope: joinScopes(rawToken.scope ?? rawToken.scopes),
      token_type: firstNonEmpty(rawToken.token_type, rawToken.tokenType),
    }),
    extra: stripUnavailable({
      ...buildCommonExtra(record, email),
      auto: typeof record.auto === "boolean" ? record.auto : undefined,
      checked: typeof record.checked === "boolean" ? record.checked : undefined,
    }),
  };
}

export function convertCPARecord(record, options = {}) {
  if (!isPlainObject(record)) {
    throw new Error("文件不是 JSON 对象");
  }

  const sourceType = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
  const exportedAt = normalizeTimestamp(options.now instanceof Date ? options.now : new Date());

  let parsed;
  switch (sourceType || "codex") {
    case "codex":
      parsed = parseOpenAIRecord(record, options);
      break;
    case "claude":
      parsed = parseClaudeRecord(record);
      break;
    case "antigravity":
      parsed = parseAntigravityRecord(record);
      break;
    case "gemini":
      parsed = parseGeminiRecord(record);
      break;
    default:
      throw new Error(`暂不支持 type=${record.type} 的 CPA 文件`);
  }

  const credentials = parsed.credentials;

  if (!credentials) {
    throw new Error("没有可导出的认证字段");
  }

  const accountName = firstNonEmpty(parsed.email, options.sourceName, "converted-account");
  const account = stripUnavailable({
    name: accountName,
    platform: parsed.platform,
    type: parsed.accountType,
    concurrency: 10,
    priority: 1,
    credentials,
    extra: parsed.extra,
  });

  const document = {
    exported_at: exportedAt,
    proxies: [],
    accounts: [account],
  };

  return {
    sourceName: options.sourceName ?? "",
    sourceType: sourceType || "codex",
    providerLabel: parsed.providerLabel,
    email: parsed.email,
    planType: parsed.planType,
    expiresAt: parsed.expiresAt,
    account,
    document,
    outputFileName: buildOutputFileName(options.sourceName, parsed.email),
  };
}

export function buildMergedSub2ApiDocument(convertedRecords, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();

  return {
    exported_at: normalizeTimestamp(now),
    proxies: [],
    accounts: convertedRecords.map((item) => item.account),
  };
}

export function formatMergedPreview(document, limit = 12000) {
  const pretty = JSON.stringify(document, null, 2);
  if (pretty.length <= limit) {
    return pretty;
  }

  return `${pretty.slice(0, limit)}\n...`;
}
