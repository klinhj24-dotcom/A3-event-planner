// Resolves the public base URL of the deployed app, used to construct
// links in outbound emails (signup pages, invite links, etc.).
//
// Resolution order:
//   1. PUBLIC_BASE_URL — explicit override (set this on Vercel for prod)
//   2. VERCEL_URL — auto-injected by Vercel for previews + prod (no scheme)
//   3. REPLIT_DOMAINS — Replit legacy fallback (comma-separated)
//   4. http://localhost:<PORT> — local dev fallback
export function getBaseUrl(): string {
  if (process.env.PUBLIC_BASE_URL) {
    return stripTrailingSlash(process.env.PUBLIC_BASE_URL);
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  const port = process.env.PORT ?? "8080";
  return `http://localhost:${port}`;
}

// Returns just the host (no scheme), useful for OAuth redirect URI builders
// that prefix `https://` themselves.
export function getBaseHost(): string {
  return getBaseUrl().replace(/^https?:\/\//, "");
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
