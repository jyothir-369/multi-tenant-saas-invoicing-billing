'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
export default function AuditLogClient() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/audit?page=1&pageSize=50').then((r: any) => { setItems(r.items || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  if (loading) return <p>Loading...</p>;
  if (!items.length) return <p>No audit events yet.</p>;
  return (
    <table className="w-full text-sm border-collapse">
      <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead>
      <tbody>
        {items.map((i: any) => (
          <tr key={i.id} className="border-b hover:bg-gray-50">
            <td>{new Date(i.createdAt).toLocaleString()}</td>
            <td>{i.actor?.email || 'System'}</td>
            <td>{i.action}</td>
            <td>{i.entityType}/{i.entityId}</td>
            <td><pre className="text-xs">{JSON.stringify(i.metadata)}</pre></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
