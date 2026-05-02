const state = {
  view: "overview",
  data: null,
};

const views = {
  overview: "Overview SEO",
  monthly: "Dashboard Mensual",
  weekly: "Dashboard Semanal",
  content: "Contenido",
  keywords: "Keywords",
  leads: "Leads / Conversiones",
  technical: "Salud Tecnica",
  comparison: "Colombia vs Mexico",
  business: "Insights de Negocio",
  variables: "Variables",
};

const shell = document.querySelector(".shell");
const filters = document.querySelector("#filters");
const navItems = [...document.querySelectorAll(".nav-item")];

document.querySelector("#sidebarToggle").addEventListener("click", () => {
  shell.dataset.sidebar = shell.dataset.sidebar === "closed" ? "open" : "closed";
});

navItems.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewShortcut));
});

filters.addEventListener("change", () => loadDashboard());
document.querySelector("#refreshVariables")?.addEventListener("click", () => loadVariables());
document.querySelector("#adminToken")?.addEventListener("change", (event) => {
  localStorage.setItem("seoVariablesAdminToken", event.target.value);
});

function setView(view) {
  state.view = view;
  document.querySelector("#pageTitle").textContent = views[view];
  navItems.forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  if (view === "weekly") {
    filters.elements.timeframe.value = "weekly";
    loadDashboard();
  } else if (view === "monthly") {
    filters.elements.timeframe.value = "monthly";
    loadDashboard();
  } else {
    updateSectionVisibility();
    if (view === "variables") loadVariables();
  }
}

async function loadDashboard() {
  const params = new URLSearchParams(new FormData(filters));
  setLoading(true);
  try {
    const response = await fetch(`/api/seo-dashboard?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    render(state.data);
  } catch (error) {
    document.querySelector("#summary").textContent = `No se pudo cargar el tablero: ${error.message}`;
  } finally {
    setLoading(false);
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
  renderTrend(data.trends);
  renderKeywords(data.keywords);
  renderContent(data.content);
  renderPages(data.content.topPages);
  renderTechnical(data.technical);
  renderLeads(data.business.channels);
  renderComparison(data.comparison);
  renderOpportunities(data.business.opportunities);
  updateSectionVisibility();
}

function renderSources(sources) {
  document.querySelector("#sourceDots").innerHTML = sources.map((source) => (
    `<span class="source-dot ${source.status}" title="${source.name}: ${source.message}"></span>`
  )).join("");
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
          <stop offset="0%" stop-color="#2454ff" stop-opacity="0.20" />
          <stop offset="100%" stop-color="#2454ff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${line((p) => yOrganic(p.organic))} L ${x(points.length - 1)} ${height - bottomPad} L ${pad} ${height - bottomPad} Z" fill="url(#area)" />
      <path d="${line((p) => yOrganic(p.organic))}" fill="none" stroke="#2454ff" stroke-width="4" stroke-linecap="round" />
      ${points.some((point) => typeof point.leads === "number") ? `<path d="${line((p) => yLeads(p.leads || 0))}" fill="none" stroke="#00a88f" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 8" />` : ""}
      ${points.map((point, index) => `
        <g>
          <circle cx="${x(index)}" cy="${yOrganic(point.organic)}" r="5" fill="#2454ff" />
          ${shouldShowTick(index) ? `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" font-size="12" fill="#69717c">${formatTrendLabel(point.label)}</text>` : ""}
        </g>
      `).join("")}
    </svg>
  `;
}

function renderKeywords(keywords) {
  const intentRows = keywords.intent.map((item) => `
    <div>
      <div class="row"><strong>${item.name}</strong><span>${displayValue(item.value, "%")}</span></div>
      <div class="bar"><span style="width:${item.value || 0}%"></span></div>
      <small>${item.description}</small>
    </div>
  `).join("");

  document.querySelector("#keywordPanel").innerHTML = `
    <div class="row"><strong>Top 3</strong><span>${displayValue(keywords.top3)}</span></div>
    <div class="row"><strong>Top 10</strong><span>${displayValue(keywords.top10)}</span></div>
    <div class="row"><strong>Nuevas</strong><span>${displayValue(keywords.newKeywords)}</span></div>
    <div class="row"><strong>Suben / bajan</strong><span>${displayValue(keywords.movementUp)} / ${displayValue(keywords.movementDown)}</span></div>
    ${intentRows}
  `;
}

function renderContent(content) {
  document.querySelector("#contentOps").innerHTML = `
    <div class="op"><strong>${displayValue(content.published)}</strong><span>Articulos publicados</span></div>
    <div class="op"><strong>${displayValue(content.optimized)}</strong><span>Optimizados</span></div>
    <div class="op"><strong>${displayValue(content.updated)}</strong><span>Actualizados</span></div>
    <div class="op"><strong>${displayValue(content.blogTrafficShare, "%")}</strong><span>Trafico desde blog</span></div>
  `;
}

function renderPages(pages) {
  if (!pages.length) {
    document.querySelector("#topPages").innerHTML = `<div class="empty-state">Sin paginas reales desde Search Console para este filtro.</div>`;
    return;
  }
  document.querySelector("#topPages").innerHTML = pages.map((page) => `
    <div class="page-row">
      <strong>${page.path}</strong>
      <span>${formatNumber(page.sessions)} sesiones</span>
      <span>${page.ctr.toFixed(1)}% CTR</span>
      <span class="badge ${page.status === "Optimizar" ? "warn" : ""}">${page.status}</span>
    </div>
  `).join("");
}

function renderTechnical(technical) {
  const score = typeof technical.score === "number" ? technical.score : 0;
  document.querySelector("#technicalPanel").innerHTML = `
    <div class="score">
      <div class="score-ring" style="--score:${score}%"><strong>${technical.score ?? "S/D"}</strong></div>
      <div>
        <strong>Score general</strong>
        <p class="summary">Solo se muestran valores reales de PageSpeed/GSC. Sin fuente conectada se marca S/D.</p>
      </div>
    </div>
    <div class="row"><strong>LCP</strong><span>${technical.lcp ?? "Sin datos"}</span></div>
    <div class="row"><strong>INP</strong><span>${technical.inp ?? "Sin datos"}</span></div>
    <div class="row"><strong>CLS</strong><span>${technical.cls ?? "Sin datos"}</span></div>
  `;
}

function renderLeads(channels) {
  const max = Math.max(1, ...channels.map((channel) => channel.leads || 0));
  document.querySelector("#leadChannels").innerHTML = channels.map((channel) => `
    <div>
      <div class="row"><strong>${channel.name}</strong><span>${displayValue(channel.leads)} leads · ${displayValue(channel.conversion, "%")}</span></div>
      <div class="bar"><span style="width:${((channel.leads || 0) / max) * 100}%"></span></div>
    </div>
  `).join("");
}

function renderComparison(rows) {
  document.querySelector("#comparisonTable").innerHTML = `
    <div class="comparison-row header"><span>Metrica</span><span>Colombia</span><span>Mexico</span><span>Lider</span></div>
    ${rows.map((row) => `
      <div class="comparison-row">
        <strong>${row.metric}</strong>
        <span>${row.colombia}</span>
        <span>${row.mexico}</span>
        <span class="badge">${row.leader}</span>
      </div>
    `).join("")}
  `;
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

function updateSectionVisibility() {
  document.querySelectorAll("[data-section]").forEach((panel) => {
    const allowed = panel.dataset.section.split(" ");
    panel.classList.toggle("hidden", !allowed.includes(state.view));
  });
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
  return `${value}${suffix}`;
}

loadDashboard();
