import { useState } from 'react';
import { Download } from 'lucide-react';
import { buildChartCsv, canExportChart, type ChartCsvInput } from '@/lib/chartCsv';

export default function DownloadChartCsvButton({ input }: { input: ChartCsvInput }) {
  const [error, setError] = useState(false);
  function download() {
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const csv = buildChartCsv(input);
      if (!csv) throw new Error('No exportable points');
      url = URL.createObjectURL(new Blob([csv.text], { type: 'text/csv;charset=utf-8' }));
      link = document.createElement('a');
      link.href = url;
      link.download = csv.filename;
      document.body.append(link);
      link.click();
      setError(false);
    } catch { setError(true); }
    finally {
      link?.remove();
      // Allow browsers to start consuming the download before revoking it.
      if (url) { const createdUrl = url; window.setTimeout(() => URL.revokeObjectURL(createdUrl), 1000); }
    }
  }
  return <div className="mt-3 text-xs text-text-secondary">
    <button type="button" disabled={!canExportChart(input)} onClick={download}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-cyan-900 hover:bg-cyan-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">
      <Download className="h-4 w-4" aria-hidden="true" />Скачать точки графика · CSV
    </button>
    <p className="mt-1">Только точки выбранного диапазона, с датами, единицей и источником. Без заполнения пропусков.</p>
    <p role="status">{error ? 'Не удалось начать скачивание CSV. Попробуйте ещё раз в браузере с поддержкой загрузки файлов.' : ''}</p>
  </div>;
}
