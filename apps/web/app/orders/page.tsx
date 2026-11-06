'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney, idempotencyKey, message } from '../../lib/api';

interface Order {
  id: string;
  commercialNumber: string;
  quoteNumber: string;
  customerName: string;
  status: string;
  totalAmountCents: string;
  depositAmountCents: string;
  paidAmountCents: string;
}
interface Quote {
  id: string;
  commercialNumber: string;
  revisionNumber: number;
  customerName: string;
  finalPriceCents: string;
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [orderPage, quotePage] = await Promise.all([
        api<{ items: Order[] }>('/orders'),
        api<{ items: Quote[] }>('/quotes?status=ISSUED'),
      ]);
      setOrders(orderPage.items);
      setQuotes(quotePage.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function convert(quoteId: string) {
    setError('');
    try {
      const order = await api<{ id: string }>('/orders', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ quoteId }),
      });
      router.push(`/orders/${order.id}`);
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <div>
            <h1>Pedidos</h1>
            <p className="muted">
              A conversão é explícita e preserva o snapshot do orçamento emitido.
            </p>
          </div>
          <Link className="button secondary" href="/settings/orders">
            Configurações
          </Link>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {quotes.length > 0 && (
          <div className="card">
            <h2>Orçamentos emitidos disponíveis</h2>
            <div className="actions">
              {quotes.map((quote) => (
                <button key={quote.id} onClick={() => void convert(quote.id)}>
                  Converter {quote.commercialNumber} · {quote.customerName} ·{' '}
                  {formatMoney(quote.finalPriceCents)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        {orders === null ? (
          <p role="status">Carregando pedidos…</p>
        ) : orders.length === 0 ? (
          <p>Nenhum pedido criado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Sinal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      {order.commercialNumber}
                      <br />
                      <small>{order.quoteNumber}</small>
                    </td>
                    <td>{order.customerName}</td>
                    <td>
                      <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
                    </td>
                    <td>{formatMoney(order.totalAmountCents)}</td>
                    <td>
                      {formatMoney(order.paidAmountCents)} / {formatMoney(order.depositAmountCents)}
                    </td>
                    <td>
                      <Link href={`/orders/${order.id}`}>Abrir</Link>
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
