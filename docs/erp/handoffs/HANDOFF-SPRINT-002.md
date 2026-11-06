# Handoff — Sprint 002

### 1. Resultado

**CONCLUÍDO.** A branch `sprint-002-catalogo-orcamento` entrega o incremento vertical
de catálogo, ficha técnica, precificação e orçamento versionado. O commit de
implementação é `d504940` (`feat: deliver sprint 002 catalog and versioned quotes`).

O gestor consegue configurar produtos, variantes, técnicas, combinações, fichas
técnicas versionadas, componentes adicionais, método de formação de preço e opções
e limites de desconto. Gestor e funcionário conseguem cadastrar clientes, montar,
simular e emitir orçamentos. A emissão captura cliente, ficha, consumo, perda,
custos, disponibilidade, política, desconto e preços em snapshots estruturados e
imutáveis. Uma revisão explícita recalcula com os dados vigentes e preserva o
documento anterior.

O fluxo foi comprovado pela API, interface, PostgreSQL real e E2E isolado. Orçamentos
não criam pedidos, movimentos ou reservas de estoque. Asaas, arte, pedido, produção,
arquivos, PDF e demais itens previstos para incrementos posteriores não foram
iniciados.

### 2. Alterações

**Aplicação API**

- `apps/api/src/app.module.ts`
- `apps/api/src/catalog-repository.ts`
- `apps/api/src/commercial-controllers.ts`
- `apps/api/src/commercial-shared.ts`
- `apps/api/src/quote-repository.ts`
- `apps/api/src/sprint-001.integration.test.ts`

**Aplicação web**

- `apps/web/app/catalog/page.tsx`
- `apps/web/app/customers/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/materials/[id]/page.tsx`
- `apps/web/app/pricing/page.tsx`
- `apps/web/app/quotes/page.tsx`
- `apps/web/app/quotes/[id]/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/app/technical-sheets/page.tsx`

**Domínio e contratos**

- `packages/contracts/src/commercial.ts`
- `packages/contracts/src/index.ts`
- `packages/domain/package.json`
- `packages/domain/src/commercial.ts`
- `packages/domain/src/commercial.unit.test.ts`

**Banco e infraestrutura**

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261105180000_sprint_002_catalog_quotes/migration.sql`
- `packages/database/prisma/migrations/20261105200000_sprint_002_discount_options/migration.sql`
- `packages/database/src/index.ts`
- `packages/testing/src/reset-database.ts`
- `packages/testing/src/verify-sprint-002-migration.ts`
- `eslint.config.mjs`
- `package.json`
- `tsconfig.json`

**Testes e evidências**

- `e2e/sprint-002.spec.ts`
- `docs/erp/evidence/sprint-002-issued-quote.png`

**Documentação**

- `README.md`
- `docs/erp/INDEX.md`
- `docs/erp/11-roadmap.md`
- `docs/erp/sprints/SPRINT-002-catalogo-orcamento.md`
- `docs/erp/handoffs/HANDOFF-SPRINT-002.md`

O submódulo `3E` já estava modificado localmente. Nenhum arquivo interno dele foi
formatado, preparado, versionado ou publicado.

### 3. Banco e migrações

Foram adicionadas duas migrações cumulativas e não destrutivas:

- `20261105180000_sprint_002_catalog_quotes`: clientes, catálogo, combinações,
  fichas e componentes, políticas e componentes de preço, orçamentos, itens,
  snapshots materiais/comerciais, sequência de número, chaves de auditoria,
  índices, constraints e triggers de imutabilidade;
- `20261105200000_sprint_002_discount_options`: opções versionadas de desconto com
  integridade referencial e proteção append-only.

UUIDs, estados explícitos, atores, timestamps, versões otimistas, centavos inteiros,
pontos-base e `numeric(18,6)` foram mantidos no banco. A restrição de uma única ficha
ativa por combinação usa índice parcial. Emissão, ativação, revisão e mudanças de
política são transacionais e idempotentes; transações serializáveis com `40001` são
repetidas de forma limitada para resolver concorrência real sem snapshot híbrido.

A verificação automatizada aplicou as migrações em schema vazio e sobre um schema do
Sprint 001 com dados. Resultado preservado: `users=1`, `materials=1`,
`movements=1`, `balances=1`, `audits=1`, físico `7.000000` e reservado `2.000000`.

A restauração foi repetida em um banco temporário separado:

```text
north_restore_sprint002_handoff|3|26|6|26|79|5|7
```

As colunas representam banco, usuários, materiais, movimentos, saldos, auditorias,
orçamentos e opções de desconto. O banco e o arquivo temporários foram removidos
após a conferência. `north` não recebeu as migrações do Sprint 002 e permaneceu com:

```json
{"database":"north","users":3,"materials":24,"movements":5,"balances":24,"audits":45,"quotes_relation":false,"reserved_sum":"0.000000"}
```

Aplicação da migração, após configurar `DATABASE_URL` para o banco intencional:

```powershell
npm run db:migrate
```

### 4. Comandos executados

| Comando | Código | Resultado |
| --- | ---: | --- |
| `git rev-parse HEAD` | 0 | Baseline confirmado em `013bc8d92733796c0e43a296eee207f878d09254`. |
| `git branch --show-current` | 0 | Branch inicial `main`; trabalho criado em `sprint-002-catalogo-orcamento`. |
| `git remote -v` | 0 | Remote confirmado como `https://github.com/vncs06/NORTH.git`. |
| `npm run format:check` | 1 | Detectou somente `apps/api/src/commercial-controllers.ts`. |
| `npx prettier --write apps/api/src/commercial-controllers.ts` | 0 | Formatação normalizada. |
| `npm run format:check` | 0 | Todos os arquivos compatíveis com Prettier. |
| `npm run lint` | 0 | ESLint sem warnings. |
| `npm run typecheck` | 0 | TypeScript sem erros. |
| `npm run test` | 0 | 4 arquivos e 23 testes unitários aprovados. |
| `npm run test:integration` com URL incorreta `postgresql://postgres:postgres@localhost:5432/north_test` | 1 | Autenticação PostgreSQL recusada; não houve mutação. |
| `$env:TEST_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north_test?schema=public'; $env:DEVELOPMENT_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north?schema=public'; npm run test:integration` | 0 | 1 arquivo, 11 testes PostgreSQL/HTTP aprovados. |
| `npm run test:database-safety` | 0 | 9 testes de isolamento e segurança aprovados. |
| `$env:TEST_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north_test?schema=public'; $env:DEVELOPMENT_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north?schema=public'; npm run db:test:verify-sprint-002-migration` | 0 | Migração vazia e sobre Sprint 001 aprovadas. |
| `$env:TEST_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north_test?schema=public'; $env:DEVELOPMENT_DATABASE_URL='postgresql://north:north_dev_only@localhost:5432/north?schema=public'; $env:E2E_WEB_PORT=3100; $env:E2E_API_PORT=3101; npm run test:e2e` | 0 | 2 fluxos E2E aprovados em 34,1 s. |
| `$env:NEXT_DIST_DIR='.next-e2e'; npm run build` | 0 | API, worker e 13 páginas Next compilados. |
| `docker exec north-erp-postgres-1 pg_dump -U north -d north_test -Fc -f /tmp/north_sprint002_handoff.dump` | 0 | Backup de teste criado. |
| `docker exec north-erp-postgres-1 createdb -U north north_restore_sprint002_handoff` | 0 | Banco temporário isolado criado. |
| `docker exec north-erp-postgres-1 pg_restore -U north -d north_restore_sprint002_handoff /tmp/north_sprint002_handoff.dump` | 0 | Backup restaurado. |
| `docker exec north-erp-postgres-1 psql -U north -d north_restore_sprint002_handoff -tAc "SELECT ..."` | 0 | Contagens e dados restaurados conferidos. |
| `docker exec north-erp-postgres-1 dropdb -U north north_restore_sprint002_handoff` | 0 | Somente banco temporário removido. |
| `docker exec north-erp-postgres-1 rm -f /tmp/north_sprint002_handoff.dump` | 0 | Somente arquivo temporário removido. |
| Consulta Node/`pg` somente leitura em `north` | 0 | Contagens originais e reserva zero confirmadas; tabela `quotes` ausente. |
| `git diff --cached --check` | 0 | Nenhum erro de whitespace no commit. |
| `git commit -m "feat: deliver sprint 002 catalog and versioned quotes"` | 0 | Commit `d504940`, 35 arquivos, 6.891 inserções e 44 remoções. |

### 5. Matriz de aceite

| Critério | Estado | Evidência |
| --- | --- | --- |
| Cliente PF/PJ persistido, buscável, paginado, versionado e auditado | PASSOU | API/UI e integração; auditoria sanitizada sem e-mail, telefone ou observação. |
| Catálogo genérico representa caneca, camisa e outras combinações | PASSOU | Produto, variante, técnica e combinação sem tabelas setoriais. |
| Catálogo é configurável somente pelo gestor | PASSOU | Matriz HTTP retorna `403` ao funcionário. |
| Ficha possui `DRAFT`, `ACTIVE` e `ARCHIVED` | PASSOU | Domínio, constraints e testes de transição. |
| Uma única ficha ativa por combinação | PASSOU | Índice parcial e teste concorrente PostgreSQL. |
| Ativação arquiva a versão anterior na mesma transação | PASSOU | Repositório transacional e integração. |
| Ficha ativa/arquivada não é sobrescrita | PASSOU | API exige revisão; snapshots continuam consultáveis. |
| Material ativo, unidade-base e custo vigente são validados | PASSOU | Ativação/emissão rejeitam material inválido ou custo ausente. |
| Consumo por rendimento e perda usa decimal exato/`HALF_UP` | PASSOU | Unidade e integração validam base, perda e total em seis casas. |
| Disponibilidade e insuficiência são explicáveis sem bloquear orçamento | PASSOU | Snapshot material guarda físico, reservado, disponível e aviso. |
| Orçamento não movimenta nem reserva estoque | PASSOU | Integração e E2E com contagens antes/depois; `reserved_quantity` inalterada. |
| Custos vigentes são usados e congelados | PASSOU | Mudança posterior de custo não altera emitido. |
| Componentes fixo/orçamento, fixo/unidade e percentual funcionam | PASSOU | Domínio, política e snapshots estruturados. |
| Markup e margem são fórmulas distintas e explicáveis | PASSOU | 23 testes unitários e composição mostrada na UI. |
| Opções e limites de desconto são versionados | PASSOU | Migração própria, política e endpoints de consulta. |
| Funcionário não ultrapassa limite ou opção disponível | PASSOU | `DISCOUNT_LIMIT_EXCEEDED` e `DISCOUNT_OPTION_NOT_AVAILABLE` em integração. |
| Ajuste manual exige gestor e motivo | PASSOU | API retorna `403` ao funcionário e valida motivo. |
| Emissão exige cliente ativo, item, ficha e custos completos | PASSOU | Validações HTTP e rollback comprovado em integração. |
| Número comercial é único sob concorrência | PASSOU | Sequência transacional e emissão concorrente. |
| Emissão é idempotente e payload divergente conflita | PASSOU | Mesmo payload retorna original; divergência retorna `409 IDEMPOTENCY_KEY_REUSED`. |
| Snapshot emitido é estruturado e imutável | PASSOU | Tabelas de snapshot, triggers e testes após alteração de custo/ficha/política. |
| Documento emitido não tem vencimento automático | PASSOU | Modelo não possui `expires_at`. |
| Revisão preserva anterior e usa dados atuais | PASSOU | Nova revisão nasce `DRAFT`; anterior só fica `SUPERSEDED` ao emitir. |
| Revisões concorrentes não corrompem versões | PASSOU | Transação serializável com repetição de `40001`. |
| Cancelamento é gerencial e não exclui registro | PASSOU | Autorização de servidor, estado `CANCELLED` e auditoria. |
| API aplica toda a matriz de autorização | PASSOU | Testes HTTP cobrem gestor/funcionário e respostas `401/403`. |
| Logs, erros e auditoria não expõem dados pessoais ou segredos | PASSOU | Integração inspeciona auditoria; filtro global devolve erro seguro/correlação. |
| Interface cobre clientes, catálogo, ficha, preço e orçamento | PASSOU | Rotas compiladas, E2E e captura `sprint-002-issued-quote.png`. |
| Interface mostra consumo, custo, perda, estoque, desconto e preço | PASSOU | Construtor e detalhe emitido exercitados no E2E. |
| HTML de orçamento é imprimível | PASSOU | CSS `@media print` e detalhe dedicado. |
| Migração funciona desde vazio | PASSOU | Verificador criou schema temporário vazio com as três migrações. |
| Migração preserva dados do Sprint 001 | PASSOU | Contagens e saldos preservados; restauração independente aprovada. |
| Banco principal permaneceu intacto | PASSOU | `north` manteve `3/24/5/24/45`, sem `quotes`, reserva total zero. |
| Regressão do Sprint 001 permanece aprovada | PASSOU | Integração compartilhada e E2E do Sprint 001 aprovados. |
| Todos os gates obrigatórios retornaram zero no estado final | PASSOU | Format, lint, typecheck, unitário, integração, E2E e build aprovados. |
| Fora de escopo permaneceu fora | PASSOU | Nenhum pedido, arte, Asaas, cobrança, produção, IA, n8n, PDF ou Sprint 003. |

Exemplo numérico reproduzível do E2E/domínio:

```text
quantidade = 3; rendimento = 1; componente = 1; perda = 500 bps
consumo_base = 3.000000
consumo_com_perda = 3.150000
custo_unitário = 1000 centavos; custo_material = 3150 centavos
componente fixo/unidade = 200 * 3 = 600 centavos
custo_base = 3750 centavos
markup = 5000 bps; preço sugerido = 5625 centavos
desconto = 500 bps; impacto HALF_UP = 281 centavos
preço final = 5344 centavos
```

Após custo unitário de 1.400 centavos, uma revisão com margem de 40% e desconto de
3% produz custo material de 4.410, preço sugerido de 7.350, desconto de 221 e preço
final de 7.129 centavos, sem modificar os 5.344 centavos emitidos anteriormente.

### 6. Decisões e desvios

- A inconsistência do `INDEX.md` foi reconciliada sem apagar o histórico: Sprint 001
  concluído em `013bc8d`, M1 concluído e M2A/Sprint 002 concluído nesta branch.
- Componentes adicionais e opções de desconto são versões filhas da política. Isso
  permite reconstruir a composição sem depender de JSON opaco.
- Snapshots JSON sanitizados coexistem com linhas estruturadas para consulta,
  constraints e testes.
- O domínio usa inteiros/`bigint` e divisão racional com `HALF_UP`; valores decimais
  vindos do PostgreSQL permanecem strings até a conversão exata. `number` não é
  usado para persistir cálculos monetários ou quantidades.
- A emissão usa transação serializável e leitura consistente de ficha, custos e
  política. O retry limitado de `40001` foi necessário para a revisão concorrente.
- O build web usa `NEXT_DIST_DIR=.next-e2e` para não colidir com o desenvolvimento
  ativo em `.next`; isso não altera contrato ou comportamento da aplicação.
- O endpoint de política para funcionário remove valores internos desnecessários e
  limita as opções exibidas ao teto operacional do papel.
- Nenhuma decisão de dinheiro, estoque, permissão, privacidade ou contrato foi
  reinterpretada. Não houve desvio funcional do Sprint 002.

### 7. Problemas e riscos

Falhas encontradas e resolvidas durante a execução:

```text
Error: Configuração de teste recusada: TEST_DATABASE_URL ausente.
Node.js v24.18.0
```

O runner recusou corretamente executar testes destrutivos sem banco dedicado.

```text
AggregateError [EACCES]
connect EACCES ::1:5432
connect EACCES 127.0.0.1:5432
```

O sandbox bloqueou a conexão local; a suíte foi repetida com autorização controlada.

```text
error: password authentication failed for user "postgres"
severity: 'FATAL'
code: '28P01'
file: 'auth.c'
line: '317'
routine: 'auth_failed'
Node.js v24.18.0
```

A repetição usou o usuário local documentado `north` e passou.

```text
INTERNAL_ERROR diagnostic error:40001
AssertionError: expected [ 201, 500 ] to deeply equal [ 201, 201 ]
```

A revisão simultânea revelou serialização não repetida. Foi implementado retry
limitado de `40001`; o teste concorrente passou.

```text
Module not found: Can't resolve './commercial.js'
packages/domain/src/index.ts
```

O Next resolvia o source do workspace. O domínio comercial recebeu export de
subpath explícito e o build passou.

```text
EPERM: operation not permitted, mkdir '.next'
EPERM: operation not permitted, mkdir '.next-e2e'
```

Build/Vitest também encontraram `EPERM` para temporários no sandbox. A repetição
autorizada e isolada passou; não houve relaxamento de teste.

```text
Error: strict mode violation: getByText('R$ 44,10') resolved to 3 elements
```

O seletor E2E foi tornado específico ao primeiro resumo de valor; o fluxo passou.

```text
psql: The term 'psql' is not recognized as a name of a cmdlet, function,
script file, or executable program.
```

A prova somente leitura de `north` foi executada com o driver `pg` já instalado.

Riscos residuais: o Sprint 002 não envia propostas nem converte orçamento em pedido;
esses contratos devem ser tratados apenas no incremento seguinte. Crescimento de
snapshots e auditoria deverá ser acompanhado operacionalmente. O submódulo `3E`
continua modificado pelo usuário e deve permanecer fora de commits do NORTH até uma
decisão explícita.

### 8. Como executar

1. Use Node 24 e PostgreSQL 18; copie `.env.example` para a configuração local sem
   versionar credenciais.
2. Instale dependências com `npm install`.
3. Aponte `DATABASE_URL` explicitamente para o banco desejado e execute
   `npm run db:migrate`.
4. Se for uma instalação nova, execute `npm run db:bootstrap` com as variáveis de
   bootstrap definidas no ambiente.
5. Inicie API, web e worker com `npm run dev`; o desenvolvimento usa 3001/3000.
6. Entre como gestor, registre custo vigente nos materiais, configure catálogo,
   combinação, ficha ativa e política de preço/desconto.
7. Cadastre um cliente, crie um orçamento, simule, emita e abra o detalhe imprimível.
8. Para validar isoladamente, configure `TEST_DATABASE_URL` terminando em
   `/north_test`, mantenha `DEVELOPMENT_DATABASE_URL` em `/north` e execute os sete
   gates listados na seção 4. O E2E usa exclusivamente 3100/3101.

### 9. Próximo passo recomendado

Auditar e aceitar a branch publicada do Sprint 002. Somente depois da aceitação,
planejar o incremento M2B com conversão explícita de orçamento em pedido, arte,
reserva e sinal/Asaas. Não fazer merge automático e não iniciar o Sprint 003 antes
dessa auditoria.
