import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createApiKey, revokeApiKey } from "../src/api-key-auth.ts";

const base = process.env.MCP_E2E_BASE_URL ?? "https://dataforseo-mcp-three.vercel.app";
const redirectUri = "http://127.0.0.1:43123/callback";
const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "manual" });

const key = await createApiKey(`Ephemeral production E2E ${new Date().toISOString()}`, ["claude", "seo", "full"], false);
try {
  const unauthenticated = await post(`${base}/mcp?bundle=claude`, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get("www-authenticate") ?? "", /resource_metadata/);

  const registration = await post(`${base}/oauth/register`, { redirect_uris: [redirectUri] });
  assert.equal(registration.status, 201);
  const { client_id: clientId } = await registration.json();
  assert.ok(clientId);

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const form = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state: "e2e", code_challenge: challenge, code_challenge_method: "S256", api_key: key.key });
  const authorization = await fetch(`${base}/oauth/authorize`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, redirect: "manual" });
  assert.equal(authorization.status, 302);
  const code = new URL(authorization.headers.get("location")).searchParams.get("code");
  assert.ok(code);

  const tokenForm = new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier });
  const tokenResponse = await fetch(`${base}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenForm });
  assert.equal(tokenResponse.status, 200);
  const { access_token: accessToken, refresh_token: refreshToken } = await tokenResponse.json();
  assert.match(accessToken ?? "", /^mcpot_/);
  assert.match(refreshToken ?? "", /^mcprt_/);

  const refreshForm = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
  const refreshResponse = await fetch(`${base}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: refreshForm });
  assert.equal(refreshResponse.status, 200);
  const { access_token: refreshedAccessToken, refresh_token: rotatedRefreshToken } = await refreshResponse.json();
  assert.match(refreshedAccessToken ?? "", /^mcpot_/);
  assert.match(rotatedRefreshToken ?? "", /^mcprt_/);
  assert.notEqual(rotatedRefreshToken, refreshToken);

  const reusedRefreshResponse = await fetch(`${base}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: refreshForm });
  assert.equal(reusedRefreshResponse.status, 400);

  const toolCall = await post(`${base}/mcp?bundle=claude`, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "http_headers_inspect", arguments: { url: "https://www.dnamusic.edu.co/" } } }, { authorization: `Bearer ${refreshedAccessToken}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" });
  assert.equal(toolCall.status, 200);
  const event = (await toolCall.text()).split("\n").find(line => line.startsWith("data: "))?.slice(6);
  const result = JSON.parse(event);
  assert.equal(result.result?.isError, undefined);
  assert.match(result.result?.content?.[0]?.text ?? "", /"status"\s*:\s*301/);

  const fullCatalog = await post(`${base}/mcp?bundle=full`, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }, { authorization: `Bearer ${refreshedAccessToken}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" });
  assert.equal(fullCatalog.status, 200);
  const fullCatalogEvent = (await fullCatalog.text()).split("\n").find(line => line.startsWith("data: "))?.slice(6);
  const fullCatalogResult = JSON.parse(fullCatalogEvent);
  const toolNames = fullCatalogResult.result?.tools?.map(tool => tool.name) ?? [];
  assert.ok(toolNames.length >= 300);
  for (const toolName of ["ai_optimization_chatgpt_live", "ai_optimization_claude_live", "ai_optimization_gemini_live", "ai_optimization_perplexity_live"]) {
    assert.ok(toolNames.includes(toolName), `missing full-catalog tool: ${toolName}`);
  }
  console.log("MCP production OAuth E2E passed: authorization, PKCE exchange, refresh-token rotation, authenticated tool call, and full tool catalog.");
} finally {
  await revokeApiKey(key.id);
}
