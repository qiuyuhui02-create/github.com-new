// NextURL normalizes loopback hosts to localhost. Preserve the original local host
// so development redirects do not move PKCE/session cookies from 127.0.0.1 to localhost.
// Production URLs never use Host/X-Forwarded-Host overrides.
export function authRequestUrl(request: Pick<Request, "url" | "headers">) {
  const url = new URL(request.url);
  const loopback = (host: string) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const host = request.headers.get("host");
  if (loopback(url.hostname) && host) {
    try {
      const candidate = new URL(`${url.protocol}//${host}`);
      if (
        loopback(candidate.hostname) &&
        candidate.port === url.port &&
        !candidate.username &&
        !candidate.password &&
        candidate.pathname === "/"
      )
        url.host = candidate.host;
    } catch {
      /* Ignore invalid local Host values. */
    }
  }
  return url;
}
