export type Probe = { name: string; url: string; mode: RequestMode; api?: boolean };
export type Result = Probe & {
  status: 'readable' | 'opaque' | 'http-error' | 'failed' | 'timeout';
  ms: number;
  detail: string;
  httpStatus?: number;
  responseType?: ResponseType;
  redirected?: boolean;
  responseUrl?: string;
  apiOutcome?: 'success' | 'error' | 'unknown';
  apiErrorCode?: number;
};
export const tests: Probe[] = [
  { name: 'VK Web', url: 'https://vk.com/', mode: 'no-cors' },
  { name: 'VK Mobile', url: 'https://m.vk.com/', mode: 'no-cors' },
  { name: 'VK API host', url: 'https://api.vk.com/', mode: 'no-cors' },
  { name: 'VK API users.get (без токена)', url: 'https://api.vk.com/method/users.get?user_ids=1&v=5.199', mode: 'cors', api: true },
  { name: 'VK API server time (без токена)', url: 'https://api.vk.com/method/utils.getServerTime?v=5.199', mode: 'cors', api: true },
  { name: 'VK OAuth', url: 'https://oauth.vk.com/', mode: 'no-cors' },
  { name: 'VK Static', url: 'https://vk.com/favicon.ico', mode: 'no-cors' }
];

export async function probe(test: Probe, timeoutMs = 9000): Promise<Result> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const response = await fetch(test.url, {
      mode: test.mode, cache: 'no-store', credentials: 'omit', signal: controller.signal
    });
    const result: Result = {
      ...test, status: response.type === 'opaque' ? 'opaque' : response.ok ? 'readable' : 'http-error',
      ms: elapsed(), responseType: response.type,
      detail: response.type === 'opaque'
        ? 'Запрос выполнен; HTTP status, тело и конечный URL скрыты браузером. Это не подтверждает работу API.'
        : `HTTP ${response.status} ${response.statusText}`
    };
    if (response.type !== 'opaque') {
      result.httpStatus = response.status;
      result.redirected = response.redirected;
      result.responseUrl = response.url;
      if (test.api) {
        result.apiOutcome = 'unknown';
        const body = await response.text();
        try {
          const data = JSON.parse(body);
          if (data && typeof data === 'object' && data.error) {
            result.apiOutcome = 'error';
            if (typeof data.error.error_code === 'number') result.apiErrorCode = data.error.error_code;
            result.detail += `; VK API error ${result.apiErrorCode ?? '?'}: ${String(data.error.error_msg ?? '').slice(0, 300)}`;
          } else if (data && typeof data === 'object' && 'response' in data) {
            result.apiOutcome = 'success';
            result.detail += '; VK вернул response';
          } else result.detail += '; нет подтверждения результата API';
        } catch { result.detail += '; ответ не JSON, результат API неизвестен'; }
      }
    }
    result.ms = elapsed();
    return result;
  } catch (error) {
    return { ...test, status: controller.signal.aborted ? 'timeout' : 'failed', ms: elapsed(),
      detail: controller.signal.aborted ? `Таймаут ${timeoutMs} ms`
        : `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}. Браузер не позволяет отличить CORS, DNS, TLS и блокировку сети.` };
  } finally { clearTimeout(timer); }
}
