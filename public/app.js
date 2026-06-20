const state = {
  module: "seo",
  view: "overview",
  data: null,
  socialData: null,
  executiveData: null,
  requestCounter: 0,
};

const modules = {
  executive: {
    eyebrow: "Executive Overview",
    defaultView: "executive_overview",
    views: {
      executive_overview: "Executive Overview",
    },
  },
  seo: {
    eyebrow: "Modulo SEO",
    defaultView: "overview",
    views: {
      overview: "Overview SEO",
      backlog: "Backlog SEO",
      monthly: "Dashboard Mensual",
      weekly: "Dashboard Semanal",
      content: "Contenido",
      keywords: "Keywords",
      ai: "Visibilidad AI",
      backlinks: "Backlinks",
      leads: "Leads / Conversiones",
      technical: "Salud Tecnica",
      comparison: "CO vs MX vs LTA",
      business: "Insights de Negocio",
      variables: "Variables",
    },
  },
  social: {
    eyebrow: "Modulo Redes Sociales",
    defaultView: "social_overview",
    views: {
      social_overview: "Radar social",
      social_local: "Presencia local",
      social_accounts: "Canales y activos",
      social_publishing: "Pipeline editorial",
      social_instagram: "Instagram intelligence",
      social_tiktok: "TikTok intelligence",
      variables: "Variables",
    },
  },
};

const SITE_LABELS = {
  "dnamusic.edu.co": "Colombia",
  "dnamusic.mx": "Mexico",
  "latiendadeaudio.com": "La Tienda de Audio",
};

function siteLabel(domain) {
  return SITE_LABELS[domain] ?? domain;
}

function normalizeLandingLabel(value) {
  if (value === null || value === undefined || value === "") return "(directo / sin landing)";
  return String(value);
}

function isLandingPlaceholder(value) {
  return value === null || value === undefined || value === "" || value === "/" || value === "(directo / sin landing)";
}

function getTrafficReality(data) {
  const summary = data?.ga4?.reality ?? null;
  const primary = summary?.by_domain?.[0] ?? null;
  return {
    acquisition: summary?.acquisition_sessions ?? null,
    organicAcquisition: summary?.organic_acquisition_sessions ?? null,
    operational: summary?.operational_sessions ?? null,
    propertyId: primary?.property_id ?? null,
    hostFilter: primary?.host_filter ?? null,
    topAcquisitionPage: normalizeLandingLabel(primary?.top_acquisition_pages?.[0] ?? null),
    topPortalPage: normalizeLandingLabel(primary?.top_operational_pages?.[0] ?? null),
    note: primary?.note ?? null,
  };
}

function buildTrafficRealitySummary(data) {
  const traffic = getTrafficReality(data);
  if (!isFiniteNumber(traffic.acquisition) && !isFiniteNumber(traffic.operational)) {
    return "La lectura de tráfico útil todavía no está disponible.";
  }
  if ((traffic.operational ?? 0) > 0) {
    return `GA4 ya separa ${displayValue(traffic.acquisition)} sesiones de adquisición y ${displayValue(traffic.operational)} operativas de Portal / Q10 en la propiedad ${traffic.propertyId || "activa"}.`;
  }
  return `GA4 solo muestra tráfico de adquisición en el host filtrado ${traffic.hostFilter || "principal"}.`;
}

function parseLocaleNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const normalized = value
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const shell = document.querySelector(".shell");
shell.dataset.module = state.module;
const filters = document.querySelector("#filters");
const navItems = [...document.querySelectorAll(".nav-item")];
const moduleTabs = [...document.querySelectorAll(".module-tab")];
const navGroups = [...document.querySelectorAll("[data-nav-module]")];

document.querySelector("#sidebarToggle").addEventListener("click", () => {
  shell.dataset.sidebar = shell.dataset.sidebar === "closed" ? "open" : "closed";
});

navItems.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.module !== state.module) setModule(button.dataset.module, { skipDefaultView: true });
    setView(button.dataset.view);
  });
});

moduleTabs.forEach((button) => {
  button.addEventListener("click", () => {
    setModule(button.dataset.module);
  });
});

document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewShortcut));
});

filters.addEventListener("change", () => {
  if (state.module === "executive") loadExecutiveOverview();
  else if (state.module === "social" && state.view !== "variables") loadSocialDashboard();
  else if (state.view !== "variables" && state.view !== "backlog") loadDashboard();
});
document.querySelector("#refreshVariables")?.addEventListener("click", () => loadVariables());
document.querySelector("#adminToken")?.addEventListener("change", (event) => {
  localStorage.setItem("seoVariablesAdminToken", event.target.value);
});

function setModule(module, options = {}) {
  const { skipDefaultView = false } = options;
  state.module = module;
  shell.dataset.module = module;
  moduleTabs.forEach((button) => {
    const active = button.dataset.module === module;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  navGroups.forEach((group) => group.classList.toggle("hidden", group.dataset.navModule !== module));
  document.querySelector("#moduleEyebrow").textContent = modules[module].eyebrow;
  if (!skipDefaultView) setView(modules[module].defaultView);
}

function createRequestToken() {
  state.requestCounter += 1;
  return {
    id: state.requestCounter,
    module: state.module,
    view: state.view,
  };
}

function isRequestCurrent(token) {
  return token.id === state.requestCounter
    && token.module === state.module
    && token.view === state.view;
}

function setView(view) {
  state.view = view;
  document.querySelector("#pageTitle").textContent = modules[state.module].views[view];
  navItems.forEach((button) => button.classList.toggle("is-active", button.dataset.module === state.module && button.dataset.view === view));
  if (state.module === "executive") {
    loadExecutiveOverview();
    return;
  }
  if (state.module === "social") {
    if (view === "variables") {
      updateSectionVisibility();
      loadVariables();
      return;
    }
    loadSocialDashboard();
    return;
  }
  if (view === "weekly") {
    filters.elements.timeframe.value = "weekly";
    loadDashboard();
  } else if (view === "monthly") {
    filters.elements.timeframe.value = "monthly";
    loadDashboard();
  } else {
    updateSectionVisibility();
    if (view === "variables") loadVariables();
    if (view === "backlog") loadBacklog();
    if (view !== "variables" && view !== "backlog") loadDashboard();
  }
}

async function loadDashboard() {
  const params = new URLSearchParams(new FormData(filters));
  const requestToken = createRequestToken();
  setLoading(true);
  try {
    const response = await fetch(`/api/seo-dashboard?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const nextData = await response.json();
    if (!isRequestCurrent(requestToken)) return;
    state.data = nextData;
    render(state.data);
  } catch (error) {
    if (!isRequestCurrent(requestToken)) return;
    document.querySelector("#summary").textContent = `No se pudo cargar el tablero: ${error.message}`;
  } finally {
    if (isRequestCurrent(requestToken)) setLoading(false);
  }
}

async function loadSocialDashboard() {
  const params = new URLSearchParams(new FormData(filters));
  const requestToken = createRequestToken();
  setLoading(true);
  try {
    const response = await fetch(`/api/social-dashboard?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const nextData = await response.json();
    if (!isRequestCurrent(requestToken)) return;
    state.socialData = nextData;
    renderSocialDashboard(state.socialData);
  } catch (error) {
    if (!isRequestCurrent(requestToken)) return;
    document.querySelector("#summary").textContent = `No se pudo cargar el submódulo social: ${error.message}`;
  } finally {
    if (isRequestCurrent(requestToken)) setLoading(false);
  }
}

async function loadExecutiveOverview() {
  const params = new URLSearchParams(new FormData(filters));
  const requestToken = createRequestToken();
  setLoading(true);
  try {
    const response = await fetch(`/api/executive-overview?${params}`);
    if (!response.ok) throw new Error(`Executive HTTP ${response.status}`);
    const bundle = await response.json();
    if (!isRequestCurrent(requestToken)) return;
    state.data = bundle.seo;
    state.socialData = bundle.social;
    state.executiveData = bundle;
    renderExecutiveOverview(state.executiveData);
  } catch (error) {
    if (!isRequestCurrent(requestToken)) return;
    document.querySelector("#summary").textContent = `No se pudo cargar el executive overview: ${error.message}`;
  } finally {
    if (isRequestCurrent(requestToken)) setLoading(false);
  }
}

function setLoading(isLoading) {
  document.querySelector("#freshness").textContent = isLoading ? "Sincronizando" : "Actualizado";
}

function render(data) {
  document.querySelector("#verdict").textContent = data.overview.verdict;
  document.querySelector("#summary").textContent = data.overview.summary;
  document.querySelector("#freshness").textContent = formatFreshness(data.generatedAt);
  renderSources(data.sources);
  renderMetrics(data.overview.metrics);
  renderSeoExecutiveLayer(data);
  renderSeoInsightLayer(data);
  renderTrend(data.trends);
  renderKeywords(data.keywords);
  renderContent(data.content);
  renderPages(data.content.topPages);
  renderTechnical(data.technical, data.sources);
  renderLeads(data.business.channels, data.ga4);
  renderComparison(data.comparison);
  renderOpportunities(data.business.opportunities);
  renderAiVisibility(data.ai_visibility);
  renderBacklinks(data.backlinks);
  renderHistory(data.history_summary);
  updateSectionVisibility();
}

function renderExecutiveOverview(bundle) {
  const seo = bundle.seo;
  const social = bundle.social;
  const intel = deriveSocialIntelligence(social.social);
  const generatedAt = latestGeneratedAt([seo.generatedAt, social.generatedAt]);
  const combined = buildExecutiveOverviewModel(seo, social, intel);
  document.querySelector("#verdict").textContent = combined.verdict;
  document.querySelector("#summary").textContent = combined.summary;
  document.querySelector("#freshness").textContent = formatFreshness(generatedAt);
  renderSources(combined.sources);
  renderMetrics(combined.metrics);
  renderCommandDeck(combined.deck);
  renderSignalRail(combined.signals);
  renderInsightMatrix(combined.insights);
  renderBenchmarkBoard(combined.benchmarks);
  renderExecutiveNarrativePanel(combined);
  renderExecutiveSnapshots(seo, social, intel);
  renderExecutiveTrendBlend(seo, social, intel);
  renderExecutiveOpportunityBoard(seo, social, intel);
  renderExecutiveSourceBoard(combined.sources);
  renderExecutiveBaselineBoard(seo, social, intel);
  renderExecutiveAnomalyBoard(seo, social, intel);
  renderExecutiveAnomalyHistory(bundle.anomaly_history);
  updateSectionVisibility();
}

function renderSocialDashboard(data) {
  const platformFilter = state.view === "social_instagram"
    ? "instagram"
    : state.view === "social_tiktok"
      ? "tiktok"
      : null;
  const intel = deriveSocialIntelligence(data.social, platformFilter);
  document.querySelector("#verdict").textContent = data.overview.verdict;
  document.querySelector("#summary").textContent = data.overview.summary;
  document.querySelector("#freshness").textContent = formatFreshness(data.generatedAt);
  renderSources(data.sources);
  renderMetrics(data.overview.metrics);
  renderSocialExecutiveLayer(data, intel, platformFilter);
  renderSocialInsightLayer(data, intel, platformFilter);
  renderSocialExecutiveSummary(intel, data.social.note);
  renderSocialTrendChart(intel, data.social.note);
  renderSocialPlatformBoard(intel, data.social.note);
  renderSocialPipeline(intel, data.social.note);
  renderSocialActionCenter(intel, data.social.note);
  renderSocialSummary(data.social, intel);
  renderSocialAccounts(data.social.accounts, data.social.note, platformFilter);
  renderSocialPosts(data.social.posts, data.social.note, platformFilter);
  renderSocialPublishingHealth(data.social, intel);
  renderSocialPlatformSpotlight("instagramSpotlight", "instagram", data.social, intel);
  renderSocialPlatformSpotlight("tiktokSpotlight", "tiktok", data.social, intel);
  renderSocialVoice(data.social.customer_voice, data.social.note, platformFilter);
  renderSocialAlerts(data.social.reputation_alerts, data.social.note, platformFilter);
  renderSocialTopPosts(data.social.top_posts, data.social.note, platformFilter);
  renderSocialCalendar(data.social.calendar, data.social.note, platformFilter);
  renderSocialLocalExecutive(data.social.local_presence);
  renderSocialLocalLocations(data.social.local_presence);
  renderSocialLocalReviews(data.social.local_presence);
  renderSocialLocalKeywords(data.social.local_presence);
  updateSectionVisibility();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderSources(sources) {
  document.querySelector("#sourceDots").innerHTML = sources.map((source) => (
    `<span class="source-dot ${source.status}" title="${source.name}: ${source.message}"></span>`
  )).join("");
}

function renderSeoExecutiveLayer(data) {
  const traffic = getTrafficReality(data);
  const deck = [
    {
      kicker: "Search Pulse",
      title: "Visibilidad orgánica en control",
      value: `${displayValue(data.overview.metrics?.[0]?.value ?? null)}`,
      body: buildSeoExecutiveNarrative(data),
      tone: "primary",
      meta: [
        { label: "Top 10 activas", value: displayValue(data.keywords?.top10), note: displayValue(data.keywords?.top3) + " en Top 3" },
        { label: "Landing de adquisición", value: stripUrl(traffic.topAcquisitionPage) || "Sin líder claro", note: `${displayValue(traffic.acquisition)} sesiones útiles` },
      ],
    },
    {
      kicker: "AI + Authority",
      title: "Cobertura de presencia",
      value: `${displayValue(data.ai_visibility?.by_domain?.[0]?.google_mentions)}`,
      body: data.ai_visibility?.note || "Sin señal AI todavía.",
      meta: [
        { label: "Referring domains", value: displayValue(data.backlinks?.by_domain?.[0]?.referring_domains), note: "Backlinks vivos" },
      ],
    },
    {
      kicker: "Technical Posture",
      title: "Salud técnica",
      value: displayValue(data.technical?.score),
      body: `LCP ${data.technical?.lcp ?? "Sin datos"} · CLS ${data.technical?.cls ?? "Sin datos"} · velocidad ${data.technical?.speed ?? "Sin datos"}.`,
      meta: [
        { label: "UX incidents", value: [data.technical?.deadClicks, data.technical?.rageClicks].every((v) => v === null) ? "Monitoreo parcial" : `${displayValue(data.technical?.deadClicks)} dead · ${displayValue(data.technical?.rageClicks)} rage`, note: "Clarity + PageSpeed" },
      ],
    },
    {
      kicker: "Decision Queue",
      title: "Siguiente foco",
      body: data.business?.opportunities?.[0]?.action || "Sin prioridad crítica detectada.",
      meta: [
        { label: "Insight", value: data.business?.opportunities?.[0]?.title || "Mantener seguimiento", note: data.business?.opportunities?.[0]?.priority || "Baja" },
      ],
    },
    {
      kicker: "Source Health",
      title: "Estado de fuentes",
      body: "Lectura operativa del stack de datos que alimenta este tablero.",
      wide: true,
      sourceRows: (data.sources || []).map((source) => ({
        label: source.name,
        value: source.status,
        note: source.message,
      })),
    },
  ];
  renderCommandDeck(deck);
  renderSignalRail([
    { kicker: "Organic", title: "CTR promedio", value: data.overview.metrics?.[3]?.value ?? "Sin datos", note: data.overview.metrics?.[3]?.detail ?? "", status: "live" },
    { kicker: "Traffic", title: "Adquisición web", value: displayValue(traffic.acquisition), note: `${displayValue(traffic.operational)} portal/Q10 separados`, status: "live" },
    { kicker: "AI", title: "LLM visibility", value: displayValue(data.ai_visibility?.by_domain?.[0]?.google_mentions), note: data.ai_visibility?.note ?? "", status: data.ai_visibility?.has_data ? "live" : "pending" },
    { kicker: "Risk", title: "Technical score", value: displayValue(data.technical?.score), note: data.sources?.find((item) => item.name === "Microsoft Clarity")?.message || "Sin alertas críticas", status: normalizeSignalStatus(data.sources?.find((item) => item.name === "Microsoft Clarity")?.status || "live") },
  ]);
}

function renderSocialExecutiveLayer(data, intel, platformFilter) {
  const leadPlatform = intel.platforms?.[0];
  const topPost = (platformFilter
    ? toArray(data.social?.top_posts).filter((post) => post.platform === platformFilter)
    : toArray(data.social?.top_posts))[0];
  const deck = [
    {
      kicker: "Audience Command",
      title: platformFilter ? `${capitalize(platformFilter)} en foco` : "Radar social multi-plataforma",
      value: displayValue(intel.audience?.totalFollowers),
      body: buildSocialExecutiveNarrative(data.social, intel, leadPlatform, platformFilter),
      tone: "primary",
      meta: [
        { label: "Canal líder", value: leadPlatform ? capitalize(leadPlatform.platform) : "Sin líder", note: leadPlatform ? `${displayValue(leadPlatform.followers)} seguidores` : "Sin datos" },
        { label: "Readiness", value: displayValue(intel.operations?.publishReadyRate, "%"), note: `${displayValue(intel.operations?.analyticsCoverage, "%")} analytics coverage` },
      ],
    },
    {
      kicker: "Content Momentum",
      title: "Rendimiento creativo",
      value: displayValue(intel.performance?.avgEngagementRate, "%"),
      body: topPost?.content ? `Top post actual: ${topPost.content.slice(0, 130)}.` : "Sin top post claro todavía.",
      meta: [
        { label: "Posts analizados", value: displayValue(intel.performance?.postsAnalyzed), note: `${displayValue(intel.performance?.avgReach)} reach medio` },
      ],
    },
    {
      kicker: "Community Pressure",
      title: "Lectura de audiencia",
      value: displayValue(intel.community?.responsePressure),
      body: `${displayValue(intel.community?.leadSignals)} señales de lead y ${displayValue(intel.community?.riskAlerts)} alertas reputacionales activas.`,
      meta: [
        { label: "Comentarios", value: displayValue(data.social?.customer_voice?.commentsAnalyzed), note: `${displayValue(data.social?.customer_voice?.questionComments)} preguntas detectadas` },
      ],
    },
    {
      kicker: "Publishing Ops",
      title: "Cobertura editorial",
      value: displayValue(intel.pipeline?.scheduleCoverage, "%"),
      body: data.social?.calendar?.recommendation || data.social?.note || "Sin recomendación editorial todavía.",
      meta: [
        { label: "Programados", value: displayValue(intel.pipeline?.scheduled), note: `${displayValue(intel.pipeline?.drafts)} drafts` },
      ],
    },
    {
      kicker: "Source Health",
      title: "Conectividad social",
      body: data.social?.note || "Sin lectura operativa todavía.",
      wide: true,
      sourceRows: [
        { label: "Cuentas conectadas", value: displayValue(data.social?.connected_accounts), note: `${displayValue(data.social?.publish_ready_accounts)} listas para publicar` },
        { label: "Analytics activos", value: displayValue(data.social?.analytics_ready_accounts), note: `${displayValue(data.social?.published_posts)} posts publicados` },
        ...toArray(data.sources).map((source) => ({ label: source.name, value: source.status, note: source.message })),
      ],
    },
  ];
  renderCommandDeck(deck);
  renderSignalRail([
    { kicker: "Leader", title: "Canal dominante", value: leadPlatform ? capitalize(leadPlatform.platform) : "Sin datos", note: leadPlatform?.takeaway || "Sin lectura líder", status: "live" },
    { kicker: "Audience", title: "Followers", value: displayValue(intel.audience?.totalFollowers), note: `${displayValue(intel.audience?.activePlatforms)} plataformas activas`, status: "live" },
    { kicker: "Community", title: "Lead signals", value: displayValue(intel.community?.leadSignals), note: `${displayValue(intel.community?.riskAlerts)} alertas`, status: intel.community?.riskAlerts > 0 ? "pending" : "live" },
    { kicker: "Calendar", title: "Best slot", value: formatBestSlot(data.social?.calendar?.bestSlots?.[0]), note: data.social?.calendar?.recommendation || "", status: "live" },
  ]);
}

function renderCommandDeck(cards) {
  const target = document.querySelector("#executiveDeck");
  if (!target) return;
  target.innerHTML = toArray(cards).map((card) => `
    <article class="command-card ${card.tone || ""} ${card.wide ? "wide" : ""}">
      <header>
        <div>
          <span class="command-card-kicker">${esc(card.kicker || "")}</span>
          <h3>${esc(card.title || "")}</h3>
        </div>
        ${card.value ? `<strong class="command-value">${esc(card.value)}</strong>` : ""}
      </header>
      ${card.body ? `<p>${esc(card.body)}</p>` : ""}
      ${card.meta?.length ? `<div class="command-meta">${card.meta.map((row) => `
        <div class="command-meta-row">
          <span>${esc(row.label)}</span>
          <span><strong>${esc(row.value)}</strong>${row.note ? ` <small>${esc(row.note)}</small>` : ""}</span>
        </div>
      `).join("")}</div>` : ""}
      ${card.sourceRows?.length ? `<div class="source-health-list">${card.sourceRows.map((row) => `
        <div class="source-health-row">
          <span>${esc(row.label)}</span>
          <span><strong>${esc(row.value)}</strong>${row.note ? ` <small>${esc(row.note)}</small>` : ""}</span>
        </div>
      `).join("")}</div>` : ""}
    </article>
  `).join("");
}

function renderSignalRail(items) {
  const target = document.querySelector("#signalRail");
  if (!target) return;
  target.innerHTML = toArray(items).map((item) => `
    <article class="signal-card">
      <header>
        <div>
          <span class="signal-card-kicker">${esc(item.kicker || "")}</span>
          <h3>${esc(item.title || "")}</h3>
        </div>
        <span class="status-chip ${esc(normalizeSignalStatus(item.status || "live"))}">${esc(normalizeSignalStatus(item.status || "live"))}</span>
      </header>
      <strong class="signal-value">${esc(item.value || "Sin datos")}</strong>
      <p>${esc(item.note || "")}</p>
    </article>
  `).join("");
}

function renderSeoInsightLayer(data) {
  renderInsightMatrix(buildSeoInsightCards(data));
  renderBenchmarkBoard(buildSeoBenchmarkRows(data));
}

function renderSocialInsightLayer(data, intel, platformFilter) {
  renderInsightMatrix(buildSocialInsightCards(data.social, intel, platformFilter));
  renderBenchmarkBoard(buildSocialBenchmarkRows(data.social, intel, platformFilter));
}

function renderInsightMatrix(cards) {
  const target = document.querySelector("#insightMatrix");
  if (!target) return;
  target.innerHTML = toArray(cards).map((card) => `
    <article class="insight-card ${esc(card.tone || "neutral")}">
      <header>
        <div>
          <span class="insight-kicker">${esc(card.kicker || "")}</span>
          <h3>${esc(card.title || "")}</h3>
        </div>
        <span class="insight-priority ${esc(card.priorityTone || "live")}">${esc(card.priority || "Monitor")}</span>
      </header>
      ${card.value ? `<strong class="insight-value">${esc(card.value)}</strong>` : ""}
      <p>${esc(card.body || "")}</p>
      ${card.meta ? `<small>${esc(card.meta)}</small>` : ""}
    </article>
  `).join("");
}

function renderBenchmarkBoard(rows) {
  const target = document.querySelector("#benchmarkBoard");
  if (!target) return;
  target.innerHTML = `
    <div class="benchmark-head">
      <div>
        <span>Operating benchmark</span>
        <h3>Lectura comparativa del sistema</h3>
      </div>
      <small>Normaliza cobertura, riesgo y capacidad operativa para priorizar mejor.</small>
    </div>
    <div class="benchmark-grid">
      ${toArray(rows).map((row) => `
        <article class="benchmark-card">
          <header>
            <div>
              <span class="benchmark-kicker">${esc(row.kicker || "")}</span>
              <h4>${esc(row.label || "")}</h4>
            </div>
            <strong>${esc(row.scoreLabel || "Sin datos")}</strong>
          </header>
          <div class="benchmark-bar">
            <span class="${esc(row.tone || "neutral")}" style="width:${Math.max(6, Math.min(100, Number(row.score) || 0))}%"></span>
          </div>
          <p>${esc(row.note || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function buildExecutiveOverviewModel(seo, social, intel) {
  const traffic = getTrafficReality(seo);
  const seoClicks = parseLocaleNumber(seo.overview?.metrics?.[0]?.value);
  const socialFollowers = Number(intel.audience?.totalFollowers) || 0;
  const socialLeads = Number(intel.community?.leadSignals) || 0;
  const seoTop10 = Number(seo.keywords?.top10) || 0;
  const seoTechnical = Number(seo.technical?.score) || 0;
  const socialReadiness = Number(intel.operations?.publishReadyRate) || 0;
  const socialPerformance = Number(intel.performance?.avgEngagementRate) || 0;
  const opportunity = seo.business?.opportunities?.[0];
  const topPlatform = intel.platforms?.[0];
  const combinedSources = dedupeSources([...toArray(seo.sources), ...toArray(social.sources)]);
  const liveSources = combinedSources.filter((item) => item.status === "live").length;
  const metricBlend = Math.min(100, Math.round((Math.min(seoTop10, 40) * 1.4) + (Math.min(socialPerformance, 10) * 4)));
  const demandBlend = Math.min(100, Math.round((Math.min(seoClicks, 10000) / 10000) * 50 + (Math.min(socialFollowers, 100000) / 100000) * 50));
  const riskScore = Math.max(0, 100 - Math.min(100, (toArray(social.social?.reputation_alerts).length * 14) + (seoTechnical < 80 ? 22 : 0)));
  return {
    verdict: "Executive signal en vivo",
    summary: `${buildTrafficRealitySummary(seo)} Lectura unificada de demanda, comunidad, operación y riesgo para priorizar mejor SEO y Social desde una sola superficie.`,
    metrics: [
      { label: "Search demand", value: displayValue(seoClicks), delta: seo.overview?.metrics?.[0]?.delta ?? 0, detail: `${displayValue(seoTop10)} keywords Top 10`, source: "Search Console" },
      { label: "Audience base", value: displayValue(socialFollowers), delta: 0, detail: `${displayValue(intel.audience?.activePlatforms)} plataformas activas`, source: "Zernio" },
      { label: "Commercial signals", value: displayValue(socialLeads), delta: 0, detail: `${displayValue(toArray(social.social?.reputation_alerts).length)} alertas reputacionales`, source: "Comments + Zernio" },
      { label: "Execution readiness", value: displayValue(Math.round((seoTechnical + socialReadiness) / 2)), delta: 0, detail: `${displayValue(seoTechnical)} technical · ${displayValue(socialReadiness, "%")} social`, source: "PageSpeed + Zernio" },
    ],
    deck: [
      {
        kicker: "Command",
        title: "Demanda + comunidad",
        value: displayValue(demandBlend, "%"),
        body: `${displayValue(seoClicks)} clics orgánicos y ${displayValue(socialFollowers)} seguidores activos ya permiten operar el sistema como un frente integrado. Además, GA4 ya distingue ${displayValue(traffic.acquisition)} sesiones de adquisición frente a ${displayValue(traffic.operational)} operativas del portal.`,
        tone: "primary",
        meta: [
          { label: "Canal líder", value: topPlatform ? capitalize(topPlatform.platform) : "Sin líder", note: topPlatform ? `${displayValue(topPlatform.followers)} followers` : "Sin datos" },
          { label: "Search posture", value: displayValue(seoTop10), note: `${displayValue(traffic.organicAcquisition)} orgánicas útiles` },
        ],
      },
      {
        kicker: "Revenue pressure",
        title: "Señales comerciales",
        value: displayValue(socialLeads),
        body: `${displayValue(intel.community?.responsePressure)} fricciones/preguntas activas están entrando por comunidad, así que Social ya opera como superficie de captura y contención.`,
        meta: [
          { label: "Opportunity", value: opportunity?.title || "Mantener seguimiento", note: opportunity?.priority || "Baja" },
        ],
      },
      {
        kicker: "Ops health",
        title: "Capacidad de ejecución",
        value: displayValue(Math.round((seoTechnical + socialReadiness) / 2)),
        body: `La base técnica SEO marca ${displayValue(seoTechnical)} y la readiness social ${displayValue(socialReadiness, "%")}. Esto define cuánto puede acelerar el sistema sin perder calidad.`,
        meta: [
          { label: "Social readiness", value: displayValue(socialReadiness, "%"), note: `${displayValue(intel.operations?.accountsReady)} cuentas listas` },
        ],
      },
      {
        kicker: "Source health",
        title: "Cobertura de medición",
        value: `${liveSources}/${combinedSources.length}`,
        body: "La lectura ejecutiva depende de mantener vivo el stack de fuentes, no solo de mirar números bonitos.",
        wide: true,
        sourceRows: combinedSources.map((source) => ({ label: source.name, value: source.status, note: source.message })),
      },
    ],
    signals: [
      { kicker: "SEO", title: "Search pulse", value: displayValue(seoClicks), note: `${displayValue(seoTop10)} Top 10 activas`, status: "live" },
      { kicker: "Social", title: "Audience pulse", value: displayValue(socialFollowers), note: topPlatform ? `${capitalize(topPlatform.platform)} lidera` : "Sin líder claro", status: "live" },
      { kicker: "Ops", title: "Execution blend", value: displayValue(Math.round((seoTechnical + socialReadiness) / 2)), note: "Promedio entre técnica y publishing readiness", status: seoTechnical < 80 || socialReadiness < 70 ? "pending" : "live" },
      { kicker: "Risk", title: "Risk floor", value: displayValue(riskScore, "%"), note: `${displayValue(toArray(social.social?.reputation_alerts).length)} alertas sociales · score técnico ${displayValue(seoTechnical)}`, status: riskScore < 60 ? "pending" : "live" },
    ],
    insights: [
      { kicker: "Now", title: "Dónde está la tracción", value: topPlatform ? capitalize(topPlatform.platform) : "SEO", body: topPlatform ? `${capitalize(topPlatform.platform)} concentra la mayor base de audiencia, mientras SEO sigue capturando intención activa con ${displayValue(seoClicks)} clics.` : `SEO concentra hoy la mejor señal visible de intención.`, meta: "Usa el canal fuerte para distribuir y el otro para convertir.", priority: "Acelerar", priorityTone: "live", tone: "accent" },
      { kicker: "Friction", title: "Qué puede trabar crecimiento", value: displayValue(toArray(social.social?.reputation_alerts).length), body: seoTechnical < 80 ? "La técnica aún puede frenar crecimiento sostenible." : "La mayor fricción hoy está más en comunidad y operación que en técnica.", meta: `${displayValue(intel.community?.responsePressure)} señales de respuesta pendientes`, priority: seoTechnical < 80 ? "Atender" : "Responder", priorityTone: "pending" },
      { kicker: "Leverage", title: "Mejor palanca inmediata", value: opportunity?.priority || "Media", body: opportunity?.action || "Toma el contenido SEO con más tracción y conviértelo en secuencia social para amplificar demanda con un CTA claro.", meta: opportunity?.title || "Sin palanca declarada", priority: "Ejecutar", priorityTone: "live" },
      { kicker: "Cadence", title: "Ritmo del sistema", value: displayValue(intel.pipeline?.postsPerWeek), body: `${displayValue(intel.pipeline?.scheduleCoverage, "%")} del pipeline social está agendado. Eso marca qué tan predecible es el frente de awareness y nurturing.`, meta: seo.overview?.metrics?.[3]?.detail || "Search Console", priority: intel.pipeline?.scheduleCoverage < 40 ? "Completar" : "Estable", priorityTone: intel.pipeline?.scheduleCoverage < 40 ? "pending" : "live" },
    ],
    benchmarks: [
      { kicker: "Blend", label: "Demand engine", score: demandBlend, scoreLabel: displayValue(demandBlend, "%"), note: "Combina demanda orgánica y masa social para leer fuerza del sistema.", tone: benchmarkTone(demandBlend) },
      { kicker: "Creative", label: "Content + engagement", score: metricBlend, scoreLabel: displayValue(metricBlend, "%"), note: `${displayValue(seoTop10)} keywords y ${displayValue(socialPerformance, "%")} ER media como señal de contenido que sí mueve atención.`, tone: benchmarkTone(metricBlend) },
      { kicker: "Ops", label: "Execution resilience", score: Math.round((seoTechnical + socialReadiness) / 2), scoreLabel: displayValue(Math.round((seoTechnical + socialReadiness) / 2), "%"), note: "Promedia robustez técnica con readiness social.", tone: benchmarkTone(Math.round((seoTechnical + socialReadiness) / 2)) },
      { kicker: "Risk", label: "Risk stability", score: riskScore, scoreLabel: displayValue(riskScore, "%"), note: "Mide si el sistema puede crecer sin ruido reputacional o fragilidad operativa.", tone: benchmarkTone(riskScore) },
      { kicker: "Stack", label: "Measurement coverage", score: combinedSources.length ? Math.round((liveSources / combinedSources.length) * 100) : 0, scoreLabel: displayValue(combinedSources.length ? Math.round((liveSources / combinedSources.length) * 100) : 0, "%"), note: `${liveSources}/${combinedSources.length} fuentes críticas vivas.`, tone: benchmarkTone(combinedSources.length ? Math.round((liveSources / combinedSources.length) * 100) : 0) },
    ],
    sources: combinedSources,
  };
}

function dedupeSources(sources) {
  const map = new Map();
  for (const source of toArray(sources)) {
    const key = source.name || Math.random().toString(36);
    if (!map.has(key)) map.set(key, source);
    else {
      const current = map.get(key);
      if ((current.status !== "live" && source.status === "live") || (current.message || "").length < (source.message || "").length) {
        map.set(key, source);
      }
    }
  }
  return [...map.values()];
}

function renderExecutiveNarrativePanel(model) {
  const target = document.querySelector("#executiveNarrative");
  if (!target) return;
  target.innerHTML = `
    <article class="executive-brief-card executive-brief-primary">
      <span>Lectura principal</span>
      <strong>El sistema ya se puede gestionar por flujos, no por silos.</strong>
      <p>${esc(model.summary)}</p>
    </article>
    <article class="executive-brief-card">
      <span>Foco de crecimiento</span>
      <strong>Capturar demanda y redistribuirla mejor.</strong>
      <p>SEO está trayendo intención activa; Social debe amplificar, nutrir y recoger fricción comercial en comentarios, mientras Portal / Q10 queda separado como tráfico operativo.</p>
    </article>
    <article class="executive-brief-card">
      <span>Foco de control</span>
      <strong>Proteger el ritmo operativo.</strong>
      <p>La mezcla entre salud técnica, readiness de cuentas y cobertura de pipeline define cuánto podemos acelerar sin perder claridad.</p>
    </article>
  `;
}

function renderExecutiveSnapshots(seo, social, intel) {
  const seoTarget = document.querySelector("#executiveSeoSnapshot");
  const socialTarget = document.querySelector("#executiveSocialSnapshot");
  const traffic = getTrafficReality(seo);
  if (seoTarget) {
    seoTarget.innerHTML = `
      <div class="row"><strong>Clics orgánicos</strong><span>${displayValue(seo.overview?.metrics?.[0]?.value)}</span></div>
      <div class="row"><strong>Adquisición web</strong><span>${displayValue(traffic.acquisition)}</span></div>
      <div class="row"><strong>Portal / Q10</strong><span>${displayValue(traffic.operational)}</span></div>
      <div class="row"><strong>Keywords Top 10</strong><span>${displayValue(seo.keywords?.top10)}</span></div>
      <div class="row"><strong>CTR promedio</strong><span>${seo.overview?.metrics?.[3]?.value ?? "Sin datos"}</span></div>
      <div class="row"><strong>Landing adquisición</strong><span>${stripUrl(traffic.topAcquisitionPage) || "Sin datos"}</span></div>
      <div class="row"><strong>Salud técnica</strong><span>${displayValue(seo.technical?.score)}</span></div>
    `;
  }
  if (socialTarget) {
    socialTarget.innerHTML = `
      <div class="row"><strong>Followers</strong><span>${displayValue(intel.audience?.totalFollowers)}</span></div>
      <div class="row"><strong>ER media</strong><span>${displayValue(intel.performance?.avgEngagementRate, "%")}</span></div>
      <div class="row"><strong>Lead signals</strong><span>${displayValue(intel.community?.leadSignals)}</span></div>
      <div class="row"><strong>Publish-ready</strong><span>${displayValue(intel.operations?.publishReadyRate, "%")}</span></div>
      <div class="row"><strong>Best slot</strong><span>${formatBestSlot(social.social?.calendar?.bestSlots?.[0])}</span></div>
    `;
  }
}

function renderExecutiveTrendBlend(seo, social, intel) {
  const target = document.querySelector("#executiveTrendBlend");
  if (!target) return;
  const seoTrend = toArray(seo.trends).slice(-6);
  const socialTrend = toArray(intel.trendSeries).slice(-6);
  const seoRows = seoTrend.length ? seoTrend.map((point) => `
    <div class="executive-trend-row">
      <span>${esc(formatTrendLabel(point.label))}</span>
      <div class="bar"><span style="width:${Math.max(6, Math.min(100, Math.round(((point.organic || 0) / Math.max(1, ...seoTrend.map((item) => item.organic || 0))) * 100)))}%"></span></div>
      <small>${displayValue(point.organic)} clics</small>
    </div>
  `).join("") : `<div class="empty-state">Sin tendencia SEO suficiente.</div>`;
  const socialRows = socialTrend.length ? socialTrend.map((point) => `
    <div class="executive-trend-row">
      <span>${esc(point.label)}</span>
      <div class="bar"><span style="width:${Math.max(6, Math.min(100, Math.round(((point.reach || 0) / Math.max(1, ...socialTrend.map((item) => item.reach || 0))) * 100)))}%"></span></div>
      <small>${displayValue(point.reach)} reach</small>
    </div>
  `).join("") : `<div class="empty-state">Sin tendencia social suficiente.</div>`;
  target.innerHTML = `
    <article class="executive-trend-card">
      <span>SEO momentum</span>
      <h3>Últimos cortes de search</h3>
      <div class="stack">${seoRows}</div>
    </article>
    <article class="executive-trend-card">
      <span>Social momentum</span>
      <h3>Últimos cortes de reach</h3>
      <div class="stack">${socialRows}</div>
    </article>
  `;
}

function renderExecutiveOpportunityBoard(seo, social, intel) {
  const target = document.querySelector("#executiveOpportunityBoard");
  if (!target) return;
  const items = [
    ...(seo.business?.opportunities || []).slice(0, 2).map((item) => ({
      title: item.title,
      body: item.action,
      priority: item.priority || "Media",
      tag: "SEO",
    })),
    ...intel.actions.slice(0, 2).map((item) => ({
      title: item.title,
      body: item.action,
      priority: item.priority || "Media",
      tag: "Social",
    })),
  ];
  target.innerHTML = items.length ? items.map((item) => `
    <div class="action-item">
      <div>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.body)}</p>
      </div>
      <span class="badge ${item.priority === "Alta" ? "warn" : ""}">${esc(item.tag)} · ${esc(item.priority)}</span>
    </div>
  `).join("") : `<div class="empty-state">Sin prioridades activas todavía.</div>`;
}

function renderExecutiveSourceBoard(sources) {
  const target = document.querySelector("#executiveSourceBoard");
  if (!target) return;
  target.innerHTML = `<div class="source-health-list">${toArray(sources).map((source) => `
    <div class="source-health-row">
      <strong>${esc(source.name)}</strong>
      <span><strong>${esc(source.status)}</strong>${source.message ? ` <small>${esc(source.message)}</small>` : ""}</span>
    </div>
  `).join("")}</div>`;
}

function renderExecutiveBaselineBoard(seo, social, intel) {
  const target = document.querySelector("#executiveBaselineBoard");
  if (!target) return;
  const rows = buildExecutiveBaselineRows(seo, social, intel);
  target.innerHTML = rows.map((row) => `
    <div class="comparison-row executive-baseline-row">
      <div>
        <strong>${esc(row.label)}</strong>
        <small>${esc(row.note)}</small>
      </div>
      <span>${esc(row.current)}</span>
      <span>${esc(row.baseline)}</span>
      <span class="badge ${row.tone === "warn" ? "warn" : row.tone === "info" ? "info" : ""}">${esc(row.delta)}</span>
    </div>
  `).join("");
}

function renderExecutiveAnomalyBoard(seo, social, intel) {
  const target = document.querySelector("#executiveAnomalyBoard");
  if (!target) return;
  const rows = buildExecutiveAnomalies(seo, social, intel);
  target.innerHTML = rows.length ? rows.map((item) => `
    <div class="action-item">
      <div>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.reason)}</p>
        <p>${esc(item.action)}</p>
      </div>
      <span class="badge ${item.severity === "Alta" ? "warn" : item.severity === "Media" ? "info" : ""}">${esc(item.scope)} · ${esc(item.severity)}</span>
    </div>
  `).join("") : `<div class="empty-state">Sin anomalías fuertes contra baseline en este corte.</div>`;
}

function renderExecutiveAnomalyHistory(rows) {
  const target = document.querySelector("#executiveAnomalyHistory");
  if (!target) return;
  const items = toArray(rows);
  target.innerHTML = items.length ? items.map((row) => `
    <div class="history-row">
      <div>
        <strong>${esc(formatShortDate(row.snapshot_date))}</strong>
        <small>${esc(row.top_titles?.join(" · ") || "Sin anomalías destacadas")}</small>
      </div>
      <span>${esc(displayValue(row.anomaly_count))} alertas</span>
      <span>${esc(row.top_delta || "Sin delta clave")}</span>
      <span class="badge ${row.anomaly_count > 2 ? "warn" : row.anomaly_count > 0 ? "info" : ""}">${row.anomaly_count > 0 ? "Activo" : "Estable"}</span>
    </div>
  `).join("") : `<div class="empty-state">Todavía no hay historial persistido de anomalías.</div>`;
}

function buildExecutiveBaselineRows(seo, social, intel) {
  const seoTrend = toArray(seo.trends).slice(-8);
  const organicNow = seoTrend.at(-1)?.organic ?? null;
  const organicBaseline = average(seoTrend.slice(0, -1).map((item) => item.organic).filter(isFiniteNumber));
  const ctrNow = seoTrend.at(-1)?.ctr ?? null;
  const ctrBaseline = average(seoTrend.slice(0, -1).map((item) => item.ctr).filter(isFiniteNumber));
  const historyRows = toArray(seo.history_summary?.rankings_by_domain);
  const trackedTop10Baseline = historyRows.reduce((sum, row) => sum + (Number(row.top10) || 0), 0);
  const trackedTop10Now = Number(seo.keywords?.top10) || 0;
  const socialCadence = toArray(social.social?.calendar?.cadence);
  const observedCadence = average(socialCadence.map((row) => row.postsPerWeek).filter(isFiniteNumber));
  const liveCadence = Number(intel.pipeline?.postsPerWeek) || 0;
  const responseNow = Number(intel.community?.responsePressure) || 0;
  const responseBaseline = Math.max(1, Number(social.social?.customer_voice?.questionComments || 0) + Number(social.social?.customer_voice?.leadQuestions || 0));
  return [
    {
      label: "Organic clicks vs. trailing week",
      note: "Último día visible comparado contra la media de los 7 cortes anteriores.",
      current: displayValue(organicNow),
      baseline: displayValue(organicBaseline),
      delta: formatDeltaValue(organicNow, organicBaseline, false),
      tone: trendTone(organicNow, organicBaseline, 15),
    },
    {
      label: "CTR vs. trailing week",
      note: "Último CTR observado contra el baseline reciente del mismo periodo.",
      current: displayValue(ctrNow, "%"),
      baseline: displayValue(ctrBaseline, "%"),
      delta: formatDeltaValue(ctrNow, ctrBaseline, true),
      tone: trendTone(ctrNow, ctrBaseline, 8),
    },
    {
      label: "Search breadth vs. tracked history",
      note: "Top 10 actual contra el baseline histórico persistido en snapshots de rankings.",
      current: displayValue(trackedTop10Now),
      baseline: displayValue(trackedTop10Baseline),
      delta: formatDeltaValue(trackedTop10Now, trackedTop10Baseline, false),
      tone: trendTone(trackedTop10Now, trackedTop10Baseline, 20),
    },
    {
      label: "Publishing cadence vs. observed pattern",
      note: "Cadencia viva del pipeline contra la media observada en la recomendación histórica.",
      current: `${displayValue(liveCadence)} posts/semana`,
      baseline: `${displayValue(observedCadence)} posts/semana`,
      delta: formatDeltaValue(liveCadence, observedCadence, false),
      tone: trendTone(liveCadence, observedCadence, 20),
    },
    {
      label: "Community pressure vs. baseline de preguntas",
      note: "Presión actual de respuesta frente al volumen base de preguntas/lead comments.",
      current: displayValue(responseNow),
      baseline: displayValue(responseBaseline),
      delta: formatDeltaValue(responseNow, responseBaseline, false),
      tone: responseNow > responseBaseline ? "warn" : "neutral",
    },
  ];
}

function buildExecutiveAnomalies(seo, social, intel) {
  const anomalies = [];
  const seoTrend = toArray(seo.trends).slice(-8);
  const organicNow = Number(seoTrend.at(-1)?.organic) || 0;
  const organicBaseline = average(seoTrend.slice(0, -1).map((item) => item.organic).filter(isFiniteNumber)) || 0;
  const ctrNow = Number(seoTrend.at(-1)?.ctr) || 0;
  const ctrBaseline = average(seoTrend.slice(0, -1).map((item) => item.ctr).filter(isFiniteNumber)) || 0;
  const topPost = toArray(social.social?.top_posts)[0];
  const topPlatform = intel.platforms?.[0];
  const weakPlatform = [...toArray(intel.platforms)].sort((a, b) => (a.avgEngagementRate || 0) - (b.avgEngagementRate || 0))[0];
  if (organicBaseline && organicNow < organicBaseline * 0.72) {
    anomalies.push({
      scope: "SEO",
      severity: "Alta",
      title: "Caída de clics orgánicos frente al baseline reciente",
      reason: `El último corte visible cae a ${displayValue(organicNow)} frente a un baseline de ${displayValue(organicBaseline)}.`,
      action: "Revisa qué URLs perdieron tracción, si hubo cambio de mix en impresiones y si el CTR también cayó en paralelo.",
    });
  }
  if (ctrBaseline && ctrNow < ctrBaseline * 0.88) {
    anomalies.push({
      scope: "SEO",
      severity: "Media",
      title: "Drift de CTR en el cierre del periodo",
      reason: `El CTR reciente está en ${displayValue(ctrNow, "%")} contra ${displayValue(ctrBaseline, "%")} de baseline.`,
      action: "Audita titles/snippets de las páginas líderes y detecta si la demanda se movió a queries menos transaccionales.",
    });
  }
  if ((Number(intel.pipeline?.scheduled) || 0) === 0 && (Number(intel.pipeline?.drafts) || 0) === 0) {
    anomalies.push({
      scope: "Social",
      severity: "Alta",
      title: "Pipeline editorial sin cobertura futura",
      reason: "No hay posts programados ni drafts visibles, así que el sistema está operando sin cola de ejecución.",
      action: "Programa al menos una semana de contenido usando el best slot observado y replica el formato del top post actual.",
    });
  }
  if (topPlatform && weakPlatform && topPlatform.platform !== weakPlatform.platform && (topPlatform.avgEngagementRate || 0) > ((weakPlatform.avgEngagementRate || 0) * 1.6)) {
    anomalies.push({
      scope: "Social",
      severity: "Media",
      title: `Brecha de performance entre ${capitalize(topPlatform.platform)} y ${capitalize(weakPlatform.platform)}`,
      reason: `${capitalize(topPlatform.platform)} está rindiendo claramente mejor en ER media que ${capitalize(weakPlatform.platform)}.`,
      action: "Traslada hooks, duración y tema del canal ganador al débil y prueba 2-3 iteraciones con hipótesis cerrada.",
    });
  }
  if ((Number(intel.community?.responsePressure) || 0) >= 4) {
    anomalies.push({
      scope: "Community",
      severity: "Media",
      title: "Presión de respuesta por comentarios",
      reason: `Hay ${displayValue(intel.community?.responsePressure)} señales entre preguntas y fricción que ya merecen seguimiento activo.`,
      action: "Agrupa respuestas sobre precio, horarios y sedes y conviértelas en plantillas o FAQ visibles.",
    });
  }
  if (topPost && topPost.platform === "tiktok" && (Number(topPost.views) || 0) > 20000 && (Number(topPost.engagementRate) || 0) >= 3) {
    anomalies.push({
      scope: "Creative",
      severity: "Oportunidad",
      title: "Top post con señal fuerte para escalar",
      reason: `Un post de ${capitalize(topPost.platform)} ya pasó ${displayValue(topPost.views)} views con ${displayValue(topPost.engagementRate, "%")} de ER.`,
      action: "Convierte ese tema en secuencia: remake, respuesta, versión corta y pieza SEO-support para capturar la demanda que abrió.",
    });
  }
  return anomalies.slice(0, 6);
}

function buildSeoInsightCards(data) {
  const traffic = getTrafficReality(data);
  const topMetric = data.overview?.metrics?.[0];
  const ctrMetric = data.overview?.metrics?.[3];
  const aiMentions = Number(data.ai_visibility?.by_domain?.[0]?.google_mentions) || 0;
  const technicalScore = Number(data.technical?.score) || 0;
  const clarityStatus = data.sources?.find((item) => item.name === "Microsoft Clarity")?.status || "degraded";
  const opportunity = data.business?.opportunities?.[0];
  const topPage = data.content?.topPages?.[0];
  return [
    {
      kicker: "Growth",
      title: "Captura orgánica activa",
      value: displayValue(topMetric?.value),
      body: `La demanda orgánica visible sostiene ${displayValue(data.keywords?.top10)} keywords en Top 10 y ${displayValue(data.keywords?.top3)} en Top 3. En paralelo, GA4 aísla ${displayValue(traffic.operational)} sesiones de Portal / Q10 para no inflar la lectura de adquisición.`,
      meta: ctrMetric?.detail || traffic.note || "Search Console",
      priority: "Activa",
      priorityTone: "live",
      tone: "accent",
    },
    {
      kicker: "Content",
      title: "Mayor palanca de adquisición",
      value: !isLandingPlaceholder(traffic.topAcquisitionPage) ? stripUrl(traffic.topAcquisitionPage) : stripUrl(topPage?.path) || "Sin líder",
      body: !isLandingPlaceholder(traffic.topAcquisitionPage)
        ? `La landing de adquisición líder hoy es ${stripUrl(traffic.topAcquisitionPage)}. Conviene usarla como referencia de mensaje, UX y CTA para las demás páginas del funnel.`
        : topPage?.path
          ? `La URL con más tracción en Search Console está generando ${displayValue(topPage?.sessions)} clics orgánicos. Conviene usarla como plantilla de expansión o refresh.`
          : "Aún no hay una página líder clara para amplificar.",
      meta: topPage?.path ? `${displayValue(topPage?.ctr, "%")} CTR · ${displayValue(topPage?.sessions)} clics orgánicos` : (traffic.note || "Sin metadata adicional"),
      priority: "Expandir",
      priorityTone: "pending",
    },
    {
      kicker: "Risk",
      title: "Postura técnica y medición",
      value: displayValue(data.technical?.score),
      body: technicalScore >= 80
        ? "La base técnica está estable; el foco puede ir a CTR, contenidos y distribución."
        : "La salud técnica todavía puede limitar crecimiento y conviene tratarla como cuello de botella.",
      meta: clarityStatus === "degraded"
        ? "Clarity está degradado, así que la lectura UX está parcial."
        : `LCP ${data.technical?.lcp ?? "Sin datos"} · CLS ${data.technical?.cls ?? "Sin datos"}`,
      priority: technicalScore >= 80 ? "Controlado" : "Atender",
      priorityTone: technicalScore >= 80 ? "live" : "pending",
    },
    {
      kicker: "Decision",
      title: opportunity?.title || "Siguiente jugada recomendada",
      value: opportunity?.priority || "Monitor",
      body: opportunity?.action || "No hay una alerta crítica ahora mismo, así que toca sostener ejecución y revisar nuevas oportunidades.",
      meta: aiMentions > 0 ? `${displayValue(aiMentions)} menciones en AI visibility ya registradas.` : "La capa de AI visibility todavía necesita más masa histórica.",
      priority: opportunity?.priority || "Baja",
      priorityTone: opportunity?.priority === "Alta" ? "pending" : "live",
    },
  ];
}

function buildSeoBenchmarkRows(data) {
  const traffic = getTrafficReality(data);
  const sources = toArray(data.sources);
  const liveSources = sources.filter((item) => item.status === "live").length;
  const visibilityScore = Math.min(100, Math.round(((Number(data.keywords?.top10) || 0) * 1.8) + ((Number(data.keywords?.top3) || 0) * 2.4)));
  const contentScore = Math.min(100, Math.round((Number(data.content?.topPages?.[0]?.ctr) || 0) * 5));
  const technicalScore = Number(data.technical?.score) || 0;
  const aiScore = Math.min(100, Math.round((Number(data.ai_visibility?.by_domain?.[0]?.google_mentions) || 0) * 4));
  const sourceScore = sources.length ? Math.round((liveSources / sources.length) * 100) : 0;
  return [
    { kicker: "Search", label: "Organic visibility", score: visibilityScore, scoreLabel: displayValue(visibilityScore, "%"), note: `${displayValue(data.keywords?.top10)} keywords Top 10, ${displayValue(data.overview?.metrics?.[0]?.value)} clics reales y ${displayValue(traffic.organicAcquisition)} sesiones orgánicas útiles.`, tone: benchmarkTone(visibilityScore) },
    { kicker: "Traffic", label: "Acquisition truth", score: Math.min(100, Math.round(((Number(traffic.acquisition) || 0) / Math.max(1, (Number(traffic.acquisition) || 0) + (Number(traffic.operational) || 0))) * 100)), scoreLabel: `${displayValue(traffic.acquisition)} / ${displayValue(traffic.operational)}`, note: `${stripUrl(traffic.topAcquisitionPage) || "Sin landing líder"} impulsa adquisición mientras portal/Q10 queda segregado.`, tone: benchmarkTone(Math.min(100, Math.round(((Number(traffic.acquisition) || 0) / Math.max(1, (Number(traffic.acquisition) || 0) + (Number(traffic.operational) || 0))) * 100))) },
    { kicker: "Technical", label: "Technical resilience", score: technicalScore, scoreLabel: displayValue(technicalScore), note: `LCP ${data.technical?.lcp ?? "Sin datos"} · Speed ${data.technical?.speed ?? "Sin datos"}.`, tone: benchmarkTone(technicalScore) },
    { kicker: "AI", label: "LLM / AI presence", score: aiScore, scoreLabel: displayValue(aiScore, "%"), note: data.ai_visibility?.note || "Sin notas AI todavía.", tone: benchmarkTone(aiScore) },
    { kicker: "Ops", label: "Measurement stack", score: sourceScore, scoreLabel: displayValue(sourceScore, "%"), note: `${liveSources}/${sources.length || 0} fuentes críticas en estado live.`, tone: benchmarkTone(sourceScore) },
  ];
}

function buildSocialInsightCards(social, intel, platformFilter) {
  const leadPlatform = intel.platforms?.[0];
  const bestSlot = formatBestSlot(social?.calendar?.bestSlots?.find((slot) => !platformFilter || slot.platform === platformFilter) || social?.calendar?.bestSlots?.[0]);
  return [
    {
      kicker: "Audience",
      title: platformFilter ? `${capitalize(platformFilter)} concentra la lectura` : "Masa social y liderazgo",
      value: displayValue(intel.audience?.totalFollowers),
      body: leadPlatform
        ? `${capitalize(leadPlatform.platform)} lidera con ${displayValue(leadPlatform.followers)} seguidores y ${displayValue(leadPlatform.avgEngagementRate, "%")} de ER media.`
        : "Todavía no hay suficiente masa para establecer un líder claro entre plataformas.",
      meta: `${displayValue(intel.audience?.activePlatforms)} plataformas activas`,
      priority: "Escalar",
      priorityTone: "live",
      tone: "accent",
    },
    {
      kicker: "Community",
      title: "Señales comerciales y fricción",
      value: displayValue(intel.community?.leadSignals),
      body: `${displayValue(intel.community?.riskAlerts)} focos reputacionales y ${displayValue(social?.customer_voice?.questionComments)} preguntas activas están entrando por comentarios.`,
      meta: `${displayValue(social?.customer_voice?.commentsAnalyzed)} comentarios analizados`,
      priority: intel.community?.riskAlerts > 0 ? "Responder" : "Monitor",
      priorityTone: intel.community?.riskAlerts > 0 ? "pending" : "live",
    },
    {
      kicker: "Publishing",
      title: "Ventana de ejecución",
      value: bestSlot,
      body: social?.calendar?.recommendation || "Todavía no hay suficiente histórico para cerrar un patrón de calendarización más fino.",
      meta: `${displayValue(intel.pipeline?.scheduleCoverage, "%")} del pipeline ya está agendado`,
      priority: intel.pipeline?.scheduleCoverage < 40 ? "Completar" : "Operando",
      priorityTone: intel.pipeline?.scheduleCoverage < 40 ? "pending" : "live",
    },
    {
      kicker: "Creative",
      title: "Momentum creativo",
      value: displayValue(intel.performance?.avgEngagementRate, "%"),
      body: `${displayValue(intel.performance?.postsAnalyzed)} posts ya permiten leer reach medio de ${displayValue(intel.performance?.avgReach)} y detectar qué formato merece más repetición.`,
      meta: leadPlatform?.topContentLabel || "Sin top creative claro todavía.",
      priority: "Optimizar",
      priorityTone: "live",
    },
  ];
}

function buildSocialBenchmarkRows(social, intel, platformFilter) {
  const audienceScore = Math.min(100, Math.round((Number(intel.audience?.totalFollowers) || 0) / 1000));
  const performanceScore = Math.min(100, Math.round((Number(intel.performance?.avgEngagementRate) || 0) * 8));
  const readinessScore = Number(intel.operations?.publishReadyRate) || 0;
  const communityScore = Math.max(0, 100 - Math.min(100, ((Number(intel.community?.responsePressure) || 0) * 5) + ((Number(intel.community?.riskAlerts) || 0) * 12)));
  const pipelineScore = Number(intel.pipeline?.scheduleCoverage) || 0;
  const leadPlatform = intel.platforms?.[0];
  return [
    { kicker: "Audience", label: "Audience scale", score: audienceScore, scoreLabel: displayValue(audienceScore, "%"), note: leadPlatform ? `${capitalize(leadPlatform.platform)} lidera la base social actual.` : "Sin líder claro todavía.", tone: benchmarkTone(audienceScore) },
    { kicker: "Creative", label: "Content performance", score: performanceScore, scoreLabel: displayValue(performanceScore, "%"), note: `${displayValue(intel.performance?.avgEngagementRate, "%")} ER media · ${displayValue(intel.performance?.avgReach)} reach medio.`, tone: benchmarkTone(performanceScore) },
    { kicker: "Ops", label: "Publishing readiness", score: readinessScore, scoreLabel: displayValue(readinessScore, "%"), note: `${displayValue(intel.operations?.accountsReady)} cuentas listas para publicar.`, tone: benchmarkTone(readinessScore) },
    { kicker: "Community", label: "Community stability", score: communityScore, scoreLabel: displayValue(communityScore, "%"), note: `${displayValue(intel.community?.leadSignals)} señales de lead · ${displayValue(intel.community?.riskAlerts)} alertas.`, tone: benchmarkTone(communityScore) },
    { kicker: "Calendar", label: "Pipeline coverage", score: pipelineScore, scoreLabel: displayValue(pipelineScore, "%"), note: platformFilter ? `${capitalize(platformFilter)} en foco editorial.` : (social?.calendar?.recommendation || "Sin recomendación de calendario todavía."), tone: benchmarkTone(pipelineScore) },
  ];
}

function benchmarkTone(score) {
  if ((Number(score) || 0) >= 75) return "live";
  if ((Number(score) || 0) >= 45) return "pending";
  return "error";
}

function renderMetrics(metrics) {
  document.querySelector("#metricGrid").innerHTML = metrics.map((metric) => `
    <article class="metric" tabindex="0">
      <span>${metric.label}</span>
      <strong>${metric.value}</strong>
      <div>
        <div class="delta">${formatDelta(metric.delta)}</div>
        <small>${metric.detail} · ${metric.source}</small>
      </div>
    </article>
  `).join("");
}

function renderTrend(points) {
  const trendTitle = document.querySelector("#trendChart")?.closest(".panel")?.querySelector("h2");
  if (trendTitle) {
    trendTitle.textContent = points.some((point) => typeof point.leads === "number")
      ? "Trafico, leads y CTR"
      : "Clicks orgánicos y CTR";
  }
  if (!points.length) {
    document.querySelector("#trendChart").innerHTML = `<div class="empty-state">Sin tendencia real disponible para el periodo seleccionado.</div>`;
    return;
  }
  const width = 720;
  const height = 300;
  const pad = 28;
  const bottomPad = 42;
  const tickEvery = Math.max(1, Math.ceil(points.length / 7));
  const maxOrganic = Math.max(1, ...points.map((point) => point.organic || 0));
  const maxLeads = Math.max(1, ...points.map((point) => point.leads || 0));
  const x = (index) => pad + index * ((width - pad * 2) / Math.max(1, points.length - 1));
  const yOrganic = (value) => height - bottomPad - (value / maxOrganic) * (height - pad - bottomPad);
  const yLeads = (value) => height - bottomPad - (value / maxLeads) * (height - pad - bottomPad);
  const line = (accessor) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${accessor(point)}`).join(" ");
  const shouldShowTick = (index) => index === 0 || index === points.length - 1 || index % tickEvery === 0;

  document.querySelector("#trendChart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia SEO">
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#6f56c7" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#6f56c7" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${line((p) => yOrganic(p.organic))} L ${x(points.length - 1)} ${height - bottomPad} L ${pad} ${height - bottomPad} Z" fill="url(#area)" />
      <path d="${line((p) => yOrganic(p.organic))}" fill="none" stroke="#5b3aa6" stroke-width="4" stroke-linecap="round" />
      ${points.some((point) => typeof point.leads === "number") ? `<path d="${line((p) => yLeads(p.leads || 0))}" fill="none" stroke="#138a72" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 8" />` : ""}
      ${points.map((point, index) => `
        <g>
          <circle cx="${x(index)}" cy="${yOrganic(point.organic)}" r="5" fill="#5b3aa6" />
          ${shouldShowTick(index) ? `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" font-size="12" fill="#7f796f">${formatTrendLabel(point.label)}</text>` : ""}
        </g>
      `).join("")}
    </svg>
  `;
}

function renderKeywords(keywords) {
  const intentItems = toArray(keywords.intent).filter((item) => typeof item.value === "number");
  const intentRows = intentItems.map((item) => `
    <div>
      <div class="row"><strong>${item.name}</strong><span>${displayValue(item.value, "%")}</span></div>
      <div class="bar"><span style="width:${item.value || 0}%"></span></div>
      <small>${item.description}</small>
    </div>
  `).join("");

  const missingKeywordIntel = [];
  if (!isFiniteNumber(keywords.newKeywords)) missingKeywordIntel.push("nuevas keywords");
  if (!isFiniteNumber(keywords.movementUp) || !isFiniteNumber(keywords.movementDown)) missingKeywordIntel.push("movimiento");
  if (!intentItems.length) missingKeywordIntel.push("intención");

  document.querySelector("#keywordPanel").innerHTML = `
    <div class="row"><strong>Top 3</strong><span>${displayValue(keywords.top3)}</span></div>
    <div class="row"><strong>Top 10</strong><span>${displayValue(keywords.top10)}</span></div>
    ${isFiniteNumber(keywords.newKeywords) ? `<div class="row"><strong>Nuevas</strong><span>${displayValue(keywords.newKeywords)}</span></div>` : ""}
    ${(isFiniteNumber(keywords.movementUp) || isFiniteNumber(keywords.movementDown)) ? `<div class="row"><strong>Suben / bajan</strong><span>${displayValue(keywords.movementUp)} / ${displayValue(keywords.movementDown)}</span></div>` : ""}
    ${intentRows}
    ${missingKeywordIntel.length ? `<div class="empty-inline">Pendiente inteligencia de ${esc(missingKeywordIntel.join(", "))}. La lectura accionable actual es Top 3 / Top 10 + oportunidades SEO.</div>` : ""}
  `;
}

function renderContent(content) {
  const topPages = toArray(content.topPages);
  const topPage = topPages[0];
  const lowCtrPages = topPages.filter((page) => page.status === "Optimizar");
  const programPages = topPages.filter((page) => page.path.includes("/programas"));
  const hasEditorialMetrics = [content.published, content.optimized, content.updated, content.blogTrafficShare].some(isFiniteNumber);
  document.querySelector("#contentOps").innerHTML = hasEditorialMetrics ? `
    <div class="op"><strong>${displayValue(content.published)}</strong><span>Articulos publicados</span></div>
    <div class="op"><strong>${displayValue(content.optimized)}</strong><span>Optimizados</span></div>
    <div class="op"><strong>${displayValue(content.updated)}</strong><span>Actualizados</span></div>
    <div class="op"><strong>${displayValue(content.blogTrafficShare, "%")}</strong><span>Trafico desde blog</span></div>
  ` : `
    <div class="op"><strong>${stripUrl(topPage?.path) || "Sin líder"}</strong><span>Landing orgánica líder</span></div>
    <div class="op"><strong>${displayValue(lowCtrPages.length)}</strong><span>URLs con CTR bajo para optimizar</span></div>
    <div class="op"><strong>${displayValue(programPages.length)}</strong><span>Programas visibles en top páginas</span></div>
    <div class="op"><strong>Pendiente</strong><span>Workflow editorial no conectado todavía</span></div>
  `;
}

function renderPages(pages) {
  if (!pages.length) {
    document.querySelector("#topPages").innerHTML = `<div class="empty-state">Sin paginas reales desde Search Console para este filtro.</div>`;
    return;
  }
  document.querySelector("#topPages").innerHTML = pages.map((page) => `
    <div class="page-row">
      <strong>${stripUrl(page.path)}</strong>
      <span>${formatNumber(page.sessions)} clics orgánicos</span>
      <span>${page.ctr.toFixed(1)}% CTR</span>
      <span class="badge ${page.status === "Optimizar" ? "warn" : ""}">${page.status}</span>
    </div>
  `).join("");
}

function renderTechnical(technical, sources = []) {
  const score = typeof technical.score === "number" ? technical.score : 0;
  const node = document.querySelector("#technicalPanel");
  const claritySource = toArray(sources).find((item) => item.name === "Microsoft Clarity");
  const clarityAvailable = [technical.deadClicks, technical.rageClicks, technical.excessiveScroll, technical.quickbackClick].some(isFiniteNumber);
  // eslint-disable-next-line no-unsanitized/property
  node.innerHTML = `
    <div class="score">
      <div class="score-ring" style="--score:${esc(score)}%"><strong>${esc(technical.score ?? "S/D")}</strong></div>
      <div>
        <strong>Score general (PageSpeed)</strong>
        <p class="summary">Performance + Core Web Vitals + UX (Microsoft Clarity).</p>
      </div>
    </div>
    <div class="row"><strong>LCP</strong><span>${esc(technical.lcp ?? "Sin datos")}</span></div>
    <div class="row"><strong>INP</strong><span>${esc(technical.inp ?? "Sin datos")}</span></div>
    <div class="row"><strong>CLS</strong><span>${esc(technical.cls ?? "Sin datos")}</span></div>
    ${clarityAvailable ? `
      <div class="row clarity"><strong>Dead clicks (24h)</strong><span>${displayValue(technical.deadClicks)}</span></div>
      <div class="row clarity"><strong>Rage clicks (24h)</strong><span>${displayValue(technical.rageClicks)}</span></div>
      <div class="row clarity"><strong>Excessive scroll (24h)</strong><span>${displayValue(technical.excessiveScroll)}</span></div>
      <div class="row clarity"><strong>Quickback clicks (24h)</strong><span>${displayValue(technical.quickbackClick)}</span></div>
    ` : `<div class="empty-inline">UX behavior desde Clarity no disponible ahora mismo${claritySource?.message ? `: ${esc(claritySource.message)}` : "."}</div>`}
  `;
}

function renderLeads(channels, ga4) {
  const usefulChannels = channels.filter((channel) => channel.leads !== null || channel.name === "Leads SEO");
  const pendingChannels = channels.filter((channel) => channel.leads === null && channel.name !== "Leads SEO");
  const max = Math.max(1, ...usefulChannels.map((channel) => channel.leads || 0));
  const channelRows = usefulChannels.map((channel) => `
    <div>
      <div class="row"><strong>${esc(channel.name)}</strong><span>${displayValue(channel.leads)} ${typeof channel.conversion === "number" ? `· ${esc(channel.conversion)} conv` : ""}</span></div>
      <div class="bar"><span style="width:${((channel.leads || 0) / max) * 100}%"></span></div>
    </div>
  `).join("");

  const realityNotes = (ga4?.reality?.notes ?? []).map((note) => `
    <div class="ga4-note">${esc(note)}</div>
  `).join("");

  const realityRows = (ga4?.reality?.by_domain ?? []).map((row) => `
    <div class="ga4-reality-card">
      <div class="row ga4-domain">
        <strong>${esc(siteLabel(row.domain))}</strong>
        <span>${displayValue(row.acquisition_sessions)} adq · ${displayValue(row.organic_acquisition_sessions)} org util · ${displayValue(row.operational_sessions)} portal</span>
        <span class="origin-pill ${esc(row.source_origin)}">${esc(row.source_origin)}</span>
      </div>
      <div class="ga4-reality-meta">
        <span>Propiedad ${esc(row.property_id ?? "sin id")}</span>
        <span>Host ${esc(row.host_filter)}</span>
      </div>
      <div class="ga4-reality-note">${esc(row.note)}</div>
      ${row.top_operational_pages?.length ? `<div class="ga4-reality-list"><strong>Portal / Q10:</strong> ${row.top_operational_pages.map((page) => esc(page)).join(" · ")}</div>` : ""}
      ${row.top_acquisition_pages?.length ? `<div class="ga4-reality-list"><strong>Adquisicion:</strong> ${row.top_acquisition_pages.map((page) => esc(page)).join(" · ")}</div>` : ""}
    </div>
  `).join("");

  const byDomainRows = (ga4?.by_domain ?? []).map((row) => `
    <div class="row ga4-domain">
      <strong>${esc(siteLabel(row.domain))}</strong>
      <span>${displayValue(row.sessions)} ses · ${displayValue(row.organic_sessions)} org · ${displayValue(row.conversions)} conv</span>
      <span class="origin-pill ${esc(row.source_origin)}">${esc(row.source_origin)}</span>
    </div>
  `).join("");

  const node = document.querySelector("#leadChannels");
  // eslint-disable-next-line no-unsanitized/property
  node.innerHTML = `
    ${channelRows}
    ${pendingChannels.length ? `<div class="empty-inline">Pendiente conectar medición directa de ${esc(pendingChannels.map((channel) => channel.name).join(", "))} para cerrar el loop comercial.</div>` : ""}
    ${realityNotes ? `<hr/><strong class="block-label">Lectura real de GA4</strong><div class="ga4-notes">${realityNotes}</div>` : ""}
    ${realityRows ? `<div class="ga4-reality-grid">${realityRows}</div>` : ""}
    ${byDomainRows ? `<hr/><strong class="block-label">GA4 por dominio (último día)</strong>${byDomainRows}` : ""}
  `;
}

function renderComparison(rows) {
  const node = document.querySelector("#comparisonTable");
  const validMarkets = toArray(rows).filter((row) => row.colombia !== "Sin datos" || row.mexico !== "Sin datos" || row.lta !== "Sin datos");
  const marketsWithData = new Set();
  validMarkets.forEach((row) => {
    if (row.colombia !== "Sin datos") marketsWithData.add("co");
    if (row.mexico !== "Sin datos") marketsWithData.add("mx");
    if (row.lta !== "Sin datos") marketsWithData.add("lta");
  });
  if (marketsWithData.size < 2) {
    node.innerHTML = `<div class="empty-state">Comparativo incompleto: hoy solo hay datos confiables para ${marketsWithData.has("co") ? "Colombia" : marketsWithData.has("mx") ? "Mexico" : marketsWithData.has("lta") ? "La Tienda de Audio" : "ningún mercado adicional"}.</div>`;
    return;
  }
  // eslint-disable-next-line no-unsanitized/property
  node.innerHTML = `
    <div class="comparison-row header"><span>Metrica</span><span>Colombia</span><span>Mexico</span><span>La Tienda de Audio</span><span>Lider</span></div>
    ${rows.map((row) => `
      <div class="comparison-row">
        <strong>${esc(row.metric)}</strong>
        <span>${esc(row.colombia)}</span>
        <span>${esc(row.mexico)}</span>
        <span>${esc(row.lta ?? "Sin datos")}</span>
        <span class="badge">${esc(row.leader)}</span>
      </div>
    `).join("")}
  `;
}

function renderAiVisibility(ai) {
  const target = document.querySelector("#aiVisibilityPanel");
  if (!target) return;
  if (!ai || !ai.has_data) {
    target.textContent = ai?.note ?? "Sin datos de visibilidad LLM aún. Espera el cron del lunes o lanza snapshot_run_now con tasks=['llm'].";
    target.classList.add("empty-state");
    return;
  }
  target.classList.remove("empty-state");
  // eslint-disable-next-line no-unsanitized/property
  target.innerHTML = (ai.by_domain ?? []).map((row) => `
    <article class="ai-card">
      <header><strong>${esc(siteLabel(row.domain))}</strong><small>${esc(row.date ?? "")}</small></header>
      <div class="row"><span>ChatGPT mentions</span><strong>${displayValue(row.chat_gpt_mentions)}</strong></div>
      <div class="row"><span>Google AI Overview mentions</span><strong>${displayValue(row.google_mentions)}</strong></div>
    </article>
  `).join("");
}

function renderBacklinks(backlinks) {
  const target = document.querySelector("#backlinksPanel");
  if (!target) return;
  const byDomain = backlinks?.by_domain ?? [];
  if (byDomain.length === 0) {
    target.textContent = "Sin datos de backlinks. Verifica que el módulo Backlinks de DataForSEO esté activo.";
    target.classList.add("empty-state");
    return;
  }
  target.classList.remove("empty-state");
  // eslint-disable-next-line no-unsanitized/property
  target.innerHTML = byDomain.map((row) => `
    <article class="bl-card">
      <header><strong>${esc(siteLabel(row.domain))}</strong><small>${esc(row.date ?? "")} · ${esc(row.source_origin)}</small></header>
      <div class="row"><span>Total backlinks</span><strong>${displayValue(row.total)}</strong></div>
      <div class="row"><span>Referring domains</span><strong>${displayValue(row.referring_domains)}</strong></div>
      <div class="row"><span>Domain rank</span><strong>${displayValue(row.rank)}</strong></div>
      <div class="row"><span>Spam score</span><strong>${displayValue(row.spam_score)}</strong></div>
    </article>
  `).join("");
}

function renderHistory(history) {
  const target = document.querySelector("#historyPanel");
  if (!target) return;
  const rows = history?.rankings_by_domain ?? [];
  if (rows.length === 0) {
    target.textContent = "Sin snapshots de rankings persistidos todavía.";
    target.classList.add("empty-state");
    return;
  }
  target.classList.remove("empty-state");
  // eslint-disable-next-line no-unsanitized/property
  target.innerHTML = rows.map((r) => `
    <div class="history-row">
      <strong>${esc(siteLabel(r.domain))}</strong>
      <span>${esc(r.total_tracked)} tracked · ${esc(r.top3)} en Top 3 · ${esc(r.top10)} en Top 10</span>
      <span>Avg pos ${esc(r.avg_position ?? "S/D")}</span>
      <small>${esc(r.snapshot_date)}</small>
    </div>
  `).join("");
}

function renderOpportunities(items) {
  document.querySelector("#opportunities").innerHTML = items.map((item) => `
    <div class="action-item">
      <div>
        <strong>${item.title}</strong>
        <p>${item.reason}</p>
        <p>${item.action}</p>
      </div>
      <span class="badge ${item.priority === "Alta" ? "warn" : ""}">${item.priority}</span>
    </div>
  `).join("");
}

function renderSocialSummary(social, intel) {
  const target = document.querySelector("#socialSummary");
  if (!target) return;
  const byPlatform = intel?.platforms ?? [];
  if (!byPlatform.length) {
    target.innerHTML = `<div class="empty-state">${esc(social?.note ?? "Sin datos sociales todavía.")}</div>`;
    return;
  }
  const grouped = groupPlatformsForRadar(byPlatform);
  target.innerHTML = grouped.map((item) => `
    <article class="social-stat-card">
      <span>${esc(item.label)}</span>
      <strong>${esc(item.value)}</strong>
      <small>${esc(item.detail)}</small>
    </article>
  `).join("");
}

function renderSocialAccounts(accounts, note, platformFilter = null) {
  const target = document.querySelector("#socialAccounts");
  if (!target) return;
  const safeAccounts = toArray(accounts);
  const visibleAccounts = platformFilter ? safeAccounts.filter((item) => item.platform === platformFilter) : safeAccounts;
  if (!visibleAccounts.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin cuentas conectadas todavía.")}</div>`;
    return;
  }
  target.innerHTML = visibleAccounts.map((account) => `
    <article class="social-account-card">
      <div class="social-account-top">
        <div>
          <strong>${esc(account.displayName || account.handle || capitalize(account.platform))}</strong>
          <div class="social-account-subtitle">${esc(platformDisplayName(account.platform))} · ${esc(account.handle || "Sin handle")} · ${esc(platformCategoryLabel(account.platform))}</div>
        </div>
        <div class="social-account-badges">
          <span class="badge ${account.publishReady ? "" : "warn"}">${account.publishReady ? "publish-ready" : "revisar"}</span>
          <span class="badge ${account.status === "connected" || account.status === "active" ? "" : "warn"}">${esc(account.status)}</span>
        </div>
      </div>
      <div class="social-account-grid">
        <span><strong>Followers</strong>${displayValue(account.followers)}</span>
        <span><strong>Perfil</strong>${esc(account.profileName || "Sin profile")}</span>
        <span><strong>Tipo</strong>${esc(account.accountType || "No informado")}</span>
        <span><strong>Permisos</strong>${displayValue(account.permissionsCount)}</span>
        <span><strong>Analytics</strong>${account.analyticsReady ? "Sync activo" : "Pendiente"}</span>
        <span><strong>Token</strong>${esc(formatShortDate(account.tokenExpiresAt) || "Sin fecha")}</span>
        <span><strong>Privacidad</strong>${esc((account.privacyLevels || []).join(" · ") || "Por defecto")}</span>
        <span><strong>URL</strong>${account.profileUrl ? `<a href="${esc(account.profileUrl)}" target="_blank" rel="noreferrer">${esc(account.handle || "Abrir")}</a>` : "No disponible"}</span>
      </div>
    </article>
  `).join("");
}

function renderSocialPosts(posts, note, platformFilter = null) {
  const target = document.querySelector("#socialPosts");
  if (!target) return;
  const safePosts = toArray(posts);
  const visiblePosts = platformFilter
    ? safePosts.filter((post) => toArray(post.platforms).includes(platformFilter))
    : safePosts;
  if (!visiblePosts.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin posts recientes todavía.")}</div>`;
    return;
  }
  target.innerHTML = visiblePosts.map((post) => `
    <article class="social-post-card">
      <div class="social-post-head">
        <strong>${esc(post.title || "Post")}</strong>
        <span class="badge ${post.status === "published" ? "" : post.status === "scheduled" ? "info" : "warn"}">${esc(post.status)}</span>
      </div>
      <p>${esc(post.excerpt || "Sin texto disponible.")}</p>
      <div class="social-post-meta">
        <span>${esc((post.platforms || []).map(capitalize).join(" · ") || "Sin plataforma")}</span>
        <span>${esc(post.profileName || "Sin profile")}</span>
        <span>${esc(post.scheduledFor || post.publishedAt || "Sin fecha")}</span>
      </div>
    </article>
  `).join("");
}

function renderSocialPublishingHealth(social, intel) {
  const target = document.querySelector("#socialPublishingHealth");
  if (!target) return;
  const rows = [
    ["Perfiles activos", displayValue(social.profiles)],
    ["Cuentas listas para publicar", displayValue(social.publish_ready_accounts)],
    ["Cuentas con analytics", displayValue(social.analytics_ready_accounts)],
    ["Posts programados", displayValue(social.scheduled_posts)],
    ["Drafts", displayValue(social.draft_posts)],
    ["Posts publicados", displayValue(social.published_posts)],
    ["Cadencia estimada", `${displayValue(intel.pipeline.postsPerWeek)} posts/semana`],
    ["Cobertura del calendario", displayValue(intel.pipeline.scheduleCoverage, "%")],
  ];
  target.innerHTML = rows.map(([label, value]) => `<div class="row"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`).join("");
}

function renderSocialPlatformSpotlight(targetId, platform, social, intel) {
  const target = document.querySelector(`#${targetId}`);
  if (!target) return;
  const platformSummary = intel.platforms.find((item) => item.platform === platform);
  const accounts = (social.accounts || []).filter((item) => item.platform === platform);
  const posts = (social.posts || []).filter((item) => (item.platforms || []).includes(platform));
  if (!accounts.length) {
    target.innerHTML = `<div class="empty-state">Sin cuentas conectadas en ${esc(capitalize(platform))}.</div>`;
    return;
  }
  const totalFollowers = accounts.reduce((sum, item) => sum + (Number(item.followers) || 0), 0);
  const ready = accounts.filter((item) => item.publishReady).length;
  const analytics = accounts.filter((item) => item.analyticsReady).length;
  const permissions = Math.max(0, ...accounts.map((item) => Number(item.permissionsCount) || 0));
  const privacy = [...new Set(accounts.flatMap((item) => item.privacyLevels || []))];
  target.innerHTML = `
    <div class="row"><strong>Cuentas</strong><span>${displayValue(accounts.length)}</span></div>
    <div class="row"><strong>Followers agregados</strong><span>${displayValue(totalFollowers)}</span></div>
    <div class="row"><strong>ER media</strong><span>${displayValue(platformSummary?.avgEngagementRate, "%")}</span></div>
    <div class="row"><strong>Reach medio</strong><span>${displayValue(platformSummary?.avgReach)}</span></div>
    <div class="row"><strong>Publish-ready</strong><span>${displayValue(ready)} / ${displayValue(accounts.length)}</span></div>
    <div class="row"><strong>Analytics activos</strong><span>${displayValue(analytics)} / ${displayValue(accounts.length)}</span></div>
    <div class="row"><strong>Max permisos</strong><span>${displayValue(permissions)}</span></div>
    <div class="row"><strong>Posts visibles</strong><span>${displayValue(posts.length)}</span></div>
    <div class="row"><strong>Top contenido</strong><span>${esc(platformSummary?.topContentLabel || "Sin top post")}</span></div>
    <div class="row"><strong>Privacidad</strong><span>${esc(privacy.join(" · ") || "Por defecto / no expuesta")}</span></div>
  `;
}

function renderSocialVoice(voice, note, platformFilter = null) {
  const target = document.querySelector("#socialVoice");
  if (!target) return;
  const quotesFiltered = (voice?.quotes || []).filter((quote) => !platformFilter || quote.platform === platformFilter);
  if (!voice || (platformFilter === "tiktok" ? !quotesFiltered.length : (!voice.commentsAnalyzed && !quotesFiltered.length))) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin comentarios suficientes todavía.")}</div>`;
    return;
  }
  const terms = (voice.topTerms || []).slice(0, 8).map((item) => `<span class="tag-chip">${esc(item.term)} · ${esc(item.count)}</span>`).join("");
  const quotes = quotesFiltered.slice(0, 4).map((quote) => `
    <article class="quote-card">
      <span class="badge ${quote.signal === "negative" ? "warn" : quote.signal === "lead" ? "info" : ""}">${esc(quote.signal)}</span>
      <p>${esc(quote.text)}</p>
      <small>${esc(quote.author || "audiencia")} · ${esc(capitalize(quote.platform || "social"))}</small>
    </article>
  `).join("");
  target.innerHTML = `
    <article class="social-stat-card">
      <span>Comentarios leídos</span>
      <strong>${displayValue(voice.commentsAnalyzed)}</strong>
      <small>${displayValue(voice.questionComments)} preguntas · ${displayValue(voice.leadQuestions)} señales de lead</small>
    </article>
    <article class="social-stat-card">
      <span>Riesgo reputacional</span>
      <strong>${displayValue(voice.negativeSignals)}</strong>
      <small>Comentarios con fricción u objeción detectada</small>
    </article>
    <article class="social-stat-card social-stat-wide">
      <span>Temas dominantes</span>
      <div class="tag-cloud">${terms || "<small>Sin temas claros todavía.</small>"}</div>
    </article>
    <div class="quote-grid">${quotes || `<div class="empty-inline">Sin citas destacadas todavía.</div>`}</div>
  `;
}

function renderSocialAlerts(alerts, note, platformFilter = null) {
  const target = document.querySelector("#socialAlerts");
  if (!target) return;
  const visibleAlerts = platformFilter === "tiktok" ? [] : toArray(alerts);
  if (!visibleAlerts || !visibleAlerts.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin alertas relevantes por ahora.")}</div>`;
    return;
  }
  target.innerHTML = visibleAlerts.slice(0, 5).map((alert) => `
    <article class="alert-card">
      <div class="social-post-head">
        <strong>${esc(alert.contentPreview || "Post con comentarios")}</strong>
        <span class="badge warn">${displayValue(alert.negativeComments)} riesgo · ${displayValue(alert.leadQuestions)} leads</span>
      </div>
      <div class="social-post-meta">
        <span>${displayValue(alert.commentCount)} comentarios</span>
        <span>${alert.permalink ? `<a href="${esc(alert.permalink)}" target="_blank" rel="noreferrer">Abrir post</a>` : "Sin link"}</span>
      </div>
      ${alert.sampleNegative ? `<p>${esc(alert.sampleNegative)}</p>` : ""}
    </article>
  `).join("");
}

function renderSocialTopPosts(posts, note, platformFilter = null) {
  const target = document.querySelector("#socialTopPosts");
  if (!target) return;
  const safePosts = toArray(posts);
  const visiblePosts = platformFilter ? safePosts.filter((post) => post.platform === platformFilter) : safePosts;
  if (!visiblePosts || !visiblePosts.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin top posts todavía.")}</div>`;
    return;
  }
  target.innerHTML = visiblePosts.slice(0, 8).map((post) => `
    <article class="social-post-card">
      <div class="social-post-head">
        <strong>${esc(capitalize(post.platform || "social"))}</strong>
        <span class="badge">${displayValue(post.engagementRate, "%")}</span>
      </div>
      <p>${esc(post.content || "Sin texto disponible.")}</p>
      <div class="social-post-meta">
        <span>${displayValue(post.impressions)} imp</span>
        <span>${displayValue(post.reach)} reach</span>
        <span>${displayValue(post.likes)} likes</span>
        <span>${displayValue(post.comments)} comments</span>
        <span>${esc(formatShortDate(post.publishedAt) || "Sin fecha")}</span>
      </div>
    </article>
  `).join("");
}

function renderSocialCalendar(calendar, note, platformFilter = null) {
  const target = document.querySelector("#socialCalendar");
  if (!target) return;
  const bestSlotsList = platformFilter ? (calendar?.bestSlots || []).filter((slot) => slot.platform === platformFilter) : (calendar?.bestSlots || []);
  const cadenceList = platformFilter ? (calendar?.cadence || []).filter((row) => row.platform === platformFilter) : (calendar?.cadence || []);
  if (!calendar || (!bestSlotsList.length && !cadenceList.length)) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin histórico suficiente para recomendar calendario.")}</div>`;
    return;
  }
  const slots = bestSlotsList.slice(0, 6).map((slot) => `
    <div class="calendar-slot">
      <strong>${esc(capitalize(slot.platform || "social"))}</strong>
      <span>${esc(formatDayOfWeek(slot.dayOfWeek))} · ${String(slot.hour).padStart(2, "0")}:00</span>
      <small>${displayValue(slot.avgEngagement)} engagement · ${displayValue(slot.postCount)} posts</small>
    </div>
  `).join("");
  const cadence = cadenceList.slice(0, 6).map((row) => `
    <div class="calendar-slot">
      <strong>${esc(capitalize(row.platform || "social"))}</strong>
      <span>${displayValue(row.postsPerWeek)} posts/semana</span>
      <small>${displayValue(row.avgEngagementRate, "%")} ER · ${displayValue(row.weeksCount)} semanas</small>
    </div>
  `).join("");
  target.innerHTML = `
    <article class="social-stat-card social-stat-wide">
      <span>Recomendación</span>
      <small>${esc(calendar.recommendation || note || "Sin recomendación todavía.")}</small>
    </article>
    <div class="calendar-band">
      <h3>Mejores horarios</h3>
      <div class="calendar-slot-grid">${slots}</div>
    </div>
    <div class="calendar-band">
      <h3>Cadencia observada</h3>
      <div class="calendar-slot-grid">${cadence}</div>
    </div>
  `;
}

function renderSocialLocalExecutive(local) {
  const target = document.querySelector("#socialLocalExecutive");
  if (!target) return;
  if (!local?.locations_rows?.length) {
    target.innerHTML = `<div class="empty-state">${esc(local?.note ?? "Sin histórico local todavía.")}</div>`;
    return;
  }
  const leader = toArray(local.locations_rows)
    .slice()
    .sort((a, b) => ((b.totalReviewCount || 0) + (b.websiteClicks || 0)) - ((a.totalReviewCount || 0) + (a.websiteClicks || 0)))[0];
  target.innerHTML = `
    <article class="social-exec-card social-exec-primary">
      <span>Sedes activas</span>
      <strong>${displayValue(local.locations)}</strong>
      <small>${displayValue(local.accounts)} cuentas GBP historizadas · snapshot ${esc(formatShortDate(local.snapshot_date) || "actual")}</small>
    </article>
    <article class="social-exec-card">
      <span>Reputación</span>
      <strong>${displayValue(local.avg_rating)}</strong>
      <small>${displayValue(local.reviews)} reseñas totales · ${displayValue(local.unanswered_reviews)} sin responder</small>
    </article>
    <article class="social-exec-card">
      <span>Acciones locales</span>
      <strong>${displayValue(local.website_clicks + local.call_clicks + local.direction_requests)}</strong>
      <small>${displayValue(local.website_clicks)} web · ${displayValue(local.call_clicks)} llamadas · ${displayValue(local.direction_requests)} rutas</small>
    </article>
    <article class="social-exec-card">
      <span>Salud de ficha</span>
      <strong>${displayValue(local.coverage_score, "%")}</strong>
      <small>${displayValue(local.recent_reviews_30d)} reseñas en 30d · ${displayValue(local.low_rating_reviews)} reseñas <= 3 estrellas</small>
    </article>
    <article class="social-exec-card social-exec-wide">
      <span>Lectura local</span>
      <p>${esc(leader
        ? `${leader.locationName} hoy concentra la mayor masa local. La prioridad operativa está en responder ${displayValue(local.unanswered_reviews)} reseñas pendientes, sostener una cobertura de ficha de ${displayValue(local.coverage_score, "%")} y convertir mejor las búsquedas locales en visitas web, llamadas y rutas.`
        : (local.note || "Sin lectura local todavía."))}</p>
    </article>
  `;
}

function renderSocialLocalLocations(local) {
  const target = document.querySelector("#socialLocalLocations");
  if (!target) return;
  const rows = toArray(local?.locations_rows);
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">${esc(local?.note ?? "Sin sedes historizadas todavía.")}</div>`;
    return;
  }
  target.innerHTML = rows.map((row) => `
    <article class="social-account-card">
      <div class="social-account-top">
        <div>
          <strong>${esc(row.locationName)}</strong>
          <div class="social-account-subtitle">${esc(row.city || "Colombia")} · ${esc(row.category || "Sin categoría")} · ${esc(displayValue(row.completenessScore, "%"))} de completitud</div>
        </div>
        <div class="social-account-badges">
          <span class="badge ${row.unansweredReviews > 0 ? "warn" : ""}">${displayValue(row.unansweredReviews)} sin responder</span>
          <span class="badge ${row.lowRatingReviews > 0 ? "warn" : ""}">${displayValue(row.averageRating)} rating</span>
        </div>
      </div>
      <div class="social-account-grid">
        <span><strong>Reseñas</strong>${displayValue(row.totalReviewCount)}</span>
        <span><strong>Últimos 30d</strong>${displayValue(row.recentReviews30d)}</span>
        <span><strong>Web clicks</strong>${displayValue(row.websiteClicks)}</span>
        <span><strong>Llamadas</strong>${displayValue(row.callClicks)}</span>
        <span><strong>Rutas</strong>${displayValue(row.directionRequests)}</span>
        <span><strong>Keyword líder</strong>${esc(row.topKeyword || "Sin query líder")}</span>
        <span><strong>Maps</strong>${row.mapsUri ? `<a href="${esc(row.mapsUri)}" target="_blank" rel="noreferrer">Abrir</a>` : "No disponible"}</span>
        <span><strong>Reviews</strong>${row.reviewUrl ? `<a href="${esc(row.reviewUrl)}" target="_blank" rel="noreferrer">Abrir</a>` : "No disponible"}</span>
      </div>
    </article>
  `).join("");
}

function renderSocialLocalReviews(local) {
  const target = document.querySelector("#socialLocalReviews");
  if (!target) return;
  const rows = toArray(local?.locations_rows).slice().sort((a, b) => (b.unansweredReviews + b.lowRatingReviews * 2) - (a.unansweredReviews + a.lowRatingReviews * 2));
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">${esc(local?.note ?? "Sin reseñas historizadas todavía.")}</div>`;
    return;
  }
  target.innerHTML = rows.slice(0, 8).map((row) => `
    <div class="history-row local-history-row">
      <div>
        <strong>${esc(row.locationName)}</strong>
        <small>${displayValue(row.recentReviews30d)} nuevas en 30d · última ${esc(formatShortDate(row.latestReviewAt) || "sin fecha")}</small>
      </div>
      <span>${displayValue(row.totalReviewCount)} total</span>
      <span>${displayValue(row.unansweredReviews)} pendientes</span>
      <span class="badge ${row.unansweredReviews > 0 || row.lowRatingReviews > 0 ? "warn" : ""}">${displayValue(row.lowRatingReviews)} críticas</span>
    </div>
  `).join("");
}

function renderSocialLocalKeywords(local) {
  const target = document.querySelector("#socialLocalKeywords");
  if (!target) return;
  const keywords = toArray(local?.top_keywords);
  const trend = toArray(local?.trend);
  if (!keywords.length && !trend.length) {
    target.innerHTML = `<div class="empty-state">${esc(local?.note ?? "Sin señales locales todavía.")}</div>`;
    return;
  }
  const keywordRows = keywords.slice(0, 8).map((row) => `
    <div class="row">
      <strong>${esc(row.keyword)}</strong>
      <span>${displayValue(row.impressions)} imp · ${esc(row.locationName)}</span>
    </div>
  `).join("");
  const trendRows = trend.slice(-8).map((row) => `
    <div class="executive-trend-row">
      <span>${esc(formatTrendLabel(row.date.slice(5)))}</span>
      <div class="bar"><span style="width:${Math.max(6, Math.min(100, Math.round((((row.websiteClicks + row.callClicks + row.directionRequests) || 0) / Math.max(1, ...trend.map((item) => (item.websiteClicks + item.callClicks + item.directionRequests) || 0))) * 100)))}%"></span></div>
      <small>${displayValue(row.websiteClicks)} web · ${displayValue(row.callClicks)} calls · ${displayValue(row.directionRequests)} rutas</small>
    </div>
  `).join("");
  target.innerHTML = `
    <article class="local-keyword-band">
      <h3>Búsquedas locales líderes</h3>
      <div class="stack">${keywordRows}</div>
    </article>
    <article class="local-keyword-band">
      <h3>Acciones recientes</h3>
      <div class="stack">${trendRows || `<div class="empty-inline">Sin tendencia reciente.</div>`}</div>
    </article>
  `;
}

function renderSocialExecutiveSummary(intel, note) {
  const target = document.querySelector("#socialExecutiveSummary");
  if (!target) return;
  if (!intel.platforms.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin inteligencia social todavía.")}</div>`;
    return;
  }
  target.innerHTML = `
    <article class="social-exec-card social-exec-primary">
      <span>Audiencia total</span>
      <strong>${displayValue(intel.audience.totalFollowers)}</strong>
      <small>${esc(intel.audience.leaderLabel)} lidera la comunidad · ${displayValue(intel.audience.activePlatforms)} plataformas activas</small>
    </article>
    <article class="social-exec-card">
      <span>ER promedio</span>
      <strong>${displayValue(intel.performance.avgEngagementRate, "%")}</strong>
      <small>${displayValue(intel.performance.avgReach)} reach medio · ${displayValue(intel.performance.postsAnalyzed)} posts analizados</small>
    </article>
    <article class="social-exec-card">
      <span>Readiness operativa</span>
      <strong>${displayValue(intel.operations.publishReadyRate, "%")}</strong>
      <small>${displayValue(intel.operations.analyticsCoverage, "%")} cobertura analytics · ${displayValue(intel.operations.accountsReady)} cuentas listas</small>
    </article>
    <article class="social-exec-card">
      <span>Comunidad</span>
      <strong>${displayValue(intel.community.responsePressure)}</strong>
      <small>${displayValue(intel.community.leadSignals)} señales de lead · ${displayValue(intel.community.riskAlerts)} alertas</small>
    </article>
    <article class="social-exec-card social-exec-wide">
      <span>Lectura ejecutiva</span>
      <p>${esc(intel.executiveSummary)}</p>
    </article>
  `;
}

function renderSocialTrendChart(intel, note) {
  const target = document.querySelector("#socialTrendChart");
  if (!target) return;
  const points = intel.trendSeries;
  if (!points.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin suficiente histórico reciente para ver tendencia.")}</div>`;
    return;
  }
  const width = 760;
  const height = 280;
  const pad = 28;
  const bottomPad = 38;
  const maxReach = Math.max(1, ...points.map((point) => point.reach || 0));
  const maxEngagement = Math.max(1, ...points.map((point) => point.engagementRate || 0));
  const x = (index) => pad + index * ((width - pad * 2) / Math.max(1, points.length - 1));
  const yReach = (value) => height - bottomPad - (value / maxReach) * (height - pad - bottomPad);
  const yEr = (value) => height - bottomPad - (value / maxEngagement) * (height - pad - bottomPad);
  const line = (accessor) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${accessor(point)}`).join(" ");
  target.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia de performance social">
      <defs>
        <linearGradient id="socialArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#6d4cc2" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#6d4cc2" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${line((p) => yReach(p.reach || 0))} L ${x(points.length - 1)} ${height - bottomPad} L ${pad} ${height - bottomPad} Z" fill="url(#socialArea)" />
      <path d="${line((p) => yReach(p.reach || 0))}" fill="none" stroke="#6d4cc2" stroke-width="3.5" stroke-linecap="round" />
      <path d="${line((p) => yEr(p.engagementRate || 0))}" fill="none" stroke="#138a72" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 7" />
      ${points.map((point, index) => `
        <g>
          <circle cx="${x(index)}" cy="${yReach(point.reach || 0)}" r="4" fill="#6d4cc2" />
          <text x="${x(index)}" y="${height - 12}" text-anchor="middle" font-size="11" fill="#736d64">${esc(point.label)}</text>
        </g>
      `).join("")}
    </svg>
    <div class="social-chart-legend">
      <span><i class="swatch swatch-reach"></i> Reach / impresiones</span>
      <span><i class="swatch swatch-er"></i> Engagement rate</span>
    </div>
  `;
}

function renderSocialPlatformBoard(intel, note) {
  const target = document.querySelector("#socialPlatformBoard");
  if (!target) return;
  if (!intel.platforms.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin plataformas activas todavía.")}</div>`;
    return;
  }
  target.innerHTML = intel.platforms.map((platform) => `
    <article class="social-platform-card">
      <header>
        <div>
          <strong>${esc(platformDisplayName(platform.platform))}</strong>
          <small>${displayValue(platform.accounts)} cuentas · ${esc(platformCategoryLabel(platform.platform))}</small>
        </div>
        <span class="badge ${platform.healthScore < 60 ? "warn" : ""}">${displayValue(platform.healthScore)} health</span>
      </header>
      <div class="social-platform-grid">
        <span><strong>Followers / audiencia</strong>${displayValue(platform.followers)}</span>
        <span><strong>ER media</strong>${displayValue(platform.avgEngagementRate, "%")}</span>
        <span><strong>Reach medio</strong>${displayValue(platform.avgReach)}</span>
        <span><strong>Programados</strong>${displayValue(platform.scheduled)}</span>
        <span><strong>Publish-ready</strong>${displayValue(platform.publishReady)} / ${displayValue(platform.accounts)}</span>
        <span><strong>Posts visibles</strong>${displayValue(platform.recentPosts)}</span>
      </div>
      <p>${esc(platform.takeaway)}</p>
    </article>
  `).join("");
}

function renderSocialPipeline(intel, note) {
  const target = document.querySelector("#socialPipelineStats");
  if (!target) return;
  if (!intel.platforms.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin pipeline editorial todavía.")}</div>`;
    return;
  }
  target.innerHTML = `
    <article class="social-pipeline-card">
      <span>Posts publicados</span>
      <strong>${displayValue(intel.pipeline.published)}</strong>
      <small>${displayValue(intel.pipeline.postsPerWeek)} posts/semana observados</small>
    </article>
    <article class="social-pipeline-card">
      <span>Programados</span>
      <strong>${displayValue(intel.pipeline.scheduled)}</strong>
      <small>${displayValue(intel.pipeline.scheduleCoverage, "%")} del pipeline listo</small>
    </article>
    <article class="social-pipeline-card">
      <span>Drafts</span>
      <strong>${displayValue(intel.pipeline.drafts)}</strong>
      <small>${displayValue(intel.pipeline.backlogDepth)} piezas en backlog inmediato</small>
    </article>
  `;
}

function renderSocialActionCenter(intel, note) {
  const target = document.querySelector("#socialActionCenter");
  if (!target) return;
  if (!intel.actions.length) {
    target.innerHTML = `<div class="empty-state">${esc(note ?? "Sin acciones prioritarias por ahora.")}</div>`;
    return;
  }
  target.innerHTML = intel.actions.map((item) => `
    <div class="action-item">
      <div>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.reason)}</p>
        <p>${esc(item.action)}</p>
      </div>
      <span class="badge ${item.priority === "Alta" ? "warn" : ""}">${esc(item.priority)}</span>
    </div>
  `).join("");
}

function deriveSocialIntelligence(social, platformFilter = null) {
  const safeSocial = social || {};
  const accountsBase = toArray(safeSocial.accounts);
  const topPostsBase = toArray(safeSocial.top_posts);
  const postsBase = toArray(safeSocial.posts);
  const byPlatformBase = toArray(safeSocial.by_platform);
  const accounts = platformFilter ? accountsBase.filter((item) => item.platform === platformFilter) : accountsBase;
  const topPosts = platformFilter ? topPostsBase.filter((item) => item.platform === platformFilter) : topPostsBase;
  const posts = platformFilter ? postsBase.filter((item) => toArray(item.platforms).includes(platformFilter)) : postsBase;
  const byPlatformSeed = platformFilter ? byPlatformBase.filter((item) => item.platform === platformFilter) : byPlatformBase;
  const totalFollowers = accounts.reduce((sum, account) => sum + (Number(account.followers) || 0), 0);
  const avgEngagementRate = average(topPosts.map((item) => item.engagementRate).filter(isFiniteNumber));
  const avgReach = average(topPosts.map((item) => item.reach ?? item.impressions).filter(isFiniteNumber));
  const postsAnalyzed = topPosts.length;
  const publishReadyAccounts = accounts.filter((item) => item.publishReady).length;
  const analyticsReadyAccounts = accounts.filter((item) => item.analyticsReady).length;
  const publishedPosts = posts.filter((item) => item.status === "published").length;
  const scheduledPosts = posts.filter((item) => item.status === "scheduled").length;
  const draftPosts = posts.filter((item) => item.status === "draft").length;
  const cadenceRowsBase = toArray(safeSocial.calendar?.cadence);
  const bestSlotsBase = toArray(safeSocial.calendar?.bestSlots);
  const cadenceRows = platformFilter ? cadenceRowsBase.filter((item) => item.platform === platformFilter) : cadenceRowsBase;
  const bestSlots = platformFilter ? bestSlotsBase.filter((item) => item.platform === platformFilter) : bestSlotsBase;
  const postsPerWeek = cadenceRows.reduce((sum, row) => sum + (row.postsPerWeek || 0), 0);
  const scheduleCoverage = percentage(scheduledPosts, Math.max(1, scheduledPosts + draftPosts + publishedPosts));
  const publishReadyRate = percentage(publishReadyAccounts, Math.max(1, accounts.length));
  const analyticsCoverage = percentage(analyticsReadyAccounts, Math.max(1, accounts.length));
  const trendSeries = buildSocialTrendSeries(topPosts);
  const platforms = byPlatformSeed.map((item) => {
    const platformAccounts = accounts.filter((account) => account.platform === item.platform);
    const platformPosts = topPosts.filter((post) => post.platform === item.platform);
    const followers = platformAccounts.reduce((sum, account) => sum + (Number(account.followers) || 0), 0);
    const platformAvgEr = average(platformPosts.map((post) => post.engagementRate).filter(isFiniteNumber));
    const platformAvgReach = average(platformPosts.map((post) => post.reach ?? post.impressions).filter(isFiniteNumber));
    const topContent = [...platformPosts].sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0))[0];
    const healthScore = Math.round(
      (percentage(platformAccounts.filter((account) => account.publishReady).length, Math.max(1, platformAccounts.length)) * 0.35)
      + (percentage(platformAccounts.filter((account) => account.analyticsReady).length, Math.max(1, platformAccounts.length)) * 0.25)
      + (Math.min(platformAvgEr || 0, 15) / 15) * 40
    );
    return {
      platform: item.platform,
      accounts: item.accounts,
      publishReady: item.publishReady,
      published: item.published,
      scheduled: item.scheduled,
      followers,
      avgEngagementRate: platformAvgEr,
      avgReach: platformAvgReach,
      recentPosts: platformPosts.length,
      topContentLabel: topContent?.content ? topContent.content.slice(0, 52) : null,
      healthScore,
      takeaway: buildPlatformTakeaway(item.platform, platformAvgEr, item.publishReady, item.accounts, topContent),
    };
  }).sort((a, b) => (b.followers || 0) - (a.followers || 0));
  const leader = platforms[0];
  const actions = buildSocialActionItems({
    platformFilter,
    accounts,
    topPosts,
    riskAlerts: toArray(safeSocial.reputation_alerts),
    voice: safeSocial.customer_voice,
    cadenceRows,
    bestSlots,
    scheduleCoverage,
    publishReadyRate,
    analyticsCoverage,
    platforms,
    scheduledPosts,
    draftPosts,
  });
  const executiveSummary = buildSocialExecutiveSummary({
    platformFilter,
    leader,
    avgEngagementRate,
    publishReadyRate,
    analyticsCoverage,
    scheduleCoverage,
    leadSignals: safeSocial.customer_voice?.leadQuestions || 0,
    riskAlerts: toArray(safeSocial.reputation_alerts).length,
    bestSlots,
  });
  return {
    platforms,
    trendSeries,
    actions,
    executiveSummary,
    audience: {
      totalFollowers,
      leaderLabel: leader ? `${capitalize(leader.platform)} (${displayValue(leader.followers)} followers)` : "Sin líder claro",
      activePlatforms: platforms.length,
    },
    performance: {
      avgEngagementRate,
      avgReach,
      postsAnalyzed,
    },
    operations: {
      publishReadyRate,
      analyticsCoverage,
      accountsReady: publishReadyAccounts,
    },
    community: {
      leadSignals: safeSocial.customer_voice?.leadQuestions || 0,
      riskAlerts: toArray(safeSocial.reputation_alerts).length,
      responsePressure: (safeSocial.customer_voice?.negativeSignals || 0) + (safeSocial.customer_voice?.questionComments || 0),
    },
    pipeline: {
      published: publishedPosts,
      scheduled: scheduledPosts,
      drafts: draftPosts,
      postsPerWeek,
      scheduleCoverage,
      backlogDepth: scheduledPosts + draftPosts,
    },
  };
}

function buildSocialTrendSeries(posts) {
  const buckets = new Map();
  for (const post of posts) {
    const rawDate = post.publishedAt || "";
    const date = rawDate ? new Date(rawDate) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const bucket = buckets.get(key) || { label: key.slice(5), reach: 0, engagementRateSum: 0, count: 0 };
    bucket.reach += Number(post.reach ?? post.impressions) || 0;
    bucket.engagementRateSum += Number(post.engagementRate) || 0;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([, bucket]) => ({
      label: bucket.label,
      reach: bucket.reach,
      engagementRate: bucket.count ? bucket.engagementRateSum / bucket.count : 0,
    }));
}

function buildPlatformTakeaway(platform, avgEr, publishReady, accounts, topContent) {
  const readiness = accounts ? percentage(publishReady, accounts) : 0;
  const contentHint = topContent?.content ? `Top creativo: ${topContent.content.slice(0, 46)}.` : "Sin top post claro todavía.";
  if (platform === "googlebusiness") return `Google Business ya opera como capa de presencia local por sede. Vigila consistencia, reseñas y publicaciones locales.`;
  if (platform === "googleads" || platform === "tiktokads") return `${platformDisplayName(platform)} funciona como superficie de distribución paga. Lo clave aquí es cobertura operativa y medición, más que ER orgánico.`;
  if (platform === "youtube") return `YouTube queda como superficie editorial de fondo. Conviene conectar frecuencia, títulos y reaprovechamiento desde social corto.`;
  if ((avgEr || 0) >= 8) return `${capitalize(platform)} está respondiendo bien. ${contentHint}`;
  if (readiness < 100) return `${capitalize(platform)} aún tiene fricción operativa (${displayValue(readiness, "%")} listo). ${contentHint}`;
  return `${capitalize(platform)} necesita más experimentación creativa o distribución. ${contentHint}`;
}

function groupPlatformsForRadar(platforms) {
  const groups = new Map();
  for (const platform of toArray(platforms)) {
    const key = platformCategory(platform.platform);
    const current = groups.get(key) || {
      key,
      label: platformCategoryLabel(platform.platform),
      accounts: 0,
      followers: 0,
      publishReady: 0,
      recentPosts: 0,
      engagementRates: [],
      names: [],
    };
    current.accounts += Number(platform.accounts) || 0;
    current.followers += Number(platform.followers) || 0;
    current.publishReady += Number(platform.publishReady) || 0;
    current.recentPosts += Number(platform.recentPosts) || 0;
    if (isFiniteNumber(platform.avgEngagementRate)) current.engagementRates.push(platform.avgEngagementRate);
    current.names.push(platformDisplayName(platform.platform));
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    label: group.label,
    value: group.key === "local_presence"
      ? displayValue(group.accounts)
      : group.key === "paid_distribution"
        ? displayValue(group.accounts)
        : displayValue(group.followers),
    detail: group.key === "local_presence"
      ? `${displayValue(group.accounts)} sedes/cuentas locales · ${displayValue(group.publishReady)} listas`
      : group.key === "paid_distribution"
        ? `${group.names.join(" · ")} · ${displayValue(group.accounts)} cuentas activas`
        : `${displayValue(average(group.engagementRates), "%")} ER media · ${displayValue(group.recentPosts)} posts visibles`,
  }));
}

function platformCategory(platform) {
  if (platform === "googlebusiness") return "local_presence";
  if (platform === "googleads" || platform === "tiktokads") return "paid_distribution";
  return "social_channel";
}

function platformCategoryLabel(platform) {
  const key = platformCategory(platform);
  if (key === "local_presence") return "Presencia local";
  if (key === "paid_distribution") return "Distribución paga";
  return "Canal social";
}

function platformDisplayName(platform) {
  return ({
    googlebusiness: "Google Business",
    googleads: "Google Ads",
    tiktokads: "TikTok Ads",
    instagram: "Instagram",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    youtube: "YouTube",
  })[platform] || capitalize(platform);
}

function buildSocialExecutiveSummary(input) {
  const slot = input.bestSlots?.[0];
  const slotLabel = slot ? `${formatDayOfWeek(slot.dayOfWeek)} ${String(slot.hour).padStart(2, "0")}:00` : "sin slot ganador claro";
  const scope = input.platformFilter ? capitalize(input.platformFilter) : "el portafolio social";
  return `${scope} promedia ${displayValue(input.avgEngagementRate, "%")} de engagement rate, con readiness operativa de ${displayValue(input.publishReadyRate, "%")} y analytics coverage de ${displayValue(input.analyticsCoverage, "%")}. El mejor momento observado hoy es ${slotLabel}; hay ${displayValue(input.leadSignals)} señales de lead y ${displayValue(input.riskAlerts)} focos reputacionales a vigilar.`;
}

function buildSocialActionItems(input) {
  const actions = [];
  if (input.riskAlerts.length > 0) {
    actions.push({
      title: "Atender conversación con riesgo",
      reason: `${displayValue(input.riskAlerts.length)} posts tienen comentarios con fricción o señales de crisis.`,
      action: "Responder primero los hilos con objeciones o preguntas repetidas y convertirlos en FAQ o contenido de soporte.",
      priority: "Alta",
    });
  }
  if (input.voice?.leadQuestions > 0) {
    actions.push({
      title: "Capturar demanda comercial en comentarios",
      reason: `${displayValue(input.voice.leadQuestions)} comentarios muestran intención de compra o solicitud de información.`,
      action: "Centraliza respuestas sobre precio, horarios y cupos con CTA claro hacia WhatsApp o formulario.",
      priority: "Alta",
    });
  }
  if (input.scheduleCoverage < 35) {
    actions.push({
      title: "Subir cobertura del calendario",
      reason: `Solo ${displayValue(input.scheduleCoverage, "%")} del pipeline está agendado frente al backlog inmediato.`,
      action: "Programa contenido para la próxima semana antes de abrir nuevos drafts y usa los slots de mejor performance.",
      priority: "Media",
    });
  }
  if (input.publishReadyRate < 100) {
    actions.push({
      title: "Cerrar brechas operativas por cuenta",
      reason: `${displayValue(input.publishReadyRate, "%")} de las cuentas está realmente lista para publicar.`,
      action: "Revisa permisos, privacidad y estado de conexión para que ninguna cuenta clave quede fuera del calendario.",
      priority: "Media",
    });
  }
  const weakPlatform = [...input.platforms].sort((a, b) => (a.avgEngagementRate || 0) - (b.avgEngagementRate || 0))[0];
  if (weakPlatform && input.platforms.length > 1) {
    actions.push({
      title: `Elevar el piso de ${capitalize(weakPlatform.platform)}`,
      reason: `${capitalize(weakPlatform.platform)} está por debajo del resto en engagement relativo.`,
      action: "Replica ganchos, formatos o temas del canal líder y prueba una secuencia de 2-3 piezas con hipótesis claras.",
      priority: "Media",
    });
  }
  if (!actions.length) {
    actions.push({
      title: "Sistema estable",
      reason: "No hay alertas fuertes ni vacíos críticos en la operación actual.",
      action: "Mantén la cadencia, documenta aprendizajes de los top posts y sigue monitoreando comunidad y analytics.",
      priority: "Baja",
    });
  }
  return actions.slice(0, 5);
}

function buildSeoExecutiveNarrative(data) {
  const clicks = data.overview?.metrics?.[0]?.value ?? "Sin datos";
  const top10 = displayValue(data.keywords?.top10);
  const score = displayValue(data.technical?.score);
  const ai = displayValue(data.ai_visibility?.by_domain?.[0]?.google_mentions);
  const traffic = getTrafficReality(data);
  return `El frente orgánico está sosteniendo ${clicks} clics reales, ${top10} keywords en Top 10 y una postura técnica de ${score}. GA4 separa ${displayValue(traffic.acquisition)} sesiones de adquisición frente a ${displayValue(traffic.operational)} del Portal / Q10, y la capa de AI visibility ya registra ${ai} menciones en Google AI para el dominio principal.`;
}

function buildSocialExecutiveNarrative(social, intel, leadPlatform, platformFilter) {
  const scope = platformFilter ? capitalize(platformFilter) : "el ecosistema social";
  const leadSignals = displayValue(social?.customer_voice?.leadQuestions);
  const alerts = displayValue(toArray(social?.reputation_alerts).length);
  const cadence = displayValue(intel.pipeline?.postsPerWeek);
  const leaderLine = leadPlatform ? `${capitalize(leadPlatform.platform)} concentra la mayor masa de audiencia y lidera el momentum.` : "Todavía no hay un líder claro entre plataformas.";
  return `${scope} opera con una cadencia observada de ${cadence} posts/semana. ${leaderLine} Hoy vemos ${leadSignals} señales de lead y ${alerts} focos reputacionales a vigilar.`;
}

function formatBestSlot(slot) {
  if (!slot) return "Sin datos";
  return `${formatDayOfWeek(slot.dayOfWeek)} ${String(slot.hour).padStart(2, "0")}:00`;
}

function stripUrl(value) {
  if (!value) return "";
  if (value === "/") return "Home";
  if (String(value).startsWith("/")) return String(value).replace(/\/$/, "") || "Home";
  return String(value)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function normalizeSignalStatus(status) {
  return ["live", "pending", "error", "degraded"].includes(status) ? status : "live";
}

function latestGeneratedAt(values) {
  const timestamps = toArray(values)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

function formatDeltaValue(current, baseline, isPercent = false) {
  if (!isFiniteNumber(current) || !isFiniteNumber(baseline) || baseline === 0) return "Sin baseline";
  const delta = ((current - baseline) / Math.abs(baseline)) * 100;
  const formatted = new Intl.NumberFormat("es-CO", { maximumFractionDigits: Math.abs(delta) >= 10 ? 0 : 1 }).format(Math.abs(delta));
  const suffix = isPercent ? " vs base" : " vs base";
  return `${delta >= 0 ? "+" : "-"}${formatted}%${suffix}`;
}

function trendTone(current, baseline, threshold = 10) {
  if (!isFiniteNumber(current) || !isFiniteNumber(baseline) || baseline === 0) return "neutral";
  const delta = ((current - baseline) / Math.abs(baseline)) * 100;
  if (delta <= -threshold) return "warn";
  if (delta >= threshold) return "info";
  return "neutral";
}

function average(values) {
  const valid = values.filter(isFiniteNumber);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function percentage(value, total) {
  if (!isFiniteNumber(value) || !isFiniteNumber(total) || total <= 0) return null;
  return Math.round((value / total) * 100);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

function formatDayOfWeek(value) {
  return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][Number(value) || 0];
}

function updateSectionVisibility() {
  document.querySelectorAll("[data-section]").forEach((panel) => {
    const allowed = panel.dataset.section.split(" ");
    panel.classList.toggle("hidden", !allowed.includes(state.view));
  });
  const executiveVisibleViews = new Set(["executive_overview", "overview", "monthly", "weekly", "social_overview", "social_local"]);
  const executiveVisible = executiveVisibleViews.has(state.view);
  document.querySelector("#executiveDeck")?.classList.toggle("hidden", !executiveVisible);
  document.querySelector("#signalRail")?.classList.toggle("hidden", !executiveVisible);
  document.querySelector("#insightMatrix")?.classList.toggle("hidden", !executiveVisible);
  document.querySelector("#benchmarkBoard")?.classList.toggle("hidden", !executiveVisible);
}

// =====================================================================
// Backlog (SEO agent tasks)
// =====================================================================

document.querySelector("#agentRunNow")?.addEventListener("click", runAgentNow);
document.querySelector("#backlogRefresh")?.addEventListener("click", loadBacklog);
document.querySelector("#backlogFilterDomain")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogFilterPriority")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogFilterSource")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogFilterTrack")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogSort")?.addEventListener("change", loadBacklog);

const TRACK_CATEGORIES = {
  recovery: new Set(["migracion", "technical", "tecnico", "indexacion", "schema", "sitemap", "performance"]),
  growth: new Set(["content", "ctr", "on-page", "social", "seo-local", "llm-visibility", "ai-optimization", "ecommerce", "link-building"]),
  config: new Set(["tecnico", "technical"]),
};

async function loadBacklog() {
  const board = document.querySelector("#backlogBoard");
  if (!board) return;
  board.textContent = "Cargando backlog...";
  const params = new URLSearchParams();
  const domain = document.querySelector("#backlogFilterDomain")?.value;
  const priority = document.querySelector("#backlogFilterPriority")?.value;
  const source = document.querySelector("#backlogFilterSource")?.value;
  const sort = document.querySelector("#backlogSort")?.value;
  if (domain) params.set("domain", domain);
  if (priority) params.set("priority", priority);
  if (source) params.set("source_type", source);
  if (sort) params.set("sort", sort);
  try {
    const response = await fetch(`/api/backlog?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    let rows = data.rows ?? [];
    const track = document.querySelector("#backlogFilterTrack")?.value;
    if (track === "risky") {
      rows = rows.filter((r) => r.requires_human_review || r.risk_level === "high");
    } else if (track === "config") {
      rows = rows.filter((r) => {
        const text = (r.title + " " + r.description).toLowerCase();
        return r.action_type === "config" || /ga4|gtm|sitemap|robots|gsc|tracking|tag|consent|medici[oó]n|measurement/.test(text);
      });
    } else if (track === "unassigned") {
      rows = rows.filter((r) => (!r.owner || r.owner === "") || !r.due_date);
    } else if (track === "overdue") {
      const today = new Date().toISOString().slice(0, 10);
      rows = rows.filter((r) => r.due_date && r.due_date < today && r.status !== "ejecutada" && r.status !== "descartada");
    } else if (track === "recovery_focus") {
      rows = rows.filter((r) =>
        r.phase === "recovery"
        && (r.status === "pendiente" || r.status === "en_progreso")
        && (r.priority === "alta" || r.priority === "media")
        && !r.stale_at
      );
      rows.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0));
    } else if (track && TRACK_CATEGORIES[track]) {
      rows = rows.filter((r) => TRACK_CATEGORIES[track].has(r.category));
    }
    renderBacklogBoard(rows);
    loadBacklogStats();
  } catch (error) {
    board.textContent = `No se pudo cargar el backlog: ${error.message}`;
  }
}

async function loadBacklogStats() {
  const target = document.querySelector("#backlogStats");
  const alertBox = document.querySelector("#backlogHealthAlert");
  if (!target) return;
  try {
    const res = await fetch("/api/backlog?action=stats");
    if (!res.ok) return;
    const s = await res.json();
    const cards = [
      { label: "🛠 Recovery pendientes", value: s.recovery_pendiente, kind: "recovery" },
      { label: "🚀 Growth pendientes", value: s.growth_pendiente, kind: "growth" },
      { label: "🔒 Bloqueadas", value: s.total_blocked, kind: "blocked" },
      { label: "⏳ En progreso", value: s.total_en_progreso, kind: "progress" },
      { label: "⏰ Vencidas", value: s.overdue, kind: s.overdue > 0 ? "warn" : "neutral" },
      { label: "👤 Sin owner", value: s.no_owner, kind: s.no_owner > 5 ? "warn" : "neutral" },
      { label: "📅 Sin due date", value: s.no_due_date, kind: s.no_due_date > 5 ? "warn" : "neutral" },
      { label: "🕒 Stale", value: s.stale, kind: "neutral" },
    ];
    // eslint-disable-next-line no-unsanitized/property
    target.innerHTML = cards.map((c) => `
      <div class="stat-card stat-${esc(c.kind)}">
        <span class="stat-value">${esc(c.value)}</span>
        <span class="stat-label">${esc(c.label)}</span>
      </div>
    `).join("");
    if (alertBox) {
      if (s.health_alert) {
        alertBox.hidden = false;
        alertBox.textContent = s.health_alert;
      } else {
        alertBox.hidden = true;
      }
    }
  } catch {
    // silent
  }
}

function renderBacklogBoard(rows) {
  const board = document.querySelector("#backlogBoard");
  if (!board) return;
  if (rows.length === 0) {
    board.classList.add("empty-state");
    board.textContent = "Aún no hay tareas en el backlog. Click en 'Correr agente ahora' para generar el primer batch.";
    return;
  }
  board.classList.remove("empty-state");
  const buckets = { pendiente: [], en_progreso: [], blocked: [], ejecutada: [], descartada: [] };
  for (const row of rows) (buckets[row.status] ?? buckets.pendiente).push(row);
  const columns = [
    { key: "pendiente", label: "Pendiente" },
    { key: "en_progreso", label: "En progreso" },
    { key: "blocked", label: "Bloqueada" },
    { key: "ejecutada", label: "Ejecutada" },
    { key: "descartada", label: "Descartada" },
  ];
  // eslint-disable-next-line no-unsanitized/property
  board.innerHTML = columns.map((col) => `
    <section class="kanban-col" data-col="${esc(col.key)}">
      <header><strong>${esc(col.label)}</strong><span>${buckets[col.key].length}</span></header>
      <div class="kanban-col-body">
        ${buckets[col.key].map(renderTaskCard).join("") || "<p class=\"empty\">—</p>"}
      </div>
    </section>
  `).join("");
  document.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => openTaskModal(Number(card.dataset.id)));
  });
}

function renderTaskCard(row) {
  const ev = row.data_sources?.evidence ?? {};
  const evidenceShort = Object.entries(ev).slice(0, 2).map(([k, v]) => `${esc(k)}: ${esc(typeof v === "object" ? JSON.stringify(v).slice(0, 30) : String(v).slice(0, 30))}`).join(" · ");
  const hasScores = row.impact_score !== null && row.impact_score !== undefined;
  const scoresBlock = hasScores ? `
    <div class="task-scores" title="Impact / Difficulty / Confidence">
      <span class="score-bar score-impact" style="--w:${esc(row.impact_score)}%">I ${esc(Math.round(row.impact_score))}</span>
      <span class="score-bar score-difficulty" style="--w:${esc(row.difficulty_score ?? 0)}%">D ${esc(Math.round(row.difficulty_score ?? 0))}</span>
      <span class="score-bar score-confidence" style="--w:${esc(row.confidence_score ?? 0)}%">C ${esc(Math.round(row.confidence_score ?? 0))}</span>
    </div>
    ${row.opportunity_score !== null && row.opportunity_score !== undefined ? `<small class="opp-score">Opp ${esc(Math.round(row.opportunity_score))}</small>` : ""}
  ` : "";
  const sourceBadge = row.source_type ? `<span class="source-badge source-${esc(row.source_type)}">${esc(row.source_type)}</span>` : "";
  const riskBadge = row.risk_level && row.risk_level !== "low" ? `<span class="risk-badge risk-${esc(row.risk_level)}">⚠ ${esc(row.risk_level)}</span>` : "";
  const reviewBadge = row.requires_human_review ? `<span class="review-badge">👤 review</span>` : "";
  const actionBadge = row.action_type && row.action_type !== "execution" ? `<span class="action-badge action-${esc(row.action_type)}">${esc(row.action_type)}</span>` : "";
  const audienceBadge = row.audience === "estudiantes_actuales" ? `<span class="audience-badge audience-current">🎓 estudiantes actuales</span>` : "";
  const blockedChip = row.status === "blocked" ? `<span class="blocked-chip">🔒 bloqueada${row.blocked_by ? ` (por #${row.blocked_by.join(',#')})` : ""}</span>` : "";
  const ownerChip = row.owner ? `<span class="owner-chip">👤 ${esc(row.owner)}</span>` : "";
  const dueChip = row.due_date ? `<span class="due-chip">📅 ${esc(row.due_date)}</span>` : "";
  const phaseChip = row.phase === "recovery" ? `<span class="phase-chip phase-recovery">🛠 recovery</span>` : row.phase === "growth" ? `<span class="phase-chip phase-growth">🚀 growth</span>` : "";
  return `
    <article class="task-card priority-${esc(row.priority)}${row.requires_human_review ? " needs-review" : ""}" data-id="${esc(row.id)}">
      <header>
        <span class="priority-pill priority-${esc(row.priority)}">${esc(row.priority)}</span>
        <span class="category-pill">${esc(row.category)}</span>
        ${actionBadge}
        ${audienceBadge}
        ${phaseChip}
        ${blockedChip}
        ${riskBadge}
        ${reviewBadge}
        ${sourceBadge}
      </header>
      <div class="task-meta">${ownerChip}${dueChip}</div>
      <h4>${esc(row.title)}</h4>
      <p>${esc(row.description.length > 140 ? row.description.slice(0, 140) + "…" : row.description)}</p>
      ${scoresBlock}
      <footer>
        <span class="domain-tag">${esc(siteLabel(row.domain))}</span>
        ${evidenceShort ? `<small>${evidenceShort}</small>` : ""}
      </footer>
    </article>
  `;
}

async function openTaskModal(id) {
  const response = await fetch(`/api/backlog?action=get&id=${id}`);
  if (!response.ok) return;
  const task = await response.json();
  const modal = document.querySelector("#taskModal") ?? createTaskModalElement();
  const taxonomy = [
    task.programa_relacionado ? `Programa: ${task.programa_relacionado}` : null,
    task.materia_relacionada ? `Materia: ${task.materia_relacionada}` : null,
    task.sede_relacionada ? `Sede: ${task.sede_relacionada}` : null,
    task.modalidad_jornada ? `Modalidad: ${task.modalidad_jornada}` : null,
    task.intencion ? `Intención: ${task.intencion}` : null,
    task.audience ? `Audiencia: ${task.audience}` : null,
    task.funnel_stage ? `Funnel: ${task.funnel_stage}` : null,
    task.conversion_expected ? `Conversión: ${task.conversion_expected}` : null,
  ].filter(Boolean).map((t) => esc(t)).join(" · ");
  const scoresPanel = task.impact_score !== null && task.impact_score !== undefined ? `
    <div class="modal-scores">
      <span><strong>Impact</strong> ${esc(Math.round(task.impact_score))}</span>
      <span><strong>Difficulty</strong> ${esc(Math.round(task.difficulty_score ?? 0))}</span>
      <span><strong>Confidence</strong> ${esc(Math.round(task.confidence_score ?? 0))}</span>
      <span><strong>Opportunity</strong> ${esc(Math.round(task.opportunity_score ?? 0))}</span>
    </div>` : "";
  // eslint-disable-next-line no-unsanitized/property
  modal.querySelector(".modal-body").innerHTML = `
    <header class="modal-head">
      <span class="priority-pill priority-${esc(task.priority)}">${esc(task.priority)}</span>
      <span class="category-pill">${esc(task.category)}</span>
      <span class="domain-tag">${esc(siteLabel(task.domain))}</span>
      ${task.action_type && task.action_type !== "execution" ? `<span class="action-badge action-${esc(task.action_type)}">${esc(task.action_type)}</span>` : ""}
      ${task.risk_level && task.risk_level !== "low" ? `<span class="risk-badge risk-${esc(task.risk_level)}">⚠ riesgo ${esc(task.risk_level)}</span>` : ""}
      ${task.requires_human_review ? `<span class="review-badge">👤 requiere revisión humana</span>` : ""}
      ${task.source_type ? `<span class="source-badge source-${esc(task.source_type)}">${esc(task.source_type)}</span>` : ""}
      <button class="modal-close" type="button">×</button>
    </header>
    <h3>${esc(task.title)}</h3>
    ${taxonomy ? `<p class="taxonomy-line">${taxonomy}</p>` : ""}
    ${scoresPanel}
    <p class="modal-desc">${esc(task.description)}</p>
    <h5>Por qué</h5>
    <p>${esc(task.rationale)}</p>
    <h5>Impacto SEO esperado</h5>
    <p>${esc(task.impact_expected ?? "Sin estimación")}</p>
    ${task.impact_conversion ? `<h5>Impacto en conversión web</h5><p>${esc(task.impact_conversion)}</p>` : ""}
    ${task.business_goal ? `<h5>Objetivo de negocio</h5><p>${esc(task.business_goal)}</p>` : ""}
    ${task.assignee_suggested ? `<h5>Asignado sugerido</h5><p>${esc(task.assignee_suggested)}</p>` : ""}
    <h5>Fuentes / evidencia</h5>
    <pre class="evidence">${esc(JSON.stringify(task.data_sources, null, 2))}</pre>
    ${task.notes ? `<h5>Notas</h5><pre>${esc(task.notes)}</pre>` : ""}
    <h5>Estado</h5>
    <div class="status-actions">
      ${["pendiente", "en_progreso", "blocked", "ejecutada", "descartada"].map((s) => `
        <button class="small-button ${task.status === s ? "is-active" : ""}" data-status="${esc(s)}">${esc(s)}</button>
      `).join("")}
    </div>
    <h5>Operación</h5>
    <div class="op-fields">
      <label>Owner <input id="taskOwnerInput" type="text" value="${esc(task.owner ?? '')}" placeholder="Nombre o email" /></label>
      <label>Due date <input id="taskDueInput" type="date" value="${esc(task.due_date ?? '')}" /></label>
      <label>Team area <input id="taskTeamInput" type="text" value="${esc(task.team_area ?? '')}" placeholder="SEO | dev | content | ops" /></label>
      <button class="small-button" id="saveOpFields" type="button">Guardar</button>
    </div>
    ${task.blocked_by && task.blocked_by.length ? `<p class="blocked-note">🔒 Bloqueada por tareas: ${task.blocked_by.map((id) => `#${esc(id)}`).join(', ')}${task.blocked_reason ? '. ' + esc(task.blocked_reason) : ''}</p>` : ""}
    <textarea id="taskNoteInput" placeholder="Agregar nota (opcional al cambiar estado)"></textarea>
  `;
  modal.classList.add("visible");
  modal.querySelector(".modal-close").addEventListener("click", () => modal.classList.remove("visible"));
  modal.querySelector("#saveOpFields")?.addEventListener("click", async () => {
    const token = document.querySelector("#adminToken")?.value || localStorage.getItem("seoVariablesAdminToken") || "";
    if (!token) { alert("Configura admin token primero."); return; }
    const body = {
      id: task.id,
      owner: modal.querySelector("#taskOwnerInput")?.value || null,
      due_date: modal.querySelector("#taskDueInput")?.value || null,
      team_area: modal.querySelector("#taskTeamInput")?.value || null,
    };
    const res = await fetch("/api/backlog?action=assign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body),
    });
    if (res.ok) { modal.classList.remove("visible"); loadBacklog(); }
    else alert(`No se pudo guardar: ${res.status}`);
  });

  modal.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = btn.dataset.status;
      const notes = modal.querySelector("#taskNoteInput")?.value?.trim() || undefined;
      const token = document.querySelector("#adminToken")?.value || localStorage.getItem("seoVariablesAdminToken") || "";
      if (!token) {
        alert("Necesitas configurar el admin token en la vista Variables primero.");
        return;
      }
      const res = await fetch("/api/backlog?action=update_status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ id: task.id, status, notes }),
      });
      if (res.ok) {
        modal.classList.remove("visible");
        loadBacklog();
      } else {
        alert(`No se pudo actualizar: HTTP ${res.status}`);
      }
    });
  });
}

function createTaskModalElement() {
  const div = document.createElement("div");
  div.id = "taskModal";
  div.className = "task-modal";
  // eslint-disable-next-line no-unsanitized/property
  div.innerHTML = `<div class="modal-backdrop"></div><div class="modal-content"><div class="modal-body"></div></div>`;
  document.body.appendChild(div);
  div.querySelector(".modal-backdrop").addEventListener("click", () => div.classList.remove("visible"));
  return div;
}

async function runAgentNow() {
  const status = document.querySelector("#agentStatus");
  const button = document.querySelector("#agentRunNow");
  if (!status || !button) return;
  const token = document.querySelector("#adminToken")?.value || localStorage.getItem("seoVariablesAdminToken") || "";
  if (!token) {
    status.textContent = "Configura el admin token primero (vista Variables).";
    return;
  }
  button.disabled = true;
  status.textContent = "Corriendo agente... DeepSeek + Opus, esto tarda 1-3 min.";
  try {
    const res = await fetch("/api/backlog?action=run_agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    status.textContent = `Listo. Propuestas: ${data.proposed ?? 0} · Insertadas: ${data.inserted ?? 0} · Actualizadas: ${data.updated ?? 0} · Costo: $${(data.cost_usd ?? 0).toFixed(3)}`;
    loadBacklog();
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function loadVariables() {
  const input = document.querySelector("#adminToken");
  if (input && !input.value) input.value = localStorage.getItem("seoVariablesAdminToken") || "";
  const container = document.querySelector("#variablesList");
  if (!container) return;
  container.innerHTML = `<p class="summary">Cargando variables...</p>`;

  try {
    const response = await fetch("/api/variables");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderVariables(data.variables);
  } catch (error) {
    container.innerHTML = `<p class="summary">No se pudieron cargar variables: ${error.message}</p>`;
  }
}

function renderVariables(variables) {
  const groups = variables.reduce((acc, item) => {
    acc[item.group] ||= [];
    acc[item.group].push(item);
    return acc;
  }, {});

  document.querySelector("#variablesList").innerHTML = Object.entries(groups).map(([group, items]) => `
    <section class="variable-group">
      <h3>${group}</h3>
      ${items.map((item) => `
        <form class="variable-row" data-variable="${item.name}">
          <div>
            <strong>${item.name}</strong>
            <p>${item.description}</p>
            <small>${item.requiredFor}</small>
          </div>
          <span class="badge ${item.configured ? "" : "warn"}">${item.source}</span>
          <input name="value" type="${item.sensitive ? "password" : "text"}" placeholder="${item.preview || "Agregar valor"}" autocomplete="off" />
          <button class="small-button" type="submit">Guardar</button>
          <button class="small-button danger-button" type="button" data-delete="${item.name}">Borrar</button>
        </form>
      `).join("")}
    </section>
  `).join("");

  document.querySelectorAll(".variable-row").forEach((form) => {
    form.addEventListener("submit", saveVariable);
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", deleteVariable);
  });
}

async function saveVariable(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = form.elements.value.value.trim();
  if (!value) return;
  await variablesRequest("/api/variables", {
    method: "POST",
    body: JSON.stringify({ name: form.dataset.variable, value }),
  });
  await loadVariables();
}

async function deleteVariable(event) {
  const name = event.currentTarget.dataset.delete;
  await variablesRequest(`/api/variables?name=${encodeURIComponent(name)}`, { method: "DELETE" });
  await loadVariables();
}

async function variablesRequest(url, options) {
  const token = document.querySelector("#adminToken")?.value || localStorage.getItem("seoVariablesAdminToken") || "";
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

function formatDelta(value) {
  if (typeof value !== "number") return "Sin historico real";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value}% vs periodo anterior`;
}

function formatFreshness(value) {
  const date = new Date(value);
  return `Actualizado ${date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatTrendLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-CO", { month: "short", day: "numeric" }).replace(".", "");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function displayValue(value, suffix = "") {
  if (value === null || value === undefined) return "Sin datos";
  if (typeof value === "number") {
    const formatted = suffix === "%"
      ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: value >= 10 ? 0 : 1 }).format(value)
      : formatNumber(Math.round(value));
    return `${formatted}${suffix}`;
  }
  return `${value}${suffix}`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// Deep-link: ?view=backlog&task=N opens that task's modal at load.
(function applyDeepLinkOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const taskId = params.get("task");
  if (view === "backlog") {
    setView("backlog");
    if (taskId && /^\d+$/.test(taskId)) {
      setTimeout(() => openTaskModal(Number(taskId)), 1200);
    }
  }
})();

setModule("seo");
