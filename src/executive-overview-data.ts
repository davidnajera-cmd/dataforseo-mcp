import { collectSeoDashboardData, normalizeFilters, type DashboardFilters, type SeoDashboardData } from "./dashboard-data.js";
import { collectSocialDashboardData, type SocialDashboardData } from "./social-dashboard-data.js";
import { listExecutiveSnapshots, saveExecutiveSnapshot, type ExecutiveSnapshotPayload } from "./executive-store.js";

type ExecutiveHistoryEntry = {
  snapshot_date: string;
  generated_at: string;
  anomaly_count: number;
  top_titles: string[];
  top_delta: string | null;
};

export type ExecutiveOverviewData = {
  generatedAt: string;
  filters: DashboardFilters;
  seo: SeoDashboardData;
  social: SocialDashboardData;
  anomaly_history: ExecutiveHistoryEntry[];
};

export async function collectExecutiveOverviewData(input: Partial<DashboardFilters>): Promise<ExecutiveOverviewData> {
  const filters = normalizeFilters(input);
  const [seo, social] = await Promise.all([
    collectSeoDashboardData(filters),
    collectSocialDashboardData(filters),
  ]);

  const payload = buildExecutiveSnapshotPayload(seo, social);
  await saveExecutiveSnapshot(filters, payload).catch((error) => {
    console.warn("Could not persist Executive snapshot", error);
  });
  const historyRows = await listExecutiveSnapshots(filters, 10).catch(() => []) as any[];

  return {
    generatedAt: latestGeneratedAt([seo.generatedAt, social.generatedAt]),
    filters,
    seo,
    social,
    anomaly_history: historyRows.map((row: any) => ({
      snapshot_date: row.snapshot_date,
      generated_at: row.generated_at,
      anomaly_count: Array.isArray(row.payload?.anomalies) ? row.payload.anomalies.length : 0,
      top_titles: Array.isArray(row.payload?.anomalies) ? row.payload.anomalies.slice(0, 3).map((item: any) => String(item.title)) : [],
      top_delta: Array.isArray(row.payload?.baselines) ? (row.payload.baselines.find((item: any) => item.tone === "warn" || item.tone === "info")?.delta ?? null) : null,
    })),
  };
}

function buildExecutiveSnapshotPayload(seo: SeoDashboardData, social: SocialDashboardData): ExecutiveSnapshotPayload {
  const baselines = buildBaselineRows(seo, social);
  const anomalies = buildAnomalies(seo, social);
  return {
    generatedAt: latestGeneratedAt([seo.generatedAt, social.generatedAt]),
    baselines,
    anomalies,
  };
}

function buildBaselineRows(seo: SeoDashboardData, social: SocialDashboardData) {
  const seoTrend = toArray(seo.trends).slice(-8);
  const organicNow = seoTrend.at(-1)?.organic ?? null;
  const organicBaseline = average(seoTrend.slice(0, -1).map((item) => item.organic));
  const ctrNow = seoTrend.at(-1)?.ctr ?? null;
  const ctrBaseline = average(seoTrend.slice(0, -1).map((item) => item.ctr));
  const trackedTop10Baseline = toArray(seo.history_summary?.rankings_by_domain).reduce((sum, row) => sum + (Number(row.top10) || 0), 0);
  const trackedTop10Now = Number(seo.keywords?.top10) || 0;
  const cadenceRows = toArray(social.social?.calendar?.cadence);
  const observedCadence = average(cadenceRows.map((row) => row.postsPerWeek));
  const liveCadence = cadenceRows.length ? Math.max(...cadenceRows.map((row) => Number(row.postsPerWeek) || 0)) : 0;
  const responseNow = Number(social.social?.customer_voice?.questionComments || 0) + Number(social.social?.customer_voice?.leadQuestions || 0) + Number(social.social?.customer_voice?.negativeSignals || 0);
  const responseBaseline = Math.max(1, Number(social.social?.customer_voice?.questionComments || 0) + Number(social.social?.customer_voice?.leadQuestions || 0));

  return [
    baselineRow("Organic clicks vs. trailing week", organicNow, organicBaseline),
    baselineRow("CTR vs. trailing week", ctrNow, ctrBaseline, "%"),
    baselineRow("Search breadth vs. tracked history", trackedTop10Now, trackedTop10Baseline),
    baselineRow("Publishing cadence vs. observed pattern", liveCadence, observedCadence, " posts/semana"),
    baselineRow("Community pressure vs. baseline de preguntas", responseNow, responseBaseline),
  ];
}

function buildAnomalies(seo: SeoDashboardData, social: SocialDashboardData) {
  const anomalies: ExecutiveSnapshotPayload["anomalies"] = [];
  const seoTrend = toArray(seo.trends).slice(-8);
  const organicNow = Number(seoTrend.at(-1)?.organic) || 0;
  const organicBaseline = average(seoTrend.slice(0, -1).map((item) => item.organic)) || 0;
  const ctrNow = Number(seoTrend.at(-1)?.ctr) || 0;
  const ctrBaseline = average(seoTrend.slice(0, -1).map((item) => item.ctr)) || 0;
  const topPost = toArray(social.social?.top_posts)[0];
  const topByPlatform = toArray(social.social?.top_posts).reduce<Record<string, number[]>>((acc, post) => {
    const key = String(post.platform || "mixed");
    acc[key] ||= [];
    acc[key].push(Number(post.engagementRate) || 0);
    return acc;
  }, {});
  const platformAverages = Object.entries(topByPlatform).map(([platform, rows]) => ({ platform, avg: average(rows) || 0 })).sort((a, b) => b.avg - a.avg);
  const leader = platformAverages[0];
  const weakest = platformAverages[platformAverages.length - 1];

  if (organicBaseline && organicNow < organicBaseline * 0.72) {
    anomalies.push({
      scope: "SEO",
      severity: "Alta",
      title: "Caída de clics orgánicos frente al baseline reciente",
      reason: `Último corte ${formatValue(organicNow)} vs baseline ${formatValue(organicBaseline)}.`,
      action: "Auditar URLs líderes, mix de queries y caída paralela de CTR.",
    });
  }
  if (ctrBaseline && ctrNow < ctrBaseline * 0.88) {
    anomalies.push({
      scope: "SEO",
      severity: "Media",
      title: "Drift de CTR en el cierre del periodo",
      reason: `CTR ${formatValue(ctrNow, "%")} vs baseline ${formatValue(ctrBaseline, "%")}.`,
      action: "Revisar snippets, páginas líderes y cambio de intención en la demanda.",
    });
  }
  if ((Number(social.social?.scheduled_posts) || 0) === 0 && (Number(social.social?.draft_posts) || 0) === 0) {
    anomalies.push({
      scope: "Social",
      severity: "Alta",
      title: "Pipeline editorial sin cobertura futura",
      reason: "No hay programados ni drafts visibles en este corte.",
      action: "Programar al menos una semana usando el best slot observado.",
    });
  }
  if (leader && weakest && leader.platform !== weakest.platform && leader.avg > weakest.avg * 1.6) {
    anomalies.push({
      scope: "Social",
      severity: "Media",
      title: `Brecha de performance entre ${capitalize(leader.platform)} y ${capitalize(weakest.platform)}`,
      reason: `${capitalize(leader.platform)} está muy por encima en ER media.`,
      action: "Trasladar hooks y formatos del canal líder al más débil.",
    });
  }
  if ((Number(social.social?.customer_voice?.questionComments) || 0) + (Number(social.social?.customer_voice?.leadQuestions) || 0) >= 4) {
    anomalies.push({
      scope: "Community",
      severity: "Media",
      title: "Presión de respuesta por comentarios",
      reason: "Las preguntas y señales de lead ya exigen seguimiento activo.",
      action: "Convertir preguntas repetidas en plantillas y FAQ visibles.",
    });
  }
  if (topPost && topPost.platform === "tiktok" && (Number(topPost.views) || 0) > 20000 && (Number(topPost.engagementRate) || 0) >= 3) {
    anomalies.push({
      scope: "Creative",
      severity: "Oportunidad",
      title: "Top post con señal fuerte para escalar",
      reason: `${capitalize(topPost.platform)} superó ${formatValue(topPost.views)} views con ER ${formatValue(topPost.engagementRate, "%")}.`,
      action: "Derivar remake, respuesta y pieza SEO-support alrededor del mismo tema.",
    });
  }
  return anomalies.slice(0, 6);
}

function baselineRow(label: string, current: number | null, baseline: number | null, suffix = "") {
  return {
    label,
    current: formatValue(current, suffix),
    baseline: formatValue(baseline, suffix),
    delta: formatDelta(current, baseline),
    tone: toneForDelta(current, baseline),
  };
}

function average(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function formatValue(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Sin datos";
  const formatted = new Intl.NumberFormat("es-CO", { maximumFractionDigits: suffix === "%" ? 1 : 0 }).format(value);
  return `${formatted}${suffix}`;
}

function formatDelta(current: number | null | undefined, baseline: number | null | undefined) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || !baseline) return "Sin baseline";
  const delta = (((current as number) - (baseline as number)) / Math.abs(baseline as number)) * 100;
  const formatted = new Intl.NumberFormat("es-CO", { maximumFractionDigits: Math.abs(delta) >= 10 ? 0 : 1 }).format(Math.abs(delta));
  return `${delta >= 0 ? "+" : "-"}${formatted}% vs base`;
}

function toneForDelta(current: number | null | undefined, baseline: number | null | undefined) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || !baseline) return "neutral";
  const delta = (((current as number) - (baseline as number)) / Math.abs(baseline as number)) * 100;
  if (delta <= -12) return "warn";
  if (delta >= 12) return "info";
  return "neutral";
}

function latestGeneratedAt(values: string[]) {
  const timestamps = values
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
