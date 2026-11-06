# Handoff — Sprint 003

### 1. Resultado

**PARCIAL.** A branch `sprint-003-pedido-arte-sinal-reserva`, baseada em `b3aa5b5`,
contém o commit de implementação `5a6db44` (`feat: implement sprint 003 order
readiness flow`) e o commit inicial deste handoff `4d2b006`. O núcleo vertical local funciona: orçamento emitido é convertido
uma única vez em pedido; a política percentual de sinal é congelada; cobrança local
e outbox são criadas; arte privada é versionada, confirmada e aprovada; webhook
autenticado atualiza o sinal; a prontidão reserva materiais atomicamente sem consumir
o físico; cancelamento libera a reserva por compensação.

Foram aprovados 29 testes unitários, 18 testes de integração PostgreSQL e 3 fluxos
E2E isolados. A migração foi validada em schema vazio, upgrade com dados, rollback e
restauração de backup. O banco principal `north` não recebeu a migração.

O Sprint 003 **não está concluído**. A homologação real do Asaas Sandbox está
`BLOQUEADA` por ausência de `ASAAS_API_KEY`, `ASAAS_WEBHOOK_AUTH_TOKEN` e
`ASAAS_WEBHOOK_PUBLIC_URL`. A revisão final também identificou lacunas locais do
prompt: sinal fixo, política e consulta de taxas, cartão hospedado, validação de
CPF/CNPJ por dígitos verificadores, ciclo completo conectar/rotacionar/desconectar,
superfície completa de arte e cenários amplos do stub/concor­rência. Esses itens não
foram mascarados como aprovados.

### 2. Alterações

**API e worker**

- `apps/api/src/app.module.ts`
- `apps/api/src/commercial-shared.ts`
- `apps/api/src/fulfillment-controllers.ts`
- `apps/api/src/fulfillment-infrastructure.ts`
- `apps/api/src/fulfillment-repository.ts`
- `apps/api/src/main.ts`
- `apps/api/src/sprint-003.integration.test.ts`
- `apps/worker/src/main.ts`

**Web**

- `apps/web/app/layout.tsx`
- `apps/web/app/orders/page.tsx`
- `apps/web/app/orders/[id]/page.tsx`
- `apps/web/app/settings/orders/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/next-env.d.ts`

**Domínio, contratos e banco**

- `packages/contracts/src/fulfillment.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/package.json`
- `packages/domain/src/fulfillment.ts`
- `packages/domain/src/fulfillment.unit.test.ts`
- `packages/domain/src/index.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261106120000_sprint_003_orders_art_payments_reservations/migration.sql`

**Testes e infraestrutura**

- `e2e/sprint-003.spec.ts`
- `packages/testing/src/asaas-stub.ts`
- `packages/testing/src/homologate-asaas-sandbox.ts`
- `packages/testing/src/inspect-integration-queues.ts`
- `packages/testing/src/reset-database.ts`
- `packages/testing/src/run-with-test-database.ts`
- `packages/testing/src/start-e2e-service.ts`
- `packages/testing/src/verify-sprint-003-migration.ts`
- `playwright.config.ts`
- `package.json`
- `tsconfig.json`
- `.env.example`
- `.gitignore`

**Documentação e evidências**

- `README.md`
- `docs/erp/INDEX.md`
- `docs/erp/11-roadmap.md`
- `docs/erp/sprints/SPRINT-003-pedido-arte-sinal-reserva.md`
- `docs/erp/handoffs/HANDOFF-SPRINT-003.md`
- `docs/erp/learning-candidates/LC-003-webhook-inbox-reserva-atomica.md`
- `docs/erp/evidence/sprint-001-audit.png`
- `docs/erp/evidence/sprint-002-issued-quote.png`
- `docs/erp/evidence/sprint-003-ready-order.png`

O submódulo `3E` continua com modificação local preexistente. Nenhum arquivo interno
dele foi formatado, preparado, commitado ou publicado.

### 3. Banco e migrações

A migração incremental
`20261106120000_sprint_003_orders_art_payments_reservations` adiciona:

- documento de cobrança cifrado/HMAC ao cliente;
- `deposit_policies`, `orders`, `order_items`, `order_material_requirements` e
  `order_state_history`;
- `financial_decisions`, `asaas_connections`, `asaas_customer_bindings` e
  `payment_charges`;
- `integration_outbox`, `asaas_webhook_inbox`, `object_files`, `artwork_versions` e
  `artwork_approvals`;
- `inventory_reservations` e `inventory_reservation_alerts`;
- deltas de reserva `RESERVATION`/`RELEASE` no razão imutável existente;
- sequência de número de pedido, índices, FKs, checks, unicidades e triggers
  append-only.

Quantidades usam `numeric(18,6)`, dinheiro usa centavos inteiros e percentual usa
pontos-base. O sinal percentual implementado é:

```text
sinal = HALF_UP(total_centavos * rate_bps / 10000)
sinal_confirmado = max(sinal, mínimo_centavos), limitado ao total do pedido
saldo_final_estimado = total_centavos - sinal_centavos
```

A reserva soma as demandas do snapshot em precisão de seis casas, cria movimento
com `reserved_quantity_delta` e não altera `physical_quantity`. O cancelamento cria
`RELEASE` inverso; não edita nem exclui o movimento original.

O verificador dedicado retornou:

```text
Migração vazia: PASSOU ({"orders":"orders","charges":"payment_charges","artworks":"artwork_versions","reservations":"inventory_reservations"}).
Upgrade com dados Sprint 002: PASSOU ({"users":1,"materials":1,"balances":1,"customers":1,"quotes":1,"audits":1,"physical":"12.000000","reserved":"2.000000"}).
Rollback transacional: PASSOU.
```

A restauração temporária comprovou `migrations=4`, `orders=2`, `materials=27`,
`inventory_movements=10` e `audit_events=98`. O banco `north_restore_check` e o dump
temporário foram removidos depois da prova.

O banco principal permaneceu intacto:

```text
database=north
migrations=1
latest=20261105120000_sprint_001
orders_table=ABSENT
users=3
materials=24
inventory_movements=5
audit_events=45
```

### 4. Comandos executados

| Comando | Código | Resultado |
| --- | ---: | --- |
| `git rev-parse HEAD` | 0 | Baseline `b3aa5b536c8795cba58ecf19238ddf15462bacb5`. |
| `git branch --show-current` | 0 | Branch `sprint-003-pedido-arte-sinal-reserva`. |
| `npm run format:check` (primeira execução final) | 1 | Detectou somente `packages/domain/src/index.ts`; corrigido com Prettier. |
| `npm run format:check` (estado final) | 0 | Todos os arquivos compatíveis com Prettier. |
| `npm run lint` (primeira execução) | 1 | 14 erros de tipagem segura; todos corrigidos sem suprimir regras. |
| `npm run lint` (estado final) | 0 | ESLint sem warnings. |
| `npm run typecheck` | 0 | TypeScript sem erros. |
| `npm run test -- --runInBand` | 1 | Opção não suportada pelo Vitest; nenhuma suíte executada. |
| `npm run test` no sandbox | 1 | `EPERM` ao renomear cache temporário; nenhum teste executado. |
| `npm run test` autorizado (estado final) | 0 | 5 arquivos, 29 testes unitários aprovados. |
| `npm run test:database-safety` | 0 | 9 testes de isolamento aprovados. |
| `npm run test:integration` sem `TEST_DATABASE_URL` | 1 | Proteção recusou configuração ausente. |
| `npm run test:integration` com `DATABASE_URL` herdada incorretamente | 1 | Proteção detectou banco principal e de teste iguais. |
| `npm run test:integration` com URLs explícitas separadas | 0 | 2 arquivos, 18 testes PostgreSQL/HTTP; conversão concorrente incluída. |
| `npm run db:test:verify-sprint-003-migration` | 0 | Vazio, upgrade com dados e rollback aprovados. |
| `npm run test:e2e` com `north_test`, 3100/3101 e stub 3199 | 0 | 3 fluxos aprovados em 40,6 s. |
| `npm run build` no sandbox | 1 | Compilou; `mkdir apps/web/.next/...` foi negado por `EPERM`. |
| `npm run build` autorizado (estado final) | 0 | API, worker e 15 rotas Next compilados. |
| `npm run asaas:sandbox:homologate` | 1 | Bloqueio seguro por três variáveis externas ausentes. |
| `pg_dump north_test` no container PostgreSQL | 0 | Backup temporário criado sem publicação. |
| `createdb north_restore_check` | 0 | Banco temporário criado após confirmar que não existia. |
| `pg_restore ... north_restore_check` | 0 | Restauração concluída e contagens conferidas. |
| `dropdb north_restore_check` e remoção do dump exato | 0 | Somente artefatos temporários removidos; alvo conferido como `ABSENT`. |
| Consulta somente leitura no banco `north` | 0 | Migração Sprint 003 ausente e tabela `orders` inexistente. |
| `git diff --cached --check` | 0 | Nenhum erro de whitespace. |
| `git commit -m "feat: implement sprint 003 order readiness flow"` | 0 | Commit `5a6db44`, 42 arquivos, 4.689 inserções e 27 remoções. |
| `git commit -m "docs: add sprint 003 partial handoff"` | 0 | Commit documental `4d2b006`. |
| `git push -u origin sprint-003-pedido-arte-sinal-reserva` | 0 | Branch criada no GitHub sem merge nem force push. |

### 5. Matriz de aceite

| Critério | Estado | Evidência |
| --- | --- | --- |
| Branch correta, base `b3aa5b5`, sem merge em `main` | PASSOU | Git e commit `5a6db44`. |
| `3E` preservado e fora dos commits | PASSOU | Status permanece ` m 3E`; diff staged vazio para o submódulo. |
| Orçamento `ISSUED` converte explicitamente sem recalcular | PASSOU | Snapshot copiado em transação serializável; integração e E2E. |
| Estados inválidos de orçamento não convertem | PASSOU | Validação no repositório e resposta segura. |
| Uma revisão emitida gera no máximo um pedido | PASSOU | `orders.quote_id UNIQUE`, lock e idempotência. |
| Duas conversões simultâneas retornam o mesmo pedido | PASSOU | `Promise.all` contra PostgreSQL real no teste de integração. |
| Dois pedidos distintos geram números concorrentes únicos | NÃO EXECUTADO | Sequência/UNIQUE existem, mas não houve teste concorrente com duas revisões distintas. |
| Snapshot comercial, itens, ficha, preço e demanda são preservados | PASSOU | Tabelas estruturadas e detalhe do pedido. |
| Conversão cria pedido, sinal e outbox atomicamente | PASSOU | Mesma transação e teste de integração. |
| Conversão não reserva nem altera orçamento | PASSOU | Reserva só ocorre na prontidão; E2E observa bloqueio inicial. |
| Política percentual versionada e congelada | PASSOU | `deposit_policies` e snapshot no pedido. |
| Política de sinal por valor fixo | FALHOU | Modo fixo não foi implementado. |
| Meios habilitados fazem parte da política versionada | FALHOU | Política não persiste lista de meios. |
| Sinal usa `HALF_UP` e centavos | PASSOU | Domínio unitário com `bigint`; exemplo 10.001 × 33,33% = 3.333 centavos. |
| Sinal não supera total sem decisão explícita | PARCIAL | Implementação limita automaticamente ao total; não registra decisão específica. |
| Estados detalhados do pedido refletem arte e sinal separadamente | FALHOU | Foram usados estados equivalentes mais agregados: `PENDING_READINESS`, `READY_FOR_PRODUCTION`, `FINANCIAL_REVIEW`, `CANCELLED`. |
| Toda transição possui histórico, ator, correlação e motivo | PASSOU | `order_state_history` append-only. |
| `READY_FOR_PRODUCTION` exige arte, sinal/decisão e reserva | PASSOU | Reavaliação transacional e E2E. |
| Produção e consumo real permanecem fora | PASSOU | Nenhum fluxo de produção; físico não muda. |
| Conexão aceita somente `SANDBOX` e produção fica desabilitada | PASSOU | Contrato literal e base URL fixa por padrão. |
| Segredos distintos cifrados com AES-256-GCM | PASSOU | API key e webhook token com nonce/tag; chave mestra só no ambiente. |
| Startup não local recusa chave mestra ausente | PASSOU | Guarda em infraestrutura. |
| Backend valida a credencial chamando o Sandbox | FALHOU | Configuração persiste a credencial cifrada sem validação externa inicial. |
| Rotação e desconexão Asaas auditadas | FALHOU | Não há endpoints dedicados de rotação/desconexão. |
| Consulta e snapshot de taxas `/myAccount/fees/` | FALHOU | Não implementado. |
| Política de absorver/repassar taxa e revisão de orçamento | FALHOU | Não implementado. |
| CPF/CNPJ normalizado, cifrado, HMAC e mascarado | PASSOU | Persistência protegida e auditoria somente com últimos quatro dígitos. |
| CPF/CNPJ validado por dígitos verificadores | FALHOU | Contrato valida apenas 11/14 dígitos. |
| Vínculo Asaas evita cliente duplicado | PASSOU | Unicidade por cliente/ambiente e reuse no worker. |
| Timeout inconclusivo é reconciliado antes de repetir | PARCIAL | Vínculo/external reference existem; stub não exercita timeout/reconciliação. |
| Obrigação financeira local precede chamada externa | PASSOU | `payment_charges` + outbox antes do worker. |
| Criação de cobrança não equivale a pagamento | PASSOU | Começa `PENDING_CREATION`; somente webhook confirma. |
| Pix e boleto | PASSOU | Contrato, UI, gateway e stub. |
| Cartão por experiência hospedada sem capturar cartão | FALHOU | `CREDIT_CARD` não está disponível. |
| Data de vencimento é explícita | PASSOU | Obrigatória no contrato da cobrança. |
| Outbox usa lock, backoff, limite e erro sanitizado | PASSOU | `FOR UPDATE SKIP LOCKED`, tentativas e próxima execução. |
| Duas solicitações concorrentes de cobrança não duplicam | PARCIAL | UNIQUE/idempotência existem; concorrência simultânea não foi testada. |
| Webhook não usa sessão/CSRF e exige token próprio | PASSOU | Controller dedicado e comparação constante. |
| Evento é persistido antes do HTTP 200 | PASSOU | Inbox é gravada antes do retorno e testada. |
| Webhook duplicado não duplica pagamento/reserva | PASSOU | ID externo UNIQUE, worker idempotente e E2E repetido. |
| Evento fora de ordem | NÃO EXECUTADO | Mapeamento existe, mas não há teste específico de ordem. |
| Refund/chargeback abre revisão sem decisão automática | PASSOU | Worker mapeia para `FINANCIAL_REVIEW`; integração cobre revisão financeira. |
| Arte é privada, versionada, com MIME real, tamanho e checksum | PASSOU | Storage privado, magic bytes, limite 25 MB e SHA-256. |
| Download exige autorização | PASSOU | Sessão e autorização de API. |
| Cliente confirma externamente e gestor aprova versão exata | PASSOU | Referência de confirmação, aprovação gerencial e vínculo à versão. |
| Solicitar aprovação, rejeitar e comentar em endpoints próprios | FALHOU | Upload/confirmação/aprovação existem; request/reject/comentários dedicados não. |
| Nova versão invalida aprovação anterior | PASSOU | Versão anterior vira `SUPERSEDED`; integração. |
| Reserva é atômica, rastreável e idempotente | PASSOU | Locks ordenados, movimentos imutáveis e UNIQUE por pedido/material. |
| Reserva altera reservado, não físico | PASSOU | E2E e integração: físico `10.000000`, reservado `2.500000`. |
| Falta de saldo bloqueia funcionário | PASSOU | `INSUFFICIENT_STOCK_REQUIRES_MANAGER`. |
| Gestor confirma saldo negativo com motivo | PASSOU | Segundo fluxo E2E e auditoria. |
| Falha em um material reverte toda reserva | PASSOU | Uma transação para todos os materiais. |
| Cancelamento gerencial libera por `RELEASE` | PASSOU | Integração confere delta inverso e histórico preservado. |
| Cancelamento com pagamento abre decisão sem reembolso automático | PARCIAL | Não há reembolso automático; decisão financeira completa requer ampliação. |
| Matriz de autorização aplicada na API | PASSOU | Gestor controla política, integração, aprovação, exceções e cancelamento; integração retorna `403`. |
| Logs/auditoria não expõem documento ou segredos | PASSOU | Sanitização específica e inspeção de ciphertext. |
| Interface cobre lista, detalhe, checklist, timeline, arte, sinal e reserva | PASSOU | Rotas web compiladas e E2E. |
| Interface cobre taxas, rotação/desconexão e histórico completo | FALHOU | Superfície complementar Asaas não implementada. |
| Stub simula autenticação, cliente, cobrança e confirmação | PASSOU | Stub determinístico local usado em integração/E2E. |
| Stub simula taxas, timeout, 400/429/500 e todos os eventos | FALHOU | Cenários amplos exigidos não foram implementados. |
| Concorrência completa do item 19 | PARCIAL | Conversão e deduplicação foram testadas; as demais combinações simultâneas não. |
| Migração funciona desde vazio e sobre dados anteriores | PASSOU | Verificador dedicado com contagens preservadas. |
| Rollback de transação | PASSOU | Inserção revertida e contagem zero. |
| Backup e restauração | PASSOU | Banco temporário restaurado e removido. |
| Banco principal não foi migrado | PASSOU | Apenas 1 migração Sprint 001; `orders_table=ABSENT`. |
| Regressão dos Sprints 001/002 | PASSOU | Integração compartilhada e E2E 3/3. |
| Gates obrigatórios finais retornam zero | PASSOU | Format, lint, typecheck, unitário, segurança, integração, E2E e build. |
| Homologação real Asaas Sandbox | BLOQUEADO | Variáveis seguras e URL HTTPS pública ausentes; script saiu 1 sem expor segredo. |
| Itens do Sprint 004 permanecem fora | PASSOU | Sem produção, consumo, qualidade, saldo final ou entrega. |

Matriz de autorização observada:

| Ação | Funcionário | Gestor |
| --- | --- | --- |
| Consultar/converter pedido e criar cobrança | Sim | Sim |
| Enviar/baixar/confirmar arte | Sim | Sim |
| Aprovar arte vigente | Não | Sim |
| Alterar política de sinal ou conexão Asaas | Não | Sim |
| Autorizar sinal/saldo insuficiente | Não | Sim |
| Reavaliar prontidão sem exceção | Sim | Sim |
| Cancelar pedido | Não | Sim |

### 6. Decisões e desvios

- A documentação oficial do Asaas foi consultada em 2026-11-06. A API atual usa
  `access_token`, cliente pagador exige CPF/CNPJ, o webhook usa
  `asaas-access-token`, entregas são ao menos uma vez e o evento precisa ser
  deduplicado. Referências: `https://docs.asaas.com/reference/create-new-customer`,
  `https://docs.asaas.com/docs/webhooks-faq`,
  `https://docs.asaas.com/docs/how-to-implement-idempotence-in-webhooks` e
  `https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint`.
- Não foi encontrada divergência de direção com ADR-005; a documentação atual
  reforçou inbox persistida antes do ACK, token separado e idempotência. A ausência
  de homologação impede validar comportamento real da conta.
- O endpoint implementado é `/api/v1/webhooks/asaas/payments`, variante mais
  específica do contrato sugerido. Pedidos usam `/api/v1/orders` e configurações
  usam `/api/v1/order-settings` e `/api/v1/integrations/asaas`.
- O estado agregado `PENDING_READINESS` simplificou estados intermediários do prompt.
  O checklist explica os bloqueios, mas a divergência foi marcada como falha, não
  como equivalência silenciosa.
- O aprendizado reutilizável foi registrado apenas como candidato local sanitizado;
  nada foi alterado ou publicado no `3E`.

### 7. Problemas e riscos

Erros completos relevantes encontrados:

```text
Error: Configuração de teste recusada: TEST_DATABASE_URL ausente.
```

```text
Error: Banco de teste recusado: TEST_DATABASE_URL aponta para o mesmo banco de DATABASE_URL.
```

```text
Error: Unknown option `--runInBand`
```

```text
Error: EPERM: operation not permitted, rename '<sandbox-temp>/.tmp-...'
```

```text
Error: EPERM: operation not permitted, mkdir
'C:\Users\tamba\Documents\ChatGPT\NORTH\apps\web\.next\server\app\_not-found.segments\_not-found'
```

```text
BLOQUEADO: homologação real exige variáveis seguras ausentes: ASAAS_API_KEY,
ASAAS_WEBHOOK_AUTH_TOKEN, ASAAS_WEBHOOK_PUBLIC_URL. Não informe segredos em
argumentos ou no repositório.
```

Falhas intermediárias corrigidas incluíram SQL com múltiplos comandos preparados,
chave de teste AES com 31 bytes, resolução do subpath
`@north/domain/fulfillment`, referência assíncrona inválida ao formulário React,
race de navegação E2E e 14 erros ESLint de `any` inseguro. As correções foram
validadas pelos gates finais.

Riscos residuais: a superfície Asaas ainda não satisfaz integralmente o prompt; o
stub cobre o caminho feliz principal, não substitui homologação; segredos cifrados em
backup continuam sensíveis; armazenamento privado local exige volume e política de
retenção em implantação; testes concorrentes ainda não cobrem todas as combinações
listadas. O Sprint 004 não deve começar sobre este estado sem correção/auditoria.

### 8. Como executar

1. Use Node 24 e PostgreSQL 18; configure a partir de `.env.example` sem versionar
   valores reais.
2. Defina `DATABASE_URL` explicitamente e execute `npm run db:migrate` somente no
   banco intencional.
3. Defina `NORTH_SECRET_MASTER_KEY` com 32 bytes aleatórios em hexadecimal ou
   base64 e monte `OBJECT_STORAGE_ROOT` como diretório privado persistente.
4. Execute o bootstrap documentado para uma instalação nova.
5. Inicie API, web e worker pelos scripts do `package.json`.
6. Como gestor, configure a política percentual de sinal e a conexão Sandbox; como
   usuário autorizado, converta um orçamento emitido, informe documento fictício,
   crie a cobrança, envie/confirme a arte e aguarde o webhook processado pelo worker.
7. Acesse o pedido para acompanhar checklist, timeline, sinal, arte, materiais,
   alertas e reserva.
8. Para testes, mantenha `DEVELOPMENT_DATABASE_URL` em `/north` e
   `TEST_DATABASE_URL` em `/north_test`. O E2E usa 3100/3101 e stub 3199.
9. Para homologação real, injete as três variáveis seguras fora de logs/CLI e execute
   `npm run asaas:sandbox:homologate`. Nunca use chave de produção.

### 9. Próximo passo recomendado

Auditar a branch publicada e executar uma revisão corretiva do próprio Sprint 003:
completar sinal fixo, meios/versionamento, taxas e política de repasse, validação
CPF/CNPJ, cartão hospedado, ciclo da conexão, endpoints de arte, stub e matriz de
concorrência; depois homologar o Asaas Sandbox com credenciais e URL HTTPS fornecidas
por canal seguro. Não iniciar o Sprint 004 e não fazer merge automático em `main`.
