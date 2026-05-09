const state = {
  view: "overview",
  data: null,
};

const views = {
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
};

const SITE_LABELS = {
  "dnamusic.edu.co": "Colombia",
  "dnamusic.mx": "Mexico",
  "latiendadeaudio.com": "La Tienda de Audio",
};

function siteLabel(domain) {
  return SITE_LABELS[domain] ?? domain;
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
    if (view === "backlog") loadBacklog();
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
  renderLeads(data.business.channels, data.ga4);
  renderComparison(data.comparison);
  renderOpportunities(data.business.opportunities);
  renderAiVisibility(data.ai_visibility);
  renderBacklinks(data.backlinks);
  renderHistory(data.history_summary);
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
  const node = document.querySelector("#technicalPanel");
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
    <div class="row clarity"><strong>Dead clicks (24h)</strong><span>${displayValue(technical.deadClicks)}</span></div>
    <div class="row clarity"><strong>Rage clicks (24h)</strong><span>${displayValue(technical.rageClicks)}</span></div>
    <div class="row clarity"><strong>Excessive scroll (24h)</strong><span>${displayValue(technical.excessiveScroll)}</span></div>
    <div class="row clarity"><strong>Quickback clicks (24h)</strong><span>${displayValue(technical.quickbackClick)}</span></div>
  `;
}

function renderLeads(channels, ga4) {
  const max = Math.max(1, ...channels.map((channel) => channel.leads || 0));
  const channelRows = channels.map((channel) => `
    <div>
      <div class="row"><strong>${esc(channel.name)}</strong><span>${displayValue(channel.leads)} ${typeof channel.conversion === "number" ? `· ${esc(channel.conversion)} conv` : ""}</span></div>
      <div class="bar"><span style="width:${((channel.leads || 0) / max) * 100}%"></span></div>
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
    ${byDomainRows ? `<hr/><strong class="block-label">GA4 por dominio (último día)</strong>${byDomainRows}` : ""}
  `;
}

function renderComparison(rows) {
  const node = document.querySelector("#comparisonTable");
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

function updateSectionVisibility() {
  document.querySelectorAll("[data-section]").forEach((panel) => {
    const allowed = panel.dataset.section.split(" ");
    panel.classList.toggle("hidden", !allowed.includes(state.view));
  });
}

// =====================================================================
// Backlog (SEO agent tasks)
// =====================================================================

document.querySelector("#agentRunNow")?.addEventListener("click", runAgentNow);
document.querySelector("#backlogRefresh")?.addEventListener("click", loadBacklog);
document.querySelector("#backlogFilterDomain")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogFilterPriority")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogFilterSource")?.addEventListener("change", loadBacklog);
document.querySelector("#backlogSort")?.addEventListener("change", loadBacklog);

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
    renderBacklogBoard(data.rows ?? []);
  } catch (error) {
    board.textContent = `No se pudo cargar el backlog: ${error.message}`;
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
  const buckets = { pendiente: [], en_progreso: [], ejecutada: [], descartada: [] };
  for (const row of rows) (buckets[row.status] ?? buckets.pendiente).push(row);
  const columns = [
    { key: "pendiente", label: "Pendiente" },
    { key: "en_progreso", label: "En progreso" },
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
  return `
    <article class="task-card priority-${esc(row.priority)}" data-id="${esc(row.id)}">
      <header>
        <span class="priority-pill priority-${esc(row.priority)}">${esc(row.priority)}</span>
        <span class="category-pill">${esc(row.category)}</span>
        ${sourceBadge}
      </header>
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
    ${task.assignee_suggested ? `<h5>Asignado sugerido</h5><p>${esc(task.assignee_suggested)}</p>` : ""}
    <h5>Fuentes / evidencia</h5>
    <pre class="evidence">${esc(JSON.stringify(task.data_sources, null, 2))}</pre>
    ${task.notes ? `<h5>Notas</h5><pre>${esc(task.notes)}</pre>` : ""}
    <h5>Estado</h5>
    <div class="status-actions">
      ${["pendiente", "en_progreso", "ejecutada", "descartada"].map((s) => `
        <button class="small-button ${task.status === s ? "is-active" : ""}" data-status="${esc(s)}">${esc(s)}</button>
      `).join("")}
    </div>
    <textarea id="taskNoteInput" placeholder="Agregar nota (opcional al cambiar estado)"></textarea>
  `;
  modal.classList.add("visible");
  modal.querySelector(".modal-close").addEventListener("click", () => modal.classList.remove("visible"));
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
  return `${value}${suffix}`;
}

loadDashboard();
