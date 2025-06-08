interface Env {
  CORS_ALLOW_ORIGIN: string;
  HELIUS_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env) {
    // Разбор CORS
    const supportedDomains = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',')
      : undefined;
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    };
    if (supportedDomains) {
      const origin = request.headers.get("Origin");
      if (origin && supportedDomains.includes(origin)) {
        corsHeaders["Access-Control-Allow-Origin"] = origin;
      }
    } else {
      corsHeaders["Access-Control-Allow-Origin"] = "*";
    }

    // Обрабатываем preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Если это WebSocket, просто проксируем на Helius
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      return await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
        request
      );
    }

    // Подготовка URL и тела запроса
    const { pathname, search } = new URL(request.url);
    const body = await request.text();
    const heliusBase =
      pathname === "/"
        ? "https://mainnet.helius-rpc.com/"
        : "https://api.helius.xyz";
    const heliusUrl = `${heliusBase}${pathname}?api-key=${env.HELIUS_API_KEY}${
      search ? `&${search.slice(1)}` : ""
    }`;
    const localUrl = `https://rpc.onenodes.org${pathname}${search}`;

    // Заголовки
    const commonHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const heliusHeaders = {
      ...commonHeaders,
      "X-Helius-Cloudflare-Proxy": "true",
    };

    // Создаём два объекта запроса
    const heliusRequest = new Request(heliusUrl, {
      method: request.method,
      headers: heliusHeaders,
      body: body || null,
    });
    const localRequest = new Request(localUrl, {
      method: request.method,
      headers: commonHeaders,
      body: body || null,
    });

    // Отправляем оба запроса параллельно
    const [heliusRes] = await Promise.all([
      fetch(heliusRequest),
      // не ждем локальный ответ, чтобы не задерживать пользователя
      fetch(localRequest).catch((err) => {
        // сюда можно добавить логирование ошибок
        console.error("Local node error:", err);
      }),
    ]);

    // Формируем ответ клиенту на основе Helius
    return new Response(heliusRes.body, {
      status: heliusRes.status,
      headers: corsHeaders,
    });
  },
};
