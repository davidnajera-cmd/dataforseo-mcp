import type { IncomingMessage, ServerResponse } from "node:http";
import { createOAuthAuthorizationCode, exchangeOAuthAuthorizationCode, isOAuthClientRedirectAllowed, refreshOAuthAccessToken, registerOAuthClient, validateApiKey } from "../src/api-key-auth.js";

const issuer = "https://dataforseo-mcp-three.vercel.app";

export default async function handler(req: IncomingMessage & { body?: unknown; url?: string }, res: ServerResponse) {
  const url = new URL(req.url ?? "/api/oauth", issuer);
  const route = url.searchParams.get("route") ?? "";
  if (route === "authorize") return authorize(req, res, url);
  if (route === "token") return token(req, res);
  if (route === "register") return register(req, res);
  send(res, 404, { error: "not_found" });
}

async function register(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const body = await jsonBody(req);
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter(isSafeRedirectUri) : [];
  if (redirectUris.length === 0) return send(res, 400, { error: "invalid_redirect_uris" });
  const clientId = await registerOAuthClient(redirectUris);
  // Echo the registered metadata. Claude's connector validates this response
  // more strictly than the minimum RFC 7591 client_id-only response.
  send(res, 201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

async function authorize(req: IncomingMessage & { body?: unknown }, res: ServerResponse, url: URL) {
  const params = req.method === "POST" ? new URLSearchParams(await formBody(req)) : url.searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "";
  const valid = clientId && redirectUri && challenge && method === "S256" && await isOAuthClientRedirectAllowed(clientId, redirectUri);
  if (!valid) return send(res, 400, { error: "invalid_authorization_request" });
  if (req.method !== "POST") return html(res, authorizationPage({ clientId, redirectUri, state, challenge }));
  const apiKey = params.get("api_key") ?? "";
  const credential = await validateApiKey(apiKey);
  if (!credential.valid) return html(res, authorizationPage({ clientId, redirectUri, state, challenge, error: "La clave no es válida o fue revocada." }), 401);
  const code = await createOAuthAuthorizationCode({ clientId, redirectUri, apiKeyId: credential.id, codeChallenge: challenge });
  const destination = new URL(redirectUri);
  destination.searchParams.set("code", code);
  if (state) destination.searchParams.set("state", state);
  res.writeHead(302, { Location: destination.toString(), "Cache-Control": "no-store" });
  res.end();
}

async function token(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const params = new URLSearchParams(await formBody(req));
  if (params.get("grant_type") === "refresh_token") {
    const refreshed = await refreshOAuthAccessToken({ refreshToken: params.get("refresh_token") ?? "", clientId: params.get("client_id") ?? "" });
    if (!refreshed) return send(res, 400, { error: "invalid_grant" });
    return send(res, 200, { access_token: refreshed.accessToken, refresh_token: refreshed.refreshToken, token_type: "Bearer", expires_in: 28800, scope: "mcp" });
  }
  if (params.get("grant_type") !== "authorization_code") return send(res, 400, { error: "unsupported_grant_type" });
  const result = await exchangeOAuthAuthorizationCode({
    code: params.get("code") ?? "", clientId: params.get("client_id") ?? "", redirectUri: params.get("redirect_uri") ?? "", codeVerifier: params.get("code_verifier") ?? "",
  });
  if (!result) return send(res, 400, { error: "invalid_grant" });
  send(res, 200, { access_token: result.accessToken, refresh_token: result.refreshToken, token_type: "Bearer", expires_in: 28800, scope: "mcp" });
}

function authorizationPage(input: { clientId: string; redirectUri: string; state: string; challenge: string; error?: string }) {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Autorizar SEO Expert</title><meta name="viewport" content="width=device-width, initial-scale=1"><body style="font-family:system-ui;max-width:520px;margin:64px auto;padding:0 24px"><h1>Autorizar SEO Expert</h1><p>Ingresa una clave MCP válida para conceder a Claude acceso limitado por su alcance.</p>${input.error ? `<p role="alert" style="color:#b42318">${input.error}</p>` : ""}<form method="post">${hidden("client_id", input.clientId)}${hidden("redirect_uri", input.redirectUri)}${hidden("state", input.state)}${hidden("code_challenge", input.challenge)}<input type="hidden" name="code_challenge_method" value="S256"><label>Clave MCP<input name="api_key" type="password" autocomplete="off" required style="display:block;width:100%;margin:8px 0 20px;padding:10px"></label><button type="submit">Autorizar Claude</button></form></body></html>`;
}

async function formBody(req: IncomingMessage & { body?: unknown }): Promise<string> { if (typeof req.body === "string") return req.body; return readBody(req); }
async function jsonBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> { try { return JSON.parse(await formBody(req)) as Record<string, unknown>; } catch { return {}; } }
function readBody(req: IncomingMessage): Promise<string> { return new Promise((resolve) => { let data = ""; req.on("data", c => { data += c.toString(); }); req.on("end", () => resolve(data)); }); }
function isSafeRedirectUri(value: unknown): value is string { try { const u = new URL(String(value)); return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")); } catch { return false; } }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function send(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); }
function html(res: ServerResponse, body: string, status = 200) { res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(body); }
