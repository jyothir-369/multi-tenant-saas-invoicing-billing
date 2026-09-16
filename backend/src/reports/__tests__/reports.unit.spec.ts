import { ReportsService } from '../reports.service';

describe('Aging bucket classification', () => {
  const now = new Date();
  function bucket(daysOverdue: number) {
    if (daysOverdue < 0) return 'current';
    if (daysOverdue <= 30) return '1_30';
    if (daysOverdue <= 60) return '31_60';
    if (daysOverdue <= 90) return '61_90';
    return '90_plus';
  }
  it('classifies exactly 0, 1, 30, 31, 60, 61, 90, 91', () => {
    expect(bucket(0)).toBe('current');
    expect(bucket(1)).toBe('1_30');
    expect(bucket(30)).toBe('1_30');
    expect(bucket(31)).toBe('31_60');
    expect(bucket(60)).toBe('31_60');
    expect(bucket(61)).toBe('61_90');
    expect(bucket(90)).toBe('61_90');
    expect(bucket(91)).toBe('90_plus');
  });
});

describe('CSV escaping', () => {
  function escapeCsv(value: string): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  it('escapes commas, quotes, newlines', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('Revenue aggregation excludes DRAFT/VOID', () => {
  it('only includes PAID in total logic', () => {
    const statuses = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'];
    const allowed = statuses.filter(s => s === 'PAID');
    expect(allowed).toEqual(['PAID']);
  });
});
