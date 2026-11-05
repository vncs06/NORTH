'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, message } from '../../../lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}
export default function UsersPage() {
  const router = useRouter();
  const [items, setItems] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function load() {
    try {
      setItems((await api<{ items: User[] }>('/users')).items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) router.push('/login');
      else setError(message(caught));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      formElement.reset();
      setSuccess('Funcionário criado.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function disable(id: string) {
    try {
      await api(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DISABLED' }),
      });
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }
  return (
    <div className="stack">
      <section className="panel">
        <h1>Usuários</h1>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && <div className="success">{success}</div>}
        <form className="grid" onSubmit={create}>
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Senha inicial</label>
            <input id="password" name="password" type="password" minLength={12} required />
          </div>
          <div className="actions">
            <button>Criar funcionário</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Equipe</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Estado</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    {user.role === 'EMPLOYEE' && user.status === 'ACTIVE' ? (
                      <button className="danger" onClick={() => void disable(user.id)}>
                        Desativar
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
