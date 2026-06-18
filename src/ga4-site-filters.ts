export const GA4_CLEAN_KEY_EVENTS_TIMESTAMP = "2026-06-18T23:00:00Z";
export const GA4_CLEAN_KEY_EVENTS_DATE = "2026-06-19";
export const GA4_CONVERSION_EVENT_NAMES = ["whatsapp_click", "form_submit", "purchase"] as const;

type DimensionFilter = Record<string, unknown>;
type DimensionExpression = { filter?: DimensionFilter; andGroup?: { expressions: DimensionExpression[] } };

export function ga4HostnamesForDomain(domain: string): string[] {
  const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!normalized) return [];
  if (normalized.startsWith("www.")) {
    return [normalized, normalized.slice(4)];
  }
  return [normalized, `www.${normalized}`];
}

export function ga4HostNameExpression(domain: string): DimensionExpression {
  return {
    filter: {
      fieldName: "hostName",
      inListFilter: { values: ga4HostnamesForDomain(domain) },
    },
  };
}

export function ga4ExactStringExpression(fieldName: string, value: string): DimensionExpression {
  return {
    filter: {
      fieldName,
      stringFilter: { matchType: "EXACT", value },
    },
  };
}

export function ga4InListExpression(fieldName: string, values: readonly string[]): DimensionExpression {
  return {
    filter: {
      fieldName,
      inListFilter: { values: [...values] },
    },
  };
}

export function ga4AndExpression(...expressions: Array<DimensionExpression | null | undefined>): DimensionExpression | undefined {
  const filtered = expressions.filter(Boolean) as DimensionExpression[];
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return { andGroup: { expressions: filtered } };
}
