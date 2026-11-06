'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney, message } from '../../lib/api';

interface Customer {
  id: string;
  displayName: string;
}
interface Combination {
  id: string;
  productName: string;
  variantName: string;
  techniqueName: string;
  status: string;
}
interface Quote {
  id: string;
  commercialNumber: string;
  revisionNumber: number;
  customerName: string;
  status: string;
  finalPriceCents: string | null;
  createdAt: string;
}

export default function QuotesPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [c, x, q] = await Promise.all([
        api<{ items: Customer[] }>('/customers?status=ACTIVE'),
        api<{ items: Combination[] }>('/catalog/combinations?status=ACTIVE'),
        api<{ items: Quote[] }>('/quotes'),
      ]);
      setCustomers(c.items);
      setCombinations(x.items);
      setQuotes(q.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const quote = await api<{ id: string }>('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.get('customerId'),
          items: [{ combinationId: form.get('combinationId'), quantity: form.get('quantity') }],
        }),
      });
      router.push(`/quotes/${quote.id}`);
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h1>Novo orçamento</h1>
        <p className="muted">
          A criação abre um rascunho; a simulação não reserva nem movimenta estoque.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {customers.length === 0 || combinations.length === 0 ? (
          <div className="notice">Cadastre um cliente e uma combinação ativa antes de começar.</div>
        ) : (
          <form className="grid" onSubmit={submit}>
            <label>
              Cliente
              <select name="customerId" required>
                {customers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Produto, variante e técnica
              <select name="combinationId" required>
                {combinations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.productName} · {item.variantName} · {item.techniqueName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade
              <input
                name="quantity"
                inputMode="decimal"
                defaultValue="1"
                pattern="\d+(\.\d{1,6})?"
                required
              />
            </label>
            <button>Criar e simular</button>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Orçamentos</h2>
        {quotes === null ? (
          <p role="status">Carregando orçamentos…</p>
        ) : quotes.length === 0 ? (
          <p>Nenhum orçamento criado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Revisão</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <Link href={`/quotes/${quote.id}`}>{quote.commercialNumber}</Link>
                    </td>
                    <td>v{quote.revisionNumber}</td>
                    <td>{quote.customerName}</td>
                    <td>
                      <span className={`status ${quote.status.toLowerCase()}`}>{quote.status}</span>
                    </td>
                    <td>{formatMoney(quote.finalPriceCents)}</td>
                    <td>
                      <Link href={`/quotes/${quote.id}`}>Abrir</Link>
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
