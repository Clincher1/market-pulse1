// Карточка PNG должна расти вместе с данными, а не обрезать текст или оставлять
// большую пустую область. Тест рендерит короткий и предельно длинный варианты
// теми же Satori и Resvg, что используются в API.
import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBrief } from '../api/brief-image.js';

const SHORT_CARD = {
    stampLabel: 'обновлено 3 нояб., 10:08 МСК',
    facts: ['IMOEX: +0,42 % за наблюдение; последнее значение 2 543,20; источник Московская биржа; дата наблюдения за 3 нояб.'],
    changesTitle: 'Сравнение с сохранённым снимком',
    changes: ['IMOEX: 2 543,20 против 2 531,40 в снимке; +0,47 % = (текущее значение / значение в снимке − 1) × 100.'],
    changesNote: 'точка отсчёта: 3 нояб., 08:33 МСК',
    changesExtraNote: null,
};

const LONG_FACT = 'Наибольшее по модулю дневное изменение среди загруженных мировых рядов: Brent (фьючерс) +2,13 %; последнее значение $107,00; источник ICE; дата наблюдения за 3 нояб. Проверяемое значение приводится отдельно от сравнения с сохранённым рядом.';
const LONG_CHANGE = 'Brent (фьючерс): $107,00 против $105,16 в снимке; +1,75 % = (последняя точка ряда / точка снимка − 1) × 100; источник ICE; дата в снимке за 1 нояб., сейчас за 3 нояб. Даты различаются и указаны явно.';
const LONG_CARD = {
    stampLabel: 'обновлено 3 нояб., 10:08 МСК',
    facts: [LONG_FACT, LONG_FACT, LONG_FACT],
    changesTitle: 'Сравнение с сохранённым снимком',
    changes: [LONG_CHANGE, LONG_CHANGE, LONG_CHANGE, LONG_CHANGE, LONG_CHANGE, LONG_CHANGE],
    changesNote: 'точка отсчёта: 3 нояб., 08:33 МСК',
    changesExtraNote: 'Формула: (текущее значение / значение в снимке − 1) × 100. Дельта округлена до 0,01 %. Показано шесть сопоставимых рядов в порядке абсолютной величины изменения.',
};

function pngSize(buffer) {
    assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG', 'на выходе должен быть PNG');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const rendered = new Map();
async function render(card, key) {
    if (!rendered.has(key)) rendered.set(key, renderBrief(card));
    return rendered.get(key);
}

test('PNG-карточка: ширина 1080, высота определяется содержимым', async () => {
    const { width } = pngSize(await render(SHORT_CARD, 'short'));
    assert.equal(width, 1080);
});

test('PNG-карточка: короткий вариант не растягивается до прежней фиксированной высоты', async () => {
    const { height } = pngSize(await render(SHORT_CARD, 'short'));
    assert.ok(height >= 900, `высота ${height} меньше минимальной высоты макета`);
    assert.ok(height <= 1250, `короткая карточка растянута до ${height} px`);
});

test('PNG-карточка: длинные значения и сравнения увеличивают холст', async () => {
    const short = pngSize(await render(SHORT_CARD, 'short')).height;
    const long = pngSize(await render(LONG_CARD, 'long')).height;
    assert.ok(long > short, `длинная карточка (${long}) не выше короткой (${short})`);
    assert.ok(long > 1600, `длинная карточка выросла только до ${long} px`);
    assert.ok(long < 3000, `длинная карточка выросла до ${long} px — вероятно, сломан перенос текста`);
});

test('PNG-карточка: каждый добавленный набор строк увеличивает высоту', async () => {
    const steps = [
        ['один факт', { ...SHORT_CARD, changesTitle: null, changes: [] }],
        ['три факта', { ...SHORT_CARD, facts: [LONG_FACT, LONG_FACT, LONG_FACT], changesTitle: null, changes: [] }],
        ['плюс сравнения', { ...SHORT_CARD, facts: [LONG_FACT, LONG_FACT, LONG_FACT], changes: [LONG_CHANGE, LONG_CHANGE, LONG_CHANGE] }],
        ['плюс дополнительные сравнения', LONG_CARD],
    ];
    const heights = [];
    for (const [name, card] of steps) {
        heights.push([name, pngSize(await render(card, name)).height]);
    }
    for (let index = 1; index < heights.length; index += 1) {
        const [previousName, previousHeight] = heights[index - 1];
        const [name, height] = heights[index];
        assert.ok(height > previousHeight, `шаг «${name}» (${height}) не выше предыдущего «${previousName}» (${previousHeight})`);
    }
});
