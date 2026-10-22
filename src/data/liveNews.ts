import { NewsItem } from './mockData';
import { supabase } from '@/lib/supabase';
import { safeHttpUrl } from '@/lib/safeUrl';
import { dedupeNewsItems } from '@/lib/newsDedupe';

/**
 * Декодирует HTML-сущности в тексте из базы
 * (например, "OpenAI&apos;s" -> "OpenAI's").
 * В идеале сущности должен декодировать бэкенд при записи в базу,
 * но фронт страхуется сам.
 */
function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes('&')) return value;
  if (typeof document === 'undefined') {
    return value
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

/**
 * Загружает новости из кэша Supabase (таблица cached_news),
 * newest-first по дате публикации. При ошибке возвращает
 * пустой массив — хук useLiveNews превращает это в error-состояние,
 * сохраняя уже показанные новости.
 */
export async function fetchRawNews(): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('cached_news')
      .select(
        'id, source, time, title, summary, url, published_at, impacts, sentiment, importance, confidence, topic'
      )
      .order('published_at', { ascending: false, nullsFirst: false })
      // Fetch a little extra before conservative duplicate grouping so a
      // collapsed republication does not unnecessarily shorten the feed.
      .limit(80);

    if (error || !data || data.length === 0) {
      throw new Error('Нет новостей в кэше');
    }

    const normalized = (data as NewsItem[]).map((item) => ({
      ...item,
      title: decodeHtmlEntities(item.title ?? ''),
      summary: decodeHtmlEntities(item.summary ?? ''),
      url: safeHttpUrl(item.url),
      impacts: item.impacts ?? [],
      sentiment: item.sentiment ?? 0,
      importance: item.importance ?? 0,
    }));

    return dedupeNewsItems(normalized).slice(0, 50);
  } catch (e) {
    console.error('Ошибка загрузки новостей из базы:', e);
    return [];
  }
}
