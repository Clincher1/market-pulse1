import type { NewsHeadline } from './marketTypes';
import { supabase } from '@/lib/supabase';
import { safeHttpUrl } from '@/lib/safeUrl';

/**
 * Декодирует HTML-сущности в заголовке из базы
 * (например, "OpenAI&apos;s" -> "OpenAI's").
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
 * Загружает только проверяемые поля публикаций: заголовок, источник, время и URL.
 * Новостные классификации и модельные оценки остаются в базе для аудита, но не
 * используются для отбора, ранжирования, группировки или показа этих заголовков.
 */
export async function fetchRawNews(): Promise<NewsHeadline[]> {
  try {
    const { data, error } = await supabase
      .from('cached_news')
      .select('id, source, time, title, url, published_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(80);

    if (error || !data || data.length === 0) {
      throw new Error('Нет новостей в кэше');
    }

    return (data as NewsHeadline[]).map((item) => ({
      id: item.id,
      source: item.source || 'Источник не указан',
      time: item.time ?? null,
      title: decodeHtmlEntities(item.title ?? ''),
      url: safeHttpUrl(item.url),
      published_at: item.published_at ?? null,
    }));
  } catch (e) {
    console.error('Ошибка загрузки новостей из базы:', e);
    return [];
  }
}
