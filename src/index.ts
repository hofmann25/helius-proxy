export interface Env {
  CORS_ALLOW_ORIGIN: string;    // через запятую список разрешённых Origin, или пусто для *
  RPC_NODE_URL: string;         // например "http://45.139.132.172:80"
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // --- CORS ---
    const supported = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',').map(s => s.trim())
      : null;
    const corsHeaders: Record<string,string> = {
      "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    if (supported) {
      const origin = request.headers.get("Origin");
      if (origin && supported.includes(origin)) {
        corsHeaders["Access-Control-Allow-Origin"] = origin;
      }
    } else {
      corsHeaders["Access-Control-Allow-Origin"] = "*";
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- WebSocket (опционально, если нода поддерживает) ---
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      // Проксируем WS-запрос на ws://45.139.132.172:80 (или wss:// если TLS)
      const wsUrl = env.RPC_NODE_URL.replace(/^http/, "ws");
      return fetch(new Request(wsUrl, request), { duplex: "half" });
    }

    // --- HTTP JSON-RPC ---
    const url = new URL(request.url);
    const path = url.pathname;   // обычно "/"
    const query = url.search;    // если есть дополнительные параметры

    const target = `${env.RPC_NODE_URL}${path}${query}`;
    const body = ["GET","HEAD"].includes(request.method)
      ? null
      : await request.text();

    const proxyReq = new Request(target, {
      method: request.method,
      headers: {
        // передаём все оригинальные заголовки, кроме Host
        ...Object.fromEntries(
          Array.from(request.headers.entries())
            .filter(([k]) => k.toLowerCase() !== "host")
        ),
        "Content-Type": "application/json"
      },
      body,
    });

    const res = await fetch(proxyReq);
    // копируем все заголовки ответа от ноды, и добавляем CORS
    const responseHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      responseHeaders.set(k, v);
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  }
};
