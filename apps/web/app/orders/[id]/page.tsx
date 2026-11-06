'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  formatMoney,
  formatQuantity,
  idempotencyKey,
  message,
} from '../../../lib/api';

interface OrderView {
  id: string;
  commercialNumber: string;
  quoteNumberSnapshot: string;
  customerId: string;
  customerNameSnapshot: string;
  status: string;
  totalAmountCents: string;
  depositRateBps: number;
  depositAmountCents: string;
  paidAmountCents: string;
  readiness: { ready: boolean; blockers: string[] };
  items: Array<{
    id: string;
    productName: string;
    variantName: string;
    techniqueName: string;
    requestedQuantity: string;
    technicalSheetVersion: number;
  }>;
  materials: Array<{
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    requiredQuantity: string;
  }>;
  charges: Array<{
    id: string;
    status: string;
    billingType: string;
    amountCents: string;
    dueDate: string;
    invoiceUrl: string | null;
  }>;
  artworks: Array<{
    id: string;
    versionNumber: number;
    status: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
  }>;
  reservations: Array<{
    materialId: string;
    reservedQuantity: string;
    status: string;
    exceptionConfirmed: boolean;
  }>;
  alerts: Array<{
    materialId: string;
    requiredQuantity: string;
    availableQuantity: string;
    status: string;
    reason: string | null;
  }>;
  history: Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string;
    actorType: string;
    createdAt: string;
  }>;
  decisions: Array<{ type: string; reason: string; createdAt: string }>;
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('O arquivo não pôde ser convertido para envio.'));
        return;
      }
      resolve(reader.result.split(',')[1] ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      setOrder(await api<OrderView>(`/orders/${id}`));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    }
  }
  useEffect(() => {
    void load();
  }, [id]);

  async function action(path: string, body: unknown) {
    setError('');
    setSuccess('');
    try {
      await api(`/orders/${id}${path}`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify(body),
      });
      setSuccess('Operação registrada e prontidão reavaliada.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function billing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/customers/${order!.customerId}/billing-document`, {
        method: 'PATCH',
        body: JSON.stringify({ cpfCnpj: form.get('cpfCnpj') }),
      });
      formElement.reset();
      setSuccess(
        'Documento protegido configurado; somente os quatro últimos dígitos ficam visíveis.',
      );
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get('file');
    if (!(file instanceof File)) return;
    try {
      await api(`/orders/${id}/artworks`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          originalName: file.name,
          mimeType: file.type,
          contentBase64: await fileBase64(file),
        }),
      });
      formElement.reset();
      setSuccess('Nova versão da arte armazenada privadamente.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  if (!order)
    return error ? <div className="error">{error}</div> : <p role="status">Carregando pedido…</p>;
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <div>
            <h1>{order.commercialNumber}</h1>
            <p>
              {order.customerNameSnapshot} · orçamento {order.quoteNumberSnapshot}
            </p>
          </div>
          <Link href="/orders">Voltar</Link>
        </div>
        <span className={`status ${order.status.toLowerCase()}`}>{order.status}</span>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="success" role="status">
            {success}
          </div>
        )}
        <div className="metric-grid">
          <div className="metric">
            Total<strong>{formatMoney(order.totalAmountCents)}</strong>
          </div>
          <div className="metric">
            Sinal ({order.depositRateBps / 100}%)
            <strong>{formatMoney(order.depositAmountCents)}</strong>
          </div>
          <div className="metric">
            Confirmado<strong>{formatMoney(order.paidAmountCents)}</strong>
          </div>
        </div>
        <div className={order.readiness.ready ? 'success' : 'notice'}>
          {order.readiness.ready
            ? 'Prontidão confirmada.'
            : `Pendências: ${order.readiness.blockers.join(', ') || 'reavaliar'}`}
        </div>
      </section>
      <section className="panel">
        <h2>Checklist e ações</h2>
        {order.status !== 'CANCELLED' && (
          <div className="subgrid">
            <form className="card" onSubmit={billing}>
              <h3>Documento de cobrança</h3>
              <label>
                CPF/CNPJ, somente dígitos
                <input name="cpfCnpj" inputMode="numeric" pattern="\d{11}|\d{14}" required />
              </label>
              <button>Salvar protegido</button>
            </form>
            <form
              className="card"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void action('/charges', {
                  billingType: f.get('billingType'),
                  dueDate: f.get('dueDate'),
                });
              }}
            >
              <h3>Cobrança do sinal</h3>
              <label>
                Meio
                <select name="billingType">
                  <option>PIX</option>
                  <option>BOLETO</option>
                  <option>UNDEFINED</option>
                </select>
              </label>
              <label>
                Vencimento
                <input name="dueDate" type="date" required />
              </label>
              <button>Enfileirar no Asaas</button>
            </form>
            <form className="card" onSubmit={upload}>
              <h3>Nova versão da arte</h3>
              <label>
                Arquivo da arte
                <input
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  required
                />
              </label>
              <button>Enviar arte</button>
            </form>
            <form
              className="card"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void action('/financial-exception', { reason: f.get('reason') });
              }}
            >
              <h3>Exceção financeira gerencial</h3>
              <input name="reason" minLength={3} maxLength={500} required />
              <button>Aprovar com motivo</button>
            </form>
            <form
              className="card"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void action('/evaluate-readiness', {
                  confirmStockException: f.get('confirm') === 'on',
                  stockExceptionReason: f.get('reason') || undefined,
                });
              }}
            >
              <h3>Reavaliar reserva</h3>
              <label>
                <input name="confirm" type="checkbox" /> Confirmar exceção de saldo (gestor)
              </label>
              <input name="reason" placeholder="Motivo, se houver exceção" />
              <button>Reavaliar</button>
            </form>
            <form
              className="card"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void action('/cancel', { reason: f.get('reason') });
              }}
            >
              <h3>Cancelar pedido</h3>
              <input name="reason" minLength={3} maxLength={500} required />
              <button className="danger">Cancelar e liberar reservas</button>
            </form>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Itens e demanda prevista</h2>
        {order.items.map((item) => (
          <div className="card" key={item.id}>
            {item.productName} · {item.variantName} · {item.techniqueName} ·{' '}
            {formatQuantity(item.requestedQuantity)} · ficha v{item.technicalSheetVersion}
          </div>
        ))}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Demanda</th>
                <th>Reserva</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {order.materials.map((m) => {
                const reservation = order.reservations.find((r) => r.materialId === m.materialId);
                const alert = order.alerts.find(
                  (a) => a.materialId === m.materialId && a.status === 'OPEN',
                );
                return (
                  <tr key={m.materialId} className={alert ? 'warning-row' : ''}>
                    <td>
                      {m.materialCode} · {m.materialName}
                    </td>
                    <td>{formatQuantity(m.requiredQuantity, m.unit)}</td>
                    <td>
                      {reservation
                        ? `${formatQuantity(reservation.reservedQuantity, m.unit)} · ${reservation.status}`
                        : '—'}
                    </td>
                    <td>
                      {alert
                        ? `Disponível ${formatQuantity(alert.availableQuantity, m.unit)}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Arte versionada</h2>
        {order.artworks.length === 0 ? (
          <p>Nenhuma arte enviada.</p>
        ) : (
          order.artworks.map((art) => (
            <div className="card" key={art.id}>
              <div className="toolbar">
                <div>
                  <strong>
                    v{art.versionNumber} · {art.originalName}
                  </strong>
                  <br />
                  <span className="status">{art.status}</span>
                </div>
                <a href={`${apiBase}/orders/${id}/artworks/${art.id}/download`}>
                  Download autorizado
                </a>
              </div>
              {art.status === 'PENDING_CUSTOMER' && (
                <button
                  onClick={() =>
                    void action(`/artworks/${art.id}/customer-confirmation`, {
                      customerConfirmationReference: 'Confirmação externa registrada pelo operador',
                    })
                  }
                >
                  Registrar confirmação externa
                </button>
              )}
              {art.status === 'CUSTOMER_CONFIRMED' && (
                <button
                  onClick={() =>
                    void action(`/artworks/${art.id}/approve`, {
                      customerConfirmationReference: 'Evidência externa conferida pelo gestor',
                    })
                  }
                >
                  Aprovar como gestor
                </button>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Cobranças e decisões</h2>
        {order.charges.length === 0 ? (
          <p>Nenhuma cobrança.</p>
        ) : (
          order.charges.map((charge) => (
            <div className="card" key={charge.id}>
              {charge.billingType} · {formatMoney(charge.amountCents)} · {charge.status}
              {charge.invoiceUrl && (
                <>
                  {' '}
                  ·{' '}
                  <a href={charge.invoiceUrl} target="_blank" rel="noreferrer">
                    abrir no Sandbox
                  </a>
                </>
              )}
            </div>
          ))
        )}
        {order.decisions.map((d) => (
          <div className="notice" key={`${d.type}-${d.createdAt}`}>
            {d.type}: {d.reason}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>Linha do tempo auditável</h2>
        {order.history.map((event) => (
          <div className="timeline-item" key={event.createdAt}>
            <strong>{event.toStatus}</strong> · {new Date(event.createdAt).toLocaleString('pt-BR')}
            <br />
            <span className="muted">
              {event.reason} · {event.actorType}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
