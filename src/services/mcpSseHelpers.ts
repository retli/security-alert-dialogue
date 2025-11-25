export function appendTimestamp(url: string) {
  try {
    const target = new URL(url);
    target.searchParams.set("_t", Date.now().toString());
    return target.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_t=${Date.now()}`;
  }
}

export function resolveSessionUrl(
  sseUrl: string,
  endpoint: string | null
): string {
  if (!endpoint) return "";
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }
  try {
    const target = new URL(endpoint, sseUrl);
    return target.toString();
  } catch {
    const root = sseUrl.replace(/\/sse.*/i, "");
    if (endpoint.startsWith("/")) {
      return `${root}${endpoint}`;
    }
    return `${root}/${endpoint}`;
  }
}

