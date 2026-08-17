import { fetchWithRetry } from "../../shared/retry.ts";

interface OpenRouterHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function isReasoningParameterRejection(response: Response, body: Record<string, unknown>): Promise<boolean> {
  if (response.status !== 400 || !Object.prototype.hasOwnProperty.call(body, "reasoning")) return Promise.resolve(false);
  return response.clone().text().then((text) => /reasoning|thinking|unsupported\s+(?:parameter|field)|(?:parameter|field)[^\n.]*(?:unsupported|not supported|invalid)/i.test(text)).catch(() => false);
}

export async function fetchOpenRouterWithReasoningFallback({
  url,
  headers,
  body,
  signal,
  fetchImpl = fetch,
}: OpenRouterHttpRequest): Promise<Response> {
  const request = (requestBody: Record<string, unknown>) => fetchWithRetry(url, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(requestBody),
  }, { fetchImpl });

  let response = await request(body);
  if (await isReasoningParameterRejection(response, body)) {
    const fallbackBody = { ...body };
    delete fallbackBody.reasoning;
    response = await request(fallbackBody);
  }
  return response;
}
