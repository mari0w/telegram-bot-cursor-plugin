import { ProxyAgent } from "undici";
import { resolveProxyUrl } from "./proxy.js";

let cachedProxyUrl;
let proxyDispatcher;
let preferDirect = false;
const readMethods = new Set([
  "getUpdates", "getMe", "getFile", "getChat", "getChatAdministrators", "getMyCommands",
  "getWebhookInfo", "getBusinessConnection", "downloadFile",
]);

export function resetProxyPreferenceForTests() {
  preferDirect = false;
}

export function redact(text, tokens) {
  let message = String(text);
  for (const token of tokens) {
    message = message.split(token).join("[REDACTED]").split(encodeURIComponent(token)).join("[REDACTED]");
  }
  return message.replace(/\d+(?::|%3A)[A-Za-z0-9_-]{30,}/gi, "[REDACTED]");
}

export function errorMessage(error, tokens) {
  return redact([error?.message ?? String(error), error?.cause?.message].filter(Boolean).join(": "), tokens);
}

function dispatcherOptions(env) {
  const proxyUrl = resolveProxyUrl(env);
  if (proxyUrl !== cachedProxyUrl) {
    const nextDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    proxyDispatcher?.close().catch(() => {});
    proxyDispatcher = nextDispatcher;
    cachedProxyUrl = proxyUrl;
  }
  return proxyDispatcher ? { dispatcher: proxyDispatcher } : {};
}

async function fetchTelegram(url, options, fetch, env, timeoutMs, method) {
  const proxy = preferDirect ? {} : dispatcherOptions(env);
  try {
    return { response: await fetch(url, { ...options, ...proxy, signal: AbortSignal.timeout(timeoutMs) }), directFallback: false };
  } catch (error) {
    if (!readMethods.has(method) || !proxy.dispatcher || !([error?.name, error?.cause?.name].some((name) => /^(AbortError|TimeoutError)$/.test(name))
      || /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|socket|fetch failed/i
        .test(errorMessage(error, [])))) throw error;
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    return { response, directFallback: true };
  }
}

export async function callApi(token, method, params, { fetch = globalThis.fetch, env = process.env, timeoutMs = 15000 } = {}) {
  try {
    const { response, directFallback } = await fetchTelegram(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      ...(params instanceof FormData ? { body: params }
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(params) }),
    }, fetch, env, timeoutMs, method);
    const body = await response.json();
    if (directFallback) preferDirect = true;
    if (!body.ok) {
      const retry = body.parameters?.retry_after;
      const hint = retry === undefined ? "" : ` Retry after ${retry} s. Stop sending. Do not retry at once.`;
      const error = new Error(`Telegram API ${method} failed: ${body.error_code} ${body.description}${hint}`);
      error.code = body.error_code ?? response.status;
      throw error;
    }
    return body.result;
  } catch (error) {
    const safeError = new Error(errorMessage(error, [token]));
    safeError.code = error.code;
    throw safeError;
  }
}

export async function downloadFile(token, filePath, { fetch = globalThis.fetch, env = process.env, timeoutMs = 15000 } = {}) {
  try {
    const { response, directFallback } = await fetchTelegram(`https://api.telegram.org/file/bot${token}/${filePath}`, {}, fetch, env, timeoutMs, "downloadFile");
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
    const body = await response.arrayBuffer();
    if (directFallback) preferDirect = true;
    return Buffer.from(body);
  } catch (error) {
    throw new Error(errorMessage(error, [token]));
  }
}
