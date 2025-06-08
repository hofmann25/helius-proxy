interface Env {
  CORS_ALLOW_ORIGIN: string;
  HELIUS_API_KEY: string;
  // если хотите, вынесите URL локальной ноды в переменную окружения:
  // LOCAL_NODE_URL: string;
}

export default {
  async fetch(request: Request, env: Env) {
    // 1) CORS-подготовка
    const supported = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(",")
      : undefined;
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "*",
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
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // 2) WebSocket-прокси (без дублирования)
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return fetch(
        `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
        request
      );
    }

    // 3) Подготовка URL и тела
    const { pathname, search } = new URL(request.url);
    const body = await request.text();
    const heliusBase =
      pathname === "/" ? "https://mainnet.helius-rpc.com/" : "https://api.helius.xyz";
    const heliusUrl = `${heliusBase}${pathname}?api-key=${env.HELIUS_API_KEY}${
      search ? `&${search.slice(1)}` : ""
    }`;

    // ваш адрес ноды:
    const localUrl = `https://rpc.onenodes.org${pathname}${search}`;
    // или из env:
    // const localUrl = `${env.LOCAL_NODE_URL}${pathname}${search}`;

    const commonHeaders = { "Content-Type": "application/json" };
    const heliusHeaders = {
      ...commonHeaders,
      "X-Helius-Cloudflare-Proxy": "true",
    };

    const heliusReq = new Request(heliusUrl, {
      method: request.method,
      headers: heliusHeaders,
      body: body || null,
    });
    const localReq = new Request(localUrl, {
      method: request.method,
      headers: commonHeaders,
      body: body || null,
    });

    // 4) Fire-and-forget для локальной ноды
    //    сразу отсылаем fetch, но не ждём:
    fetch(localReq).catch((err) => {
      console.error("Local node error:", err);
    });

    // 5) Ждём только Helius и отправляем ответ клиенту
    const heliusRes = await fetch(heliusReq);
    return new Response(heliusRes.body, {
      status: heliusRes.status,
      headers: corsHeaders,
    });
  },
};
