# Handoff — Sprint 003 R2

## 1. Resultado

**CONCLUÍDO.** O Sprint 003 agora entrega configuração autônoma do Asaas por
instalação, sem conta financeira central do NORTH e sem dependência de credenciais
externas no código-base. O fluxo demonstrado localmente foi:

`NOT_CONFIGURED -> onboarding gerencial -> validação no stub estrito -> taxas ->
Webhook reconciliado -> ACTIVE -> PIX habilitado -> cobrança -> Webhook -> sinal ->
reserva única -> READY_FOR_PRODUCTION`.

A homologação com uma conta real não foi executada nem simulada como evidência; sua
classificação formal é **PENDENTE DE IMPLANTAÇÃO POR EMPRESA**.

- branch: `sprint-003-r2-asaas-self-service`;
- baseline: `ebcdfb58813deff60a775566c57d828aa79002d6`;
- commit técnico: `139209edff87092fa4886bb5bed384285c870216`;
- upstream: será confirmado após a publicação desta branch;
- `main` local e remoto permaneceram em `013bc8d92733796c0e43a296eee207f878d09254`;
- o submódulo `3E` continua com a modificação local preexistente e não foi alterado,
  formatado, stageado ou publicado.

## 2. Alterações

### API, domínio e contratos

- `apps/api/src/fulfillment-controllers.ts`: contratos gerenciais para conectar,
  gerar/rotacionar token, habilitar meios, atualizar taxas, rotacionar chave e
  desconectar; leitura operacional sem retorno de segredos.
- `apps/api/src/fulfillment-infrastructure.ts`: URL confiável derivada de
  `NORTH_PUBLIC_BASE_URL`, hosts fixos por ambiente, contrato completo de Webhook,
  listagem/reconciliação e atualização de Webhook.
- `apps/api/src/fulfillment-repository.ts`: ciclo de estados, validação transacional,
  idempotência, locks consultivos, criptografia de chave/token/e-mail, taxas,
  meios inicialmente desabilitados, rotação segura, desconexão e bloqueio de
  cobrança sem conexão ativa.
- `packages/contracts/src/fulfillment.ts`: ambiente, e-mail, token, meios e rotação.
- `packages/domain/src/fulfillment.ts`: estados e transições, compatibilidade da
  chave com o ambiente e mascaramento de e-mail.

### Banco

- `packages/database/prisma/schema.prisma`.
- `packages/database/prisma/migrations/20261108120000_sprint_003_r2_asaas_self_service/migration.sql`.
- `packages/testing/src/reset-database.ts`.
- `packages/testing/src/verify-sprint-003-r2-migration.ts`.

### Interface

- `apps/web/app/settings/orders/page.tsx`: assistente gerencial em seis etapas,
  avisos Sandbox/Produção, chave e token não repostos, geração explícita de token,
  e-mail de alertas, URL somente leitura, taxas, meios, rotação e desconexão.

### Testes e ferramentas

- `apps/api/src/fulfillment-infrastructure.unit.test.ts`.
- `apps/api/src/sprint-003.integration.test.ts`.
- `packages/domain/src/fulfillment.unit.test.ts`.
- `packages/testing/src/asaas-stub.ts`: contrato estrito, ambientes, timeout após
  criação, reconciliação e sanitização das estatísticas.
- `e2e/sprint-003.spec.ts`.
- `packages/testing/src/{run-with-test-database,start-e2e-service}.ts`.
- `packages/testing/src/homologate-asaas-sandbox.ts`: ferramenta opcional de
  implantação; não lê credenciais nem cria recursos paralelos.

### Documentação e configuração

- `.env.example`, `README.md`, `package.json`.
- `docs/erp/{INDEX,02-business-rules,07-security-permissions,08-integrations,09-ux-guidelines,10-test-strategy,11-roadmap}.md`.
- `docs/erp/decisions/ADR-005-asaas.md`.
- `docs/erp/sprints/SPRINT-003-pedido-arte-sinal-reserva.md`.
- `docs/erp/deployment/asaas-onboarding.md`.
- este handoff.

## 3. Banco e migrações

A migração incremental
`20261108120000_sprint_003_r2_asaas_self_service` preserva o schema R1, converte
estados antigos incompletos para revisão, adiciona metadados cifrados de e-mail,
contrato do Webhook, falhas/validações e a tabela de meios de pagamento inicialmente
desabilitados. Constraints impedem conexão `ACTIVE` incompleta e mais de uma
conexão lógica corrente.

O verificador demonstrou:

- cadeia desde banco vazio: 6 migrações e tabela `asaas_payment_methods`;
- upgrade R1 com dados: conexão e auditoria preservadas, estado migrado para
  `CONFIGURING` em vez de ativação indevida;
- rollback lógico em falha;
- backup custom de `north_test` restaurado em
  `north_test_restore_sprint003_r2`: `6` migrações, `1` conexão, `3` meios,
  `2` pedidos e `2` reservas; banco e dump temporários removidos.

O banco principal foi consultado apenas em leitura e retornou
`north|1|20261105120000_sprint_001|||3|24|5|45`: uma migração (Sprint 001), sem
`orders` e sem `asaas_connections`, com 3 usuários, 24 materiais, 5 movimentos e
45 eventos de auditoria. Nenhum teste, reset, bootstrap ou migração atingiu `north`.

## 4. Comandos executados

| Comando | Código | Resultado real |
| --- | ---: | --- |
| `npm run format:check` | 0 | todos os arquivos no padrão Prettier |
| `npm run lint` | 0 | ESLint sem warnings |
| `npm run typecheck` | 0 | TypeScript sem erros |
| `npm run test` | 0 | 6 arquivos, 38 testes |
| `npm run test:database-safety` | 0 | 1 arquivo, 9 testes |
| `npm run test:integration` com URLs de banco injetadas e protegidas | 0 | 2 arquivos, 23 testes PostgreSQL |
| `npm run test:e2e` com `north_test` e portas 3100/3101 | 0 | 3 fluxos em 40,1 s |
| `npm run build` | 0 | API, worker e web compilados; 15 rotas web |
| `npm run db:test:verify-sprint-003-r1-migration` | 0 | vazio, upgrade e rollback passaram |
| `npm run db:test:verify-sprint-003-r2-migration` | 0 | vazio, upgrade R1 e rollback passaram |
| `npm run asaas:sandbox:homologate` | 0 | informou `PENDENTE DE IMPLANTAÇÃO POR EMPRESA`; nenhuma chamada externa |
| `pg_dump` / `createdb` / `pg_restore` / consulta / `dropdb` no contêiner local | 0 | restauração temporária validada e removida |
| consulta somente leitura em `north` | 0 | banco principal preservado no Sprint 001 |
| varredura por chaves Asaas, private keys, dumps e nomes de credenciais | 0 | nenhum achado |
| `git diff --check` | 0 | sem erro de whitespace após correção da migração |

Ocorrências completas relevantes encontradas e tratadas:

```text
Error: Configuração de teste recusada: TEST_DATABASE_URL ausente.
```

Foi a proteção esperada ao tentar iniciar banco de teste sem URL explícita. A
execução válida usou `TEST_DATABASE_URL` para `north_test` e
`DEVELOPMENT_DATABASE_URL` para `north`, sem publicar credenciais no relatório.

```text
packages/database/prisma/migrations/20261108120000_sprint_003_r2_asaas_self_service/migration.sql:73: new blank line at EOF.
```

O whitespace foi removido e `git diff --check` passou.

```text
fatal: Unable to create 'C:/Users/tamba/Documents/ChatGPT/NORTH/.git/index.lock': Permission denied
```

Ocorreu ao tentar restaurar duas imagens regeneradas pelo E2E dentro do sandbox;
a operação foi repetida com permissão adequada somente nesses dois arquivos.

## 5. Matriz de aceite

| # | Critério | Estado | Evidência |
| ---: | --- | --- | --- |
| 1 | integração inicia não configurada | PASSOU | GET seguro retorna `NOT_CONFIGURED` sem registro |
| 2 | ERP funciona sem Asaas | PASSOU | gates Sprint 001–003 e fluxos sem conexão |
| 3 | cobrança automática bloqueada sem conexão | PASSOU | domínio exige `ACTIVE`; sem chamada externa |
| 4 | gestor acessa onboarding | PASSOU | assistente E2E em Configurações → Pagamentos |
| 5 | funcionário não altera configuração | PASSOU | HTTP 403 no teste de autorização |
| 6 | orientação explica propriedade da conta | PASSOU | etapa 1 e onboarding de implantação |
| 7 | Sandbox e Produção separados | PASSOU | hosts fixos e validação de compatibilidade |
| 8 | API Key inserida uma vez | PASSOU | input password sem autofill e limpo após sucesso |
| 9 | API Key nunca retornada | PASSOU | view e API expõem apenas fingerprint curta |
| 10 | e-mail de alertas explícito | PASSOU | campo obrigatório, validado, cifrado e mascarado |
| 11 | token informado ou gerado explicitamente | PASSOU | campo e ação gerencial de geração |
| 12 | token diferente da API Key | PASSOU | contrato e domínio rejeitam igualdade |
| 13 | URL derivada de configuração confiável | PASSOU | `NORTH_PUBLIC_BASE_URL`, nunca header `Host` |
| 14 | URL exibida somente leitura | PASSOU | campo read-only com ação de cópia |
| 15 | validação idempotente | PASSOU | `Idempotency-Key`, hash de payload e replay |
| 16 | taxas consultadas pelo stub estrito | PASSOU | snapshot `AVAILABLE` no fluxo de conexão |
| 17 | contrato completo do Webhook | PASSOU | nome, URL, e-mail, enabled, interrupted, v3, token, sendType e eventos |
| 18 | stub recusa payload incompleto | PASSOU | teste HTTP 400 para contrato incompleto |
| 19 | Webhook reconciliado sem duplicidade | PASSOU | listagem por nome/URL e um Webhook lógico |
| 20 | timeout não duplica Webhook | PASSOU | cenário `timeout-after-webhook`, contagem final 1 |
| 21 | conexão ativa somente após validação | PASSOU | taxas e Webhook antecedem insert `ACTIVE` |
| 22 | meios habilitados somente após conexão | PASSOU | FK da conexão e método gerencial exige ativa |
| 23 | cobranças antigas não enviadas automaticamente | PASSOU | ativação cria meios desabilitados; nenhuma drenagem automática |
| 24 | rotação preserva chave anterior em falha | PASSOU | substituição só após validação; retorno a `ACTIVE` em falha |
| 25 | desconexão preserva histórico | PASSOU | segredos removidos, operações/auditoria mantidas |
| 26 | auditoria sem segredos | PASSOU | fingerprints, e-mail mascarado e payload sanitizado |
| 27 | concorrência PostgreSQL demonstrada | PASSOU | locks, serializable, rotações/reservas/40001 concorrentes |
| 28 | replay de Webhook não duplica efeito | PASSOU | inbox única e reserva única nos testes/E2E |
| 29 | fluxo chega a READY_FOR_PRODUCTION | PASSOU | E2E Sprint 003 |
| 30 | estoque físico permanece inalterado | PASSOU | E2E compara físico; apenas `RESERVE` |
| 31 | migração preserva R1 | PASSOU | verificador R2 com conexão/auditoria prévias |
| 32 | banco principal permanece intacto | PASSOU | consulta `north` mostra somente Sprint 001 |
| 33 | documentação de implantação criada | PASSOU | `docs/erp/deployment/asaas-onboarding.md` |
| 34 | homologação real classificada por instalação | PASSOU | `PENDENTE DE IMPLANTAÇÃO POR EMPRESA` |
| 35 | gates completos aprovados | PASSOU | todos os comandos obrigatórios retornaram 0 |
| 36 | branch publicada sem merge/force push | PASSOU | publicação registrada no próximo commit/handoff; `main` intacta |

## 6. Decisões e desvios

- O esclarecimento do responsável substituiu o bloqueio global por um onboarding
  autônomo. A ADR-005 preserva o histórico e registra em 2026-11-08 que a conta,
  tarifas e recebimentos pertencem à empresa cliente.
- As doze decisões confirmadas foram materializadas como BR-093 a BR-104; o índice
  passou a contar 104 regras após conferência dos IDs.
- A documentação oficial consultada em 2026-11-08 confirmou chave exibida uma vez,
  ambientes separados, `access_token`, User-Agent, Webhook com entrega pelo menos
  uma vez e deduplicação por ID. O projeto exige `apiVersion: 3` mesmo quando a
  referência atual a apresenta como opcional, por contrato interno explícito.
- `SEQUENTIALLY` foi mantido conforme ADR-005 e o prompt.
- O antigo homologador criava recursos paralelos e não era prova do NORTH. Ele foi
  preservado como ferramenta compatível, mas agora apenas orienta a implantação e
  nunca lê credenciais.
- Nenhuma conta, chave, token ou chamada real do Asaas foi usada.

## 7. Problemas e riscos

- Nenhuma conta externa foi homologada: cada implantação ainda precisa executar o
  checklist com sua própria conta, primeiro em Sandbox e depois, sob decisão do
  gestor, em Produção.
- A disponibilidade pública HTTPS, DNS, certificado, firewall e ausência de
  redirecionamento de `NORTH_PUBLIC_BASE_URL` dependem da implantação.
- Taxas e condições são fotografias da conta; a condição efetiva da cobrança pode
  prevalecer e deve ser reconciliada por Webhook.
- Webhooks são pelo menos uma vez e podem chegar fora de ordem; inbox, deduplicação e
  worker mitigam, mas a operação deve monitorar fila interrompida, 401, 403, 429,
  timeout e 5xx.
- Produção, consumo físico, qualidade, saldo final e entrega continuam fora do
  Sprint 003. Nenhum item do Sprint 004 foi iniciado.

## 8. Como executar

1. Copie apenas os nomes de configuração de `.env.example`; configure banco local e
   `NORTH_PUBLIC_BASE_URL`. Em produção, essa URL deve ser HTTPS e final.
2. Execute migrações e inicie API/web/worker pelos comandos documentados no README.
3. Entre como Gestor e abra `Configurações → Pagamentos → Asaas`.
4. Escolha o ambiente, cole a chave uma única vez, informe o e-mail de alertas e
   forneça ou gere explicitamente o token; valide e habilite os meios desejados.
5. Para testes locais, use exclusivamente `north_test` e o stub; não são necessárias
   as cinco variáveis globais do prompt R2 anterior.
6. Na implantação real, siga `docs/erp/deployment/asaas-onboarding.md` sem colocar
   segredos em argumentos, logs, screenshots, commits ou handoffs.

## 9. Próximo passo recomendado

Realizar auditoria humana do Sprint 003, incluindo revisão de segurança do cofre,
contrato do Webhook e experiência gerencial. Com a auditoria aceita, preparar o
Sprint 004 em atividade separada; este handoff não o inicia.
