// Unit: Balance computation
export function calcBalance(invoices: { totalCents: number; status: string }[], payments: { amount: number; status: string }[]): number {
  const invoiceTotal = invoices.filter(i => i.status === 'SENT' || i.status === 'OVERDUE').reduce((s, i) => s + i.totalCents, 0);
  const paymentTotal = payments.filter(p => p.status === 'SUCCEEDED').reduce((s, p) => s + p.amount, 0);
  return invoiceTotal - paymentTotal;
}

// Tests
console.log('no invoices:', calcBalance([], []) === 0);
console.log('only DRAFT excluded:', calcBalance([{ totalCents: 100, status: 'DRAFT' }], []) === 0);
console.log('only VOID excluded:', calcBalance([{ totalCents: 100, status: 'VOID' }], []) === 0);
console.log('SENT + OVERDUE:', calcBalance([{ totalCents: 100, status: 'SENT' }, { totalCents: 200, status: 'OVERDUE' }], []) === 300);
console.log('PAID excluded from invoices:', calcBalance([{ totalCents: 100, status: 'PAID' }], []) === 0);
console.log('SUCCEEDED payments subtracted:', calcBalance([{ totalCents: 500, status: 'SENT' }], [{ amount: 200, status: 'SUCCEEDED' }]) === 300);
console.log('COMPLETED status not subtracted (only SUCCEEDED):', calcBalance([{ totalCents: 500, status: 'SENT' }], [{ amount: 200, status: 'COMPLETED' }]) === 500);

// CSV escaping
export function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
console.log('comma:', escapeCsv('a,b') === '"a,b"');
console.log('quote:', escapeCsv('a"b') === '"a""b"');
console.log('newline:', escapeCsv('a\nb') === '"a\nb"');

// Note validation
export function validateNote(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed.length <= 5000;
}
console.log('empty:', !validateNote(''));
console.log('whitespace:', !validateNote('   '));
console.log('over 5000:', !validateNote('x'.repeat(5001)));
console.log('valid:', validateNote('Hello'));

// Relative time
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}
console.log('seconds:', formatRelativeTime(new Date(Date.now() - 30*1000)).includes('s'));
console.log('minutes:', formatRelativeTime(new Date(Date.now() - 5*60*1000)).includes('m'));
console.log('hours:', formatRelativeTime(new Date(Date.now() - 3*60*60*1000)).includes('h'));
console.log('days:', formatRelativeTime(new Date(Date.now() - 2*24*60*60*1000)).includes('d'));
console.log('months:', formatRelativeTime(new Date(Date.now() - 60*24*60*60*1000)).includes('mo'));
