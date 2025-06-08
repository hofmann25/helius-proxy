interface Env {
  CORS_ALLOW_ORIGIN: string;      // допустимые Origin через запятую, или пусто = "*"
  LOCAL_NODE_URL: string;         // адрес вашей ноды, например "http://45.139.132.172:51250"
}

export default {
  async fetch(request: Request, env: Env) {
    // Настройка CORS
    const supportedDomains = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',').map(s => s.trim())
      : undefined;

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };

    if (supportedDomains) {
      const origin = request.headers.get('Origin');
      if (origin && supportedDomains.includes(origin)) {
        corsHeaders["Access-Control-Allow-Origin"] = origin;
      }
    } else {
      corsHeaders["Access-Control-Allow-Origin"] = "*";
    }

    // Обрабатываем preflight-запросы
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const { pathname, search } = new URL(request.url);
    const targetUrl = new URL(env.LOCAL_NODE_URL);
    targetUrl.pathname = pathname;
    targetUrl.search = search;

    // Если это WebSocket upgrade — проксируем напрямую
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return fetch(targetUrl.toString(), request);
    }

    // Составляем проксируемый запрос к локальной ноде
    const body = await request.text();
    const proxyReq = new Request(targetUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        // можно пробросить и другие заголовки, если нужно:
        // ...Object.fromEntries(request.headers)
      },
      body: body.length > 0 ? body : null,
    });

    // Выполняем запрос
    const res = await fetch(proxyReq);

    // Возвращаем ответ с нужными CORS-заголовками
    const responseHeaders = new Headers(res.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  }
};
