'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, idempotencyKey, message } from '../../lib/api';

interface Material {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  status: string;
}
interface Combination {
  id: string;
  productName: string;
  variantName: string;
  techniqueName: string;
  status: string;
}
interface Sheet {
  id: string;
  combinationId: string;
  versionNumber: number;
  recordVersion: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  yieldQuantity: string;
  lossBps: number;
  productName: string;
  variantName: string;
  techniqueName: string;
}
interface ComponentDraft {
  materialId: string;
  quantity: string;
}

export default function TechnicalSheetsPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([
    { materialId: '', quantity: '1' },
  ]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [m, c, s] = await Promise.all([
        api<{ items: Material[] }>('/materials?status=ACTIVE'),
        api<{ items: Combination[] }>('/catalog/combinations?status=ACTIVE'),
        api<{ items: Sheet[] }>('/technical-sheets'),
      ]);
      setMaterials(m.items);
      setCombinations(c.items);
      setSheets(s.items);
      setComponents((current) =>
        current.map((item) => ({ ...item, materialId: item.materialId || m.items[0]?.id || '' })),
      );
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

  function unitFor(materialId: string) {
    return materials.find((item) => item.id === materialId)?.baseUnit ?? '';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    try {
      const created = await api<Sheet>('/technical-sheets', {
        method: 'POST',
        body: JSON.stringify({
          combinationId: form.get('combinationId'),
          yieldQuantity: form.get('yieldQuantity'),
          lossBps: Number(form.get('lossBps')),
          technicalNote: form.get('technicalNote') || undefined,
          components: components.map((item) => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: unitFor(item.materialId),
          })),
        }),
      });
      setSuccess(`Ficha v${created.versionNumber} criada como rascunho.`);
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function action(sheet: Sheet, kind: 'activate' | 'revise') {
    setError('');
    setSuccess('');
    try {
      const result = await api<Sheet>(`/technical-sheets/${sheet.id}/${kind}`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: '{}',
      });
      setSuccess(
        kind === 'activate'
          ? `Ficha v${result.versionNumber} ativada.`
          : `Revisão v${result.versionNumber} aberta.`,
      );
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  if (loading) return <p role="status">Carregando fichas técnicas…</p>;
  return (
    <div className="stack">
      <section className="panel">
        <h1>Fichas técnicas versionadas</h1>
        <p className="muted">A ativação arquiva a versão anterior na mesma transação.</p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && <div className="success">{success}</div>}
        {combinations.length === 0 || materials.length === 0 ? (
          <div className="notice">
            Crie uma combinação de catálogo e mantenha ao menos um material ativo.
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="grid">
              <label>
                Combinação
                <select name="combinationId" required>
                  {combinations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.productName} · {c.variantName} · {c.techniqueName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rendimento da ficha
                <input
                  name="yieldQuantity"
                  inputMode="decimal"
                  defaultValue="1"
                  pattern="\d+(\.\d{1,6})?"
                  required
                />
              </label>
              <label>
                Perda prevista (pontos-base)
                <input name="lossBps" type="number" min="0" defaultValue="0" required />
              </label>
              <label>
                Observação técnica
                <textarea name="technicalNote" rows={2} />
              </label>
            </div>
            <div className="card">
              <div className="toolbar">
                <h2>Materiais</h2>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setComponents([...components, { materialId: materials[0]!.id, quantity: '1' }])
                  }
                >
                  Adicionar componente
                </button>
              </div>
              {components.map((component, index) => (
                <div className="grid" key={index}>
                  <label>
                    Material
                    <select
                      aria-label={`Material ${index + 1}`}
                      value={component.materialId}
                      onChange={(e) =>
                        setComponents(
                          components.map((item, i) =>
                            i === index ? { ...item, materialId: e.target.value } : item,
                          ),
                        )
                      }
                    >
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code} · {m.name} ({m.baseUnit})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantidade por rendimento
                    <input
                      aria-label={`Quantidade ${index + 1}`}
                      value={component.quantity}
                      onChange={(e) =>
                        setComponents(
                          components.map((item, i) =>
                            i === index ? { ...item, quantity: e.target.value } : item,
                          ),
                        )
                      }
                      pattern="\d+(\.\d{1,6})?"
                      required
                    />
                  </label>
                  {components.length > 1 && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setComponents(components.filter((_, i) => i !== index))}
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button>Criar ficha em rascunho</button>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Histórico de versões</h2>
        {sheets.length === 0 ? (
          <p>Nenhuma ficha técnica cadastrada.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Combinação</th>
                  <th>Versão</th>
                  <th>Estado</th>
                  <th>Rendimento</th>
                  <th>Perda</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((sheet) => (
                  <tr key={sheet.id}>
                    <td>
                      {sheet.productName} · {sheet.variantName} · {sheet.techniqueName}
                    </td>
                    <td>v{sheet.versionNumber}</td>
                    <td>
                      <span className={`status ${sheet.status.toLowerCase()}`}>{sheet.status}</span>
                    </td>
                    <td>{sheet.yieldQuantity}</td>
                    <td>{sheet.lossBps / 100}%</td>
                    <td className="actions">
                      {sheet.status === 'DRAFT' ? (
                        <button onClick={() => void action(sheet, 'activate')}>Ativar</button>
                      ) : (
                        <button className="secondary" onClick={() => void action(sheet, 'revise')}>
                          Criar revisão
                        </button>
                      )}
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
