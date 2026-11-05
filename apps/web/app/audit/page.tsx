'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, message } from '../../lib/api';

interface Audit {
  id: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  correlationId: string;
  beforeData: unknown;
  afterData: unknown;
}
export default function AuditPage() {
  const router = useRouter();
  const [items, setItems] = useState<Audit[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ items: Audit[] }>('/audit')
      .then((r) => setItems(r.items))
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) router.push('/login');
        else setError(message(caught));
      });
  }, []);
  return (
    <section className="panel">
      <h1>Auditoria operacional</h1>
      <p className="muted">Eventos append-only, com dados permitidos e correlação técnica.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {items === null ? (
        <p role="status">Carregando eventos…</p>
      ) : items.length === 0 ? (
        <p>Nenhum evento encontrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Instante</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Recurso</th>
                <th>Correlação</th>
                <th>Antes / depois</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.occurredAt).toLocaleString('pt-BR')}</td>
                  <td>{event.actorId ?? event.actorType}</td>
                  <td>{event.action}</td>
                  <td>
                    {event.resourceType}
                    <br />
                    <small>{event.resourceId}</small>
                  </td>
                  <td>
                    <code>{event.correlationId}</code>
                  </td>
                  <td>
                    <details>
                      <summary>Ver dados</summary>
                      <pre>
                        {JSON.stringify(
                          { before: event.beforeData, after: event.afterData },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
