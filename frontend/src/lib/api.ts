const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${window.localStorage.getItem('ledgerly_token') || ''}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('Your session has expired. Please sign in again.');
  if (!response.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(' ') : body?.message || 'Request failed.');
  return body as T;
}
export const formatMoney = (minorUnits: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minorUnits / 100);
