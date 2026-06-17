# AI Optimization Family Review

## Scope

Current local tools:

- `ai_optimization_llm_mentions_search`
- `ai_optimization_llm_mentions_top_domains`
- `ai_optimization_chatgpt_live`
- `ai_optimization_claude_live`
- `ai_optimization_gemini_live`
- `ai_optimization_perplexity_live`

Evidence in repo:

- `src/tools.ts`
- `src/snapshots/capture-llm.ts`
- `src/persistence-store.ts`
- `src/tools-playbook.ts`

## Official product surface observed

From official DataForSEO sources:

- official remote MCP endpoints: `https://mcp.dataforseo.com/mcp` and `https://mcp.dataforseo.com/http`
- AI Optimization product emphasizes:
  - LLM mentions
  - AI keyword data / AI search volume
  - fan-out-query workflows

## Keep / migrate decisions

| Tool / capability | Decision | Reason |
| --- | --- | --- |
| raw LLM mentions search | `migrar` | provider-shaped capability; good first candidate for parity |
| raw live LLM response tools | `migrar` | provider-shaped and likely better maintained upstream |
| `history_llm_visibility` persistence | `mejorar` | local moat; converts raw responses into durable visibility history |
| dashboard interpretation of AI visibility | `mejorar` | real product value is in decisions, not raw responses |
| playbooks and brand audit usage | `mantener` | orchestration layer stays local |

## Gaps to close locally

1. AI search volume is not yet surfaced as a first-class local product concept.
2. Fan-out queries are not modeled in local persistence or dashboards.
3. The agent can react to "no presence in LLMs", but not yet to "high AI search volume + low citation share" opportunities.

## Migration order

1. prove parity on `ai_optimization_llm_mentions_search`
2. add normalized AI search volume support
3. model fan-out-derived opportunities
4. only then rewire dashboards/agent decisions
