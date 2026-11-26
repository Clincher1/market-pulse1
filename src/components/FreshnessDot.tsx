import { freshnessTone, observationLagLabel, observationLabel } from '@/lib/asOf';

export default function FreshnessDot({ asOf }: { asOf?: string | null }) {
  const tone = freshnessTone(asOf);
  const detail = observationLagLabel(asOf) || observationLabel(asOf);
  const title = tone === 'live' ? 'Свежая котировка'
    : tone === 'stale' ? `Данные отстают: ${detail}`
      : 'Дневное наблюдение или закрытие';

  return <span className={`freshness-dot freshness-dot--${tone}`} role="img" title={title} aria-label={title} data-freshness={tone} />;
}
