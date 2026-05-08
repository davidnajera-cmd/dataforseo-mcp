# SEO Agent — Backlog operativo

**Fecha:** 2026-05-08
**Goal:** El dashboard se convierte en centro operativo SEO. Un agente lee todas las APIs/DB históricas y entrega un backlog de tareas accionables. El equipo cambia su estado.

## Pipeline

```
┌──────────────────────────────────────────────┐
│ 1. Data collectors (paralelos)                │
│    • GSC: search analytics + URL inspection  │
│    • DataForSEO Labs: ranked + competitors   │
│    • Backlinks: anchors, spam, broken         │
│    • LLM visibility: ChatGPT + Google AI     │
│    • Clarity: dead/rage clicks               │
│    • PageSpeed: vitals                       │
│    • Postgres history: trends                │
│    • Schema audit (sample URLs)              │
└──────────────────────────────────────────────┘
            │ (raw data + per-source summaries)
            ▼
┌──────────────────────────────────────────────┐
│ 2. DeepSeek (clasifica/agrupa/limpia)         │
│    • Clusters de keywords por intención      │
│    • Anchors sospechosos                     │
│    • Páginas con bajo CTR pero alta impr.    │
│    • Backlinks tóxicos                       │
│    • Schemas faltantes                       │
│    • Patrones de drop en rankings            │
│    Output: resúmenes estructurados (JSON)    │
└──────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ 3. Opus (estratega, decide tareas)            │
│    • Prioriza por impacto × esfuerzo          │
│    • Detecta riesgos                         │
│    • Diferencia accionable vs ruido          │
│    • Output: array de tareas con full schema │
└──────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ 4. Dedup + insert (idempotente)               │
│    Signature: sha1(domain + category + key)  │
│    Si existe pendiente/en_progreso: actualiza │
│    Si existe ejecutada/descartada: skip       │
└──────────────────────────────────────────────┘
            │
            ▼
   seo_backlog_tasks (Postgres)
            │
            ▼
   Dashboard "Backlog" view + MCP tools
```

## Schema

```sql
create table seo_backlog_tasks (
  id bigserial primary key,
  task_signature text unique not null,       -- dedup
  title text not null,
  description text not null,
  domain text not null,                       -- dnamusic.edu.co | dnamusic.mx | latiendadeaudio.com | global
  category text not null,                     -- technical | on-page | content | social | link-building | ai-optimization | schema | sitemap
  priority text not null,                     -- alta | media | baja
  impact_expected text,                       -- "Recuperar ~200 clicks/mes" o similar
  rationale text not null,                    -- por qué se recomienda
  data_sources jsonb not null,                -- {sources: ["gsc","backlinks"], evidence: {...}}
  status text not null default 'pendiente',   -- pendiente | en_progreso | ejecutada | descartada
  proposed_by text not null default 'agent',  -- agent | manual
  proposed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  assignee text,
  notes text                                  -- notas del equipo
);
```

## Modelos y costo

- **DeepSeek `deepseek-chat`** (~$0.14/M in, $0.28/M out): ~50K in + 10K out = **$0.01/run**.
- **Anthropic `claude-opus-4-7`** (~$15/M in, $75/M out): ~30K in + 5K out = **$0.83/run**.
- **Total ~$0.85/run.** Daily cron = ~$25/mes.

## Variables runtime nuevas

- `DEEPSEEK_API_KEY` (sensible)
- `ANTHROPIC_API_KEY` (sensible)
- `AGENT_MAX_TASKS_PER_RUN` (default 20) — para no inundar el backlog

## Componentes nuevos

- `src/agent/data-collectors.ts` — extrae y resume cada fuente
- `src/agent/deepseek-client.ts` — cliente OpenAI-compatible
- `src/agent/opus-client.ts` — Anthropic SDK
- `src/agent/pipeline.ts` — orquestador (collect → deepseek → opus → write)
- `src/agent/prompts.ts` — system prompts y schemas JSON
- `src/agent/dedup.ts` — signature generator
- `src/backlog-store.ts` — CRUD del backlog
- `src/tools-backlog.ts` — MCP tools (list, update_status, run_agent_now, get_task)
- `api/backlog.ts` — REST endpoint para dashboard
- `api/cron/agent.ts` — cron diario (06:30 UTC, 30 min después del snapshot)
- Frontend: nueva vista `backlog` con tarjetas + filtros + botones de estado

## MCP tools

| Tool | Descripción |
|---|---|
| `backlog_list` | Lista tareas con filtros (domain, status, priority, category) |
| `backlog_get` | Detalle de una tarea por id |
| `backlog_update_status` | Cambia estado (pendiente → en_progreso → ejecutada/descartada) |
| `backlog_add_note` | Agrega nota a una tarea |
| `backlog_assign` | Asigna a una persona |
| `agent_run_now` | Dispara el agente manualmente |
| `agent_runs_list` | Historial de runs del agente |

## Cron

`/api/cron/agent` — auth con `CRON_SECRET` (mismo que el snapshot cron).
- 06:30 UTC diario.
- Ejecuta el pipeline completo.
- Inserta tareas con dedup.
- Loguea run_id en `seo_agent_runs` (tabla simple para auditoría).

`vercel.json` agrega segundo cron:
```json
"crons": [
  { "path": "/api/cron/snapshot", "schedule": "0 6 * * *" },
  { "path": "/api/cron/agent",    "schedule": "30 6 * * *" }
]
```

## Dashboard view

- Nueva nav `Backlog` (top después de Overview).
- Tarjetas en 4 columnas (Pendiente | En progreso | Ejecutada | Descartada).
- Filtros: dominio, prioridad, categoría.
- Click en tarjeta → modal con descripción + rationale + evidencia + botones de estado.
- Botón "Correr agente ahora" (admin token requerido).

## Out of scope (para iterar después)

- Notificaciones a Slack cuando se crean tareas alta.
- Comentarios threaded por tarea.
- Auto-execution de tareas (solo recomienda, no actúa).
- Dashboard mensual/semanal con métricas de cuántas tareas se cierran.
