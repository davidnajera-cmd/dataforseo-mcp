const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomainScope(value: unknown): { valid: boolean; domains: string[] } {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) return { valid: false, domains: [] };
  const normalized = value.map(normalizeHost);
  if (normalized.some((host) => host === null)) return { valid: false, domains: [] };
  return { valid: true, domains: [...new Set(normalized.filter((host): host is string => host !== null))].sort() };
}

/**
 * Finds only client-owned resources outside the key scope. Public research
 * targets stay intentionally unrestricted so competitor analysis still works.
 */
export function findOutOfScopeOwnedHosts(toolName: string, request: unknown, allowedDomains: readonly string[]): string[] {
  if (allowedDomains.length === 0) return [];
  const ownedKeys = ownedArgumentKeys(toolName);
  const hosts = new Set<string>();
  collectHosts(request, ownedKeys, hosts);
  return [...hosts].filter((host) => !allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))).sort();
}

function ownedArgumentKeys(toolName: string): ReadonlySet<string> {
  const keys = new Set(["site_url", "feedpath", "host_name"]);
  if (toolName.startsWith("gsc_")) {
    keys.add("inspection_url");
    keys.add("url");
  }
  if (/^(?:history_|keyword_universe_|snapshot_)/.test(toolName)) keys.add("domain");
  return keys;
}

function collectHosts(value: unknown, ownedKeys: ReadonlySet<string>, hosts: Set<string>, currentKey?: string): void {
  if (Array.isArray(value)) {
    value.forEach((child) => collectHosts(child, ownedKeys, hosts, currentKey));
    return;
  }
  if (!value || typeof value !== "object") {
    if (currentKey && ownedKeys.has(currentKey)) {
      const host = normalizeHost(value);
      if (host) hosts.add(host);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) collectHosts(child, ownedKeys, hosts, key);
}

function normalizeHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const gscDomain = trimmed.startsWith("sc-domain:") ? trimmed.slice("sc-domain:".length) : trimmed;
  if (trimmed.startsWith("sc-domain:") && (gscDomain.includes("/") || gscDomain.includes("?") || gscDomain.includes("#"))) return null;
  try {
    const url = new URL(gscDomain.includes("://") ? gscDomain : `https://${gscDomain}`);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    const hostname = url.hostname.toLowerCase();
    return HOSTNAME.test(hostname) ? hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}
