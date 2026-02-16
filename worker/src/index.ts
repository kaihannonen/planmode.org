interface Env {
  STATS: KVNamespace;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://planmode.org",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function corsOrigin(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (origin === "https://planmode.org" || origin === "http://localhost:4321") {
    return { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin };
  }
  // Allow no-origin requests (CLI)
  if (!origin) {
    return { ...CORS_HEADERS, "Access-Control-Allow-Origin": "*" };
  }
  return CORS_HEADERS;
}

async function increment(
  kv: KVNamespace,
  key: string,
): Promise<number> {
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  const next = current + 1;
  await kv.put(key, String(next));
  return next;
}

async function updateAggregate(
  kv: KVNamespace,
  pkg: string,
  field: "downloads" | "views",
  value: number,
): Promise<void> {
  const raw = await kv.get("_all_stats");
  const all: Record<string, { downloads: number; views: number }> = raw
    ? JSON.parse(raw)
    : {};
  if (!all[pkg]) {
    all[pkg] = { downloads: 0, views: 0 };
  }
  all[pkg][field] = value;
  await kv.put("_all_stats", JSON.stringify(all));
}

async function handlePostDownloads(
  request: Request,
  env: Env,
  pkg: string,
): Promise<Response> {
  const key = `downloads:${pkg}`;
  const count = await increment(env.STATS, key);
  await updateAggregate(env.STATS, pkg, "downloads", count);
  const headers = corsOrigin(request);
  return new Response(JSON.stringify({ downloads: count }), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function handlePostViews(
  request: Request,
  env: Env,
  pkg: string,
): Promise<Response> {
  const key = `views:${pkg}`;
  const count = await increment(env.STATS, key);
  await updateAggregate(env.STATS, pkg, "views", count);
  const headers = corsOrigin(request);
  return new Response(JSON.stringify({ views: count }), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function handleGetStats(
  request: Request,
  env: Env,
  pkg: string,
): Promise<Response> {
  const downloads = parseInt(
    (await env.STATS.get(`downloads:${pkg}`)) ?? "0",
    10,
  );
  const views = parseInt(
    (await env.STATS.get(`views:${pkg}`)) ?? "0",
    10,
  );
  const headers = corsOrigin(request);
  return new Response(JSON.stringify({ downloads, views }), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function handleGetAllStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const raw = await env.STATS.get("_all_stats");
  const data = raw ? JSON.parse(raw) : {};
  const headers = corsOrigin(request);
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsOrigin(request) });
    }

    // Route: POST /downloads/:package
    const downloadsMatch = url.pathname.match(/^\/downloads\/([a-z0-9@][a-z0-9._\/-]*)$/);
    if (downloadsMatch && method === "POST") {
      return handlePostDownloads(request, env, downloadsMatch[1]);
    }

    // Route: POST /views/:package
    const viewsMatch = url.pathname.match(/^\/views\/([a-z0-9@][a-z0-9._\/-]*)$/);
    if (viewsMatch && method === "POST") {
      return handlePostViews(request, env, viewsMatch[1]);
    }

    // Route: GET /stats/:package
    const statsMatch = url.pathname.match(/^\/stats\/([a-z0-9@][a-z0-9._\/-]*)$/);
    if (statsMatch && method === "GET") {
      return handleGetStats(request, env, statsMatch[1]);
    }

    // Route: GET /stats
    if (url.pathname === "/stats" && method === "GET") {
      return handleGetAllStats(request, env);
    }

    return json({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
