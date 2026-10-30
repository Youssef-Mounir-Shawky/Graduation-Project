const upstreams = {
  "/forecast": "https://api.open-meteo.com/v1/forecast",
  "/geocoding": "https://geocoding-api.open-meteo.com/v1/search",
};

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed.", { status: 405, headers: { Allow: "GET" } });
    }

    const target = upstreams[new URL(request.url).pathname];
    if (!target) return new Response("Not found.", { status: 404 });

    const expectedToken = env.NILEGUARD_WEATHER_PROXY_TOKEN;
    if (!expectedToken || request.headers.get("Authorization") !== `Bearer ${expectedToken}`) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const upstreamUrl = new URL(target);
    upstreamUrl.search = new URL(request.url).search;
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    });
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
