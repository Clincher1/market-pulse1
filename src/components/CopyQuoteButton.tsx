import { useId, useState } from 'react';
import { Copy } from 'lucide-react';
import type { AssetData } from '@/data/marketTypes';
import { quoteCopyText } from '@/lib/quoteCopy';

export default function CopyQuoteButton({ asset, sourceUrl, unavailable = false }: {
  asset: AssetData; sourceUrl: string; unavailable?: boolean;
}) {
  const text = quoteCopyText(asset, sourceUrl, unavailable);
  const [result, setResult] = useState<{ text: string; status: 'copied' | 'manual' } | null>(null);
  const [busy, setBusy] = useState(false);
  const manualId = useId();
  const status = result?.text === text ? result?.status : null;
  async function copy() {
    if (!text || busy) return;
    setBusy(true);
    try {
      if (!window.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await window.navigator.clipboard.writeText(text);
      setResult({ text, status: 'copied' });
    } catch {
      // No deprecated execCommand, permission requests or false success toast.
      setResult({ text, status: 'manual' });
    } finally { setBusy(false); }
  }
  return <div className="mt-[var(--space-2)] text-xs text-text-secondary">
    <button type="button" onClick={copy} disabled={!text || busy}
      title={!text ? 'Для копирования нужны полученная цена, дата наблюдения и источник.' : 'Копировать значение, единицу, дату и ссылку источника'}
      className="inline-flex min-h-11 items-center gap-[var(--space-1)] rounded-xl border border-slate-300 bg-white px-[var(--space-2)] py-[var(--space-1)] font-bold text-cyan-900 hover:bg-cyan-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">
      <Copy className="h-4 w-4" aria-hidden="true" />{busy ? 'Копирование…' : 'Копировать котировку'}
    </button>
    <p role="status" className="mt-[var(--space-1)] min-h-4">
      {status === 'copied' ? 'Котировка с датой и источником скопирована.' : status === 'manual' ? 'Браузер не разрешил копирование. Выделите и скопируйте текст ниже.' : ''}
    </p>
    {status === 'manual' && text && <div className="mt-[var(--space-1)]">
      <label htmlFor={manualId} className="font-bold">Текст котировки для ручного копирования</label>
      <textarea id={manualId} readOnly value={text} rows={7} onFocus={event => event.currentTarget.select()}
        className="mt-[var(--space-1)] w-full rounded-lg border border-slate-300 bg-slate-50 p-[var(--space-1)] text-xs text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500" />
    </div>}
  </div>;
}
