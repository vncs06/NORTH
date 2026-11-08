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
  environment: 'SANDBOX' | 'PRODUCTION';
  webhookPublicUrl?: string;
  keyFingerprint?: string;
  notificationEmailMasked?: string;
  webhookStatus?: string;
  lastValidatedAt?: string;
  lastEventReceivedAt?: string;
  paymentMethods?: Array<{ billingType: string; enabled: boolean }>;
}

export default function OrderSettingsPage() {
  const [policy, setPolicy] = useState<DepositPolicy | null>(null);
  const [asaas, setAsaas] = useState<AsaasConfig | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [depositMode, setDepositMode] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [asaasEnvironment, setAsaasEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [webhookToken, setWebhookToken] = useState('');
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

  async function rotateWebhookToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api('/integrations/asaas/rotate-webhook-token', {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ webhookAuthToken: webhookToken }),
      });
      setWebhookToken('');
      setSuccess('Novo token validado no Webhook e armazenado de forma protegida.');
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
          environment: asaasEnvironment,
          apiKey: form.get('apiKey'),
          notificationEmail: form.get('notificationEmail'),
          webhookAuthToken: webhookToken,
        }),
      });
      formElement.reset();
      setWebhookToken('');
      setSuccess('Conexão validada, taxas consultadas e Webhook reconciliado.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function generateToken() {
    try {
      const result = await api<{ token: string }>('/integrations/asaas/webhook-token/generate', {
        method: 'POST',
        body: '{}',
      });
      setWebhookToken(result.token);
      setSuccess('Token seguro gerado por sua ação. Ele será exibido somente neste formulário.');
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function savePaymentMethods(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const methods = ['PIX', 'BOLETO', 'CREDIT_CARD'].filter((item) => form.has(item));
    try {
      await api('/integrations/asaas/payment-methods', {
        method: 'PUT',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ methods }),
      });
      setSuccess('Meios de pagamento atualizados. Nenhuma cobrança antiga foi enviada.');
      await load();
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function copyWebhookUrl() {
    if (!asaas?.webhookPublicUrl) return;
    await navigator.clipboard.writeText(asaas.webhookPublicUrl);
    setSuccess('URL pública do Webhook copiada.');
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
      <section className="panel" aria-labelledby="asaas-title">
        <h2 id="asaas-title">Configurações → Pagamentos → Asaas</h2>
        <h3>1. Antes de conectar</h3>
        <p>
          A conta, as tarifas e todo o dinheiro pertencem à sua empresa. O NORTH não recebe nem
          centraliza valores. Crie a API Key na conta Asaas da empresa em{' '}
          <strong>Menu do usuário → Integrações → Chaves de API</strong>. O Asaas mostra a chave
          apenas uma vez; o NORTH a armazenará cifrada e nunca a mostrará novamente.
        </p>
        <p className="muted">
          O Webhook comunica pagamentos, atrasos, estornos e chargebacks. Sem conexão ativa, o
          restante do ERP continua disponível e cobranças automáticas ficam desabilitadas.
        </p>
        {asaas && (
          <div className="notice">
            Estado: {asaas.status} · ambiente {asaas.environment}
            {asaas.keyFingerprint ? ` · chave configurada (${asaas.keyFingerprint})` : ''}
            {asaas.notificationEmailMasked ? ` · alertas ${asaas.notificationEmailMasked}` : ''}
          </div>
        )}
        {asaas?.status !== 'ACTIVE' && (
          <form className="grid" onSubmit={saveAsaas} autoComplete="off">
            <h3 className="full">2. Ambiente</h3>
            <label>
              Ambiente Asaas
              <select
                value={asaasEnvironment}
                onChange={(event) =>
                  setAsaasEnvironment(event.target.value as typeof asaasEnvironment)
                }
              >
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Produção</option>
              </select>
            </label>
            <div className="notice full">
              Chaves de Sandbox e Produção são diferentes. Sandbox não cria cobranças reais.
              Produção pode movimentar cobranças reais e exige nova validação.
            </div>
            <h3 className="full">3. Credencial da empresa</h3>
            <label>
              API Key do Asaas
              <input
                name="apiKey"
                type="password"
                autoComplete="new-password"
                minLength={20}
                required
              />
            </label>
            <h3 className="full">4. Webhook</h3>
            <label>
              E-mail para alertas da integração
              <input
                name="notificationEmail"
                type="email"
                autoComplete="off"
                maxLength={320}
                required
              />
            </label>
            <label>
              Token de autenticação do Webhook
              <input
                name="webhookAuthToken"
                type="password"
                autoComplete="new-password"
                minLength={32}
                maxLength={255}
                value={webhookToken}
                onChange={(event) => setWebhookToken(event.target.value)}
                required
              />
            </label>
            <button type="button" className="secondary" onClick={() => void generateToken()}>
              Gerar token seguro
            </button>
            <label className="full">
              URL do Webhook fornecida pelo NORTH
              <input value={asaas?.webhookPublicUrl ?? 'Configuração técnica ausente'} readOnly />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => void copyWebhookUrl()}
              disabled={!asaas?.webhookPublicUrl}
            >
              Copiar URL
            </button>
            <p className="muted full">
              Eventos de pagamento · API v3 · envio sequencial. O e-mail recebe alertas; não é
              login.
            </p>
            <h3 className="full">5. Validar e conectar</h3>
            <button disabled={!asaas?.webhookPublicUrl}>Validar e conectar</button>
          </form>
        )}
        {asaas?.status === 'ACTIVE' && (
          <>
            <hr />
            <h3>6. Conexão ativa</h3>
            <p className="muted">
              Webhook: {asaas.webhookStatus ?? 'ACTIVE'} · URL {asaas.webhookPublicUrl} · última
              validação{' '}
              {asaas.lastValidatedAt
                ? new Date(asaas.lastValidatedAt).toLocaleString('pt-BR')
                : '—'}{' '}
              · último evento{' '}
              {asaas.lastEventReceivedAt
                ? new Date(asaas.lastEventReceivedAt).toLocaleString('pt-BR')
                : 'ainda não recebido'}
              .
            </p>
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
            <h3>Meios habilitados</h3>
            <form className="grid" onSubmit={savePaymentMethods}>
              {['PIX', 'BOLETO', 'CREDIT_CARD'].map((method) => (
                <label key={method}>
                  <input
                    name={method}
                    type="checkbox"
                    defaultChecked={asaas.paymentMethods?.some(
                      (item) => item.billingType === method && item.enabled,
                    )}
                  />{' '}
                  {method}
                </label>
              ))}
              <button>Salvar meios habilitados</button>
            </form>
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
                <input
                  name="apiKey"
                  type="password"
                  minLength={20}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button>Validar e rotacionar</button>
            </form>
            <form className="grid" onSubmit={rotateWebhookToken}>
              <label>
                Novo token do Webhook
                <input
                  type="password"
                  minLength={32}
                  maxLength={255}
                  autoComplete="new-password"
                  value={webhookToken}
                  onChange={(event) => setWebhookToken(event.target.value)}
                  required
                />
              </label>
              <button type="button" className="secondary" onClick={() => void generateToken()}>
                Gerar novo token seguro
              </button>
              <button>Rotacionar token</button>
            </form>
            <p className="muted">A falha de rotação preserva a chave atualmente ativa.</p>
            <button type="button" className="secondary" onClick={() => void disconnect()}>
              Analisar impacto e desconectar
            </button>
          </>
        )}
      </section>
    </div>
  );
}
