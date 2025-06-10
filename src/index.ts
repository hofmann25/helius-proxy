export interface Env {
  CORS_ALLOW_ORIGIN: string;  // список через запятую или пусто для *
  RPC_NODE_URL: string;       // "http://45.139.132.172:80"
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // --- CORS ---
    const allowed = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',').map(s => s.trim())
      : null;
    const cors: Record<string,string> = {
      "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    if (allowed) {
      const origin = request.headers.get("Origin");
      if (origin && allowed.includes(origin)) {
        cors["Access-Control-Allow-Origin"] = origin;
      }
    } else {
      cors["Access-Control-Allow-Origin"] = "*";
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // --- WebSocket (если ваша нода поддерживает) ---
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();
    if (upgrade === "websocket") {
      // Преобразуем http:// → ws:// (или https:// → wss://)
      const wsUrl = env.RPC_NODE_URL.replace(/^http/, "ws");
      // Удаляем Origin, чтобы нода не блокировала handshake
      const wsReq = new Request(wsUrl, {
        method: "GET",
        headers: Object.fromEntries(
          Array.from(request.headers.entries())
            .filter(([k,v]) =>
              !["host","origin","referer","sec-websocket-key","sec-websocket-version","sec-websocket-protocol","connection","upgrade"]
              .includes(k.toLowerCase())
            )
        ),
        // @ts-ignore (для поддержки WebSocket в Cf Fetch)
        duplex: "half"
      });
      return fetch(wsReq);
    }

    // --- HTTP JSON-RPC ---
    const url = new URL(request.url);
    // если путь корень — убираем "/", чтобы не было "//"
    const path = url.pathname === "/" ? "" : url.pathname;
    const target = `${env.RPC_NODE_URL}${path}${url.search}`;

    // Собираем заголовки, удаляя Host и Origin
    const headers = Object.fromEntries(
      Array.from(request.headers.entries())
        .filter(([k]) => !["host","origin"].includes(k.toLowerCase()))
    );
    headers["Content-Type"] = "application/json";

    const body = ["GET","HEAD"].includes(request.method)
      ? null
      : await request.text();

    const proxyReq = new Request(target, {
      method: request.method,
      headers,
      body,
    });

    const res = await fetch(proxyReq);
    // Копируем все заголовки от ноды и добавляем CORS
    const responseHeaders = new Headers(res.headers);
    for (const [k,v] of Object.entries(cors)) {
      responseHeaders.set(k, v);
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  }
};
