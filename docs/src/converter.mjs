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

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return undefined;
}

function timestampFromUnixLike(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  const milliseconds = numeric > 1e11 ? numeric : numeric * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

function normalizeFlexibleTimestamp(value) {
  return firstNonEmpty(normalizeTimestamp(value), timestampFromUnixLike(value));
}

function normalizeUnixSecondsString(value) {
  const normalized = normalizeFlexibleTimestamp(value);
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

function timestampFromNowPlusSeconds(value, now) {
  const seconds = toFiniteNumber(value);
  if (seconds === undefined) {
    return undefined;
  }

  const base = now instanceof Date ? now : new Date();
  const date = new Date(base.getTime() + (seconds * 1000));
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
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

function buildSub2ApiOutputFileName(sourceName, email) {
  const sourceBase = typeof sourceName === "string" && sourceName.trim() !== ""
    ? sanitizeBaseName(sourceName.split("/").pop())
    : "";

  const emailBase = typeof email === "string" && email.trim() !== ""
    ? sanitizeBaseName(email)
    : "";

  const base = sourceBase || emailBase || "converted-account";
  return `${base}.sub2api.json`;
}

function buildCPAOutputFileName(accountName, email, providerType) {
  const base = sanitizeBaseName(firstNonEmpty(email, accountName, providerType, "converted-account"));
  const typeBase = sanitizeBaseName(providerType || "account");

  if (!base || base === typeBase) {
    return `${typeBase}.cpa.json`;
  }

  return `${base}.${typeBase}.cpa.json`;
}

function buildCommonExtra(record, email) {
  return stripUnavailable({
    email,
    email_key: toEmailKey(email),
    last_refresh: normalizeFlexibleTimestamp(record.last_refresh),
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
    normalizeFlexibleTimestamp(record.expired),
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
  const expiresAt = normalizeFlexibleTimestamp(record.expired);

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
    const explicit = normalizeFlexibleTimestamp(record.expired);
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
    normalizeFlexibleTimestamp(rawToken.expiry),
    normalizeFlexibleTimestamp(rawToken.expires_at),
    normalizeFlexibleTimestamp(rawToken.expiration),
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

function normalizeSub2ApiPlatform(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "openai":
    case "codex":
      return "codex";
    case "anthropic":
    case "claude":
      return "claude";
    case "antigravity":
      return "antigravity";
    case "gemini":
      return "gemini";
    default:
      return "";
  }
}

function getSub2ApiCredentials(account) {
  if (!isPlainObject(account.credentials)) {
    throw new Error("缺少 account.credentials 对象");
  }

  return account.credentials;
}

function getSub2ApiExtra(account) {
  return isPlainObject(account.extra) ? account.extra : {};
}

function buildSub2ApiEntryLabel(account, index) {
  if (!isPlainObject(account)) {
    return `accounts[${index}]`;
  }

  const credentials = isPlainObject(account.credentials) ? account.credentials : {};
  const extra = getSub2ApiExtra(account);

  return firstNonEmpty(
    account.name,
    extra.email,
    credentials.email,
    credentials.email_address,
    `accounts[${index}]`,
  );
}

function convertSub2ApiOpenAIAccount(account, options) {
  const credentials = getSub2ApiCredentials(account);
  const extra = getSub2ApiExtra(account);
  const now = options.now instanceof Date ? options.now : new Date();
  const accessToken = firstNonEmpty(credentials.access_token);
  const refreshToken = firstNonEmpty(credentials.refresh_token);
  const idToken = firstNonEmpty(credentials.id_token);

  if (!accessToken) {
    throw new Error("credentials.access_token 为空");
  }

  if (!refreshToken) {
    throw new Error("credentials.refresh_token 为空，无法生成 Codex CPA 文件");
  }

  if (!idToken) {
    throw new Error("credentials.id_token 为空，无法生成 Codex CPA 文件");
  }

  const accessPayload = parseJwtPayload(accessToken);
  const expiresAt = firstNonEmpty(
    normalizeFlexibleTimestamp(credentials.expires_at),
    accessPayload ? timestampFromUnixSeconds(accessPayload.exp) : undefined,
    timestampFromNowPlusSeconds(credentials.expires_in, now),
  );
  const email = firstNonEmpty(extra.email, credentials.email);
  const planType = firstNonEmpty(credentials.plan_type);

  return {
    sourceType: "codex",
    providerLabel: "Codex / OpenAI",
    email,
    planType,
    expiresAt,
    entryLabel: firstNonEmpty(account.name, email),
    document: stripUnavailable({
      type: "codex",
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
      account_id: firstNonEmpty(credentials.chatgpt_account_id),
      email,
      expired: expiresAt,
      last_refresh: normalizeFlexibleTimestamp(extra.last_refresh),
      plan_type: planType,
    }),
    outputFileName: buildCPAOutputFileName(account.name, email, "codex"),
  };
}

function convertSub2ApiClaudeAccount(account, options) {
  const credentials = getSub2ApiCredentials(account);
  const extra = getSub2ApiExtra(account);
  const now = options.now instanceof Date ? options.now : new Date();
  const accessToken = firstNonEmpty(credentials.access_token);

  if (!accessToken) {
    throw new Error("credentials.access_token 为空");
  }

  const email = firstNonEmpty(extra.email, credentials.email_address);
  const expiresAt = firstNonEmpty(
    normalizeFlexibleTimestamp(credentials.expires_at),
    timestampFromNowPlusSeconds(credentials.expires_in, now),
  );

  return {
    sourceType: "claude",
    providerLabel: "Claude",
    email,
    planType: undefined,
    expiresAt,
    entryLabel: firstNonEmpty(account.name, email),
    document: stripUnavailable({
      type: "claude",
      access_token: accessToken,
      email,
      expired: expiresAt,
      id_token: firstNonEmpty(credentials.id_token),
      last_refresh: normalizeFlexibleTimestamp(extra.last_refresh),
      refresh_token: firstNonEmpty(credentials.refresh_token),
    }),
    outputFileName: buildCPAOutputFileName(account.name, email, "claude"),
  };
}

function convertSub2ApiAntigravityAccount(account, options) {
  const credentials = getSub2ApiCredentials(account);
  const extra = getSub2ApiExtra(account);
  const now = options.now instanceof Date ? options.now : new Date();
  const accessToken = firstNonEmpty(credentials.access_token);

  if (!accessToken) {
    throw new Error("credentials.access_token 为空");
  }

  const email = firstNonEmpty(extra.email, credentials.email);
  const planType = firstNonEmpty(credentials.plan_type);
  const expiresAt = firstNonEmpty(
    normalizeFlexibleTimestamp(credentials.expires_at),
    timestampFromNowPlusSeconds(credentials.expires_in, now),
  );

  return {
    sourceType: "antigravity",
    providerLabel: "Antigravity",
    email,
    planType,
    expiresAt,
    entryLabel: firstNonEmpty(account.name, email),
    document: stripUnavailable({
      type: "antigravity",
      access_token: accessToken,
      email,
      expired: expiresAt,
      expires_in: toFiniteNumber(credentials.expires_in),
      last_refresh: normalizeFlexibleTimestamp(extra.last_refresh),
      plan_type: planType,
      project_id: firstNonEmpty(credentials.project_id),
      refresh_token: firstNonEmpty(credentials.refresh_token),
      token_type: firstNonEmpty(credentials.token_type),
    }),
    outputFileName: buildCPAOutputFileName(account.name, email, "antigravity"),
  };
}

function convertSub2ApiGeminiAccount(account) {
  const credentials = getSub2ApiCredentials(account);
  const extra = getSub2ApiExtra(account);
  const accessToken = firstNonEmpty(credentials.access_token);

  if (!accessToken) {
    throw new Error("credentials.access_token 为空");
  }

  const email = firstNonEmpty(extra.email);
  const expiresAt = normalizeFlexibleTimestamp(credentials.expires_at);

  return {
    sourceType: "gemini",
    providerLabel: "Gemini",
    email,
    planType: undefined,
    expiresAt,
    entryLabel: firstNonEmpty(account.name, email),
    document: stripUnavailable({
      type: "gemini",
      checked: typeof extra.checked === "boolean" ? extra.checked : undefined,
      auto: typeof extra.auto === "boolean" ? extra.auto : undefined,
      email,
      last_refresh: normalizeFlexibleTimestamp(extra.last_refresh),
      project_id: firstNonEmpty(credentials.project_id),
      token: {
        access_token: accessToken,
        expiry: expiresAt,
        refresh_token: firstNonEmpty(credentials.refresh_token),
        scope: firstNonEmpty(credentials.scope),
        token_type: firstNonEmpty(credentials.token_type),
      },
    }),
    outputFileName: buildCPAOutputFileName(account.name, email, "gemini"),
  };
}

function convertSub2ApiAccount(account, options = {}) {
  if (!isPlainObject(account)) {
    throw new Error("account 不是对象");
  }

  const accountType = typeof account.type === "string" ? account.type.trim().toLowerCase() : "";
  if (accountType && accountType !== "oauth") {
    throw new Error(`暂不支持 type=${account.type} 的 sub2api 账号`);
  }

  const sourceType = normalizeSub2ApiPlatform(account.platform);
  switch (sourceType) {
    case "codex":
      return convertSub2ApiOpenAIAccount(account, options);
    case "claude":
      return convertSub2ApiClaudeAccount(account, options);
    case "antigravity":
      return convertSub2ApiAntigravityAccount(account, options);
    case "gemini":
      return convertSub2ApiGeminiAccount(account, options);
    default:
      throw new Error(`暂不支持 platform=${account.platform} 的 sub2api 账号`);
  }
}

function extractSub2ApiAccounts(document) {
  if (Array.isArray(document)) {
    return document;
  }

  if (isPlainObject(document) && Array.isArray(document.accounts)) {
    return document.accounts;
  }

  if (isPlainObject(document) && typeof document.platform === "string" && isPlainObject(document.credentials)) {
    return [document];
  }

  throw new Error("不是有效的 sub2api 配置，缺少 accounts 数组");
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
    entryLabel: undefined,
    account,
    document,
    outputFileName: buildSub2ApiOutputFileName(options.sourceName, parsed.email),
  };
}

export function convertSub2ApiDocument(document, options = {}) {
  const accounts = extractSub2ApiAccounts(document);

  if (!accounts.length) {
    throw new Error("sub2api 配置中的 accounts 为空");
  }

  const converted = [];
  const skipped = [];

  accounts.forEach((account, index) => {
    const entryLabel = buildSub2ApiEntryLabel(account, index);

    try {
      converted.push({
        sourceName: options.sourceName ?? "",
        ...convertSub2ApiAccount(account, options),
        entryLabel,
      });
    } catch (error) {
      skipped.push({
        sourceName: options.sourceName ?? "",
        entryLabel,
        reason: error instanceof Error ? error.message : "无法解析该账号",
      });
    }
  });

  return { converted, skipped };
}

export function buildMergedSub2ApiDocument(convertedRecords, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();

  return {
    exported_at: normalizeTimestamp(now),
    proxies: [],
    accounts: convertedRecords.map((item) => item.account).filter(Boolean),
  };
}

export function buildMergedCPARecords(convertedRecords) {
  return convertedRecords.map((item) => item.document).filter(Boolean);
}

export function formatMergedPreview(document, limit = 12000) {
  const pretty = JSON.stringify(document, null, 2);
  if (pretty.length <= limit) {
    return pretty;
  }

  return `${pretty.slice(0, limit)}\n...`;
}
