// Карточка брифа отдаётся одной PNG. Пока высота была фиксированной (1600),
// у дефекта не было видимого симптома: картинка всегда одного размера, поэтому
// длинный бриф молча обрезался, а короткий оставлял пустую полосу в треть
// высоты. Оба случая видны только если измерить, что нарисовал рендерер.
//
// Тест рисует настоящим satori+resvg (тем же путём, что и продовый обработчик)
// два бланка брифа: самый короткий и самый длинный из возможных. Проверяем:
//   * высота не прибита константой, а следует за содержимым;
//   * короткий бриф не оставляет пустоты (нет мёртвой нижней полосы);
//   * длинный бриф не упирается в предел (иначе текст обрежется — satori
//     режет всё, что вышло за объявленный холст).
import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBrief } from '../api/brief-image.js';

// Самый короткий честный бриф: шкала есть, факт один, последствие одно,
// изменений с утра нет, «что смотреть» нет.
const SHORT_CARD = {
    stampLabel: 'обновлено 3 нояб., 10:08 МСК',
    tensionValue: 42,
    tensionLabel: 'умеренная',
    tensionMeta: '+2 пункта к предыдущему дню · 63 новости за сутки',
    facts: ['Шкала напряжённости — 42/100 («умеренная»), +2 пункта к предыдущему дню; на основе 63 новостей за сутки.'],
    consequences: ['Сырьевой канал: рост Brent на +2,13% поддерживает экспортную выручку; проверяем реакцию рубля и IMOEX.'],
    changesTitle: 'Что изменилось с утра',
    changes: ['Значимых изменений со снимка нет: показатели остаются в пределах порогов шума.'],
    changesNote: 'точка отсчёта: 3 нояб., 08:33 МСК',
    changesExtraNote: null,
    watch: null,
};

// Самый длинный допустимый бриф: три факта по 196 знаков, два последствия по
// 188, два изменения по 166, хвостовая подпись и строка «что смотреть».
// Ровно эти пределы ставит truncateText в buildBriefCard.
const LONG_FACT = 'Сильнейшее дневное движение внешнего фона — Brent (фьючерс) +2,13% (последнее значение $107,00, цена на 10:21 МСК). Проверяем, подтверждается ли движение объёмом и что показывает вторая половина сессии на другой площадке.';
const LONG_CONSEQUENCE = 'Валютный канал: корзина валют в среднем −0,42% к рублю — импорт дешевле в рублях, а валютная выручка при конвертации ниже; смотрим, удержится ли движение до конца торговой сессии и не развернётся ли оно.';
const LONG_CHANGE = 'Brent: цена $107,00 против $105,16 на точке отсчёта — рост выше порога дневного шума, изменение подтверждается последней точкой ряда, а не только кэшем витрины.';
const LONG_CARD = {
    stampLabel: 'обновлено 3 нояб., 10:08 МСК',
    tensionValue: 42,
    tensionLabel: 'умеренная',
    tensionMeta: '+2 пункта к предыдущему дню · 63 новости за сутки',
    facts: [LONG_FACT, LONG_FACT, LONG_FACT],
    consequences: [LONG_CONSEQUENCE, LONG_CONSEQUENCE],
    changesTitle: 'Что изменилось с утра',
    changes: [LONG_CHANGE, LONG_CHANGE],
    changesNote: 'точка отсчёта: 3 нояб., 08:33 МСК',
    changesExtraNote: 'Ещё 2 изменения выше порогов — на сайте.',
    watch: 'Смотрим на Brent и валютную корзину: важна не одна точка, а согласованность движения между площадками и то, подтверждается ли оно объёмом.',
};

function pngSize(buffer) {
    assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG', 'на выходе должен быть PNG');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const rendered = new Map();
async function render(card, key) {
    if (!rendered.has(key)) {
        rendered.set(key, renderBrief(card));
    }
    return rendered.get(key);
}

test('бриф: ширина карточки 1080, высота считается по содержимому', async () => {
    const png = await render(SHORT_CARD, 'short');
    const { width } = pngSize(png);
    assert.equal(width, 1080);
});

test('бриф: короткий бриф не оставляет пустой полосы внизу', async () => {
    const { height } = pngSize(await render(SHORT_CARD, 'short'));
    // Раньше короткий бриф всегда был 1600 px и кончался на ~60 % высоты.
    // Нижняя граница (minHeight 1120) держит карточку от превращения в полоску,
    // верхняя — от мёртвой полосы: короткий бриф не должен дотягивать до 1600.
    assert.ok(height >= 1100, `высота ${height} меньше нижней границы макета`);
    assert.ok(height <= 1300, `короткий бриф растянут до ${height} px — снова пустая полоса внизу`);
});

test('бриф: длинный бриф растягивает карточку, а не обрезается', async () => {
    const short = pngSize(await render(SHORT_CARD, 'short')).height;
    const long = pngSize(await render(LONG_CARD, 'long')).height;
    // Главное свойство: высота следует за содержимым. При фиксированной высоте
    // эти два числа совпадали бы и длинный текст уезжал за холст.
    assert.ok(long > short, `длинный бриф (${long}) не выше короткого (${short}) — высота снова прибита константой`);
    assert.ok(long > 1600, `длинный бриф уложился в ${long} px — проверка ничего не доказывает: возьмите текст, который заведомо не влезает в прежние 1600`);
    // Верхняя граница — не про обрезку, а про то, что вёрстка не «сложилась»
    // (например, каждый факт перестал переноситься и занял по экрану).
    assert.ok(long < 2600, `длинный бриф вырос до ${long} px — похоже на сломанный перенос строк`);
});

test('бриф: каждый добавленный блок увеличивает карточку', async () => {
    // Лестница от одного факта до полного брифа. Если высота где-то перестанет
    // расти, значит блок молча уехал за холст — ровно тот дефект, который
    // фиксированная высота скрывала.
    const steps = [
        ['один факт', { ...SHORT_CARD, facts: [LONG_FACT] }],
        ['три факта', { ...SHORT_CARD, facts: [LONG_FACT, LONG_FACT, LONG_FACT] }],
        ['плюс последствия', { ...SHORT_CARD, facts: [LONG_FACT, LONG_FACT, LONG_FACT], consequences: [LONG_CONSEQUENCE, LONG_CONSEQUENCE] }],
        ['плюс изменения', { ...SHORT_CARD, facts: [LONG_FACT, LONG_FACT, LONG_FACT], consequences: [LONG_CONSEQUENCE, LONG_CONSEQUENCE], changes: [LONG_CHANGE, LONG_CHANGE], changesExtraNote: 'Ещё 2 изменения выше порогов — на сайте.' }],
        ['плюс «что смотреть»', LONG_CARD],
    ];
    const heights = [];
    for (const [name, card] of steps) {
        heights.push([name, pngSize(await render(card, name)).height]);
    }
    for (let index = 1; index < heights.length; index += 1) {
        const [prevName, prev] = heights[index - 1];
        const [name, current] = heights[index];
        assert.ok(current > prev, `шаг «${name}» (${current}) не выше предыдущего «${prevName}» (${prev}): содержимое не помещается, а обрезается`);
    }
});
