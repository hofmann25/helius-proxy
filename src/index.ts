export interface Env {
  /// Список разрешённых Origin через запятую, или пустая строка для “*”
  CORS_ALLOW_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // --- 1) CORS-подготовка ----------------------------------------------
    const supported = env.CORS_ALLOW_ORIGIN
      ? env.CORS_ALLOW_ORIGIN.split(',')
      : null;

    const corsHeaders: Record<string,string> = {
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (supported) {
      const origin = request.headers.get('Origin');
      if (origin && supported.includes(origin)) {
        corsHeaders['Access-Control-Allow-Origin'] = origin;
      }
    } else {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
    }

    // OPTIONS — сразу возвращаем 200 с CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // --- 2) Проксирование -----------------------------------------------
    const { pathname, search } = new URL(request.url);

    // Собираем URL вашей ноды
    const target = `http://45.139.132.172:80${pathname}${search}`;

    // Читаем тело только если оно есть
    let body: string | null = null;
    if (!['GET','HEAD'].includes(request.method)) {
      body = await request.text();
    }

    // Сохраняем Content-Type из оригинала или ставим JSON по умолчанию
    const contentType = request.headers.get('Content-Type') || 'application/json';

    const proxyReq = new Request(target, {
      method: request.method,
      headers: {
        'Content-Type': contentType,
        // здесь можно добавить любые другие нужные вам заголовки
      },
      body,
      redirect: 'manual',
    });

    // Делаем запрос к вашей ноде
    const upstream = await fetch(proxyReq);

    // --- 3) Возвращаем ответ с CORS -------------------------------------
    const respHeaders = new Headers(upstream.headers);
    // Пробрасываем CORS в ответ
    for (const [k,v] of Object.entries(corsHeaders)) {
      respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  }
}
