import { neon } from "@neondatabase/serverless";
import { zernioGet } from "./zernio-client.js";

let client: ReturnType<typeof neon> | null = null;
let initialized = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!client) client = neon(process.env.DATABASE_URL);
  return client;
}

export async function ensureGoogleBusinessSchema() {
  const sql = getSql();
  if (!sql || initialized) return;

  await sql`
    create table if not exists gbp_backfill_runs (
      id bigserial primary key,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      status text not null default 'running',
      stats jsonb,
      errors jsonb
    )
  `;

  await sql`
    create table if not exists gbp_accounts (
      account_id text primary key,
      profile_id text,
      profile_name text,
      platform text not null,
      handle text,
      display_name text,
      account_type text,
      selected_location_id text,
      selected_location_name text,
      location_address text,
      platform_status text,
      ads_status text,
      token_expires_at timestamptz,
      permissions jsonb,
      metadata jsonb,
      raw_payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists gbp_location_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      location_id text not null,
      location_name text,
      review_url text,
      maps_uri text,
      place_id text,
      website_uri text,
      phone_primary text,
      category_primary text,
      average_rating numeric,
      total_review_count integer,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id, location_id)
    )
  `;
  await sql`create index if not exists gbp_location_snapshots_lookup on gbp_location_snapshots (account_id, location_id, snapshot_date desc)`;

  await sql`
    create table if not exists gbp_reviews (
      review_name text primary key,
      review_id text not null,
      account_id text not null,
      location_id text not null,
      reviewer_name text,
      reviewer_photo_url text,
      rating integer,
      comment text,
      create_time timestamptz,
      update_time timestamptz,
      has_reply boolean not null default false,
      reply_comment text,
      reply_update_time timestamptz,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists gbp_reviews_location_idx on gbp_reviews (account_id, location_id, create_time desc)`;

  await sql`
    create table if not exists gbp_media_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      location_id text not null,
      media_name text not null,
      category text,
      source_url text,
      google_url text,
      thumbnail_url text,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id, location_id, media_name)
    )
  `;

  await sql`
    create table if not exists gbp_place_action_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      location_id text not null,
      action_name text not null,
      place_action_type text,
      uri text,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id, location_id, action_name)
    )
  `;

  await sql`
    create table if not exists gbp_services_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      location_id text not null,
      service_items jsonb not null,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id, location_id)
    )
  `;

  await sql`
    create table if not exists gbp_attributes_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      location_id text not null,
      name text,
      attributes jsonb not null,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id, location_id)
    )
  `;

  await sql`
    create table if not exists gbp_performance_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      date_start date,
      date_end date,
      metrics jsonb not null,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id)
    )
  `;

  await sql`
    create table if not exists gbp_search_keyword_snapshots (
      id bigserial primary key,
      snapshot_date date not null,
      account_id text not null,
      month_start text,
      month_end text,
      keywords jsonb not null,
      payload jsonb not null,
      captured_at timestamptz not null default now(),
      unique (snapshot_date, account_id)
    )
  `;

  initialized = true;
}

export async function backfillGoogleBusinessFromZernio(options: {
  snapshotDate?: string;
  maxReviewsPerLocation?: number;
} = {}) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();

  const snapshotDate = options.snapshotDate ?? new Date().toISOString().slice(0, 10);
  const maxReviewsPerLocation = options.maxReviewsPerLocation ?? 200;

  const runRows = await sql`
    insert into gbp_backfill_runs (status) values ('running') returning id
  ` as Array<{ id: number }>;
  const runId = runRows[0].id;

  const stats = {
    accounts: 0,
    locations: 0,
    reviews: 0,
    media: 0,
    place_actions: 0,
    services: 0,
    attributes: 0,
    performance: 0,
    keywords: 0,
  };
  const errors: Array<{ account_id?: string; location_id?: string; stage: string; error: string }> = [];

  try {
    const rawAccounts = await zernioGet("/accounts", { platform: "googlebusiness", limit: 100 });
    const accounts = getCollection(rawAccounts, ["accounts", "data", "items"]);
    const locationMap = new Map<string, { account: Record<string, any>; locationRef: Record<string, any> }>();

    for (const account of accounts) {
      const accountId = stringValue(account._id ?? account.id ?? account.accountId);
      if (!accountId) continue;
      stats.accounts += 1;

      const metadata = asRecord(account.metadata);
      const profileRef = asRecord(account.profileId);
      const profile = asRecord(account.profile);

      await sql`
        insert into gbp_accounts (
          account_id, profile_id, profile_name, platform, handle, display_name, account_type,
          selected_location_id, selected_location_name, location_address, platform_status,
          ads_status, token_expires_at, permissions, metadata, raw_payload, updated_at
        ) values (
          ${accountId},
          ${stringValue(profileRef._id ?? profileRef.id ?? profile._id ?? profile.id)},
          ${stringValue(profileRef.name ?? profile.name)},
          ${stringValue(account.platform)},
          ${stringValue(account.username ?? account.handle)},
          ${stringValue(account.displayName)},
          ${stringValue(account.accountType)},
          ${stringValue(metadata.selectedLocationId)},
          ${stringValue(metadata.selectedLocationName)},
          ${stringValue(metadata.locationAddress)},
          ${stringValue(account.platformStatus ?? account.status ?? account.connectionStatus)},
          ${stringValue(account.adsStatus)},
          ${nullableTimestamp(account.tokenExpiresAt)},
          ${JSON.stringify(arrayOrEmpty(account.permissions))}::jsonb,
          ${JSON.stringify(metadata)}::jsonb,
          ${JSON.stringify(account)}::jsonb,
          now()
        )
        on conflict (account_id) do update set
          profile_id = excluded.profile_id,
          profile_name = excluded.profile_name,
          platform = excluded.platform,
          handle = excluded.handle,
          display_name = excluded.display_name,
          account_type = excluded.account_type,
          selected_location_id = excluded.selected_location_id,
          selected_location_name = excluded.selected_location_name,
          location_address = excluded.location_address,
          platform_status = excluded.platform_status,
          ads_status = excluded.ads_status,
          token_expires_at = excluded.token_expires_at,
          permissions = excluded.permissions,
          metadata = excluded.metadata,
          raw_payload = excluded.raw_payload,
          updated_at = now()
      `;

      let locationsPayload: any[] = [];
      try {
        const rawLocations = await zernioGet(`/accounts/${encodeURIComponent(accountId)}/gmb-locations`);
        locationsPayload = getCollection(rawLocations, ["locations", "data", "items"]);
      } catch (error) {
        errors.push({ account_id: accountId, stage: "locations", error: error instanceof Error ? error.message : String(error) });
        continue;
      }

      for (const locationRef of locationsPayload) {
        const locationId = stringValue(locationRef.locationId ?? locationRef.id ?? locationRef.name).replace(/^locations\//, "");
        if (!locationId) continue;
        const selectedLocationId = stringValue(metadata.selectedLocationId);
        const existing = locationMap.get(locationId);
        if (!existing || selectedLocationId === locationId) {
          locationMap.set(locationId, { account, locationRef });
        }
      }
    }

    for (const [locationId, owner] of locationMap.entries()) {
      const account = owner.account;
      const locationRef = owner.locationRef;
      const accountId = stringValue(account._id ?? account.id ?? account.accountId);
      stats.locations += 1;

      const [details, reviews, media, placeActions, services, attributes, performance, keywords] = await Promise.all([
        captureSafe(`/accounts/${encodeURIComponent(accountId)}/gmb-location-details`, { locationId }),
        captureAllReviews(accountId, locationId, maxReviewsPerLocation),
        captureSafe(`/accounts/${encodeURIComponent(accountId)}/gmb-media`, { locationId, pageSize: 100 }),
        captureSafe(`/accounts/${encodeURIComponent(accountId)}/gmb-place-actions`, { locationId, pageSize: 100 }),
        captureSafe(`/accounts/${encodeURIComponent(accountId)}/gmb-services`, { locationId }),
        captureSafe(`/accounts/${encodeURIComponent(accountId)}/gmb-attributes`, { locationId }),
        captureSafe("/analytics/googlebusiness/performance", { accountId }),
        captureSafe("/analytics/googlebusiness/search-keywords", { accountId }),
      ]);

      if (details.error) errors.push({ account_id: accountId, location_id: locationId, stage: "details", error: details.error });
      if (media.error) errors.push({ account_id: accountId, location_id: locationId, stage: "media", error: media.error });
      if (placeActions.error) errors.push({ account_id: accountId, location_id: locationId, stage: "place_actions", error: placeActions.error });
      if (services.error) errors.push({ account_id: accountId, location_id: locationId, stage: "services", error: services.error });
      if (attributes.error) errors.push({ account_id: accountId, location_id: locationId, stage: "attributes", error: attributes.error });
      if (performance.error) errors.push({ account_id: accountId, location_id: locationId, stage: "performance", error: performance.error });
      if (keywords.error) errors.push({ account_id: accountId, location_id: locationId, stage: "keywords", error: keywords.error });
      for (const reviewError of reviews.errors) errors.push({ account_id: accountId, location_id: locationId, stage: "reviews", error: reviewError });

      const detailsRecord = asRecord(details.data);
      const reviewsRecord = asRecord(reviews.data);
      const mediaRecord = asRecord(media.data);
      const actionsRecord = asRecord(placeActions.data);
      const servicesRecord = asRecord(services.data);
      const attributesRecord = asRecord(attributes.data);
      const performanceRecord = asRecord(performance.data);
      const keywordsRecord = asRecord(keywords.data);

      await sql`
          insert into gbp_location_snapshots (
            snapshot_date, account_id, location_id, location_name, review_url, maps_uri, place_id,
            website_uri, phone_primary, category_primary, average_rating, total_review_count, payload
          ) values (
            ${snapshotDate},
            ${accountId},
            ${locationId},
            ${stringValue(detailsRecord.title ?? detailsRecord.location?.name ?? locationRef.name)},
            ${stringValue(detailsRecord.location?.reviewUrl)},
            ${stringValue(detailsRecord.location?.mapsUri)},
            ${stringValue(detailsRecord.location?.placeId)},
            ${stringValue(detailsRecord.websiteUri)},
            ${stringValue(asRecord(detailsRecord.phoneNumbers).primaryPhone)},
            ${stringValue(asRecord(asRecord(detailsRecord.categories).primaryCategory).displayName)},
            ${numberValue(reviewsRecord.averageRating)},
            ${numberValue(reviewsRecord.totalReviewCount)},
            ${JSON.stringify(detailsRecord)}::jsonb
          )
          on conflict (snapshot_date, account_id, location_id) do update set
            location_name = excluded.location_name,
            review_url = excluded.review_url,
            maps_uri = excluded.maps_uri,
            place_id = excluded.place_id,
            website_uri = excluded.website_uri,
            phone_primary = excluded.phone_primary,
            category_primary = excluded.category_primary,
            average_rating = excluded.average_rating,
            total_review_count = excluded.total_review_count,
            payload = excluded.payload,
            captured_at = now()
      `;

      const reviewRows = getCollection(reviewsRecord, ["reviews", "data", "items"]);
      for (const review of reviewRows) {
          const reviewName = stringValue(review.name);
          if (!reviewName) continue;
          stats.reviews += 1;
          const reviewer = asRecord(review.reviewer);
          const reply = asRecord(review.reviewReply);
          await sql`
            insert into gbp_reviews (
              review_name, review_id, account_id, location_id, reviewer_name, reviewer_photo_url,
              rating, comment, create_time, update_time, has_reply, reply_comment, reply_update_time,
              payload, updated_at
            ) values (
              ${reviewName},
              ${stringValue(review.id)},
              ${accountId},
              ${locationId},
              ${stringValue(reviewer.displayName)},
              ${stringValue(reviewer.profilePhotoUrl)},
              ${numberValue(review.rating)},
              ${stringValue(review.comment)},
              ${nullableTimestamp(review.createTime)},
              ${nullableTimestamp(review.updateTime)},
              ${Boolean(review.reviewReply)},
              ${stringValue(reply.comment)},
              ${nullableTimestamp(reply.updateTime)},
              ${JSON.stringify(review)}::jsonb,
              now()
            )
            on conflict (review_name) do update set
              reviewer_name = excluded.reviewer_name,
              reviewer_photo_url = excluded.reviewer_photo_url,
              rating = excluded.rating,
              comment = excluded.comment,
              create_time = excluded.create_time,
              update_time = excluded.update_time,
              has_reply = excluded.has_reply,
              reply_comment = excluded.reply_comment,
              reply_update_time = excluded.reply_update_time,
              payload = excluded.payload,
              updated_at = now()
          `;
      }

      const mediaRows = getCollection(mediaRecord, ["mediaItems", "data", "items"]);
      for (const item of mediaRows) {
          const mediaName = stringValue(item.name);
          if (!mediaName) continue;
          stats.media += 1;
          await sql`
            insert into gbp_media_snapshots (
              snapshot_date, account_id, location_id, media_name, category, source_url, google_url, thumbnail_url, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${locationId},
              ${mediaName},
              ${stringValue(item.category)},
              ${stringValue(asRecord(item.sourceUrl).url ?? item.sourceUrl)},
              ${stringValue(item.googleUrl)},
              ${stringValue(item.thumbnailUrl)},
              ${JSON.stringify(item)}::jsonb
            )
            on conflict (snapshot_date, account_id, location_id, media_name) do update set
              category = excluded.category,
              source_url = excluded.source_url,
              google_url = excluded.google_url,
              thumbnail_url = excluded.thumbnail_url,
              payload = excluded.payload,
              captured_at = now()
          `;
      }

      const actionRows = getCollection(actionsRecord, ["placeActionLinks", "data", "items"]);
      for (const action of actionRows) {
          const actionName = stringValue(action.name);
          if (!actionName) continue;
          stats.place_actions += 1;
          await sql`
            insert into gbp_place_action_snapshots (
              snapshot_date, account_id, location_id, action_name, place_action_type, uri, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${locationId},
              ${actionName},
              ${stringValue(action.placeActionType)},
              ${stringValue(action.uri)},
              ${JSON.stringify(action)}::jsonb
            )
            on conflict (snapshot_date, account_id, location_id, action_name) do update set
              place_action_type = excluded.place_action_type,
              uri = excluded.uri,
              payload = excluded.payload,
              captured_at = now()
          `;
      }

      if (services.data) {
          stats.services += 1;
          await sql`
            insert into gbp_services_snapshots (
              snapshot_date, account_id, location_id, service_items, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${locationId},
              ${JSON.stringify(getCollection(servicesRecord, ["services", "serviceItems", "data", "items"]))}::jsonb,
              ${JSON.stringify(servicesRecord)}::jsonb
            )
            on conflict (snapshot_date, account_id, location_id) do update set
              service_items = excluded.service_items,
              payload = excluded.payload,
              captured_at = now()
          `;
      }

      if (attributes.data) {
          stats.attributes += 1;
          await sql`
            insert into gbp_attributes_snapshots (
              snapshot_date, account_id, location_id, name, attributes, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${locationId},
              ${stringValue(attributesRecord.name)},
              ${JSON.stringify(attributesRecord.attributes ?? [])}::jsonb,
              ${JSON.stringify(attributesRecord)}::jsonb
            )
            on conflict (snapshot_date, account_id, location_id) do update set
              name = excluded.name,
              attributes = excluded.attributes,
              payload = excluded.payload,
              captured_at = now()
          `;
      }

      if (performance.data) {
          stats.performance += 1;
          const dateRange = asRecord(performanceRecord.dateRange);
          await sql`
            insert into gbp_performance_snapshots (
              snapshot_date, account_id, date_start, date_end, metrics, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${nullableDate(dateRange.startDate)},
              ${nullableDate(dateRange.endDate)},
              ${JSON.stringify(performanceRecord.metrics ?? {})}::jsonb,
              ${JSON.stringify(performanceRecord)}::jsonb
            )
            on conflict (snapshot_date, account_id) do update set
              date_start = excluded.date_start,
              date_end = excluded.date_end,
              metrics = excluded.metrics,
              payload = excluded.payload,
              captured_at = now()
          `;
      }

      if (keywords.data) {
          stats.keywords += 1;
          const monthRange = asRecord(keywordsRecord.monthRange);
          await sql`
            insert into gbp_search_keyword_snapshots (
              snapshot_date, account_id, month_start, month_end, keywords, payload
            ) values (
              ${snapshotDate},
              ${accountId},
              ${stringValue(monthRange.startMonth)},
              ${stringValue(monthRange.endMonth)},
              ${JSON.stringify(getCollection(keywordsRecord, ["keywords", "data", "items"]))}::jsonb,
              ${JSON.stringify(keywordsRecord)}::jsonb
            )
            on conflict (snapshot_date, account_id) do update set
              month_start = excluded.month_start,
              month_end = excluded.month_end,
              keywords = excluded.keywords,
              payload = excluded.payload,
              captured_at = now()
          `;
      }
    }

    await sql`
      update gbp_backfill_runs
      set ended_at = now(), status = 'ok', stats = ${JSON.stringify(stats)}::jsonb, errors = ${JSON.stringify(errors)}::jsonb
      where id = ${runId}
    `;
    return { run_id: runId, snapshot_date: snapshotDate, stats, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ stage: "run", error: message });
    await sql`
      update gbp_backfill_runs
      set ended_at = now(), status = 'failed', stats = ${JSON.stringify(stats)}::jsonb, errors = ${JSON.stringify(errors)}::jsonb
      where id = ${runId}
    `;
    throw error;
  }
}

export async function listGoogleBusinessBackfillRuns(limit = 20) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  return await sql`
    select id, started_at, ended_at, status, stats, errors
    from gbp_backfill_runs
    order by started_at desc
    limit ${limit}
  ` as Array<Record<string, unknown>>;
}

export async function listGoogleBusinessAccounts() {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  return await sql`
    select
      account_id, profile_id, profile_name, platform, handle, display_name, account_type,
      selected_location_id, selected_location_name, location_address, platform_status,
      ads_status, token_expires_at, permissions, updated_at
    from gbp_accounts
    order by display_name asc nulls last, account_id asc
  ` as Array<Record<string, unknown>>;
}

export async function listGoogleBusinessLocationHistory(options: {
  location_id?: string;
  account_id?: string;
  days?: number;
}) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  const start = daysAgoIso(options.days ?? 90);
  return await sql`
    select
      snapshot_date::text,
      account_id,
      location_id,
      location_name,
      website_uri,
      phone_primary,
      category_primary,
      average_rating,
      total_review_count,
      review_url,
      maps_uri
    from gbp_location_snapshots
    where snapshot_date >= ${start}
      and (${options.location_id ?? null}::text is null or location_id = ${options.location_id ?? null})
      and (${options.account_id ?? null}::text is null or account_id = ${options.account_id ?? null})
    order by snapshot_date desc, location_name asc nulls last
  ` as Array<Record<string, unknown>>;
}

export async function listGoogleBusinessReviews(options: {
  location_id?: string;
  account_id?: string;
  min_rating?: number;
  max_rating?: number;
  replied?: boolean;
  limit?: number;
}) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  return await sql`
    select
      review_name,
      review_id,
      account_id,
      location_id,
      reviewer_name,
      rating,
      comment,
      create_time,
      has_reply,
      reply_comment,
      reply_update_time
    from gbp_reviews
    where (${options.location_id ?? null}::text is null or location_id = ${options.location_id ?? null})
      and (${options.account_id ?? null}::text is null or account_id = ${options.account_id ?? null})
      and (${options.min_rating ?? null}::int is null or rating >= ${options.min_rating ?? null})
      and (${options.max_rating ?? null}::int is null or rating <= ${options.max_rating ?? null})
      and (${options.replied ?? null}::boolean is null or has_reply = ${options.replied ?? null})
    order by create_time desc nulls last
    limit ${options.limit ?? 100}
  ` as Array<Record<string, unknown>>;
}

export async function listGoogleBusinessPerformanceHistory(options: {
  account_id?: string;
  days?: number;
}) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  const start = daysAgoIso(options.days ?? 120);
  return await sql`
    select
      snapshot_date::text,
      account_id,
      date_start,
      date_end,
      metrics
    from gbp_performance_snapshots
    where snapshot_date >= ${start}
      and (${options.account_id ?? null}::text is null or account_id = ${options.account_id ?? null})
    order by snapshot_date desc, account_id asc
  ` as Array<Record<string, unknown>>;
}

export async function listGoogleBusinessKeywordHistory(options: {
  account_id?: string;
  days?: number;
}) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  const start = daysAgoIso(options.days ?? 120);
  return await sql`
    select
      snapshot_date::text,
      account_id,
      month_start,
      month_end,
      keywords
    from gbp_search_keyword_snapshots
    where snapshot_date >= ${start}
      and (${options.account_id ?? null}::text is null or account_id = ${options.account_id ?? null})
    order by snapshot_date desc, account_id asc
  ` as Array<Record<string, unknown>>;
}

export async function getGoogleBusinessSnapshotSummary(snapshotDate?: string) {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured");
  await ensureGoogleBusinessSchema();
  const effectiveDate = snapshotDate ?? new Date().toISOString().slice(0, 10);
  const rows = await sql`
    select
      (select count(*)::int from gbp_accounts) as accounts,
      (select count(distinct location_id)::int from gbp_location_snapshots where snapshot_date = ${effectiveDate}) as locations,
      (select count(*)::int from gbp_reviews) as reviews,
      (select count(*)::int from gbp_media_snapshots where snapshot_date = ${effectiveDate}) as media,
      (select count(*)::int from gbp_place_action_snapshots where snapshot_date = ${effectiveDate}) as place_actions,
      (select count(*)::int from gbp_services_snapshots where snapshot_date = ${effectiveDate}) as services,
      (select count(*)::int from gbp_attributes_snapshots where snapshot_date = ${effectiveDate}) as attributes,
      (select count(*)::int from gbp_performance_snapshots where snapshot_date = ${effectiveDate}) as performance,
      (select count(*)::int from gbp_search_keyword_snapshots where snapshot_date = ${effectiveDate}) as keywords
  ` as Array<Record<string, unknown>>;
  return { snapshot_date: effectiveDate, ...rows[0] };
}

async function captureSafe(path: string, query?: Record<string, unknown>) {
  try {
    const data = await zernioGet(path, query);
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function captureAllReviews(accountId: string, locationId: string, maxReviews: number) {
  const reviews: any[] = [];
  const errors: string[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  let pageCount = 0;

  while (reviews.length < maxReviews && pageCount < 20) {
    try {
      if (pageToken) {
        if (seenTokens.has(pageToken)) {
          errors.push(`Repeated review page token detected for location ${locationId}; stopping pagination to avoid infinite loop.`);
          break;
        }
        seenTokens.add(pageToken);
      }
      const data = await zernioGet(`/accounts/${encodeURIComponent(accountId)}/gmb-reviews`, {
        locationId,
        pageSize: Math.min(50, maxReviews - reviews.length),
        pageToken,
      });
      pageCount += 1;
      const record = asRecord(data);
      reviews.push(...getCollection(record, ["reviews", "data", "items"]));
      pageToken = stringValue(record.nextPageToken);
      if (!pageToken) {
        return {
          data: { ...record, reviews },
          errors,
        };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      break;
    }
  }

  return {
    data: { reviews },
    errors,
  };
}

function getCollection(payload: unknown, keys: string[]) {
  const record = asRecord(payload);
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord);
    if (candidate && typeof candidate === "object") {
      const nested = asRecord(candidate);
      if (Array.isArray(nested.items)) return nested.items.map(asRecord);
      if (Array.isArray(nested.data)) return nested.data.map(asRecord);
    }
  }
  return [];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nullableTimestamp(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function nullableDate(value: unknown) {
  const record = asRecord(value);
  const year = numberValue(record.year);
  const month = numberValue(record.month);
  const day = numberValue(record.day);
  if (!year || !month) return null;
  const safeDay = day || 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}
