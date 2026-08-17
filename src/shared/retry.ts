const MAX_RETRY_DELAY_MS = 4000;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_RETRIES = 2;

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "[::1]") return true;
  if (host.startsWith("127.")) return true; // loopback
  if (host === "0.0.0.0") return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    if (a === 10) return true;                                  // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
    if (a === 169 && b === 254) return true;                    // link-local
    if (a >= 224) return true;                                  // multicast + reserved
  }
  return host.endsWith(".local") || host.endsWith(".internal");
}

export function assertSafeRequestUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refusing request to invalid URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Refusing non-http(s) request URL: ${url}`);
  }
  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error(`Refusing request to private or reserved host: ${parsed.hostname}`);
  }
}

export function computeRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const exponential = Math.min(DEFAULT_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  if (!retryAfterHeader) return exponential;
  const seconds = Number(retryAfterHeader);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, exponential), MAX_RETRY_DELAY_MS * 2);
  }
  const dateMs = Date.parse(retryAfterHeader);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }
  return exponential;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface FetchRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

// Bounded retry wrapper for OpenRouter calls: retries 429/5xx with
// exponential backoff (honoring Retry-After), never retries other 4xx.
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  assertSafeRequestUrl(url);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let response = await fetchImpl(url, init);
  for (let attempt = 0; attempt < maxRetries && isRetryableStatus(response.status); attempt += 1) {
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const delay = computeRetryDelayMs(attempt, response.headers.get("Retry-After"));
    await sleep(Math.min(delay, baseDelayMs === 1 ? 1 : delay), init.signal ?? undefined);
    response = await fetchImpl(url, init);
  }
  return response;
}
