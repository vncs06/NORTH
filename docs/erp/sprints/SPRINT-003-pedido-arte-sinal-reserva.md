# Sprint 003 — Pedido, arte, sinal Asaas e reserva de materiais

## Estado

`CONCLUÍDO` no código-base após a revisão R2 na branch
`sprint-003-r2-asaas-self-service`. A decisão de produto de 2026-11-08 substituiu o
bloqueio global por onboarding autônomo: cada instalação inicia sem integração e o
gestor conecta a conta da própria empresa. Contrato oficial, stub estrito, PostgreSQL,
concorrência e E2E demonstram o fluxo local. Homologação real é
`PENDENTE DE IMPLANTAÇÃO POR EMPRESA`; nenhuma conta externa foi homologada nesta revisão.

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
| Onboarding autônomo e contrato Asaas | painel gerencial, stub estrito, integração e E2E |
| Homologação real da conta | `PENDENTE DE IMPLANTAÇÃO POR EMPRESA` |

## Revisão corretiva 003-R1

- sinal versionado nos modos `PERCENTAGE` e `FIXED_AMOUNT`, com snapshot no pedido;
- `GET /v3/myAccount/fees/` sem corpo, com `access_token`, `User-Agent`, estados e
  snapshot sanitizado;
- políticas versionadas `ABSORB`/`PASS_THROUGH` por PIX, boleto e cartão;
- rotação validada antes da troca e desconexão dependente da remoção do Webhook;
- cartão limitado à experiência hospedada indicada por URL validada;
- CPF/CNPJ com dígitos verificadores, HMAC, criptografia e máscara;
- contratos separados para solicitar e rejeitar arte;
- stub determinístico e vinte cenários de concorrência com PostgreSQL real;
- migração incremental `20261107120000_sprint_003_r1_asaas_completion`;
- preflight real que informa apenas presença/ausência de variáveis.

Documentação oficial do Asaas consultada em 2026-11-07. Não foi identificada
alteração contratual incompatível com ADR-005: autenticação continua em
`access_token`, taxas em `/v3/myAccount/fees/`, cobranças são assíncronas e Webhooks
continuam exigindo idempotência do consumidor.

## Revisão final 003-R2

- estados explícitos `NOT_CONFIGURED`, `CONFIGURING`, `VALIDATING`, `ACTIVE`,
  `DEGRADED`, `DISCONNECTING` e `DISCONNECTED`;
- painel em Configurações → Pagamentos → Asaas, com orientação, ambientes, chave de
  uso único, e-mail, token explícito e URL técnica somente leitura;
- Webhook completo (`email`, `enabled`, `interrupted`, `apiVersion`, `sendType` e
  eventos), reconciliação após timeout e meios desabilitados até ação gerencial;
- ausência de conexão bloqueia somente cobrança automática, sem erro 500 ou efeito em estoque;
- migração incremental `20261108120000_sprint_003_r2_asaas_self_service` preserva R1
  e reclassifica conexões antigas incompletas como `CONFIGURING`;
- `asaas:sandbox:homologate` virou lembrete opcional de implantação e não lê credencial
  nem cria cobrança paralela ao domínio NORTH.

Documentação oficial consultada novamente em 2026-11-08. A referência atual exige
`name`, `url`, `email`, `enabled`, `interrupted`, `events` e `sendType`; o projeto
também envia `apiVersion=3` e `authToken` de 32–255 caracteres conforme o guia oficial.
