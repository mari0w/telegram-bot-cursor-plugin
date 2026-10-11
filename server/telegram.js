import { ProxyAgent } from "undici";
import { resolveProxyUrl } from "./proxy.js";

let cachedProxyUrl;
let proxyDispatcher;

export function redact(text, tokens) {
  let message = String(text);
  for (const token of tokens) message = message.split(token).join("[REDACTED]");
  return message.replace(/\d+:[A-Za-z0-9_-]{30,}/g, "[REDACTED]");
}

export function errorMessage(error, tokens) {
  return redact([error?.message ?? String(error), error?.cause?.message].filter(Boolean).join(": "), tokens);
}

export async function callApi(token, method, params, { fetch = globalThis.fetch, env = process.env, timeoutMs } = {}) {
  try {
    const proxyUrl = resolveProxyUrl(env);
    if (proxyUrl !== cachedProxyUrl) {
      const nextDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
      proxyDispatcher?.close().catch(() => {});
      proxyDispatcher = nextDispatcher;
      cachedProxyUrl = proxyUrl;
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      ...(timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
      ...(proxyDispatcher ? { dispatcher: proxyDispatcher } : {}),
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
