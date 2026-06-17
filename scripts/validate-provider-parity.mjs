#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FAMILY_DEFAULTS = {
  ai_optimization: {
    current: [
      "ai_optimization_llm_mentions_search",
      "ai_optimization_llm_mentions_top_domains",
      "ai_optimization_chatgpt_live",
      "ai_optimization_claude_live",
      "ai_optimization_gemini_live",
      "ai_optimization_perplexity_live",
    ],
    target: "official-dataforseo-mcp",
    docs: [
      "docs/migrations/ai-optimization-family.md",
      "docs/ai-visibility-roadmap.md",
    ],
  },
  serp_labs: {
    current: [
      "serp_google_organic_live",
      "serp_google_ai_mode_live",
      "keywords_google_search_volume_live",
      "labs_google_keyword_ideas",
      "labs_google_keyword_overview",
      "labs_google_search_intent",
    ],
    target: "official-dataforseo-mcp",
    docs: ["docs/migrations/serp-labs-family.md"],
  },
  backlinks_onpage: {
    current: [
      "backlinks_summary",
      "backlinks_list",
      "backlinks_timeseries_summary",
      "onpage_lighthouse_live",
      "onpage_instant_pages",
    ],
    target: "official-dataforseo-mcp",
    docs: ["docs/migrations/backlinks-onpage-family.md"],
  },
};

function printHelp() {
  console.log(`Usage:
  node scripts/validate-provider-parity.mjs --family <ai_optimization|serp_labs|backlinks_onpage> [--dry-run]
  node scripts/validate-provider-parity.mjs --config path/to/config.json [--dry-run]

What it does:
  - Loads a migration family profile
  - Verifies supporting docs exist
  - Prints the comparison inventory that should be tested for parity
  - In dry-run mode, performs local readiness checks only

Config JSON shape:
  {
    "family": "custom_family",
    "current": ["tool_a", "tool_b"],
    "target": "official-dataforseo-mcp",
    "docs": ["docs/example.md"]
  }
`);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const familyArg = argValue("--family");
const configArg = argValue("--config");
const dryRun = hasFlag("--dry-run");

let profile;
if (configArg) {
  const abs = resolve(configArg);
  profile = JSON.parse(readFileSync(abs, "utf8"));
} else if (familyArg) {
  profile = FAMILY_DEFAULTS[familyArg];
}

if (!profile) {
  console.error("Missing or unknown family. Use --help.");
  process.exit(1);
}

const docs = Array.isArray(profile.docs) ? profile.docs : [];
const missingDocs = docs.filter((p) => !existsSync(resolve(p)));

const report = {
  family: profile.family ?? familyArg ?? "custom",
  target: profile.target ?? "unknown",
  current_tools: profile.current ?? [],
  docs_checked: docs,
  missing_docs: missingDocs,
  checks: {
    docs_ready: missingDocs.length === 0,
    has_tools: Array.isArray(profile.current) && profile.current.length > 0,
  },
  next_steps: [
    "Map each current tool to a normalized internal shape.",
    "Run equivalent calls against the target provider path.",
    "Compare response shape, key metrics, error behavior, latency, and estimated cost.",
    "Record go/no-go and rollback notes in the migration doc.",
  ],
};

console.log(JSON.stringify({ ok: report.checks.docs_ready && report.checks.has_tools, dry_run: dryRun, report }, null, 2));

if (!dryRun && missingDocs.length > 0) {
  process.exit(2);
}
