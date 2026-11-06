export type SiteContextVariable = {
  code: string;
  domainVar: string;
  siteVar: string;
  ga4Var: string;
  countryCode: string;
  locationVar: string;
  defaultLocationCode: number;
  ga4FallbackVar?: string;
};

// The dashboard and scheduled snapshots must use the same registry. A site is
// collected only after its domain and GSC property are configured at runtime.
export const SITE_CONTEXT_VARIABLES: SiteContextVariable[] = [
  { code: "co", domainVar: "DNA_DOMAIN_CO", siteVar: "DNA_SITE_CO", ga4Var: "GA4_PROPERTY_ID_CO", ga4FallbackVar: "GA4_PROPERTY_ID", countryCode: "co", locationVar: "DNA_LOCATION_CO", defaultLocationCode: 2170 },
  { code: "mx", domainVar: "DNA_DOMAIN_MX", siteVar: "DNA_SITE_MX", ga4Var: "GA4_PROPERTY_ID_MX", countryCode: "mx", locationVar: "DNA_LOCATION_MX", defaultLocationCode: 2484 },
  { code: "lta", domainVar: "DNA_DOMAIN_LTA", siteVar: "DNA_SITE_LTA", ga4Var: "GA4_PROPERTY_ID_LTA", countryCode: "co", locationVar: "DNA_LOCATION_LTA", defaultLocationCode: 2170 },
  { code: "mx_edu", domainVar: "DNA_DOMAIN_MX_EDU", siteVar: "DNA_SITE_MX_EDU", ga4Var: "GA4_PROPERTY_ID_MX_EDU", countryCode: "mx", locationVar: "DNA_LOCATION_MX_EDU", defaultLocationCode: 2484 },
  { code: "ar", domainVar: "DNA_DOMAIN_AR", siteVar: "DNA_SITE_AR", ga4Var: "GA4_PROPERTY_ID_AR", countryCode: "ar", locationVar: "DNA_LOCATION_AR", defaultLocationCode: 2032 },
];
