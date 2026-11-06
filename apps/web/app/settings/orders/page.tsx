'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, idempotencyKey, message } from '../../../lib/api';

interface DepositPolicy {
  versionNumber: number;
  rateBps: number;
  minimumAmountCents: string;
  effectiveAt: string;
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const results = await Promise.allSettled([
      api<DepositPolicy>('/order-settings/deposit-policy'),
      api<AsaasConfig>('/integrations/asaas'),
    ]);
    if (results[0].status === 'fulfilled') setPolicy(results[0].value);
    if (results[1].status === 'fulfilled') setAsaas(results[1].value);
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
          rateBps: Number(form.get('rateBps')),
          minimumAmountCents: Math.round(Number(form.get('minimumAmount')) * 100),
          effectiveAt: new Date().toISOString(),
        }),
      });
      setSuccess('Política de sinal versionada e ativada.');
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
            Ativa: v{policy.versionNumber} · {policy.rateBps / 100}% · mínimo R${' '}
            {(Number(policy.minimumAmountCents) / 100).toFixed(2)}
          </div>
        )}
        <form className="grid" onSubmit={savePolicy}>
          <label>
            Percentual do sinal (pontos-base)
            <input name="rateBps" type="number" min="0" max="10000" defaultValue="5000" required />
          </label>
          <label>
            Valor mínimo (R$)
            <input
              name="minimumAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
              required
            />
          </label>
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
      </section>
    </div>
  );
}
