import assert from "node:assert/strict";
import test from "node:test";
import { SITE_CONTEXT_VARIABLES } from "../src/site-context-registry.js";

test("includes the Argentina and Mexico .edu.co sites in the scheduled collector registry", () => {
  assert.deepEqual(
    SITE_CONTEXT_VARIABLES.filter((site) => ["mx_edu", "ar"].includes(site.code)),
    [
      { code: "mx_edu", domainVar: "DNA_DOMAIN_MX_EDU", siteVar: "DNA_SITE_MX_EDU", ga4Var: "GA4_PROPERTY_ID_MX_EDU", countryCode: "mx", locationVar: "DNA_LOCATION_MX_EDU", defaultLocationCode: 2484 },
      { code: "ar", domainVar: "DNA_DOMAIN_AR", siteVar: "DNA_SITE_AR", ga4Var: "GA4_PROPERTY_ID_AR", countryCode: "ar", locationVar: "DNA_LOCATION_AR", defaultLocationCode: 2032 },
    ]
  );
});
