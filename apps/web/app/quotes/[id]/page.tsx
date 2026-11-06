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

interface MaterialLine {
  materialId: string;
  materialCode: string;
  materialName: string;
  unit: string;
  componentQuantity: string;
  baseConsumption: string;
  lossQuantity: string;
  totalConsumption: string;
  lossBps: number;
  unitCostCents: number | string;
  totalCostCents: number | string;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  insufficientStock: boolean;
}
interface ItemLine {
  id: string;
  productName: string;
  variantName: string;
  techniqueName: string;
  requestedQuantity: string;
  technicalSheetVersion: number | null;
  yieldQuantity: string | null;
  lossBps: number | null;
  materialCostCents: number | string | null;
  insufficientStock: boolean | null;
  materials: MaterialLine[];
}
interface PricingLine {
  id: string;
  name: string;
  type: string;
  calculatedCents: number | string;
  includeInCostBase: boolean;
}
interface QuoteView {
  id: string;
  commercialNumber: string;
  revisionNumber: number;
  previousQuoteId: string | null;
  status: string;
  customer: { displayName: string; type: string; businessName: string | null };
  items: ItemLine[];
  priceComponents: PricingLine[];
  pricingMethod: string | null;
  pricingRateBps: number | null;
  discountBps: number | null;
  materialCostCents: string | null;
  additionalCostCents: string | null;
  costBaseCents: string | null;
  suggestedPriceCents: string | null;
  discountCents: string | null;
  suggestedFinalCents: string | null;
  manualFinalCents: string | null;
  manualAdjustmentReason: string | null;
  finalPriceCents: string | null;
  issuedAt: string | null;
  previous: { id: string; commercialNumber: string; finalPriceCents: string } | null;
}
interface Simulation {
  items: ItemLine[];
  priceComponents: PricingLine[];
  pricingPolicy: { method: string; rateBps: number; versionNumber: number };
  materialCostCents: number;
  additionalCostCents: number;
  costBaseCents: number;
  suggestedPriceCents: number;
  discountBps: number;
  discountCents: number;
  suggestedFinalCents: number;
  manualFinalPriceCents: number | null;
  manualReason: string | null;
  finalPriceCents: number;
}

interface OperationalPricingPolicy {
  discountOptionsBps: number[];
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [discountOptions, setDiscountOptions] = useState<number[]>([0]);
  const [options, setOptions] = useState({
    discountBps: 0,
    manualFinalPriceCents: '',
    manualReason: '',
  });

  async function load() {
    try {
      const [loadedQuote, policy] = await Promise.all([
        api<QuoteView>(`/quotes/${id}`),
        api<OperationalPricingPolicy>('/pricing/policy'),
      ]);
      setQuote(loadedQuote);
      setDiscountOptions(policy.discountOptionsBps);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return router.push('/login');
      setError(message(caught));
    }
  }
  useEffect(() => {
    void load();
  }, [id]);

  function payload() {
    return {
      discountBps: options.discountBps,
      ...(options.manualFinalPriceCents
        ? {
            manualFinalPriceCents: Math.round(Number(options.manualFinalPriceCents) * 100),
            manualReason: options.manualReason,
          }
        : {}),
    };
  }
  async function simulate(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    setSuccess('');
    try {
      setSimulation(
        await api<Simulation>(`/quotes/${id}/simulate`, {
          method: 'POST',
          body: JSON.stringify(payload()),
        }),
      );
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function issue() {
    setError('');
    try {
      await api(`/quotes/${id}/issue`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify(payload()),
      });
      setSimulation(null);
      setSuccess('Orçamento emitido. O snapshot agora é imutável.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function revise() {
    try {
      const revision = await api<{ id: string }>(`/quotes/${id}/revise`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: '{}',
      });
      router.push(`/quotes/${revision.id}`);
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function cancel() {
    const reason = window.prompt('Motivo do cancelamento:');
    if (!reason) return;
    try {
      await api(`/quotes/${id}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ reason }),
      });
      setSuccess('Orçamento cancelado sem exclusão do histórico.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  if (!quote)
    return error ? (
      <div className="error">{error}</div>
    ) : (
      <p role="status">Carregando orçamento…</p>
    );
  const view = simulation ?? quote;
  const items = view.items;
  const components = view.priceComponents;
  const totals = simulation
    ? {
        method: simulation.pricingPolicy.method,
        rate: simulation.pricingPolicy.rateBps,
        material: String(simulation.materialCostCents),
        additional: String(simulation.additionalCostCents),
        base: String(simulation.costBaseCents),
        suggested: String(simulation.suggestedPriceCents),
        discountBps: simulation.discountBps,
        discount: String(simulation.discountCents),
        final: String(simulation.finalPriceCents),
      }
    : {
        method: quote.pricingMethod,
        rate: quote.pricingRateBps,
        material: quote.materialCostCents,
        additional: quote.additionalCostCents,
        base: quote.costBaseCents,
        suggested: quote.suggestedPriceCents,
        discountBps: quote.discountBps,
        discount: quote.discountCents,
        final: quote.finalPriceCents,
      };

  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <div>
            <h1>Orçamento {quote.commercialNumber}</h1>
            <p>
              {quote.customer.displayName} · revisão {quote.revisionNumber} ·{' '}
              <span className={`status ${quote.status.toLowerCase()}`}>{quote.status}</span>
            </p>
          </div>
          <div className="actions no-print">
            <button className="secondary" onClick={() => window.print()}>
              Imprimir
            </button>
            <Link className="button secondary" href="/quotes">
              Voltar
            </Link>
          </div>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && <div className="success">{success}</div>}
        {quote.previous && (
          <div className="notice">
            Revisão anterior:{' '}
            <Link href={`/quotes/${quote.previous.id}`}>{quote.previous.commercialNumber}</Link> ·{' '}
            {formatMoney(quote.previous.finalPriceCents)} → {formatMoney(totals.final)}
          </div>
        )}
        {quote.status === 'DRAFT' && (
          <form className="card grid no-print" onSubmit={simulate}>
            <label>
              Desconto (pontos-base)
              <select
                value={options.discountBps}
                onChange={(e) => setOptions({ ...options, discountBps: Number(e.target.value) })}
              >
                {discountOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} ({option / 100}%)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preço final manual (R$, somente gestor)
              <input
                type="number"
                min="0"
                step="0.01"
                value={options.manualFinalPriceCents}
                onChange={(e) => setOptions({ ...options, manualFinalPriceCents: e.target.value })}
              />
            </label>
            <label className="full">
              Motivo do ajuste gerencial
              <input
                maxLength={500}
                value={options.manualReason}
                onChange={(e) => setOptions({ ...options, manualReason: e.target.value })}
              />
            </label>
            <div className="actions full">
              <button>Simular composição</button>
              {simulation && (
                <button type="button" onClick={() => void issue()}>
                  Emitir orçamento
                </button>
              )}
            </div>
          </form>
        )}
        {(quote.status === 'ISSUED' || quote.status === 'SUPERSEDED') && (
          <div className="actions no-print">
            <button onClick={() => void revise()}>Criar revisão explícita</button>
            {quote.status === 'ISSUED' && (
              <button className="danger" onClick={() => void cancel()}>
                Cancelar
              </button>
            )}
          </div>
        )}
      </section>
      {!simulation && quote.status === 'DRAFT' ? (
        <section className="panel">
          <div className="notice">
            Simule para validar ficha ativa, custos, política e disponibilidade.
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Consumo previsto e disponibilidade</h2>
            {items.map((item) => (
              <div className="card" key={item.id}>
                <h3>
                  {item.productName} · {item.variantName} · {item.techniqueName}
                </h3>
                <p>
                  Quantidade: {item.requestedQuantity} · ficha v{item.technicalSheetVersion} ·
                  rendimento {item.yieldQuantity} · perda {(item.lossBps ?? 0) / 100}%
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Base</th>
                        <th>Perda</th>
                        <th>Demanda</th>
                        <th>Disponível</th>
                        <th>Custo unit.</th>
                        <th>Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.materials.map((material) => (
                        <tr
                          key={material.materialId}
                          className={material.insufficientStock ? 'warning-row' : ''}
                        >
                          <td>
                            {material.materialCode} · {material.materialName}
                            {material.insufficientStock && <strong> · saldo insuficiente</strong>}
                          </td>
                          <td>{formatQuantity(material.baseConsumption, material.unit)}</td>
                          <td>{formatQuantity(material.lossQuantity, material.unit)}</td>
                          <td>{formatQuantity(material.totalConsumption, material.unit)}</td>
                          <td>
                            {formatQuantity(material.availableQuantity, material.unit)}
                            <br />
                            <small>
                              físico {formatQuantity(material.physicalQuantity)} · reservado{' '}
                              {formatQuantity(material.reservedQuantity)}
                            </small>
                          </td>
                          <td>{formatMoney(String(material.unitCostCents))}</td>
                          <td>{formatMoney(String(material.totalCostCents))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>Composição explicável do preço</h2>
            <div className="metric-grid">
              <div className="metric">
                Materiais<strong>{formatMoney(totals.material)}</strong>
              </div>
              <div className="metric">
                Custo-base<strong>{formatMoney(totals.base)}</strong>
              </div>
              <div className="metric">
                Preço final<strong>{formatMoney(totals.final)}</strong>
              </div>
            </div>
            <p>
              Método: <strong>{totals.method}</strong> a {(totals.rate ?? 0) / 100}% · preço
              sugerido {formatMoney(totals.suggested)} · desconto {(totals.discountBps ?? 0) / 100}%
              ({formatMoney(totals.discount)})
            </p>
            {components.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>Modo</th>
                      <th>Impacto</th>
                      <th>No custo-base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((component) => (
                      <tr key={component.id}>
                        <td>{component.name}</td>
                        <td>{component.type}</td>
                        <td>{formatMoney(String(component.calculatedCents))}</td>
                        <td>{component.includeInCostBase ? 'Sim' : 'Não'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {quote.manualFinalCents && (
              <div className="notice">
                Ajuste gerencial: de {formatMoney(quote.suggestedFinalCents)} para{' '}
                {formatMoney(quote.manualFinalCents)}. Motivo: {quote.manualAdjustmentReason}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
