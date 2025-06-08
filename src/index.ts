interface Env {
  CORS_ALLOW_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // --- CORS-заголовки ---
    const supportedDomains = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',')
      : undefined;
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (supportedDomains) {
      const origin = request.headers.get('Origin');
      if (origin && supportedDomains.includes(origin)) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
      }
    } else {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // --- Собираем URL нашей ноды ---
    const incomingUrl = new URL(request.url);
    const target = new URL(request.url);
    target.protocol = 'http:';
    target.hostname = '45.139.132.172';
    target.port = '51250';
    // path и query унаследуются из incomingUrl

    // --- Обработка WebSocket-апгрейда (если есть) ---
    const upgrade = request.headers.get('Upgrade');
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      // Cloudflare Workers умеет proxy WebSocket через fetch
      return fetch(new Request(target.toString(), request));
    }

    // --- Проксирование обычного HTTP(POST/GET) ---
    // Клонируем тело (если нужно) и заголовки
    const proxyReq = new Request(target.toString(), {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method)
        ? null
        : request.clone().body,
    });

    const res = await fetch(proxyReq);

    // отдаём клиенту тело и статус из вашей ноды, но с нашими CORS
    return new Response(res.body, {
      status: res.status,
      headers: corsHeaders,
    });
  },
};
