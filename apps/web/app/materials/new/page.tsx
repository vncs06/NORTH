'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, message } from '../../../lib/api';

export default function NewMaterialPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const created = await api<{ id: string }>('/materials', {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
          description: form.get('description') || undefined,
          baseUnit: form.get('baseUnit'),
          minimumStock: form.get('minimumStock'),
        }),
      });
      router.push(`/materials/${created.id}`);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="panel">
      <h1>Novo material</h1>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <form className="grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Código</label>
          <input id="code" name="code" required maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="baseUnit">Unidade-base</label>
          <input id="baseUnit" name="baseUnit" required placeholder="un, m, m², ml, g" />
        </div>
        <div className="field">
          <label htmlFor="minimumStock">Estoque mínimo</label>
          <input
            id="minimumStock"
            name="minimumStock"
            required
            inputMode="decimal"
            defaultValue="0"
            pattern="\d+(\.\d{1,6})?"
          />
        </div>
        <div className="field full">
          <label htmlFor="description">Descrição (opcional)</label>
          <textarea id="description" name="description" rows={3} />
        </div>
        <div className="actions full">
          <button disabled={loading}>{loading ? 'Salvando…' : 'Cadastrar material'}</button>
        </div>
      </form>
    </section>
  );
}
