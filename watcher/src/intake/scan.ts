// Recognises blocked hostile traffic in code, before any model is asked: a scanner probing for
// secrets, or requests sent to the server's raw address, that the app itself refused (a 4xx).
// Such events are folded into one "blocked scan" incident per burst (store.ts) and decided by
// rule 12 (decide.ts): logged, never a per-incident notify or wake, whatever a model would say.
// Real errors are never caught here: anything that is not a refusal (a crash is a 5xx), any
// signed-in user, and a refused Host header that is one of the app's own hosts all go the normal way.

import type { CleanEvent } from "./allowlist.js";

export type ScanKind = "refused_host" | "secret_probe";
export type ScanMatch = { kind: ScanKind; path: string | null; host: string | null };

/** Quiet time that ends a burst: an event later than this after the last one starts a new scan incident. */
export const SCAN_BURST_GAP_MS = 10 * 60 * 1000;

const bare = (t: string) => t.replace(/^.*[.:]/, "");

// Django's SuspiciousOperation family: Django answers 400 and logs them to django.security.*.
const SUSPICIOUS = new Set([
  "SuspiciousOperation", "DisallowedHost", "DisallowedRedirect", "SuspiciousFileOperation", "SuspiciousMultipartForm",
  "SuspiciousSession", "InvalidSessionKey", "TooManyFieldsSent", "TooManyFilesSent", "RequestDataTooBig",
]);
// Plain refusals (400, 401, 403, 404, 405) from Django, Django REST framework, Werkzeug/Flask and similar.
// Only counted together with a secret-probe path: a 404 on an ordinary page goes the normal way.
const REFUSED = new Set([
  "Http404", "Resolver404", "NotFound", "PermissionDenied", "MethodNotAllowed", "BadRequest", "Forbidden",
  "Unauthorized", "NotAuthenticated", "AuthenticationFailed",
]);

// One path segment that only a scanner asks for on an app that does not serve it.
const PROBE_SEGMENT =
  /^(?:\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.docker|\.kube|\.npmrc|\.htaccess|\.htpasswd|\.ds_store|\.vscode|\.idea|wp-admin|wp-login|wp-content|wp-includes|wp-config|xmlrpc\.php|phpmyadmin|pma|myadmin|adminer|phpinfo|actuator|credentials?|secrets?|keys?|api[-_]?keys?|private[-_]?keys?|id_rsa|id_ed25519|config\.(?:json|ya?ml|php|js|env)|server-status|cgi-bin|phpunit|swagger|swagger-ui|api-docs|openapi|graphql|graphiql|telescope|_profiler|boaform|hnap1|solr|jenkins)(?:[._-][\w.-]*)?$/i;

/** The request path from a transaction name ("GET /api/keys" or "/api/keys"), or null. */
export function pathOf(transaction: string | null): string | null {
  if (!transaction) return null;
  const p = transaction.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT) +/i, "").trim();
  return p.startsWith("/") ? p : null;
}

/** True when the path asks for secrets, admin consoles or source control that a scanner looks for. */
export function isSecretProbe(path: string | null): boolean {
  if (!path) return false;
  return path
    .split(/[?#]/)[0]
    .split("/")
    .some((seg) => seg !== "" && PROBE_SEGMENT.test(seg));
}

/** The Host header Django refused, from its DisallowedHost message, lower-case and without a port. */
export function refusedHost(message: string): string | null {
  const m = message.match(/Invalid HTTP_HOST header: '([^']*)'/);
  if (!m) return null;
  return m[1].trim().toLowerCase().replace(/:\d+$/, "");
}

const CLOUD_DEFAULT_HOST =
  /(?:^|\.)(?:amazonaws\.com|compute\.internal|cloudapp\.net|cloudapp\.azure\.com|googleusercontent\.com|linodeusercontent\.com|vultrusercontent\.com|your-server\.de|ip-\d+-\d+-\d+-\d+)$/;

/** A Host no visitor of the real site sends: empty, a bare IP, localhost, a cloud machine's default name, or not a hostname at all. */
function strayHost(host: string): boolean {
  if (host === "" || host === "localhost" || host.includes("[ip]")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return true;
  if (!/^[a-z0-9.-]+$/.test(host)) return true;
  return CLOUD_DEFAULT_HOST.test(host);
}

/** One of the app's own hosts: an exact name, or a suffix written with a leading dot (".faurus.app"). */
export function isOwnHost(host: string, own: string[]): boolean {
  return own.some((h) => {
    const x = h.trim().toLowerCase();
    if (!x) return false;
    return x.startsWith(".") ? host === x.slice(1) || host.endsWith(x) : host === x;
  });
}

/**
 * Classifies one clean event as blocked hostile traffic, or null for the normal path.
 * ownHosts: the app's real hostnames (project setting `hosts`); when set, any other refused Host is stray.
 */
export function classifyScan(ev: CleanEvent, ownHosts: string[] = []): ScanMatch | null {
  if (ev.signed_in) return null; // a signed-in person was refused: that may be a real user blocked
  if (ev.level === "fatal") return null;
  const type = bare(ev.exception_type);
  const path = pathOf(ev.transaction);
  const hostMessage = /Invalid HTTP_HOST header/.test(ev.message);

  if (type === "DisallowedHost" || (type === "Message" && hostMessage)) {
    const host = refusedHost(ev.message);
    // The real domain refused means the app's own ALLOWED_HOSTS is wrong: every visitor is blocked.
    if (host !== null && isOwnHost(host, ownHosts)) return null;
    if (host !== null && (ownHosts.length > 0 || strayHost(host))) return { kind: "refused_host", path, host };
    // An unknown domain and no list of the app's own hosts: only a secret probe is safe to fold.
    return isSecretProbe(path) ? { kind: "secret_probe", path, host } : null;
  }
  if ((SUSPICIOUS.has(type) || REFUSED.has(type)) && isSecretProbe(path)) return { kind: "secret_probe", path, host: null };
  return null;
}
