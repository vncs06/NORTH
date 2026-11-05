'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, formatMoney, formatQuantity, message } from '../../../lib/api';

interface Material {
  id: string;
  code: string;
  name: string;
  description: string | null;
  baseUnit: string;
  minimumStock: string;
  status: string;
  currentCostCents: string | null;
  balance: { physical: string; reserved: string; available: string };
}
interface Movement {
  id: string;
  type: string;
  quantityDelta: string;
  reason: string | null;
  createdAt: string;
}

export default function MaterialPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [material, setMaterial] = useState<Material | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void (async () => {
      try {
        const [m, ms] = await Promise.all([
          api<Material>(`/materials/${id}`),
          api<{ items: Movement[] }>(`/materials/${id}/movements`),
        ]);
        setMaterial(m);
        setMovements(ms.items);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
        setError(message(caught));
      }
    })();
  }, [id]);
  if (error)
    return (
      <div className="error" role="alert">
        {error}
      </div>
    );
  if (!material) return <p role="status">Carregando material…</p>;
  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <div>
            <h1>{material.name}</h1>
            <p>
              {material.code} · {material.baseUnit} ·{' '}
              {material.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
            </p>
          </div>
          <Link className="button" href={`/materials/${id}/movement`}>
            Registrar movimento
          </Link>
        </div>
        <div className="metric-grid">
          <div className="metric">
            Físico<strong>{formatQuantity(material.balance.physical, material.baseUnit)}</strong>
          </div>
          <div className="metric">
            Reservado<strong>{formatQuantity(material.balance.reserved, material.baseUnit)}</strong>
          </div>
          <div className="metric">
            Disponível
            <strong>{formatQuantity(material.balance.available, material.baseUnit)}</strong>
          </div>
        </div>
        <p>
          <strong>Custo vigente:</strong> {formatMoney(material.currentCostCents)}
        </p>
        <p>
          <strong>Mínimo:</strong> {formatQuantity(material.minimumStock, material.baseUnit)}
        </p>
        {material.description && <p>{material.description}</p>}
      </section>
      <section className="panel">
        <h2>Movimentos</h2>
        {movements.length === 0 ? (
          <p>Nenhum movimento registrado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Motivo</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
                    <td>{m.type}</td>
                    <td>{formatQuantity(m.quantityDelta, material.baseUnit)}</td>
                    <td>{m.reason ?? '—'}</td>
                    <td>
                      <Link href={`/materials/${id}/movement?compensate=${m.id}`}>Compensar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
