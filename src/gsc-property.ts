export type GscPropertyConfig = {
  site?: string;
  domain?: string;
  canonicalUrl?: string;
};

export function gscPropertyCandidates(config: GscPropertyConfig): string[] {
  const candidates: string[] = [];
  const siteDomain = domainFromProperty(config.site);
  const canonicalDomain = domainFromProperty(config.canonicalUrl);
  const domain = normalizeDomain(config.domain ?? siteDomain ?? canonicalDomain);

  if (domain) {
    addCandidate(candidates, `https://${domain}/`);
    addCandidate(candidates, `https://www.${domain}/`);
  }

  addCandidate(candidates, config.site);
  addCandidate(candidates, config.canonicalUrl);

  if (domain) addCandidate(candidates, `sc-domain:${domain}`);

  return candidates;
}

export function formatGscAttemptErrors(errors: Array<{ site: string; error: unknown }>): string {
  if (!errors.length) return "";

  const sites = errors.map(({ site }) => site);
  const messages = errors.map(({ error }) => message(error));
  const permissionErrors = messages.filter((item) => item.includes("User does not have sufficient permission"));

  if (permissionErrors.length === errors.length) {
    return `Sin permiso en Google Search Console para ${sites.join(", ")}. Valida que el refresh token sea de un usuario con acceso a una de esas propiedades o actualiza DNA_SITE_CO.`;
  }

  return errors.map(({ site, error }) => `${site}: ${message(error)}`).join(" | ");
}

function addCandidate(candidates: string[], value: string | undefined) {
  const normalized = normalizeProperty(value);
  if (!normalized || candidates.includes(normalized)) return;
  candidates.push(normalized);
}

function normalizeProperty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("sc-domain:")) return `sc-domain:${normalizeDomain(trimmed.slice("sc-domain:".length))}`;

  try {
    const url = new URL(trimmed);
    if (url.pathname === "") url.pathname = "/";
    return url.toString();
  } catch {
    return trimmed;
  }
}

function domainFromProperty(value: string | undefined): string | undefined {
  const normalized = normalizeProperty(value);
  if (!normalized) return undefined;
  if (normalized.startsWith("sc-domain:")) return normalizeDomain(normalized.slice("sc-domain:".length));

  try {
    return normalizeDomain(new URL(normalized).hostname);
  } catch {
    return undefined;
  }
}

function normalizeDomain(value: string | undefined): string | undefined {
  const domain = value?.trim().toLowerCase().replace(/^www\./, "").replace(/\/+$/, "");
  return domain || undefined;
}

function message(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Search Console no respondio.";
  if (raw.includes("User does not have sufficient permission")) return "User does not have sufficient permission";
  if (raw.includes("Failed to refresh Google access token")) return raw.replace(/\s+/g, " ");
  if (raw.includes("Google Search Console API error 403")) return "Google Search Console API error 403";
  return raw;
}
