'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney, idempotencyKey, message } from '../../lib/api';

type ComponentType = 'FIXED_QUOTE' | 'FIXED_UNIT' | 'PERCENT_MATERIAL';
interface ComponentDraft {
  name: string;
  type: ComponentType;
  value: string;
  includeInCostBase: boolean;
}
interface Policy {
  versionNumber: number;
  method: 'MARKUP' | 'MARGIN';
  rateBps: number;
  employeeDiscountLimitBps: number;
  managerDiscountLimitBps?: number;
  discountOptionsBps: number[];
  effectiveAt: string;
  components: Array<{
    id?: string;
    name: string;
    type: ComponentType;
    amountCents?: string | null;
    rateBps?: number | null;
    includeInCostBase: boolean;
  }>;
}

export default function PricingPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [components, setComponents] = useState<ComponentDraft[]>([
    { name: 'Mão de obra', type: 'FIXED_UNIT', value: '0', includeInCostBase: true },
  ]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setPolicy(await api<Policy>('/pricing/policy'));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      if (!(caught instanceof ApiError && caught.status === 404)) setError(message(caught));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    try {
      const created = await api<Policy>('/pricing/policy', {
        method: 'PUT',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          method: form.get('method'),
          rateBps: Number(form.get('rateBps')),
          employeeDiscountLimitBps: Number(form.get('employeeLimit')),
          managerDiscountLimitBps: Number(form.get('managerLimit')),
          discountOptionsBps: (form.get('discountOptions') as string)
            .split(',')
            .map((value) => Number(value.trim())),
          effectiveAt: new Date(form.get('effectiveAt') as string).toISOString(),
          components: components.map((item, index) => ({
            name: item.name,
            type: item.type,
            status: 'ACTIVE',
            displayOrder: index,
            includeInCostBase: item.includeInCostBase,
            ...(item.type === 'PERCENT_MATERIAL'
              ? { rateBps: Number(item.value) }
              : { amountCents: Math.round(Number(item.value) * 100) }),
          })),
        }),
      });
      setPolicy(created);
      setSuccess(`Política v${created.versionNumber} ativada. A versão anterior foi preservada.`);
    } catch (caught) {
      setError(message(caught));
    }
  }

  if (loading) return <p role="status">Carregando política de preço…</p>;
  return (
    <div className="stack">
      <section className="panel">
        <h1>Política de precificação</h1>
        <p className="muted">Configuração gerencial versionada; percentuais usam pontos-base.</p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && <div className="success">{success}</div>}
        {policy && (
          <div className="card">
            <h2>Política ativa · v{policy.versionNumber}</h2>
            <p>
              <strong>{policy.method}</strong> · {policy.rateBps / 100}% · desconto funcionário até{' '}
              {policy.employeeDiscountLimitBps / 100}%
              {policy.managerDiscountLimitBps === undefined
                ? ''
                : ` · gestor até ${policy.managerDiscountLimitBps / 100}%`}
            </p>
            <p>
              Opções: {policy.discountOptionsBps.map((option) => `${option / 100}%`).join(', ')}
            </p>
            {policy.components.length > 0 && (
              <ul>
                {policy.components.map((item, index) => (
                  <li key={item.id ?? `${item.name}-${index}`}>
                    {item.name}:{' '}
                    {item.type === 'PERCENT_MATERIAL'
                      ? `${(item.rateBps ?? 0) / 100}% do material`
                      : formatMoney(item.amountCents ?? null)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <form className="stack" onSubmit={submit}>
          <div className="grid">
            <label>
              Método
              <select name="method" defaultValue={policy?.method ?? 'MARKUP'}>
                <option value="MARKUP">Markup</option>
                <option value="MARGIN">Margem desejada</option>
              </select>
            </label>
            <label>
              Percentual (pontos-base)
              <input
                name="rateBps"
                type="number"
                min="0"
                max="9999"
                defaultValue={policy?.rateBps ?? 5000}
                required
              />
            </label>
            <label>
              Limite de desconto do funcionário (bps)
              <input
                name="employeeLimit"
                type="number"
                min="0"
                max="10000"
                defaultValue={policy?.employeeDiscountLimitBps ?? 500}
                required
              />
            </label>
            <label>
              Limite gerencial (bps)
              <input
                name="managerLimit"
                type="number"
                min="0"
                max="10000"
                defaultValue={policy?.managerDiscountLimitBps ?? 1500}
                required
              />
            </label>
            <label>
              Opções de desconto (bps, separadas por vírgula)
              <input
                name="discountOptions"
                defaultValue={policy?.discountOptionsBps.join(',') ?? '0,500,1000,1500'}
                pattern="\d+(\s*,\s*\d+)*"
                required
              />
            </label>
            <label>
              Vigência
              <input
                name="effectiveAt"
                type="datetime-local"
                defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16)}
                required
              />
            </label>
          </div>
          <div className="card">
            <div className="toolbar">
              <h2>Componentes adicionais</h2>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setComponents([
                    ...components,
                    {
                      name: 'Novo componente',
                      type: 'FIXED_QUOTE',
                      value: '0',
                      includeInCostBase: true,
                    },
                  ])
                }
              >
                Adicionar componente
              </button>
            </div>
            {components.map((component, index) => (
              <div className="grid" key={index}>
                <label>
                  Nome
                  <input
                    value={component.name}
                    onChange={(e) =>
                      setComponents(
                        components.map((item, i) =>
                          i === index ? { ...item, name: e.target.value } : item,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <label>
                  Modo
                  <select
                    value={component.type}
                    onChange={(e) =>
                      setComponents(
                        components.map((item, i) =>
                          i === index ? { ...item, type: e.target.value as ComponentType } : item,
                        ),
                      )
                    }
                  >
                    <option value="FIXED_QUOTE">Fixo por orçamento</option>
                    <option value="FIXED_UNIT">Fixo por unidade</option>
                    <option value="PERCENT_MATERIAL">% sobre materiais</option>
                  </select>
                </label>
                <label>
                  {component.type === 'PERCENT_MATERIAL' ? 'Pontos-base' : 'Valor (R$)'}
                  <input
                    type="number"
                    min="0"
                    step={component.type === 'PERCENT_MATERIAL' ? '1' : '0.01'}
                    value={component.value}
                    onChange={(e) =>
                      setComponents(
                        components.map((item, i) =>
                          i === index ? { ...item, value: e.target.value } : item,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={component.includeInCostBase}
                    onChange={(e) =>
                      setComponents(
                        components.map((item, i) =>
                          i === index ? { ...item, includeInCostBase: e.target.checked } : item,
                        ),
                      )
                    }
                  />{' '}
                  Incluir no custo-base
                </label>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setComponents(components.filter((_, i) => i !== index))}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <button>Ativar nova política</button>
        </form>
      </section>
    </div>
  );
}
