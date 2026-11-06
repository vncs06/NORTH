'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, message } from '../../lib/api';

interface Entry {
  id: string;
  code: string;
  name: string;
  status: string;
}
interface Variant extends Entry {
  productId: string;
  productName: string;
}
interface Combination {
  id: string;
  status: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  techniqueId: string;
  techniqueName: string;
}

export default function CatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Entry[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [techniques, setTechniques] = useState<Entry[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [p, v, t, c] = await Promise.all([
        api<{ items: Entry[] }>('/catalog/products?status=ACTIVE'),
        api<{ items: Variant[] }>('/catalog/variants'),
        api<{ items: Entry[] }>('/catalog/techniques?status=ACTIVE'),
        api<{ items: Combination[] }>('/catalog/combinations'),
      ]);
      setProducts(p.items);
      setVariants(v.items);
      setTechniques(t.items);
      setCombinations(c.items);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function create(
    event: FormEvent<HTMLFormElement>,
    path: string,
    extra: Record<string, unknown> = {},
  ) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      code: form.get('code'),
      name: form.get('name'),
      description: form.get('description') || undefined,
      ...extra,
    };
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setSuccess('Cadastro salvo e auditado.');
      formElement.reset();
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function createCombination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/catalog/combinations', {
        method: 'POST',
        body: JSON.stringify({
          productId: form.get('productId'),
          variantId: form.get('variantId'),
          techniqueId: form.get('techniqueId'),
        }),
      });
      setSuccess('Combinação válida criada.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  if (loading) return <p role="status">Carregando catálogo…</p>;
  return (
    <div className="stack">
      <section className="panel">
        <h1>Catálogo configurável</h1>
        <p className="muted">Produtos, variantes e técnicas independentes do setor.</p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && <div className="success">{success}</div>}
        <div className="subgrid">
          <form className="card stack" onSubmit={(e) => void create(e, '/catalog/products')}>
            <h2>Produto</h2>
            <label>
              Código
              <input name="code" required maxLength={40} />
            </label>
            <label>
              Nome
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Descrição
              <textarea name="description" rows={2} />
            </label>
            <button>Criar produto</button>
          </form>
          <form
            className="card stack"
            onSubmit={(e) => {
              const form = new FormData(e.currentTarget);
              void create(e, '/catalog/variants', { productId: form.get('productId') });
            }}
          >
            <h2>Variante</h2>
            <label>
              Produto
              <select name="productId" required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Código
              <input name="code" required maxLength={40} />
            </label>
            <label>
              Nome
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Descrição
              <textarea name="description" rows={2} />
            </label>
            <button>Criar variante</button>
          </form>
          <form className="card stack" onSubmit={(e) => void create(e, '/catalog/techniques')}>
            <h2>Técnica</h2>
            <label>
              Código
              <input name="code" required maxLength={40} />
            </label>
            <label>
              Nome
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Descrição
              <textarea name="description" rows={2} />
            </label>
            <button>Criar técnica</button>
          </form>
        </div>
      </section>
      <section className="panel">
        <h2>Combinações utilizáveis</h2>
        <form className="grid" onSubmit={createCombination}>
          <label>
            Produto
            <select name="productId" required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Variante
            <select name="variantId" required>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.productName} · {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Técnica
            <select name="techniqueId" required>
              {techniques.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button>Criar combinação</button>
        </form>
        {combinations.length === 0 ? (
          <p>Nenhuma combinação criada.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Variante</th>
                  <th>Técnica</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((c) => (
                  <tr key={c.id}>
                    <td>{c.productName}</td>
                    <td>{c.variantName}</td>
                    <td>{c.techniqueName}</td>
                    <td>{c.status}</td>
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
