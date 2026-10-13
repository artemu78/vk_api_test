import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Result = {
  name: string;
  url: string;
  mode: RequestMode;
  status: 'reachable' | 'failed';
  ms: number;
  detail: string;
};

const tests: Array<[string, string, RequestMode]> = [
  ['VK web', 'https://vk.com/', 'no-cors'],
  ['VK mobile', 'https://m.vk.com/', 'no-cors'],
  ['VK API host', 'https://api.vk.com/', 'no-cors'],
  ['VK API users.get', 'https://api.vk.com/method/users.get?user_ids=1&v=5.199', 'cors'],
  ['VK OAuth', 'https://oauth.vk.com/', 'no-cors'],
  ['VK static', 'https://vk.com/favicon.ico', 'no-cors']
];

async function probe(name: string, url: string, mode: RequestMode): Promise<Result> {
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      mode,
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timer);

    return {
      name,
      url,
      mode,
      status: 'reachable',
      ms: Math.round(performance.now() - started),
      detail:
        mode === 'no-cors'
          ? 'Request completed; response is opaque'
          : `HTTP ${response.status} ${response.statusText}`
    };
  } catch (error) {
    return {
      name,
      url,
      mode,
      status: 'failed',
      ms: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function App() {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    setResults([]);

    for (const [name, url, mode] of tests) {
      const result = await probe(name, url, mode);
      setResults(current => [...current, result]);
    }

    setRunning(false);
  }

  function exportResults() {
    const report = {
      time: new Date().toISOString(),
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      connection: (navigator as Navigator & { connection?: unknown }).connection ?? null,
      results
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json'
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'vk-probe.json';
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main>
      <h1>VK API Probe</h1>
      <p>Проверяет доступность VK непосредственно с этого устройства и через текущую сеть.</p>

      <div className="note">
        <b>Важно:</b> CORS может запрещать JavaScript читать ответ даже при доступном сервере.
        Поэтому часть тестов использует <code>no-cors</code>. Успех такого теста означает, что
        браузер смог выполнить запрос, но HTTP status и body недоступны приложению.
      </div>

      <div className="actions">
        <button onClick={runAll} disabled={running}>
          {running ? 'Проверяю…' : 'Запустить проверки'}
        </button>
        {results.length > 0 && (
          <button className="secondary" onClick={exportResults}>
            Экспорт JSON
          </button>
        )}
      </div>

      <section>
        {results.map((result, index) => (
          <article key={index} className={result.status}>
            <div>
              <b>{result.name}</b>
              <small>{result.url}</small>
            </div>
            <strong>{result.status === 'reachable' ? 'OK' : 'FAIL'}</strong>
            <span>{result.ms} ms</span>
            <small>{result.detail}</small>
          </article>
        ))}
      </section>

      <footer>
        Для полезного эксперимента сохрани один отчёт через обычный Wi-Fi и второй через
        мобильную сеть во время ограничений.
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
