'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, message } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      router.push('/materials');
      router.refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel narrow" aria-labelledby="login-title">
      <h1 id="login-title">Entrar no NORTH</h1>
      <p className="muted">Use o acesso da instalação da sua empresa.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
          />
        </div>
        <button disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </section>
  );
}
