addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Проксирует запрос на указанный Solana-RPC
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
  // Исходный URL запроса к вашему воркеру:
  const incomingUrl = new URL(request.url)

  // Собираем целевой URL, подставляя хост, порт и сохраняя путь + query
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, 'http://45.139.132.172:80')

  // Клонируем заголовки, чтобы можно было модифицировать
  const newHeaders = new Headers(request.headers)
  // Переназначаем Host на адрес вашей ноды
  newHeaders.set('Host', '45.139.132.172')
  // (по желанию) Удаляем лишние заголовки от Cloudflare
  newHeaders.delete('cf-visitor')
  newHeaders.delete('cf-ray')
  newHeaders.delete('cf-request-id')

  // Формируем новый запрос к целевому серверу
  const proxiedRequest = new Request(targetUrl.toString(), {
    method:  request.method,
    headers: newHeaders,
    body:    request.body,
    redirect:'manual'
  })

  // Выполняем запрос и возвращаем ответ «как есть»
  const response = await fetch(proxiedRequest)

  // (по желанию) Можно пробросить CORS-заголовки, если планируете вызывать RPC из браузера:
  // const corsHeaders = { 'Access-Control-Allow-Origin': '*' }
  // return new Response(response.body, {
  //   status: response.status,
  //   statusText: response.statusText,
  //   headers: {...Object.fromEntries(response.headers), ...corsHeaders}
  // })

  return response
}
