import { useState, useEffect, useCallback } from 'react';
const BASE = '/api/v1';
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}; const t = localStorage.getItem('token');
  if (t) headers.Authorization = 'Bearer ' + t;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
export function useLoad(path) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const reload = useCallback(() => api(path).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [path]);
  useEffect(() => { reload(); }, [reload]);
  return [data, reload, error];
}
