'use client';

import { addQuantities, assertMovementDelta } from '@north/domain';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, formatQuantity, idempotencyKey, message } from '../../../../lib/api';

interface Material {
  id: string;
  name: string;
  baseUnit: string;
  balance: { physical: string; reserved: string; available: string };
}

export default function MovementPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const compensation = search.get('compensate');
  const [material, setMaterial] = useState<Material | null>(null);
  const [type, setType] = useState('RECEIPT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [confirmNegative, setConfirmNegative] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    void api<Material>(`/materials/${id}`)
      .then(setMaterial)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 401) router.push('/login');
        else setError(message(caught));
      });
  }, [id]);
  const projected = useMemo(() => {
    if (!material || !quantity) return material?.balance.physical ?? '0';
    try {
      return addQuantities(
        material.balance.physical,
        assertMovementDelta(
          type as 'OPENING_BALANCE' | 'RECEIPT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT',
          quantity,
        ),
      );
    } catch {
      return '—';
    }
  }, [material, quantity, type]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const path = compensation
        ? `/materials/${id}/movements/${compensation}/compensations`
        : `/materials/${id}/movements`;
      const body = compensation
        ? { quantity: quantity || undefined, reason, confirmNegative }
        : { type, quantity, reason: reason || undefined, confirmNegative };
      await api(path, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify(body),
      });
      setSuccess('Movimento registrado com sucesso.');
      setTimeout(() => router.push(`/materials/${id}`), 400);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setLoading(false);
    }
  }
  if (!material) return <p role="status">Carregando saldo…</p>;
  return (
    <section className="panel">
      <h1>{compensation ? 'Compensar movimento' : 'Registrar movimento'}</h1>
      <p>{material.name}</p>
      <div className="metric-grid">
        <div className="metric">
          Antes<strong>{formatQuantity(material.balance.physical, material.baseUnit)}</strong>
        </div>
        <div className="metric">
          Depois (projeção)
          <strong>
            {projected === '—'
              ? 'Revise a quantidade'
              : formatQuantity(projected, material.baseUnit)}
          </strong>
        </div>
        <div className="metric">
          Reservado<strong>{formatQuantity(material.balance.reserved, material.baseUnit)}</strong>
        </div>
      </div>
      {projected.startsWith('-') && (
        <div className="notice">
          O saldo ficará negativo. Um gestor precisa confirmar e justificar a exceção.
        </div>
      )}
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
      <form className="grid" onSubmit={submit}>
        {!compensation && (
          <div className="field">
            <label htmlFor="type">Tipo</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="OPENING_BALANCE">Saldo inicial</option>
              <option value="RECEIPT">Recebimento</option>
              <option value="ADJUSTMENT_IN">Ajuste de entrada</option>
              <option value="ADJUSTMENT_OUT">Ajuste de saída</option>
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="quantity">Quantidade</label>
          <input
            id="quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required={!compensation}
            inputMode="decimal"
            placeholder={compensation ? 'Vazio inverte o original' : '0.000000'}
          />
        </div>
        <div className="field full">
          <label htmlFor="reason">
            Motivo {type.startsWith('ADJUSTMENT') || compensation ? '(obrigatório)' : '(opcional)'}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={type.startsWith('ADJUSTMENT') || Boolean(compensation)}
            rows={3}
          />
        </div>
        <label className="field full">
          <span>
            <input
              type="checkbox"
              checked={confirmNegative}
              onChange={(e) => setConfirmNegative(e.target.checked)}
              style={{ width: 'auto' }}
            />{' '}
            Confirmo a exceção de saldo negativo como gestor
          </span>
        </label>
        <div className="actions full">
          <button disabled={loading}>{loading ? 'Registrando…' : 'Confirmar movimento'}</button>
        </div>
      </form>
    </section>
  );
}
