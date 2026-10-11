import { ProxyAgent } from "undici";
import { resolveProxyUrl } from "./proxy.js";

let cachedProxyUrl;
let proxyDispatcher;

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

export async function callApi(token, method, params, { fetch = globalThis.fetch, env = process.env, timeoutMs = 15000 } = {}) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      ...(params instanceof FormData ? { body: params }
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(params) }),
      signal: AbortSignal.timeout(timeoutMs),
      ...dispatcherOptions(env),
    });
    const body = await response.json();
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
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(timeoutMs),
      ...dispatcherOptions(env),
    });
    if (!response.ok) throw new Error(`Telegram file download failed: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(errorMessage(error, [token]));
  }
}
