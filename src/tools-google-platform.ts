import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { googleApiGet, googleApiPost } from "./google-rest-client.js";

function formatResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const siteVerificationType = z.enum(["SITE", "INET_DOMAIN"]);
const verificationMethod = z.enum(["FILE", "META", "ANALYTICS", "TAG_MANAGER", "DNS", "DOMAIN"]);

export function registerGooglePlatformTools(server: McpServer) {
  server.tool(
    "gbp_accounts_list",
    "List Google Business Profile accounts accessible to the authenticated Google user. Requires the business.manage scope.",
    {
      parent_account: z.string().optional().describe("Optional parent account resource name, e.g. accounts/123456789."),
      page_size: z.number().optional().describe("Max accounts to return."),
      page_token: z.string().optional().describe("Pagination token from a previous call."),
    },
    async ({ parent_account, page_size, page_token }) => {
      const params = new URLSearchParams();
      if (parent_account) params.set("parentAccount", parent_account);
      if (page_size) params.set("pageSize", String(page_size));
      if (page_token) params.set("pageToken", page_token);
      const query = params.toString();
      const result = await googleApiGet(`/accounts${query ? `?${query}` : ""}`, "businessaccountmanagement");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gbp_locations_list",
    "List locations for a Google Business Profile account. Requires the business.manage scope and a valid account resource name from gbp_accounts_list.",
    {
      account_name: z.string().describe("Account resource name, e.g. accounts/123456789."),
      read_mask: z.string().optional().describe("Comma-separated GBP fields to return. Default: name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,metadata,openInfo,profile."),
      page_size: z.number().optional().describe("Max locations to return."),
      page_token: z.string().optional().describe("Pagination token from a previous call."),
      filter: z.string().optional().describe("Optional Google Business Profile filter expression."),
      order_by: z.string().optional().describe("Optional order clause, e.g. title desc."),
    },
    async ({ account_name, read_mask, page_size, page_token, filter, order_by }) => {
      const params = new URLSearchParams({
        readMask: read_mask ?? "name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,metadata,openInfo,profile",
      });
      if (page_size) params.set("pageSize", String(page_size));
      if (page_token) params.set("pageToken", page_token);
      if (filter) params.set("filter", filter);
      if (order_by) params.set("orderBy", order_by);
      const result = await googleApiGet(`/${account_name}/locations?${params.toString()}`, "businessinformation");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gbp_location_get",
    "Get one Google Business Profile location with a configurable readMask.",
    {
      location_name: z.string().describe("Location resource name, e.g. locations/123456789."),
      read_mask: z.string().optional().describe("Comma-separated GBP fields to return. Default: name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,metadata,openInfo,profile,regularHours,specialHours."),
    },
    async ({ location_name, read_mask }) => {
      const params = new URLSearchParams({
        readMask: read_mask ?? "name,title,storeCode,websiteUri,phoneNumbers,storefrontAddress,metadata,openInfo,profile,regularHours,specialHours",
      });
      const result = await googleApiGet(`/${location_name}?${params.toString()}`, "businessinformation");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "site_verification_list",
    "List sites and domains already verified for the authenticated Google user. Requires the siteverification scope.",
    {},
    async () => {
      const result = await googleApiGet("/webResource", "siteverification");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "site_verification_get_token",
    "Get a Google Site Verification token for a site or domain. Use this before site_verification_verify.",
    {
      type: siteVerificationType.describe("SITE for an exact URL-prefix, INET_DOMAIN for a domain property."),
      identifier: z.string().describe("For SITE use a full URL like https://example.com/. For INET_DOMAIN use example.com."),
      method: verificationMethod.describe("Verification method: FILE, META, ANALYTICS, TAG_MANAGER, DNS, or DOMAIN."),
    },
    async ({ type, identifier, method }) => {
      const result = await googleApiPost("/token", {
        site: { type, identifier },
        verificationMethod: method,
      }, "siteverification");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "site_verification_verify",
    "Ask Google to verify ownership of a site or domain after the token is placed. Equivalent to Site Verification insert.",
    {
      type: siteVerificationType.describe("SITE for an exact URL-prefix, INET_DOMAIN for a domain property."),
      identifier: z.string().describe("For SITE use a full URL like https://example.com/. For INET_DOMAIN use example.com."),
      method: verificationMethod.describe("Must match the method used to generate and place the token."),
    },
    async ({ type, identifier, method }) => {
      const result = await googleApiPost(`/webResource?verificationMethod=${encodeURIComponent(method)}`, {
        site: { type, identifier },
      }, "siteverification");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gtm_accounts_list",
    "List Google Tag Manager accounts accessible to the authenticated user. Requires a Tag Manager scope.",
    {},
    async () => {
      const result = await googleApiGet("/accounts", "tagmanager");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gtm_containers_list",
    "List Google Tag Manager containers for one GTM account.",
    {
      account_id: z.string().describe("GTM account id, e.g. 1234567."),
      page_token: z.string().optional().describe("Pagination token from a previous call."),
    },
    async ({ account_id, page_token }) => {
      const params = new URLSearchParams();
      if (page_token) params.set("pageToken", page_token);
      const query = params.toString();
      const result = await googleApiGet(`/accounts/${account_id}/containers${query ? `?${query}` : ""}`, "tagmanager");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );

  server.tool(
    "gtm_workspaces_list",
    "List workspaces for one Google Tag Manager container.",
    {
      account_id: z.string().describe("GTM account id, e.g. 1234567."),
      container_id: z.string().describe("GTM container id, e.g. 9876543."),
      page_token: z.string().optional().describe("Pagination token from a previous call."),
    },
    async ({ account_id, container_id, page_token }) => {
      const params = new URLSearchParams();
      if (page_token) params.set("pageToken", page_token);
      const query = params.toString();
      const result = await googleApiGet(`/accounts/${account_id}/containers/${container_id}/workspaces${query ? `?${query}` : ""}`, "tagmanager");
      return { content: [{ type: "text" as const, text: formatResult(result) }] };
    }
  );
}
