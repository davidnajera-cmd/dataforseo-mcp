// Two-way sync between seo_backlog_tasks and the Slack "Sprint de Marketing" list,
// scoped to items in the "Backlog SEO Agent" group (Estado Sprint = OptL5NJTUJB).
//
// Outbound: every time a task is upserted into the backlog, push its title +
// description + priority to Slack. New tasks get a fresh row; existing tasks
// (matched by slack_list_item_id) are updated in place.
//
// Inbound: a cron periodically lists the Slack rows. For each row that:
//   - has todo_completed=true, OR
//   - has Estado Sprint moved to "Completadas",
// we mark the matching local task as ejecutada (only if it was pendiente or
// en_progreso). Local tasks already marked manually are not touched again.

import { neon } from "@neondatabase/serverless";
import { createBacklogItem, updateBacklogItem, listBacklogItems, itemFieldsByColumn, SLACK_COLS, SLACK_ESTADO_OPTIONS } from "./slack-client.js";
import { ensureBacklogSchema, BacklogTask, BacklogStatus, updateTaskStatus } from "./backlog-store.js";
import { getRuntimeVariable } from "./runtime-config.js";

// We track separately whether the CURRENT local status has been pushed to Slack
// using a small jsonb field on the row: slack_last_pushed_status. If the local
// status changed since the last push, we re-push.

let client: ReturnType<typeof neon> | null = null;
function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

async function slackEnabled(): Promise<boolean> {
  const u = await getRuntimeVariable("SLACK_USER_TOKEN");
  const b = await getRuntimeVariable("SLACK_BOT_TOKEN");
  return Boolean(u || b);
}

export type SlackOutboundSummary = {
  enabled: boolean;
  pushed: number;
  updated: number;
  failed: number;
  errors: Array<{ task_id: number; error: string }>;
};

// Push tasks to Slack: create rows for tasks without slack_list_item_id,
// update existing rows for tasks with one. Only tasks with status='pendiente'
// or 'en_progreso' are synced. Closed tasks are not re-pushed.
export async function pushTasksToSlack(maxTasks: number = 50): Promise<SlackOutboundSummary> {
  if (!await slackEnabled()) {
    return { enabled: false, pushed: 0, updated: 0, failed: 0, errors: [] };
  }
  const sql = getSql();
  if (!sql) return { enabled: true, pushed: 0, updated: 0, failed: 0, errors: [] };
  await ensureBacklogSchema();

  // Pull recent open tasks ordered by opportunity score so the highest-value
  // ones reach Slack first (Slack shows in creation order which matters).
  const rows = await sql`
    select id, title, description, priority, status, slack_list_item_id, slack_synced_at::text
    from seo_backlog_tasks
    where status in ('pendiente','en_progreso')
    order by opportunity_score desc nulls last,
      case priority when 'alta' then 1 when 'media' then 2 else 3 end,
      proposed_at desc
    limit ${maxTasks}
  ` as Array<{ id: number; title: string; description: string; priority: BacklogTask["priority"]; status: BacklogStatus; slack_list_item_id: string | null; slack_synced_at: string | null }>;

  let pushed = 0;
  let updated = 0;
  let failed = 0;
  const errors: SlackOutboundSummary["errors"] = [];

  for (const row of rows) {
    try {
      if (!row.slack_list_item_id) {
        const created = await createBacklogItem({ title: row.title, description: row.description, priority: row.priority });
        await sql`update seo_backlog_tasks set slack_list_item_id = ${created.id}, slack_synced_at = now(), slack_last_pushed_status = ${row.status} where id = ${row.id}`;
        pushed++;
      } else {
        await updateBacklogItem(row.slack_list_item_id, { title: row.title, description: row.description, priority: row.priority });
        await sql`update seo_backlog_tasks set slack_synced_at = now(), slack_last_pushed_status = ${row.status} where id = ${row.id}`;
        updated++;
      }
    } catch (error) {
      failed++;
      errors.push({ task_id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { enabled: true, pushed, updated, failed, errors };
}

export type SlackClosedSyncSummary = {
  enabled: boolean;
  marked_completed: number;
  marked_descartada: number;
  failed: number;
  errors: Array<{ task_id: number; error: string }>;
};

// Mark Slack items as completed when the local task moved to ejecutada or
// descartada. Idempotent: only acts on rows where slack_last_pushed_status
// differs from the current local status (or where it's null but the task is
// already closed).
export async function pushClosedTasksToSlack(): Promise<SlackClosedSyncSummary> {
  if (!await slackEnabled()) {
    return { enabled: false, marked_completed: 0, marked_descartada: 0, failed: 0, errors: [] };
  }
  const sql = getSql();
  if (!sql) return { enabled: true, marked_completed: 0, marked_descartada: 0, failed: 0, errors: [] };
  await ensureBacklogSchema();

  const rows = await sql`
    select id, status, slack_list_item_id, title
    from seo_backlog_tasks
    where slack_list_item_id is not null
      and status in ('ejecutada','descartada')
      and (slack_last_pushed_status is null
           or slack_last_pushed_status not in ('ejecutada','descartada'))
    order by closed_at desc nulls last
    limit 100
  ` as Array<{ id: number; status: BacklogStatus; slack_list_item_id: string; title: string }>;

  let executedCount = 0;
  let discardedCount = 0;
  let failed = 0;
  const errors: SlackClosedSyncSummary["errors"] = [];

  for (const row of rows) {
    try {
      // Both ejecutada and descartada → checkbox=true + Estado=Completadas in Slack.
      // For descartada we also prepend the title with a marker so the team can tell.
      const isDiscarded = row.status === "descartada";
      const updates: Parameters<typeof updateBacklogItem>[1] = {
        completed: true,
        estado_option: SLACK_ESTADO_OPTIONS.COMPLETADAS,
      };
      if (isDiscarded && !row.title.startsWith("[DESCARTADA] ")) {
        updates.title = `[DESCARTADA] ${row.title}`;
      }
      await updateBacklogItem(row.slack_list_item_id, updates);
      await sql`update seo_backlog_tasks set slack_synced_at = now(), slack_last_pushed_status = ${row.status} where id = ${row.id}`;
      if (isDiscarded) discardedCount++; else executedCount++;
    } catch (error) {
      failed++;
      errors.push({ task_id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { enabled: true, marked_completed: executedCount, marked_descartada: discardedCount, failed, errors };
}

export type SlackInboundSummary = {
  enabled: boolean;
  scanned_items: number;
  matched_local: number;
  marked_ejecutada: number;
  marked_descartada: number;
  errors: Array<{ slack_id: string; error: string }>;
};

// Read Slack list, sync completion/state changes back to local backlog.
// Rules:
//   - If Slack item has todo_completed=true and local status is open → ejecutada
//   - If Slack item Estado Sprint = Completadas → ejecutada (idempotent)
//   - If Slack item Estado Sprint = (anything else not Backlog SEO Agent) → leave alone
export async function pullSlackToTasks(): Promise<SlackInboundSummary> {
  if (!await slackEnabled()) {
    return { enabled: false, scanned_items: 0, matched_local: 0, marked_ejecutada: 0, marked_descartada: 0, errors: [] };
  }
  const sql = getSql();
  if (!sql) return { enabled: true, scanned_items: 0, matched_local: 0, marked_ejecutada: 0, marked_descartada: 0, errors: [] };
  await ensureBacklogSchema();

  const items = await listBacklogItems();
  let matched = 0;
  let markedDone = 0;
  let markedDiscarded = 0;
  const errors: SlackInboundSummary["errors"] = [];

  for (const item of items) {
    try {
      const fields = itemFieldsByColumn(item);
      const isCompleted = Boolean(fields[SLACK_COLS.COMPLETED]?.checkbox);
      const estadoSelect = fields[SLACK_COLS.ESTADO]?.select ?? [];
      const estado = estadoSelect[0];

      const rows = await sql`select id, status from seo_backlog_tasks where slack_list_item_id = ${item.id} limit 1` as Array<{ id: number; status: BacklogStatus }>;
      if (rows.length === 0) continue;
      matched++;
      const local = rows[0];
      if (local.status === "ejecutada" || local.status === "descartada") continue;

      const movedToCompletadas = estado === SLACK_ESTADO_OPTIONS.COMPLETADAS;
      if (isCompleted || movedToCompletadas) {
        const note = movedToCompletadas
          ? `Marcada como ejecutada via Slack (Estado Sprint -> Completadas)`
          : `Marcada como ejecutada via Slack (todo_completed = true)`;
        await updateTaskStatus(local.id, "ejecutada", `[${new Date().toISOString()}] ${note}`);
        markedDone++;
      }
    } catch (error) {
      errors.push({ slack_id: item.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { enabled: true, scanned_items: items.length, matched_local: matched, marked_ejecutada: markedDone, marked_descartada: markedDiscarded, errors };
}
