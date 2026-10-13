import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { probe, tests, type Result } from './probes';
import './style.css';

type Connection = { effectiveType?: string; type?: string; downlink?: number; rtt?: number; saveData?: boolean };
type Run = {
  id: string; label: string; timestamp: string; completedAt: string;
  userAgent: string; navigatorOnline: boolean; navigatorOnlineAtEnd: boolean;
  connectionInfo: Connection | null; appVersion: string; tests: Result[];
};
type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
const storageKey = 'vk-probe-runs-v1';
const outcomes: Record<Result['status'], string> = {
  readable: 'HTTP OK', opaque: 'OPAQUE', 'http-error': 'HTTP FAIL', failed: 'FETCH FAIL', timeout: 'TIMEOUT'
};
function loadRuns(): Run[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((run): run is Run => run && typeof run.id === 'string' && typeof run.label === 'string'
      && typeof run.timestamp === 'string' && Array.isArray(run.tests)
      && run.tests.every((t: Result) => t && typeof t.name === 'string' && typeof t.url === 'string'
        && typeof t.detail === 'string' && typeof t.ms === 'number' && t.status in outcomes)).slice(0, 20);
  } catch { return []; }
}
function connectionInfo(): Connection | null {
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  if (!connection) return null;
  const { effectiveType, type, downlink, rtt, saveData } = connection;
  return { effectiveType, type, downlink, rtt, saveData };
}
function exportRun(run: Run) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `vk-probe-${run.timestamp.replace(/[:.]/g, '-')}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function summary(result: Result) {
  return `${outcomes[result.status]}${result.apiOutcome === 'error' ? ` / API ERROR ${result.apiErrorCode ?? ''}` : ''}`;
}
function App() {
  const [runs, setRuns] = useState<Run[]>(loadRuns);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [controlled, setControlled] = useState(!!navigator.serviceWorker?.controller);
  const [swError, setSwError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [latest, setLatest] = useState<Run | null>(null);
  const [leftId, setLeftId] = useState(runs[1]?.id ?? runs[0]?.id ?? '');
  const [rightId, setRightId] = useState(runs[0]?.id ?? '');
  const { offlineReady: [offlineReady], needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(error) { setSwError(String(error)); }
  });
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const control = () => setControlled(!!navigator.serviceWorker?.controller);
    const install = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', installed);
    navigator.serviceWorker?.addEventListener('controllerchange', control);
    return () => {
      window.removeEventListener('online', update); window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', installed);
      navigator.serviceWorker?.removeEventListener('controllerchange', control);
    };
  }, []);
  async function runAll() {
    setRunning(true); setResults([]); setLatest(null);
    const started = {
      id: crypto.randomUUID(), label: label.trim() || 'Без метки', timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent, navigatorOnline: navigator.onLine, connectionInfo: connectionInfo(),
      appVersion: __APP_VERSION__
    };
    try {
      const completed: Result[] = [];
      for (const test of tests) {
        completed.push(await probe(test));
        setResults([...completed]);
      }
      const run: Run = { ...started, completedAt: new Date().toISOString(), navigatorOnlineAtEnd: navigator.onLine, tests: completed };
      const recent = [run, ...runs].slice(0, 20);
      setLatest(run); setRuns(recent); setLeftId(recent[1]?.id ?? run.id); setRightId(run.id);
      try { localStorage.setItem(storageKey, JSON.stringify(recent)); setStorageError(''); }
      catch { setStorageError('Не удалось сохранить локально. Экспортируйте JSON перед закрытием.'); }
    } finally { setRunning(false); }
  }
  const left = runs.find(run => run.id === leftId);
  const right = runs.find(run => run.id === rightId);
  return (
    <main>
      <h1>VK API Probe</h1>
      <p>Проверки идут с этого устройства через текущую сеть. Версия {__APP_VERSION__}.</p>
      <div className="note" aria-live="polite">
        <b>navigator.onLine: {String(online)}</b> — {online ? 'браузер сообщает о сети' : 'приложение работает офлайн'}.
        <br />Это не проверка доступности Интернета или VK.
        <br /><b>PWA:</b> {swError ? `ошибка регистрации: ${swError}` : offlineReady || controlled
          ? 'Готово офлайн: оболочка сохранена' : 'Подготовка офлайн-кэша (только production/HTTPS)'}.
        <br />Service worker: {controlled ? 'управляет страницей' : 'пока не управляет страницей'}.
      </div>
      {needRefresh && <button disabled={running} onClick={() => void updateServiceWorker(true)}>Обновить приложение</button>}
      {installPrompt && <button className="secondary" onClick={async () => {
        await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null);
      }}>Установить приложение</button>}
      <div className="note">
        <b>OPAQUE ≠ API OK.</b> В no-cors браузер скрывает HTTP status и тело.
        FETCH FAIL может означать CORS, DNS, TLS или сетевую блокировку — точно отличить их нельзя.
        <br />utils.getServerTime проверяет публичный метод. users.get — попытка без токена; VK может вернуть ошибку авторизации даже при HTTP 200.
        Таймаут каждой проверки: 9 секунд. Ответы VK не кэшируются приложением.
      </div>
      <label htmlFor="run-label">Метка замера (необязательно)</label>
      <input id="run-label" list="labels" value={label} maxLength={80} disabled={running}
        placeholder="Например: Mobile restricted" onChange={event => setLabel(event.target.value)} />
      <datalist id="labels"><option value="Wi-Fi normal" /><option value="Mobile normal" /><option value="Mobile restricted" /></datalist>
      <div className="actions">
        <button onClick={() => void runAll()} disabled={running}>{running ? `Проверяю… ${results.length}/${tests.length}` : 'Запустить проверки'}</button>
        {latest && <button className="secondary" onClick={() => exportRun(latest)}>Экспорт JSON</button>}
      </div>
      <section aria-label="Результаты" aria-live="polite">
        {results.map(result => <article key={result.name} className={result.status}>
          <div><b>{result.name}</b><small>{result.url}</small></div>
          <strong>{summary(result)}</strong><span>{result.ms} ms</span>
          <small>fetch mode: {result.mode} · {result.detail}</small>
        </article>)}
      </section>
      {storageError && <p role="alert">{storageError}</p>}
      {runs.length > 0 && <section className="history" aria-label="Сохранённые замеры">
        <h2>Последние замеры ({runs.length}/20)</h2>
        <p>Хранятся только в этом браузере. Очистка данных сайта удаляет замеры и офлайн-кэш.</p>
        {runs.map(run => <div className="saved" key={run.id}>
          <span><b>{run.label}</b><small>{new Date(run.timestamp).toLocaleString()}</small></span>
          <button className="secondary" onClick={() => exportRun(run)}>JSON</button>
        </div>)}
      </section>}
      {runs.length >= 2 && <section className="history" aria-label="Сравнение">
        <h2>Сравнить два замера</h2>
        <label>Базовый замер<select value={leftId} onChange={event => setLeftId(event.target.value)}>
          {runs.map(run => <option key={run.id} value={run.id}>{run.label} · {new Date(run.timestamp).toLocaleString()}</option>)}
        </select></label>
        <label>Второй замер<select value={rightId} onChange={event => setRightId(event.target.value)}>
          {runs.map(run => <option key={run.id} value={run.id}>{run.label} · {new Date(run.timestamp).toLocaleString()}</option>)}
        </select></label>
        {leftId === rightId ? <p>Выберите разные замеры.</p> : left && right && <div className="table-scroll"><table>
          <thead><tr><th>Тест</th><th>{left.label}</th><th>{right.label}</th><th>Δ ms</th></tr></thead>
          <tbody>{left.tests.map(a => {
            const b = right.tests.find(test => test.url === a.url && test.mode === a.mode);
            const changed = b && (a.status !== b.status || a.httpStatus !== b.httpStatus || a.apiOutcome !== b.apiOutcome || a.apiErrorCode !== b.apiErrorCode);
            return <tr key={a.name} className={changed ? 'changed' : ''}>
              <th>{a.name}<small>{changed ? 'Изменился результат' : ''}</small></th>
              <td>{summary(a)}<small>{a.ms} ms</small></td>
              <td>{b ? summary(b) : 'Нет теста'}<small>{b ? `${b.ms} ms` : ''}</small></td>
              <td>{b ? `${b.ms - a.ms >= 0 ? '+' : ''}${b.ms - a.ms}` : '—'}</td>
            </tr>;
          })}</tbody>
        </table></div>}
        <p>Δ = второй − базовый. Смена сети во время замера и CORS ограничивают сравнение. OPAQUE не подтверждает успешный HTTP ответ.</p>
      </section>}
      <footer>Сначала откройте приложение через обычный Wi-Fi, дождитесь готовности PWA и проверьте запуск офлайн.
        Затем сохраните базовый замер и сравните его с мобильной сетью во время ограничений.
        Установка необязательна: в Chrome можно выбрать меню → «Установить приложение» / «Добавить на главный экран».</footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
