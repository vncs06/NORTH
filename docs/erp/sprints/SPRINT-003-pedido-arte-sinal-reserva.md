# Sprint 003 — Pedido, arte, sinal Asaas e reserva de materiais

## Estado

`PARCIAL` na branch `sprint-003-pedido-arte-sinal-reserva`, baseada em `b3aa5b5`.
O núcleo vertical local foi demonstrado por testes unitários, integração PostgreSQL
e E2E. A homologação real do Asaas Sandbox permanece `BLOQUEADA` por ausência de
credenciais e URL HTTPS pública injetadas de modo seguro; testes locais usam um stub
contratual. A matriz do handoff também registra requisitos locais ainda incompletos,
incluindo taxa Asaas, sinal fixo, cartão hospedado e operações de ciclo de conexão.
O Sprint 003 não é declarado concluído enquanto essas lacunas não forem resolvidas.

## Objetivo verificável

Converter explicitamente um orçamento emitido em pedido; preservar seus snapshots;
versionar uma arte privada; registrar confirmação externa e aprovação gerencial;
criar a cobrança do sinal por outbox; persistir webhooks idempotentes em inbox; e
reservar materiais atomicamente apenas quando arte, sinal/decisão e estoque estiverem
aptos. O pedido termina em `READY_FOR_PRODUCTION`, sem executar produção ou consumo.

## Regras aplicadas

- BR-003/004/009/010/012: centavos, decimais exatos, versionamento e histórico;
- BR-030–034/039: orçamento emitido e conversão explícita;
- BR-048–055: sinal, eventos financeiros e exceção gerencial;
- BR-067–073/085: arte, prontidão, reserva e liberação;
- ADR-002: razão único e imutável, reserva sem alterar físico;
- ADR-005: Asaas assíncrono, autenticado e idempotente;
- ADR-006/012/013: exceções explícitas e rastreabilidade financeira por pedido;
- ADR-009/011/015/016: instalação única, papéis simples, monólito modular e segredos
  locais à instalação.

## Entrega

- pedido, itens e demanda material copiados dos snapshots do orçamento;
- política de sinal versionada e snapshot no pedido;
- conexão Sandbox cifrada com AES-256-GCM e chave mestra somente no ambiente;
- documento de cobrança cifrado e indexado por HMAC, sem PII em auditoria;
- cobrança assíncrona, outbox com lock/backoff e vínculo estável de cliente;
- webhook com token separado, persistência anterior ao HTTP 200 e worker idempotente;
- arquivos PNG/JPEG/PDF privados, verificação de assinatura, checksum e limite de 25 MB;
- confirmação externa, aprovação gerencial e histórico de versões da arte;
- reserva/release por movimentos imutáveis, sem alterar `physical_quantity`;
- bloqueio explicável por arte, sinal e falta de saldo; exceções somente pelo gestor;
- telas de pedido, checklist, timeline, cobrança, arte, alertas e configurações.

## Fora de escopo preservado

Produção, consumo, qualidade, saldo final, entrega, estorno automático, cobrança de
saldo, arquivos públicos, PDF, mensagens e qualquer item do Sprint 004 não foram
implementados.

## Critérios de aceite verificados

| Critério | Evidência esperada |
| --- | --- |
| Conversão idempotente de orçamento emitido | integração PostgreSQL e E2E |
| Snapshot de sinal e pedido imutável | constraints e integração |
| Arte privada e versionada | HTTP/UI, checksum e teste de autorização |
| Webhook duplicado sem efeito duplo | unique inbox e integração |
| Reserva atômica sem consumo | integração e E2E com saldo antes/depois |
| Falta de saldo e exceção gerencial | integração e segundo fluxo E2E |
| Cancelamento libera reserva | movimento `RELEASE` e integração |
| Migração preserva Sprints 001/002 | verificador dedicado |
| Homologação real do Sandbox | `BLOQUEADO`: faltam credencial, authToken e URL HTTPS pública |
