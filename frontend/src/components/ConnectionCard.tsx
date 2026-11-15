import { CircleCheck, Plug } from 'lucide-react';
import { useState } from 'react';
import { api, CONNECTED_AT_RUNTIME, saveConnection, savedConnection, SOURCE, testConnection } from '../api';
import { Button, TextInput } from './ui/kit';

/** Point this dashboard at a running gateway (or back at demo data). Saved in this browser. */
export function ConnectionCard() {
  const saved = savedConnection();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [token, setToken] = useState(saved?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const u = url.trim().replace(/\/v1\/?$/, '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(u)) return setError('Enter the full URL, starting with https://');
    setBusy(true);
    setError(null);
    try {
      await testConnection({ url: u, token: token.trim() || undefined });
      saveConnection({ url: u, token: token.trim() || undefined });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2 text-sm">
        {api.mode === 'mock' ? <Plug className="size-4 text-muted-foreground" /> : <CircleCheck className="size-4 text-efficiency" />}
        <span>{api.mode === 'mock' ? 'Showing demo data (simulated in your browser)' : `Connected to ${SOURCE}`}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Gateway URL" placeholder="https://your-gateway.onrender.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        <TextInput label="Admin token" type="password" autoComplete="off" placeholder="ADMIN_TOKEN from the server" value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={connect} loading={busy} disabled={!url.trim()}>
          Test and connect
        </Button>
        {CONNECTED_AT_RUNTIME && (
          <Button
            variant="outline"
            onClick={() => {
              saveConnection(null);
              window.location.reload();
            }}
          >
            Disconnect and use demo data
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Saved only in this browser. The token is sent with every dashboard request to that gateway, so only use this on a device you trust.</p>
    </div>
  );
}
