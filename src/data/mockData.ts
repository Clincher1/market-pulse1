// Types

export interface TensionData {
  current: number;
  label: string;
  history: { day: string; value: number }[];
  newsCount: number;
}

export interface AssetData {
  id: string;
  name: string;
  price: string;
  change: number;
  sparkline: number[];
}

export interface NewsItem {
  id: number;
  source: string;
  time: string;
  title: string;
  impacts: { asset: string; direction: 'up' | 'down' }[];
  sentiment: number;
  importance: number;
  summary: string;
  topic: string;
}

export interface ForecastData {
  id: string;
  asset: string;
  direction: 'up' | 'down';
  probability: number;
  window: string;
  confidence: 'Низкая' | 'Средняя' | 'Высокая';
  reason: string;
}

// Mock data

export const tensionData: TensionData = {
  current: 67,
  label: 'Тепло',
  history: [
    { day: '6 окт', value: 54 },
    { day: '7 окт', value: 58 },
    { day: '8 окт', value: 61 },
    { day: '9 окт', value: 55 },
    { day: '10 окт', value: 63 },
    { day: '11 окт', value: 70 },
    { day: '12 окт', value: 67 },
  ],
  newsCount: 1247,
};

export const assets: AssetData[] = [
  {
    id: 'usd-eur',
    name: 'USD/EUR',
    price: '0.92',
    change: 0.3,
    sparkline: [0.914, 0.915, 0.917, 0.916, 0.918, 0.919, 0.92, 0.92, 0.92, 0.92, 0.92],
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    price: '5,847',
    change: -0.8,
    sparkline: [5910, 5895, 5870, 5885, 5860, 5850, 5847, 5855, 5840, 5847, 5847],
  },
  {
    id: 'brent',
    name: 'Brent',
    price: '$78.40',
    change: 1.2,
    sparkline: [76.8, 77.0, 77.2, 77.5, 77.8, 78.0, 78.1, 78.3, 78.4, 78.4, 78.4],
  },
  {
    id: 'gold',
    name: 'Gold',
    price: '$2,645',
    change: 0.5,
    sparkline: [2620, 2625, 2628, 2630, 2635, 2638, 2640, 2642, 2645, 2645, 2645],
  },
  {
    id: 'btc',
    name: 'BTC',
    price: '$67,240',
    change: -2.1,
    sparkline: [69200, 68800, 68500, 68200, 67800, 67500, 67400, 67300, 67240, 67240, 67240],
  },
];

export const newsSources = ['Все источники', 'Reuters', 'Bloomberg', 'BBC', 'CNBC', 'РБК'];
export const newsTopics = ['Все темы', 'Экономика', 'Геополитика', 'Энергетика', 'Технологии', 'Финансы'];
export const newsSentiments = ['Любая', 'Позитивная', 'Нейтральная', 'Негативная'];

export const newsItems: NewsItem[] = [
  {
    id: 1,
    source: 'Reuters',
    time: '12 мин назад',
    title: 'ФРС США сохраняет ставку на уровне 5.25–5.50%, сигнализирует о осторожности',
    impacts: [
      { asset: 'USD', direction: 'up' },
      { asset: 'S&P 500', direction: 'down' },
      { asset: 'Gold', direction: 'up' },
    ],
    sentiment: -0.3,
    importance: 9,
    summary: 'Федеральная резервная система оставила ключевую ставку без изменений. Рынки восприняли это как сигнал о задержке смягчения монетарной политики.',
    topic: 'Экономика',
  },
  {
    id: 2,
    source: 'Bloomberg',
    time: '34 мин назад',
    title: 'ОПЕК+ обсуждает продление сокращения добычи нефти до конца Q1 2026',
    impacts: [
      { asset: 'Brent', direction: 'up' },
      { asset: 'USD', direction: 'down' },
    ],
    sentiment: 0.4,
    importance: 8,
    summary: 'Картель рассматривает продление добровольных ограничений добычи. Аналитики ожидают краткосрочный рост цен на нефть в случае согласования.',
    topic: 'Энергетика',
  },
  {
    id: 3,
    source: 'BBC',
    time: '1 час назад',
    title: 'Переговоры по торговому соглашению между ЕС и Китаем возобновились',
    impacts: [
      { asset: 'S&P 500', direction: 'up' },
      { asset: 'BTC', direction: 'up' },
    ],
    sentiment: 0.5,
    importance: 7,
    summary: 'Европейский союз и Китай возобновили торговые переговоры после полугодового перерыва. Стороны обсудили снижение пошлин на электронику.',
    topic: 'Геополитика',
  },
  {
    id: 4,
    source: 'CNBC',
    time: '2 часа назад',
    title: 'Bitcoin упал ниже $67,500 на фоне оттока капитала из спотовых ETF',
    impacts: [
      { asset: 'BTC', direction: 'down' },
      { asset: 'Gold', direction: 'up' },
    ],
    sentiment: -0.7,
    importance: 8,
    summary: 'Отток средств из биткоин-ETF продолжается четвёртую сессию подряд. Инвесторы перераспределяют капитал в защитные активы.',
    topic: 'Финансы',
  },
  {
    id: 5,
    source: 'РБК',
    time: '3 часа назад',
    title: 'ЦБ РФ может повысить ключевую ставку на следующем заседании',
    impacts: [
      { asset: 'USD', direction: 'up' },
      { asset: 'Gold', direction: 'up' },
    ],
    sentiment: -0.4,
    importance: 6,
    summary: 'Регулятор рассматривает возможность ужесточения монетарной политики на фоне инфляционного давления. Решение ожидается 25 октября.',
    topic: 'Экономика',
  },
  {
    id: 6,
    source: 'Bloomberg',
    time: '4 часа назад',
    title: 'Apple объявила о рекордной выручке за квартал — $94.9 млрд',
    impacts: [
      { asset: 'S&P 500', direction: 'up' },
      { asset: 'USD', direction: 'up' },
    ],
    sentiment: 0.8,
    importance: 7,
    summary: 'Apple превзошла ожидания аналитиков благодаря сильным продажам iPhone 16 и росту доходов от сервисов. Акции выросли в премаркете.',
    topic: 'Технологии',
  },
  {
    id: 7,
    source: 'Reuters',
    time: '5 часов назад',
    title: 'Напряжённость на Ближнем Востоке выросла после инцидента в Красном море',
    impacts: [
      { asset: 'Brent', direction: 'up' },
      { asset: 'Gold', direction: 'up' },
      { asset: 'S&P 500', direction: 'down' },
    ],
    sentiment: -0.8,
    importance: 10,
    summary: 'Атаки на торговые суда в Красном море усилились. Эксперты предупреждают о риске перебоев с поставками через Суэцкий канал.',
    topic: 'Геополитика',
  },
  {
    id: 8,
    source: 'CNBC',
    time: '6 часов назад',
    title: 'NVIDIA представила новый чип Blackwell B300 с производительностью 20 PFLOPS',
    impacts: [
      { asset: 'S&P 500', direction: 'up' },
      { asset: 'BTC', direction: 'up' },
    ],
    sentiment: 0.6,
    importance: 6,
    summary: 'NVIDIA анонсировала следующее поколение ускорителей для ИИ. Новинка обещает двукратный прирост производительности при меньшем энергопотреблении.',
    topic: 'Технологии',
  },
  {
    id: 9,
    source: 'BBC',
    time: '8 часов назад',
    title: 'Еврозона избежала рецессии — ВВП вырос на 0.4% в Q3',
    impacts: [
      { asset: 'USD', direction: 'down' },
      { asset: 'S&P 500', direction: 'up' },
    ],
    sentiment: 0.5,
    importance: 6,
    summary: 'Экономика еврозоны продемонстрировала умеренный рост вопреки ожиданиям аналитиков. Основной вклад внесли Германия и Франция.',
    topic: 'Экономика',
  },
  {
    id: 10,
    source: 'РБК',
    time: '10 часов назад',
    title: 'Золото обновило исторический максимум на фоне геополитической неопределённости',
    impacts: [
      { asset: 'Gold', direction: 'up' },
      { asset: 'BTC', direction: 'down' },
    ],
    sentiment: 0.3,
    importance: 5,
    summary: 'Цена золота достигла нового рекорда, превысив $2,645 за унцию. Спрос на защитные активы растёт на фоне глобальных рисков.',
    topic: 'Финансы',
  },
];

export const forecasts: ForecastData[] = [
  {
    id: 'usd-eur-forecast',
    asset: 'USD/EUR',
    direction: 'up',
    probability: 72,
    window: '1–3 дня',
    confidence: 'Средняя',
    reason: '8 из 10 похожих событий в прошлом дали рост',
  },
  {
    id: 'brent-forecast',
    asset: 'Brent',
    direction: 'up',
    probability: 65,
    window: '1–7 дней',
    confidence: 'Средняя',
    reason: 'Сокращение добычи ОПЕК+ исторически даёт рост',
  },
  {
    id: 'btc-forecast',
    asset: 'BTC',
    direction: 'down',
    probability: 58,
    window: '1–3 дня',
    confidence: 'Низкая',
    reason: 'Рост ставки ФРС давит на рисковые активы',
  },
];
