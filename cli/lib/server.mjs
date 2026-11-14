// The hosted JaagteRaho API. This is the ONE place to change when the server moves (e.g. to Vultr).
export const HOSTED_SERVER = "https://jr-api.15-252-108-184.sslip.io";

/** Where `init` registers a new app: --server, then JAAGTERAHO_URL (self-hosting), then the hosted API. */
export function serverUrl(flagValue, env = process.env) {
  const pick = typeof flagValue === "string" && flagValue ? flagValue : env.JAAGTERAHO_URL || HOSTED_SERVER;
  return pick.replace(/\/+$/, "");
}
