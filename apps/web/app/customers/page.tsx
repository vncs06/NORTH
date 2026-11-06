'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, message } from '../../lib/api';

interface Customer {
  id: string;
  type: 'PERSON' | 'COMPANY';
  displayName: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  operationalNote: string | null;
  status: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Customer[] | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'PERSON' | 'COMPANY'>('PERSON');

  async function load() {
    try {
      const result = await api<{ items: Customer[] }>(
        `/customers?status=ACTIVE&search=${encodeURIComponent(search)}`,
      );
      setItems(result.items);
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
    setSuccess('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const created = await api<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          type,
          displayName: form.get('displayName'),
          businessName: form.get('businessName') || undefined,
          email: form.get('email') || undefined,
          phone: form.get('phone') || undefined,
          operationalNote: form.get('operationalNote') || undefined,
        }),
      });
      setSuccess(`Cliente ${created.displayName} cadastrado.`);
      formElement.reset();
      setType('PERSON');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h1>Clientes</h1>
        <p className="muted">Cadastro operacional sem exclusão física e com histórico auditável.</p>
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
        <form className="grid" onSubmit={submit}>
          <div className="field">
            <label htmlFor="type">Tipo</label>
            <select
              id="type"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="PERSON">Pessoa física</option>
              <option value="COMPANY">Pessoa jurídica</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="displayName">Nome de exibição</label>
            <input id="displayName" name="displayName" required minLength={2} maxLength={160} />
          </div>
          {type === 'COMPANY' && (
            <div className="field full">
              <label htmlFor="businessName">Razão social (opcional)</label>
              <input id="businessName" name="businessName" maxLength={200} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail (opcional)</label>
            <input id="email" name="email" type="email" maxLength={254} />
          </div>
          <div className="field">
            <label htmlFor="phone">Telefone (opcional)</label>
            <input id="phone" name="phone" maxLength={40} />
          </div>
          <div className="field full">
            <label htmlFor="operationalNote">Observação operacional (opcional)</label>
            <textarea id="operationalNote" name="operationalNote" rows={3} maxLength={1000} />
          </div>
          <button className="full">Cadastrar cliente</button>
        </form>
      </section>
      <section className="panel">
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div>
            <h2>Clientes ativos</h2>
            <p className="muted">Busca por nome, e-mail ou telefone.</p>
          </div>
          <div className="actions">
            <input
              aria-label="Buscar cliente"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button>Buscar</button>
          </div>
        </form>
        {items === null ? (
          <p role="status">Carregando clientes…</p>
        ) : items.length === 0 ? (
          <p>Nenhum cliente encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Contato</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.displayName}</td>
                    <td>{item.type === 'PERSON' ? 'PF' : 'PJ'}</td>
                    <td>{item.email ?? item.phone ?? '—'}</td>
                    <td>{item.status}</td>
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
