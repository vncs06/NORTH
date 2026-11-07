'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, idempotencyKey, message } from '../../../lib/api';

interface DepositPolicy {
  versionNumber: number;
  mode: 'PERCENTAGE' | 'FIXED_AMOUNT';
  rateBps: number | null;
  fixedAmountCents: string | null;
  allowAboveTotal: boolean;
  effectiveAt: string;
}
interface Fees {
  status: string;
  environment: string;
  fetchedAt?: string;
  errorCode?: string;
  items: Array<{
    billingType: string;
    fixedFeeCents: string;
    percentageBps: number;
    settlementDays: number | null;
  }>;
}
interface AsaasConfig {
  status: string;
  environment: string;
  webhookPublicUrl?: string;
  keyFingerprint?: string;
}

export default function OrderSettingsPage() {
  const [policy, setPolicy] = useState<DepositPolicy | null>(null);
  const [asaas, setAsaas] = useState<AsaasConfig | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [depositMode, setDepositMode] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const results = await Promise.allSettled([
      api<DepositPolicy>('/order-settings/deposit-policy'),
      api<AsaasConfig>('/integrations/asaas'),
      api<Fees>('/integrations/asaas/fees'),
    ]);
    if (results[0].status === 'fulfilled') setPolicy(results[0].value);
    if (results[1].status === 'fulfilled') setAsaas(results[1].value);
    if (results[2].status === 'fulfilled') setFees(results[2].value);
  }
  useEffect(() => {
    void load();
  }, []);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/order-settings/deposit-policy', {
        method: 'PUT',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          mode: depositMode,
          ...(depositMode === 'PERCENTAGE'
            ? { rateBps: Number(form.get('rateBps')) }
            : {
                fixedAmountCents: Math.round(Number(form.get('fixedAmount')) * 100),
                allowAboveTotal: false,
              }),
          effectiveAt: new Date().toISOString(),
        }),
      });
      setSuccess('Política de sinal versionada e ativada.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function refreshFees() {
    try {
      await api('/integrations/asaas/fees/refresh', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: '{}',
      });
      setSuccess(
        'Taxas da conta Sandbox atualizadas. A condição efetiva do pagamento pode prevalecer.',
      );
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveFeePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/integrations/asaas/fee-policy', {
        method: 'PUT',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          effectiveAt: new Date().toISOString(),
          methods: ['PIX', 'BOLETO', 'CREDIT_CARD'].map((billingType) => ({
            billingType,
            strategy: form.get(billingType),
          })),
        }),
      });
      setSuccess('Política de absorção/repasse versionada.');
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function rotateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api('/integrations/asaas/rotate-key', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ apiKey: form.get('apiKey') }),
      });
      formElement.reset();
      setSuccess('Nova chave validada e ativada; a anterior foi removida.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function disconnect() {
    if (
      !window.confirm(
        'Desconectar impede novas cobranças. O histórico financeiro será preservado. Continuar?',
      )
    )
      return;
    try {
      await api('/integrations/asaas/disconnect', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ confirmImpact: true }),
      });
      setSuccess('Integração desconectada com histórico preservado.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveAsaas(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    setSuccess('');
    const form = new FormData(formElement);
    try {
      await api('/integrations/asaas', {
        method: 'PUT',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({
          environment: 'SANDBOX',
          apiKey: form.get('apiKey'),
          webhookAuthToken: form.get('webhookAuthToken'),
          webhookPublicUrl: form.get('webhookPublicUrl'),
        }),
      });
      formElement.reset();
      setSuccess('Conexão Sandbox armazenada de forma cifrada.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h1>Pedido e sinal</h1>
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
        {policy && (
          <div className="notice">
            Ativa: v{policy.versionNumber} ·{' '}
            {policy.mode === 'PERCENTAGE'
              ? `${Number(policy.rateBps) / 100}%`
              : `R$ ${(Number(policy.fixedAmountCents) / 100).toFixed(2)}`}
          </div>
        )}
        <form className="grid" onSubmit={savePolicy}>
          <label>
            Modo
            <select
              value={depositMode}
              onChange={(event) => setDepositMode(event.target.value as typeof depositMode)}
            >
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED_AMOUNT">Valor fixo</option>
            </select>
          </label>
          {depositMode === 'PERCENTAGE' ? (
            <label>
              Percentual do sinal (pontos-base)
              <input
                name="rateBps"
                type="number"
                min="0"
                max="10000"
                defaultValue="5000"
                required
              />
            </label>
          ) : (
            <label>
              Valor fixo (R$)
              <input
                name="fixedAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="50"
                required
              />
            </label>
          )}
          <button>Ativar nova versão</button>
        </form>
      </section>
      <section className="panel">
        <h2>Asaas Sandbox</h2>
        <p className="muted">
          A API key e o token do webhook nunca são devolvidos pela API. Produção permanece
          desabilitada.
        </p>
        {asaas && (
          <div className="notice">
            Estado: {asaas.status} · ambiente {asaas.environment}
            {asaas.keyFingerprint ? ` · chave …${asaas.keyFingerprint}` : ''}
          </div>
        )}
        <form className="grid" onSubmit={saveAsaas}>
          <label>
            API key Sandbox
            <input name="apiKey" type="password" autoComplete="off" minLength={20} required />
          </label>
          <label>
            Token do webhook
            <input
              name="webhookAuthToken"
              type="password"
              autoComplete="off"
              minLength={32}
              maxLength={255}
              required
            />
          </label>
          <label className="full">
            URL pública HTTPS do webhook
            <input
              name="webhookPublicUrl"
              type="url"
              placeholder="https://…/api/v1/webhooks/asaas/payments"
              required
            />
          </label>
          <button>Salvar conexão cifrada</button>
        </form>
        {asaas?.status === 'CONNECTED' && (
          <>
            <hr />
            <h3>Taxas da conta</h3>
            <p className="muted">
              Estado: {fees?.status ?? 'NOT_FETCHED'}
              {fees?.fetchedAt ? ` · ${new Date(fees.fetchedAt).toLocaleString('pt-BR')}` : ''}. A
              condição efetiva do pagamento pode prevalecer.
            </p>
            <button type="button" className="secondary" onClick={() => void refreshFees()}>
              Atualizar taxas
            </button>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Meio</th>
                    <th>Fixa</th>
                    <th>Percentual</th>
                    <th>Liquidação</th>
                  </tr>
                </thead>
                <tbody>
                  {fees?.items.map((item) => (
                    <tr key={item.billingType}>
                      <td>{item.billingType}</td>
                      <td>R$ {(Number(item.fixedFeeCents) / 100).toFixed(2)}</td>
                      <td>{item.percentageBps / 100}%</td>
                      <td>{item.settlementDays ?? 'Condição efetiva'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>Absorção ou repasse</h3>
            <form className="grid" onSubmit={saveFeePolicy}>
              {['PIX', 'BOLETO', 'CREDIT_CARD'].map((method) => (
                <label key={method}>
                  {method}
                  <select name={method} defaultValue="ABSORB">
                    <option value="ABSORB">Absorver</option>
                    <option value="PASS_THROUGH">Repassar</option>
                  </select>
                </label>
              ))}
              <button>Ativar política versionada</button>
            </form>
            <h3>Rotação e desconexão</h3>
            <form className="grid" onSubmit={rotateKey}>
              <label>
                Nova API key
                <input name="apiKey" type="password" minLength={20} autoComplete="off" required />
              </label>
              <button>Validar e rotacionar</button>
            </form>
            <button type="button" className="secondary" onClick={() => void disconnect()}>
              Analisar impacto e desconectar
            </button>
          </>
        )}
      </section>
    </div>
  );
}
