import { tz } from '@date-fns/tz';
import { format, isBefore, parseISO, startOfDay, type Locale } from 'date-fns';
import { enUS } from 'date-fns/locale';

const japanTimeZone = tz('Asia/Tokyo');
const dateOnlyPattern = /^(?!0000)\d{4}-\d{2}-\d{2}$/;

// 開始日・期限は時刻を持たない。フォーム用Dateへ、実行環境の年月日として読み込む。
// 形式外の文字列はInvalid Dateとし、フォームではZodの日付検証で扱う。
export function parseDateOnly(value: string): Date {
  if (!dateOnlyPattern.test(value)) {
    return new Date(NaN);
  }

  return parseISO(value);
}

// 時刻・タイムゾーンへの変換をせず、APIの日付文字列やカレンダーの選択日を表示する。
export function formatDateOnly(value: string | Date): string {
  const date = typeof value === 'string' ? parseDateOnly(value) : value;

  return format(date, 'yyyy/MM/dd');
}

// カレンダーで選択した年月日をAPIの日付形式にする。toISOStringによるUTC変換を避ける。
export function toDateOnlyString(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

// カレンダーの月選択欄は、渡されたlocaleで短い月名を表示する。
export function formatCalendarMonth(
  value: Date,
  locale?: Partial<Locale>,
): string {
  const calendarLocale = { ...enUS, ...locale };

  return format(value, 'LLL', { locale: calendarLocale });
}

// フォームの日付に時刻が含まれていても、年月日だけで前後を比較する。
export function isDateOnlyBefore(
  value: string | Date,
  reference: string | Date,
): boolean {
  const date = typeof value === 'string' ? parseDateOnly(value) : value;
  const referenceDate =
    typeof reference === 'string' ? parseDateOnly(reference) : reference;

  const day = startOfDay(date);
  const referenceDay = startOfDay(referenceDate);

  return isBefore(day, referenceDay);
}

// 日時を日本時間の YYYY/MM/DD 形式で表示する。
export function formatDate(value: string): string {
  const date = parseISO(value);

  return format(date, 'yyyy/MM/dd', { in: japanTimeZone });
}

// 日時を日本時間の YYYY/MM/DD HH:mm 形式で表示する。
export function formatDateTime(value: string): string {
  const date = parseISO(value);

  return format(date, 'yyyy/MM/dd HH:mm', { in: japanTimeZone });
}

// 期限超過の判定には、サーバー・ブラウザの設定によらず日本時間の今日を使う。
export function getTodayDateOnly(): string {
  const now = new Date();

  return format(now, 'yyyy-MM-dd', { in: japanTimeZone });
}
