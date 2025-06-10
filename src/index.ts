export interface Env {
  /// Список разрешённых Origin, разделённых запятыми. Пустая = “*”
  CORS_ALLOW_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // --- 1) CORS -------------------------------------------------------
    const allowed = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',').map(s => s.trim())
      : null;

    const origin = request.headers.get('Origin') || '';
    const corsHeaders: Record<string,string> = {
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };
    if (!allowed || allowed.includes(origin)) {
      corsHeaders['Access-Control-Allow-Origin'] = origin || '*';
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // --- 2) Собираем URL и тело ----------------------------------------
    const incoming = new URL(request.url);
    const targetUrl = new URL(request.url);
    targetUrl.protocol = 'http:';
    targetUrl.hostname = '45.139.132.172';
    targetUrl.port     = '80';
    // Оставляем путь и query без изменений:
    targetUrl.pathname = incoming.pathname;
    targetUrl.search   = incoming.search;

    // Клонируем заголовки, но не меняем Host
    const headers = new Headers(request.headers);
    // если у вас есть особые служебные заголовки от CF, можно их почистить здесь:
    headers.delete('cf-visitor');
    headers.delete('cf-ray');
    headers.delete('cf-request-id');

    // Читаем тело для небезопасных методов
    let body: ArrayBuffer | null = null;
    if (!['GET','HEAD'].includes(request.method)) {
      body = await request.clone().arrayBuffer();
    }

    // --- 3) Создаём новый Request с поддержкой WebSocket -------------
    const proxyReq = new Request(targetUrl.toString(), {
      method:  request.method,
      headers,
      body,
      redirect: 'manual',
      // для WebSocket upgrade
      duplex: 'half',
    });

    // --- 4) Посылаем и возвращаем ответ -------------------------------
    const upstream = await fetch(proxyReq);

    // Собираем финальные заголовки
    const respHeaders = new Headers(upstream.headers);
    for (const [k,v] of Object.entries(corsHeaders)) {
      respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status:     upstream.status,
      statusText: upstream.statusText,
      headers:    respHeaders
    });
  }
}
