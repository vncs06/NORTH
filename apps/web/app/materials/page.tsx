'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney, formatQuantity, message } from '../../lib/api';

interface Material {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  status: string;
  currentCostCents: string | null;
  balance: { physical: string; reserved: string; available: string };
}

export default function MaterialsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Material[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  async function load() {
    setError('');
    try {
      const result = await api<{ items: Material[] }>(
        `/materials?search=${encodeURIComponent(search)}&status=${status}`,
      );
      setItems(result.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    }
  }

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h1>Materiais</h1>
          <p className="muted">Saldo consolidado da instalação.</p>
        </div>
        <Link className="button" href="/materials/new">
          Novo material
        </Link>
      </div>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="field">
          <label htmlFor="search">Buscar</label>
          <input id="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="status">Estado</label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
            <option value="">Todos</option>
          </select>
        </div>
        <button>Aplicar</button>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {items === null ? (
        <p role="status">Carregando materiais…</p>
      ) : items.length === 0 ? (
        <p>Nenhum material encontrado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Material</th>
                <th>Custo vigente</th>
                <th>Físico</th>
                <th>Reservado</th>
                <th>Disponível</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/materials/${item.id}`}>{item.code}</Link>
                  </td>
                  <td>{item.name}</td>
                  <td>{formatMoney(item.currentCostCents)}</td>
                  <td>{formatQuantity(item.balance.physical, item.baseUnit)}</td>
                  <td>{formatQuantity(item.balance.reserved, item.baseUnit)}</td>
                  <td>{formatQuantity(item.balance.available, item.baseUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
