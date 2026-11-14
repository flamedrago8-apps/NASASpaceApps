import clsx from 'clsx';
import { KeyRound, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api, type ApiKey, type NewApiKey } from '../api';
import { Button, Card, CopyButton, EmptyState, ErrorState, IconButton, Modal, PageHeader, Spinner, TextInput } from '../components/ui/kit';
import { fmtNum } from '../lib/format';
import { useToast } from '../state/toast';
import { useAsync } from '../state/useAsync';

function ago(iso?: string) {
  if (!iso) return 'Never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function KeysPage() {
  const keys = useAsync(() => api.listKeys(), []);
  const settings = useAsync(() => api.getSettings(), []);
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const baseUrl = settings.data?.gateway.baseUrl ?? 'https://gateway.example.com/v1';

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const k = await api.createKey(name.trim());
      setCreated(k);
      setCreating(false);
      setName('');
      keys.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create key', 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api.revokeKey(revoking.id);
      toast(`Revoked “${revoking.name}”`, 'ok');
      setRevoking(null);
      keys.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not revoke key', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="API keys"
        subtitle="Clients use these to send traffic through the gateway"
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={13} /> Create key
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] space-y-4 p-4 sm:p-5">
          <Card bodyClassName="p-0">
            {keys.error ? (
              <ErrorState error={keys.error} onRetry={keys.reload} />
            ) : !keys.data ? (
              <Spinner />
            ) : keys.data.length === 0 ? (
              <EmptyState icon={<KeyRound size={18} />} title="No API keys yet" body="Create a key, then point your OpenAI-compatible client at the gateway URL." action={<Button onClick={() => setCreating(true)}>Create key</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12.5px]">
                  <thead className="text-[11.5px] text-fg-subtle">
                    <tr>
                      <th className="px-4 pb-2 pt-3.5 font-normal">Name</th>
                      <th className="px-4 pb-2 pt-3.5 font-normal">Key</th>
                      <th className="px-4 pb-2 pt-3.5 font-normal">Created</th>
                      <th className="px-4 pb-2 pt-3.5 font-normal">Last used</th>
                      <th className="px-4 pb-2 pt-3.5 text-right font-normal">Requests</th>
                      <th className="w-12 px-4 pb-2 pt-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.data.map((k) => (
                      <tr key={k.id} className="border-t border-white/[0.04]">
                        <td className="px-4 py-3 text-fg">{k.name}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-fg-muted">{k.prefix}••••••••</td>
                        <td className="px-4 py-3 text-fg-muted">{new Date(k.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-fg-muted">{ago(k.lastUsedAt)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-fg-muted">{fmtNum(k.requests)}</td>
                        <td className="px-3 py-3 text-right">
                          <IconButton label={`Revoke ${k.name}`} onClick={() => setRevoking(k)} className="hover:text-danger">
                            <Trash2 size={13} />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Quickstart baseUrl={baseUrl} />
        </div>
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create API key"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} loading={busy} disabled={!name.trim()}>
              Create key
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <TextInput label="Name" placeholder="e.g. Production web app" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </form>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Save your key" footer={<Button variant="primary" onClick={() => setCreated(null)}>Done</Button>}>
        <p className="mb-3 flex items-start gap-2 text-security-amber">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" /> This is the only time the full key is shown. Store it somewhere safe.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-[#2a2a31] bg-white/[0.03] py-1 pl-3 pr-1">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">{created?.secret}</code>
          {created && <CopyButton text={created.secret} label="Copy key" />}
        </div>
      </Modal>

      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revoke API key?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={revoke} loading={busy}>
              Revoke key
            </Button>
          </>
        }
      >
        Requests using <span className="text-fg">{revoking?.name}</span> (<code className="font-mono">{revoking?.prefix}…</code>) will start failing with 401 immediately. This can’t be undone.
      </Modal>
    </div>
  );
}

const SNIPPETS = (base: string) => ({
  curl: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $CONDUIT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-5-5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  python: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${base}",
    api_key=os.environ["CONDUIT_API_KEY"],
)

resp = client.chat.completions.create(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": "Hello"}],
)`,
  node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${base}",
  apiKey: process.env.CONDUIT_API_KEY,
});

const resp = await client.chat.completions.create({
  model: "claude-sonnet-5-5",
  messages: [{ role: "user", content: "Hello" }],
});`,
});

function Quickstart({ baseUrl }: { baseUrl: string }) {
  const [lang, setLang] = useState<'curl' | 'python' | 'node'>('python');
  const code = SNIPPETS(baseUrl)[lang];
  return (
    <Card title="Quickstart" actions={<CopyButton text={code} label="Copy snippet" />}>
      <p className="mb-3 text-[12px] leading-relaxed text-fg-subtle">
        The gateway is OpenAI-compatible. Swap your client’s base URL to <code className="font-mono text-fg-muted">{baseUrl}</code> and use a gateway key — no other code changes.
      </p>
      <div className="mb-2 flex gap-1">
        {(['python', 'node', 'curl'] as const).map((l) => (
          <button key={l} onClick={() => setLang(l)} className={clsx('rounded-md px-2.5 py-1 text-[12px]', lang === l ? 'bg-white/[0.07] text-fg' : 'text-fg-subtle hover:text-fg-muted')}>
            {l === 'node' ? 'Node.js' : l === 'python' ? 'Python' : 'cURL'}
          </button>
        ))}
      </div>
      <pre className="overflow-x-auto rounded-xl border border-[#1f1f25] bg-[#0a0a0c] p-4 font-mono text-[12px] leading-relaxed text-fg-muted">{code}</pre>
    </Card>
  );
}
