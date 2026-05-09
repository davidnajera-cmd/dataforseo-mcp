import { getRuntimeVariable } from "./runtime-config.js";

const BASE = "https://slack.com/api";

// Schema column IDs of the "Sprint de Marketing" list (F0A0U27CYSX).
// If the list schema ever changes these need to be re-discovered via files.info.
export const SLACK_COLS = {
  NAME: "Col0A1DB58XUH",         // text
  COMPLETED: "Col00",            // checkbox (todo_completed)
  ASSIGNEE: "Col01",             // user (todo_assignee)
  ESTADO: "Col0A0K0ZS079",       // select (Estado Sprint)
  PRIORIDAD: "Col0A0X2FGKE1",    // rating
  DESCRIPCION: "Col0A10FFEU7L",  // text
} as const;

export const SLACK_ESTADO_OPTIONS = {
  BACKLOG_SEO_AGENT: "OptL5NJTUJB",
  COMPLETADAS: "Opt9UWNHWNO",
  INCOMPLETAS: "Opt6INRQ41Q",
  BACKLOG_GENERAL: "Opt45BCL9NV",
} as const;

async function token(): Promise<string> {
  // Prefer user token (more permissions for slackLists.*); fall back to bot.
  const u = await getRuntimeVariable("SLACK_USER_TOKEN");
  if (u) return u;
  const b = await getRuntimeVariable("SLACK_BOT_TOKEN");
  if (b) return b;
  throw new Error("SLACK_USER_TOKEN or SLACK_BOT_TOKEN required");
}

async function listId(): Promise<string> {
  return (await getRuntimeVariable("SLACK_LIST_ID")) ?? "F0A0U27CYSX";
}

async function backlogOptionId(): Promise<string> {
  return (await getRuntimeVariable("SLACK_BACKLOG_OPTION_ID")) ?? "OptL5NJTUJB";
}

async function slackPost<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { ok?: boolean; error?: string; response_metadata?: unknown } & T;
  if (!data.ok) {
    throw new Error(`Slack ${method} failed: ${data.error ?? "unknown"} ${JSON.stringify(data.response_metadata ?? {})}`);
  }
  return data;
}

async function slackGet<T = unknown>(method: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${await token()}` } });
  const data = await res.json() as { ok?: boolean; error?: string } & T;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error ?? "unknown"}`);
  return data;
}

function richText(text: string) {
  return [{
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  }];
}

export type SlackListItem = {
  id: string;
  list_id: string;
  fields: Array<{ key: string; value?: unknown; text?: string; checkbox?: boolean; select?: string[]; column_id: string }>;
  date_created: number;
};

export async function createBacklogItem(input: { title: string; description: string; priority?: "alta" | "media" | "baja" }): Promise<{ id: string }> {
  const list_id = await listId();
  const estado_option = await backlogOptionId();
  const initial_fields: Array<Record<string, unknown>> = [
    { column_id: SLACK_COLS.NAME, rich_text: richText(input.title.slice(0, 200)) },
    { column_id: SLACK_COLS.ESTADO, select: [estado_option] },
    { column_id: SLACK_COLS.DESCRIPCION, rich_text: richText(input.description.slice(0, 1500)) },
  ];
  if (input.priority) {
    const ratingByPriority = { alta: 5, media: 3, baja: 1 } as const;
    initial_fields.push({ column_id: SLACK_COLS.PRIORIDAD, rating: [ratingByPriority[input.priority]] });
  }
  const result = await slackPost<{ item: { id: string } }>("slackLists.items.create", { list_id, initial_fields });
  return { id: result.item.id };
}

export async function updateBacklogItem(rowId: string, input: { title?: string; description?: string; priority?: "alta" | "media" | "baja"; completed?: boolean; estado_option?: string }): Promise<void> {
  const list_id = await listId();
  const cells: Array<Record<string, unknown>> = [];
  if (input.title !== undefined) cells.push({ row_id: rowId, column_id: SLACK_COLS.NAME, rich_text: richText(input.title.slice(0, 200)) });
  if (input.description !== undefined) cells.push({ row_id: rowId, column_id: SLACK_COLS.DESCRIPCION, rich_text: richText(input.description.slice(0, 1500)) });
  if (input.priority !== undefined) {
    const ratingByPriority = { alta: 5, media: 3, baja: 1 } as const;
    cells.push({ row_id: rowId, column_id: SLACK_COLS.PRIORIDAD, rating: [ratingByPriority[input.priority]] });
  }
  if (input.completed !== undefined) cells.push({ row_id: rowId, column_id: SLACK_COLS.COMPLETED, checkbox: input.completed });
  if (input.estado_option) cells.push({ row_id: rowId, column_id: SLACK_COLS.ESTADO, select: [input.estado_option] });
  if (cells.length === 0) return;
  await slackPost("slackLists.items.update", { list_id, cells });
}

export async function deleteBacklogItem(rowId: string): Promise<void> {
  const list_id = await listId();
  await slackPost("slackLists.items.delete", { list_id, id: rowId });
}

export async function listBacklogItems(): Promise<SlackListItem[]> {
  const list_id = await listId();
  const all: SlackListItem[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const params: Record<string, string> = { list_id, limit: "100" };
    if (cursor) params.cursor = cursor;
    const res = await slackGet<{ items: SlackListItem[]; response_metadata?: { next_cursor?: string } }>("slackLists.items.list", params);
    all.push(...(res.items ?? []));
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return all;
}

// Convert a SlackListItem field array into a key/value map keyed by column_id.
export function itemFieldsByColumn(item: SlackListItem): Record<string, { text?: string; checkbox?: boolean; select?: string[]; user?: string[]; value?: unknown }> {
  const out: Record<string, { text?: string; checkbox?: boolean; select?: string[]; user?: string[]; value?: unknown }> = {};
  for (const f of item.fields ?? []) {
    out[f.column_id] = {
      text: (f as { text?: string }).text,
      checkbox: (f as { checkbox?: boolean }).checkbox,
      select: (f as { select?: string[] }).select,
      user: (f as { user?: string[] }).user,
      value: f.value,
    };
  }
  return out;
}
