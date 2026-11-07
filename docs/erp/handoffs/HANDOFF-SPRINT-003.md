# Handoff — Sprint 003 R1

## 1. Resultado

`PARCIAL`. A revisão corretiva local foi completada na branch
`sprint-003-r1-asaas-completion`, criada do baseline `3da295b`. Os onze requisitos
locais do Prompt 003-R1 passaram; a homologação real no Asaas Sandbox está
`BLOQUEADA` porque `ASAAS_ENVIRONMENT`, `ASAAS_API_KEY`,
`ASAAS_WEBHOOK_AUTH_TOKEN` e `ASAAS_WEBHOOK_PUBLIC_URL` não estavam presentes.
Nenhuma evidência externa foi fabricada e o Sprint 004 não foi iniciado.

O fluxo orçamento -> pedido -> sinal -> arte -> Webhook -> reserva ->
`READY_FOR_PRODUCTION` continua executável. Foram aprovados 33 testes unitários, 9
testes de segurança do banco, 23 testes de integração PostgreSQL e 3 fluxos E2E. A
migração corretiva, o backup/restauração e o build passaram. O commit corretivo é
`97a3962` (`fix: complete sprint 003 Asaas correction`) e o handoff inicial é
`cea9eaa` (`docs: record sprint 003 r1 handoff`). A publicação da branch foi
confirmada; o commit que contém esta linha registra essa evidência final.

## 2. Alterações

- sinal versionado em `PERCENTAGE` e `FIXED_AMOUNT`, com campos mutuamente
  exclusivos, decisão explícita para valor acima do pedido e snapshot imutável;
- consulta `GET /v3/myAccount/fees/` com `access_token`, `User-Agent`, sem body,
  estados `NOT_FETCHED/AVAILABLE/STALE/FAILED` e erros sanitizados;
- política versionada `ABSORB/PASS_THROUGH` para PIX, boleto e cartão, associada ao
  snapshot da taxa e congelada no orçamento/pedido/cobrança;
- rotação valida chave e taxas antes da troca; falha preserva a chave anterior;
- desconexão analisa outbox/cobranças/reconciliação, desativa o Webhook antes de
  remover os segredos e preserva todo o histórico;
- cartão cria cobrança e expõe somente URL hospedada validada; nenhum campo de
  cartão é aceito ou persistido;
- CPF/CNPJ normalizados, validados por dígitos, compatíveis com PF/PJ, mascarados,
  indexados por HMAC e armazenados cifrados;
- endpoints explícitos de arte `request-approval` e `reject`, com autorização,
  motivo, origem, idempotência e histórico;
- stub determinístico para autenticação, taxas, clientes, cobranças, Webhooks,
  timeouts, reconciliação, retry, duplicidade e eventos fora de ordem;
- vinte cenários concorrentes com PostgreSQL real, incluindo `40001`;
- preflight de Sandbox sem impressão de segredo e candidato de aprendizado local
  `LC-004`, sem modificar a skill/submódulo `3E`.

Exemplo reproduzível: pedido de R$ 300,00 com sinal fixo de R$ 50,00 preserva sinal
de 5.000 centavos e saldo de 25.000; com política de 50%, o sinal é 15.000. Para PIX
de taxa fixa de 99 centavos, `ABSORB` mantém bruto 30.000 e líquido estimado 29.901;
`PASS_THROUGH` apresenta 30.099 ao cliente e preserva a composição no snapshot.

Arquivos alterados:

- `.env.example`, `README.md`, `package.json`, `vitest.integration.config.ts`;
- `apps/api/src/{app.module,fulfillment-controllers,fulfillment-infrastructure,fulfillment-repository,quote-repository,sprint-003.integration.test}.ts`;
- `apps/web/app/orders/[id]/page.tsx` e `apps/web/app/settings/orders/page.tsx`;
- `packages/contracts/src/fulfillment.ts`;
- `packages/domain/src/fulfillment.ts` e `fulfillment.unit.test.ts`;
- `packages/database/prisma/schema.prisma` e a migração R1;
- `packages/testing/src/{asaas-stub,homologate-asaas-sandbox,integration-setup,verify-sprint-003-r1-migration}.ts`;
- `e2e/sprint-003.spec.ts` e `docs/erp/evidence/sprint-003-ready-order.png`;
- `docs/erp/{INDEX,11-roadmap}.md`, especificação do Sprint 003, este handoff e
  `docs/erp/learning-candidates/LC-004-asaas-credencial-taxas-desconexao.md`.

## 3. Banco e migrações

Migração incremental:
`20261107120000_sprint_003_r1_asaas_completion`. Ela parte da migração publicada do
Sprint 003, mantém compatibilidade com os registros existentes e adiciona modos de
sinal, estados/ciclo Asaas, snapshots e políticas de taxas, cartão, operações da
conexão e metadados/transições de arte com constraints e índices.

O verificador demonstrou cadeia desde banco vazio, upgrade sobre Sprint 003 com um
registro de política/conexão/auditoria preservado e rollback lógico. Um dump em
formato custom de `north_test` foi restaurado em
`north_test_restore_sprint003_r1`: 5 migrações, 2 pedidos, 2 cobranças, 3 versões de
arte e 2 reservas. O banco e o dump temporários foram removidos após a prova.

O banco principal permaneceu intacto. Consulta somente leitura retornou:
`north|1|20261105120000_sprint_001|||3|24|5|45`: uma migração (Sprint 001), ausência
de `orders` e `asaas_fee_snapshots`, 3 usuários, 24 materiais, 5 movimentos e 45
eventos de auditoria. Nenhum teste aplicou migração, reset ou bootstrap em `north`.

## 4. Comandos executados

| Comando | Código | Evidência |
| --- | ---: | --- |
| `npm run format:check` | 0 | todos os arquivos em padrão Prettier |
| `npm run lint` | 0 | ESLint sem warnings; uma execução anterior apontou 9 erros tipográficos, corrigidos sem supressão |
| `npm run typecheck` | 0 | TypeScript sem erros |
| `npm run test` | 0 | 5 arquivos, 33 testes |
| `npm run test:database-safety` | 0 | 1 arquivo, 9 testes |
| `npm run test:integration` com URLs explícitas | 0 | 2 arquivos, 23 testes PostgreSQL |
| `npm run test:e2e` com URLs explícitas | 0 | 3 fluxos, portas 3100/3101, stub 3199 |
| `npm run build` | 0 | API, worker e 15 rotas web compiladas |
| `npm run db:test:verify-sprint-003-r1-migration` | 0 | vazio, upgrade e rollback passaram |
| `npm run asaas:sandbox:homologate` | 1 | bloqueio seguro pelas quatro variáveis ausentes |
| `pg_dump` / `createdb` / `pg_restore` / consulta / `dropdb` | 0 | backup e restauração temporária validados |
| varredura por API key, token, documento aberto e URL secreta | sem achados | nenhum segredo/dado real no diff |
| `git diff --check` | 0 | sem erro de whitespace |
| `git push -u origin sprint-003-r1-asaas-completion` | 0 | nova branch publicada, sem force push ou merge |

Ocorrências completas relevantes:

```text
Error: Configuração de teste recusada: TEST_DATABASE_URL ausente.
```

```text
Error: expect(locator).toBeVisible() failed
Locator: getByText(/Nova chave validada e ativada/)
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```

A segunda ocorrência revelou acesso a `event.currentTarget` após `await`; a referência
do formulário passou a ser capturada antes da operação e o E2E passou. O primeiro
build não escalado falhou por restrição local, não por compilação:

```text
Error: EPERM: operation not permitted, mkdir
'C:\Users\tamba\Documents\ChatGPT\NORTH\apps\web\.next\server\app\materials.segments\materials'
```

Reexecutado com permissão adequada, retornou 0. O preflight real retornou:

```text
Preflight Asaas: ambiente=ausente; URL=ausente; variáveis=ausentes:
ASAAS_ENVIRONMENT, ASAAS_API_KEY, ASAAS_WEBHOOK_AUTH_TOKEN, ASAAS_WEBHOOK_PUBLIC_URL.
BLOQUEADO: homologação real exige variáveis seguras ausentes.
```

## 5. Matriz de aceite

| Pendência original | Estado | Evidência |
| --- | --- | --- |
| Sinal fixo | PASSOU | domínio, constraints, integração e E2E; percentual preservado |
| Taxas reais | PASSOU | contrato oficial `/v3/myAccount/fees/`, normalização, snapshot e stub |
| Absorção/repasse | PASSOU | política versionada por meio e snapshots de orçamento/cobrança |
| Rotação | PASSOU | validação prévia, troca atômica, concorrência e E2E |
| Desconexão | PASSOU | análise de impacto, Webhook removido antes do segredo e histórico preservado |
| Cartão hospedado | PASSOU | URL allowlisted, sem campos sensíveis, cobrança acompanha Webhook |
| CPF/CNPJ | PASSOU | vetores de dígito/máscara/repetição/tipo e armazenamento protegido |
| Solicitar arte | PASSOU | endpoint e transição `DRAFT -> AWAITING_CUSTOMER_APPROVAL` idempotentes |
| Rejeitar arte | PASSOU | endpoint gerencial, motivo/origem/data e histórico preservado |
| Stub completo | PASSOU | auth, taxas, clientes, cobranças, Webhooks, erros, timeout e estatísticas |
| Concorrência completa | PASSOU | 20 cenários PostgreSQL, estado final e `40001` comprovados |
| Sandbox real | BLOQUEADO | faltam as quatro variáveis seguras e uma URL HTTPS pública |

## 6. Decisões e desvios

- ADR-005 foi mantida: integração assíncrona, segregação de segredo, Webhook
  idempotente e Sandbox. ADR-002/006/012/013 seguem governando reserva e finanças.
- Documento oficial do Asaas consultado em 2026-11-07: Sandbox, autenticação/API
  keys, clientes, cobranças, taxas da conta e Webhooks. Não foi encontrada mudança
  incompatível; a condição efetiva da cobrança pode prevalecer sobre a estimativa.
- Um orçamento antigo sem taxa converte somente sob `ABSORB`; `PASS_THROUGH` exige
  revisão e nunca altera diretamente o pedido.
- A URL hospedada é validada contra HTTPS/hosts Asaas (e host local apenas em teste).
- Não foi criada desconexão forçada: sem comprovação de remoção externa, o estado
  permanece pendente/erro e o segredo necessário é preservado.
- A ausência de credenciais é o único desvio do resultado integral; portanto o
  estado correto é `PARCIAL`, não “concluído com ressalvas”.

## 7. Problemas e riscos

- Homologação real não executada: nenhuma das quatro variáveis exigidas estava
  configurada. Continua faltando comprovar chamada real, cliente/cobrança fictícios,
  Webhook público, reenvio e reserva contra o Sandbox.
- Taxas são estimativas versionadas; o valor efetivo informado na cobrança pode
  divergir e deve prevalecer na evolução financeira posterior.
- O preflight cria recursos fictícios quando todas as variáveis estão presentes;
  deve ser usado somente em Sandbox e com URL pública controlada.
- `3E` continua com modificação local preexistente (`m 3E`) e foi excluído de toda
  formatação, stage, commit e publicação.
- O banco temporário e o dump de restauração foram apagados após validação; eram
  descartáveis e a origem `north_test` permanece disponível.

## 8. Como executar

1. Suba o PostgreSQL local e mantenha `DATABASE_URL` apontando para `north`.
2. Defina separadamente `TEST_DATABASE_URL` para o banco allowlisted `north_test` e
   `DEVELOPMENT_DATABASE_URL` para `north`.
3. Execute `npm run db:test:prepare`, `npm run db:test:migrate` e os gates da seção 4.
4. Para homologar, injete fora do repositório `ASAAS_ENVIRONMENT=SANDBOX`, API key,
   token de Webhook e URL HTTPS pública; execute `npm run asaas:sandbox:homologate`.
5. Nunca use host de Produção, não grave as variáveis em `.env.example` e não cole
   os segredos em chat ou handoff.

## 9. Próximo passo recomendado

Disponibilizar as quatro variáveis por um canal seguro e executar a homologação real
do Sandbox. Se os doze itens da matriz então passarem, atualizar o Sprint 003 para
`CONCLUÍDO` em uma revisão auditada. Até lá, manter M2B `PARCIAL`, não mesclar
automaticamente em `main` e não iniciar o Sprint 004.
