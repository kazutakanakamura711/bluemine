// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ja } from 'date-fns/locale';

import {
  formatCalendarMonth,
  formatDate,
  formatDateOnly,
  formatDateTime,
  getTodayDateOnly,
  isDateOnlyBefore,
  parseDateOnly,
  toDateOnlyString,
} from './format-date';

afterEach(() => vi.useRealTimers());

describe('日付だけの値（タイムゾーン変換なし）', () => {
  it.each([
    '0001-01-01',
    '0099-12-31',
    '2000-02-29',
    '2026-11-05',
    '9999-12-31',
  ])(
    '%sの年月日をフォームへの変換・表示・API形式への変換で維持する',
    (value) => {
      const date = parseDateOnly(value);
      const [year, month, day] = value.split('-').map(Number);
      expect(date.getFullYear()).toBe(year);
      expect(date.getMonth()).toBe(month - 1);
      expect(date.getDate()).toBe(day);
      expect(date.getHours()).toBe(0);
      expect(toDateOnlyString(date)).toBe(value);
      expect(formatDateOnly(value)).toBe(value.replaceAll('-', '/'));
      expect(formatDateOnly(date)).toBe(value.replaceAll('-', '/'));
    },
  );

  it.each([
    '',
    'invalid',
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-11-00',
    '2026-1-1',
    '0000-01-01',
    '10000-01-01',
    '2026-11-05T00:00:00Z',
    '2026-11-05T00:00:00+09:00',
  ])('形式外・存在しない日付%sをInvalid Dateにする', (value) => {
    expect(Number.isNaN(parseDateOnly(value).getTime())).toBe(true);
  });

  it('カレンダーのDateに時刻があっても、選択した年月日を維持する', () => {
    const date = new Date(2026, 10, 5, 23, 45);
    expect(toDateOnlyString(date)).toBe('2026-11-05');
    expect(formatDateOnly(date)).toBe('2026/11/05');
  });

  it('前日・同日・翌日を、時刻によらず年月日で比較する', () => {
    expect(isDateOnlyBefore('2026-11-04', '2026-11-05')).toBe(true);
    expect(isDateOnlyBefore('2026-11-05', '2026-11-05')).toBe(false);
    expect(isDateOnlyBefore('2026-11-06', '2026-11-05')).toBe(false);
    expect(
      isDateOnlyBefore(new Date(2026, 10, 5, 1), new Date(2026, 10, 5, 23)),
    ).toBe(false);
    expect(isDateOnlyBefore(new Date(2026, 10, 4, 23), '2026-11-05')).toBe(
      true,
    );
  });

  it('カレンダーの月名を日本語・英語の短い形式で表示する', () => {
    const date = new Date(2026, 9, 1);
    expect(formatCalendarMonth(date, ja)).toBe('10月');
    expect(formatCalendarMonth(date)).toBe('Oct');
  });
});

describe('日時（日本時間へ変換）', () => {
  it.each([
    ['2026-11-04T14:59:00.000Z', '2026/11/04', '2026/11/04 23:59'],
    ['2026-11-04T15:00:00.000Z', '2026/11/05', '2026/11/05 00:00'],
    ['2026-11-05T12:34:56.789Z', '2026/11/05', '2026/11/05 21:34'],
    ['2026-11-04T08:00:00-07:00', '2026/11/05', '2026/11/05 00:00'],
    ['2026-11-05T00:00:00+09:00', '2026/11/05', '2026/11/05 00:00'],
  ])('%sを端末の設定によらず日本時間で表示する', (value, date, dateTime) => {
    expect(formatDate(value)).toBe(date);
    expect(formatDateTime(value)).toBe(dateTime);
  });

  it.each([
    ['2026-11-04T14:59:59.999Z', '2026-11-04'],
    ['2026-11-04T15:00:00.000Z', '2026-11-05'],
  ])('日本時間の午前0時を境に今日の日付を切り替える', (now, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    expect(getTodayDateOnly()).toBe(expected);
  });

  it('不正な日付・日時の表示はRangeErrorとする', () => {
    expect(() => formatDate('invalid')).toThrow(RangeError);
    expect(() => formatDateTime('invalid')).toThrow(RangeError);
    expect(() => formatDateOnly('2026-02-30')).toThrow(RangeError);
    expect(() => toDateOnlyString(new Date(NaN))).toThrow(RangeError);
  });
});
