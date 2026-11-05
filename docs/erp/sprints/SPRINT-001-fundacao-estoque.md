# Sprint 001 — Fundação e razão de materiais

- Status: CONCLUÍDO — revisão corretiva de isolamento de testes aprovada
- Tipo: incremento vertical
- Objetivo: permitir que uma instalação de empresa única controle materiais por
  movimentos auditáveis, do login à consulta do saldo.

## Valor verificável

A instalação é provisionada uma vez e recebe o primeiro gestor por bootstrap seguro.
O gestor cria funcionários. Gestor ou funcionário cadastra um material, registra
saldo inicial/recebimento e consulta saldo físico, reservado e disponível. Correções
geram novos movimentos. O gestor consulta a auditoria operacional da instalação. O
contrato de acesso somente leitura do Administrador NORTH é modelado e testado; o
plano de controle global e sua interface ficam para incremento posterior.

## Escopo

1. Inicializar monorepo, lockfile, lint, tipos, testes e Docker Compose.
2. Criar `web`, `api`, `worker` e pacotes de domínio/infraestrutura.
3. Implementar autenticação local, sessões e papéis Gestor/Funcionário.
4. Provisionar exatamente uma empresa e impedir segundo cadastro.
5. Cadastrar material, unidade-base, custo vigente e estoque mínimo.
6. Implementar razão com saldo inicial, recebimento e ajuste compensatório.
7. Projetar físico, reservado e disponível a partir dos movimentos.
8. Exigir motivo e confirmação do gestor para ajuste que gere saldo negativo.
9. Registrar auditoria de autenticação, material, custo e movimento.
10. Entregar telas responsivas de login, materiais, movimento, saldo e auditoria.

## Fora do Sprint 001

- produtos personalizados e fichas técnicas;
- orçamento, arte, pedido, reserva vinculada a produção e Asaas;
- Meta, IA/RAG, n8n e atendimento;
- compras e fornecedores;
- plano de controle global completo;
- arquivos de arte.

## Critérios de aceite

- Não é possível cadastrar uma segunda empresa na instalação.
- Gestor cria e desativa funcionário; sessão desativada é revogada.
- Material exige nome, unidade-base e estado ativo.
- Custo usa centavos e mantém histórico; quantidade usa decimal exato.
- Saldo inicial e recebimento geram movimentos imutáveis e correlacionados.
- Ajuste não altera movimento anterior e exige motivo.
- Funcionário recebe aviso e não confirma saldo negativo; gestor pode confirmar e a
  exceção fica auditada.
- Duas requisições concorrentes não produzem saldo incorreto.
- Reenvio com a mesma chave idempotente não duplica movimento.
- Auditoria mostra ator, instante, ação, recurso, correlação e antes/depois permitido.
- Logs técnicos não expõem credenciais nem conteúdo pessoal.

## Testes obrigatórios

- unitários de saldo e autorização;
- integração PostgreSQL para movimentos, idempotência e concorrência;
- HTTP para sessão, papéis e validações;
- Playwright: login -> material -> recebimento -> saldo -> auditoria;
- migração desde banco vazio e restauração de backup de teste.

## Riscos

- Escolha de provedor de objetos não bloqueia este sprint porque não há arquivos.
- Plano de controle será representado por acesso administrativo local até o incremento
  específico de provisionamento global.
- Política jurídica de retenção não bloqueia dados operacionais mínimos, mas precisa
  estar resolvida antes de produção com clientes reais.

## Rastreabilidade

| Entrega do sprint                   | Regras/decisões de origem                            |
| ----------------------------------- | ---------------------------------------------------- |
| Empresa única por instalação        | BR-001, BR-069, ADR-009, ADR-016                     |
| Gestor e funcionário                | BR-006, BR-067, BR-068, BR-073, ADR-011              |
| Administrador NORTH somente leitura | BR-072, ADR-010, ADR-016                             |
| Motor único e razão de estoque      | BR-007, BR-037, ADR-002                              |
| Unidade-base e precisão             | BR-038, ADR-002                                      |
| Aviso e exceção de saldo negativo   | BR-039, ADR-006                                      |
| Histórico de custo e auditoria      | BR-005, BR-029, BR-071                               |
| Arquitetura e testes                | ADR-015, `06-architecture.md`, `10-test-strategy.md` |

## Premissas técnicas deste sprint

- Não existe banco ou aplicação anterior a migrar.
- A instalação local contém uma empresa de demonstração criada por comando de
  bootstrap; não existe cadastro público de empresa.
- `reserved_quantity` inicia em zero porque reservas vinculadas a pedidos entram no
  Sprint 002. A coluna e a projeção já existem para estabilizar o contrato de saldo.
- Materiais não são excluídos fisicamente. Eles podem ser desativados.
- Não há upload de arquivos, Meta, Asaas, IA, n8n ou e-mail neste sprint.
- Não declarar prontidão de produção: recuperação de senha, MFA, plano de controle
  global e política jurídica completa ainda não fazem parte da entrega.

## Modelo mínimo de dados

### `installation`

Deve existir exatamente uma linha.

- `id`: UUID imutável;
- `company_name`: nome exibido;
- `timezone`: padrão `America/Manaus`, configurável no bootstrap;
- `currency`: sempre `BRL` neste ciclo;
- `created_at`, `updated_at`.

Uma constraint ou mecanismo equivalente deve impedir uma segunda instalação no
mesmo banco. Não basta esconder a ação na interface.

### `user`

- `id`: UUID;
- `name`, `email_normalized` único;
- `password_hash` Argon2id;
- `role`: `MANAGER` ou `EMPLOYEE`;
- `status`: `ACTIVE` ou `DISABLED`;
- `session_version` para revogação em massa;
- timestamps e ator de criação/desativação.

O primeiro gestor é criado por comando de bootstrap idempotente. Funcionários são
criados e desativados pelo gestor. Usuário desativado permanece referenciado em
auditoria e movimentos.

### `session`

- token aleatório armazenado somente como hash;
- `user_id`, `expires_at`, `revoked_at`, `created_at`, `last_seen_at`;
- metadados mínimos de segurança, sem guardar credenciais ou conteúdo pessoal
  desnecessário.

### `material`

- `id`: UUID;
- `code`: texto único na instalação, normalizado e obrigatório;
- `name`: obrigatório;
- `description`: opcional;
- `base_unit`: código curto obrigatório (`un`, `m`, `m2`, `ml`, `g` ou outro texto
  validado); não implementar conversões;
- `minimum_stock`: decimal não negativo, padrão zero;
- `status`: `ACTIVE` ou `INACTIVE`;
- `version`: inteiro para concorrência otimista em edições cadastrais;
- timestamps e atores.

### `material_cost`

- `id`, `material_id`;
- `amount_cents`: inteiro maior ou igual a zero;
- `effective_at`;
- `created_by`, `created_at`, `reason` opcional.

Novo custo cria histórico; não atualiza a linha anterior. Somente gestor altera custo,
pois preço e custo são configurações gerenciais.

### `inventory_movement`

- `id`: UUID;
- `material_id`;
- `type`: `OPENING_BALANCE`, `RECEIPT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`;
- `quantity_delta`: decimal assinado com até seis casas;
- `reason`: obrigatório em ajustes; opcional descritivo em recebimento;
- `source_type`, `source_id` opcionais para evolução;
- `idempotency_key` e `request_hash`;
- `correlation_id`;
- `created_by`, `created_at`.

Movimentos são imutáveis. Corrigir significa criar movimento compensatório. A mesma
`idempotency_key` com o mesmo payload retorna o resultado original; com payload
diferente retorna conflito.

### `inventory_balance`

Projeção reconstruível e atualizada na mesma transação do movimento:

- `material_id` único;
- `physical_quantity`;
- `reserved_quantity` (zero neste sprint);
- `available_quantity = physical - reserved` na leitura ou por expressão segura;
- `version`, `updated_at`.

A transação bloqueia a linha de saldo do material antes de validar/aplicar o delta.
Não aceitar lógica de “ler, calcular e gravar” sem lock ou controle equivalente.

### `idempotency_record`

- escopo/rota, chave, hash da requisição, estado, status HTTP e referência do recurso;
- constraint única por escopo e chave;
- nenhum corpo com segredo ou senha.

### `audit_event`

- `id`, `occurred_at`, `actor_type`, `actor_id` opcional;
- `action`, `resource_type`, `resource_id`;
- `correlation_id`, IP/user-agent minimizados quando aplicável;
- `before_data`, `after_data` sanitizados;
- `metadata` sem senha, hash de senha, token ou cookie.

Auditoria é append-only pela aplicação. Acesso operacional do gestor não revela
segredos nem detalhes exclusivos do Administrador NORTH.

## Casos de uso obrigatórios

### Bootstrap da instalação

1. Comando recebe nome da empresa, fuso, nome/e-mail/senha do primeiro gestor.
2. Se não houver instalação, cria instalação e gestor em transação.
3. Repetição com os mesmos dados é segura; tentativa de criar outra empresa falha.
4. Registra evento de bootstrap sem expor senha.

### Login e sessão

1. Normalizar e localizar e-mail.
2. Validar status e Argon2id em tempo constante apropriado.
3. Criar token aleatório; persistir somente hash.
4. Enviar cookie seguro e retornar identidade/papel mínimos.
5. Logout revoga a sessão. Desativar usuário revoga todas as sessões.

### Cadastrar material

1. Gestor ou funcionário envia código, nome, unidade e mínimo.
2. API normaliza código e valida duplicidade.
3. Persiste material e saldo zero na mesma transação.
4. Registra auditoria.

### Alterar custo

1. Somente gestor informa novo custo em centavos e data de vigência.
2. Cria nova linha de histórico; não sobrescreve custo anterior.
3. Atualiza consulta de custo vigente de modo determinístico.
4. Registra auditoria com valor anterior e novo.

### Registrar movimento

1. Exigir `Idempotency-Key` e validar payload.
2. Abrir transação, adquirir/validar idempotência e bloquear saldo do material.
3. Calcular novo físico e disponível com decimal exato.
4. Se ficar negativo e o ator não for gestor com confirmação explícita, retornar
   `409 NEGATIVE_STOCK_REQUIRES_MANAGER` sem movimento parcial.
5. Inserir movimento, atualizar projeção e auditoria na mesma transação.
6. Retornar movimento e saldo resultante.

### Ajuste compensatório

Não existe edição ou exclusão de movimento. A interface permite selecionar um
movimento, informar motivo e criar delta inverso ou complementar. O novo movimento
referencia o anterior por `source_type/source_id`.

## Matriz de autorização do Sprint 001

| Ação                                | Funcionário   | Gestor        | Administrador NORTH                                    |
| ----------------------------------- | ------------- | ------------- | ------------------------------------------------------ |
| Consultar materiais e saldos        | Sim           | Sim           | Somente por acesso administrativo auditado             |
| Criar/editar cadastro de material   | Sim           | Sim           | Não                                                    |
| Alterar custo                       | Não           | Sim           | Não                                                    |
| Registrar saldo inicial/recebimento | Sim           | Sim           | Não                                                    |
| Ajustar sem saldo negativo          | Sim           | Sim           | Não                                                    |
| Confirmar saldo negativo            | Não           | Sim           | Não                                                    |
| Criar/desativar funcionário         | Não           | Sim           | Não                                                    |
| Consultar auditoria operacional     | Não           | Sim           | Completa, somente leitura, via contrato administrativo |
| Alterar dados operacionais          | Não aplicável | Conforme ação | Não                                                    |

## Contratos HTTP mínimos

Prefixo `/api/v1`. Erros usam `{ code, message, details?, correlationId }` e não
retornam stack trace.

### Autenticação e usuários

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /users` — gestor
- `POST /users` — gestor
- `PATCH /users/:id/status` — gestor

### Materiais e custos

- `GET /materials?search=&status=&cursor=`
- `POST /materials`
- `GET /materials/:id`
- `PATCH /materials/:id` com `version`
- `GET /materials/:id/costs`
- `POST /materials/:id/costs` — gestor

### Estoque e auditoria

- `GET /materials/:id/balance`
- `GET /materials/:id/movements?cursor=`
- `POST /materials/:id/movements` — exige `Idempotency-Key`
- `POST /materials/:id/movements/:movementId/compensations`
- `GET /audit?resourceType=&resourceId=&actorId=&from=&to=&cursor=` — gestor

Regras de status:

- `400` payload inválido;
- `401` sem sessão/sessão expirada;
- `403` papel sem permissão;
- `404` recurso inexistente;
- `409` duplicidade, versão concorrente, idempotência divergente ou confirmação do
  gestor necessária;
- `422` regra de domínio inválida que não seja conflito concorrente.

## Interface obrigatória

- `/login`: autenticação e mensagens sem revelar se o e-mail existe.
- `/materials`: busca, filtro ativo/inativo, código, nome, unidade, custo vigente,
  físico, reservado e disponível.
- `/materials/new`: cadastro com validação junto ao campo.
- `/materials/[id]`: resumo, custo vigente/histórico, saldo e movimentos paginados.
- `/materials/[id]/movement`: saldo inicial, recebimento ou ajuste; mostrar saldo antes
  e projeção depois de confirmar.
- `/settings/users`: lista, criação e desativação; somente gestor.
- `/audit`: eventos operacionais filtráveis; somente gestor.

Estados de carregamento, vazio, erro, sucesso e conflito são obrigatórios. Em telas
estreitas, ações e valores continuam legíveis. Formulários possuem labels, foco,
mensagens acessíveis e não dependem apenas de cor.

## Validações de domínio

- quantidade de movimento não pode ser zero;
- quantidade absoluta deve respeitar limite documentado e até seis casas decimais;
- saldo inicial só pode ser usado uma vez por material, salvo compensação auditada;
- material inativo não recebe novo movimento sem reativação;
- código é único sem diferença de caixa/espaço normalizado;
- estoque mínimo não pode ser negativo;
- custo não pode ser negativo;
- funcionário não envia sinal de confirmação de gestor válido;
- `available = physical - reserved` em toda resposta;
- valores JSON decimais devem trafegar como string para evitar perda de precisão.

## Testes detalhados

### Unitários

- cálculo de físico/reservado/disponível;
- política de saldo negativo por papel;
- normalização de código/e-mail;
- custo vigente por data;
- transições de usuário e sessão;
- sanitização da auditoria.

### Integração com PostgreSQL real

- bootstrap impede segunda instalação;
- constraints de material/custo/movimento;
- movimento e projeção são atômicos;
- rollback não deixa auditoria ou saldo parcial;
- mesma idempotência/mesmo payload retorna o mesmo movimento;
- mesma idempotência/payload diferente retorna `409`;
- duas saídas concorrentes são serializadas e não perdem atualização;
- compensação preserva movimento original;
- desativação revoga sessões existentes;
- migrações sobem banco vazio e seed idempotente.

### HTTP

- matriz completa de `401`, `403`, `404`, `409` e sucesso;
- cookies e cabeçalhos de segurança;
- paginação por cursor estável;
- erro contém correlação e não contém stack/SQL.

### E2E

1. bootstrap/seed de instalação;
2. login do gestor;
3. criação de funcionário;
4. login do funcionário;
5. cadastro de material e recebimento;
6. consulta do saldo;
7. tentativa de saldo negativo pelo funcionário bloqueada;
8. confirmação equivalente pelo gestor;
9. consulta de histórico e auditoria;
10. desativação do funcionário e rejeição da sessão antiga.

## Sequência de implementação recomendada

1. Git, workspaces, configurações compartilhadas e Compose.
2. PostgreSQL, Prisma, primeira migração e bootstrap.
3. Domínio puro de identidade/material/razão.
4. Repositórios e transações de aplicação.
5. API de autenticação e autorização.
6. API de materiais, custos, movimentos e auditoria.
7. Interface e estados de UX.
8. Testes E2E e de concorrência.
9. Documentação de execução e preenchimento das evidências.

## Definição de pronto

O sprint só muda para `CONCLUÍDO` quando todos os critérios de aceite possuem estado e
evidência, migrações funcionam desde zero, os comandos obrigatórios foram executados,
o fluxo E2E passou e nenhum segredo real foi incluído. Se algo não for executado, o
sprint permanece `PARCIAL` ou `BLOQUEADO`, nunca “concluído com ressalvas”.

## Evidências de conclusão

- Versão executada: `0.1.0`, working tree inicial do repositório local, ainda sem
  commit de entrega.
- Migração aplicada: `20261105120000_sprint_001`; a prova em banco vazio criou 9
  tabelas da aplicação, 2 gatilhos append-only e 1 registro concluído em
  `_prisma_migrations`.
- `npm run format:check`, `npm run lint` e `npm run typecheck`: código de saída 0.
- `npm run test`: código de saída 0, 3 arquivos e 16 testes unitários aprovados.
- `npm run test:integration`: código de saída 0, 1 arquivo e 10 testes com PostgreSQL
  real aprovados.
- `npm run test:e2e`: código de saída 0, fluxo Playwright completo aprovado em 17,3
  segundos.
- `npm run build`: código de saída 0 para API, worker e as 8 rotas do web.
- Bootstrap no banco dedicado: primeira execução provisionou a instalação e a
  segunda retornou `repeated: true`, ambas com código de saída 0.
- Backup `pg_dump -Fc` restaurado com `pg_restore --exit-on-error`: original e cópia
  apresentaram `1 instalação / 2 usuários / 1 material / 2 movimentos / 8 eventos`;
  migração e gatilhos foram verificados na cópia. Banco e dump temporários removidos.
- Captura do fluxo: [`../evidence/sprint-001-audit.png`](../evidence/sprint-001-audit.png).
- Auditoria de dependências de produção: `npm audit --omit=dev`, código de saída 0,
  nenhuma vulnerabilidade. A auditoria completa retorna código 1 por 8 achados
  moderados em `minimatch`, todos na cadeia de ferramentas ESLint/TypeScript; a
  correção sugerida exige mudança incompatível e não foi aplicada automaticamente.

### Matriz final

| Critério | Estado | Evidência |
| --- | --- | --- |
| Segunda empresa é impedida | PASSOU | Integração valida bootstrap idempotente e rejeita empresa divergente; singleton também está no banco. |
| Gestor cria/desativa funcionário e revoga sessão | PASSOU | Integração HTTP e E2E exercitam criação, desativação e `401` na sessão antiga. |
| Material exige nome, unidade e estado ativo | PASSOU | Zod, constraints, integração de validação e criação E2E. |
| Custo em centavos, histórico e quantidade exata | PASSOU | `bigint`, `numeric(18,6)`, teste de custo vigente e movimento com seis casas. |
| Saldo inicial e recebimento são imutáveis/correlacionados | PASSOU | Teste bloqueia `UPDATE` pelo gatilho; integração e E2E criam movimentos auditados. |
| Ajuste compensa sem alterar movimento anterior e exige motivo | PASSOU | Integração cria compensação, referencia a origem e preserva o delta original. |
| Funcionário não confirma negativo; gestor confirma com auditoria | PASSOU | Integração e E2E cobrem o `409` e o evento com `negativeException: true`. |
| Concorrência não produz saldo incorreto | PASSOU | Duas saídas concorrentes resultam em `201/409` e saldo físico zero no PostgreSQL real. |
| Reenvio idempotente não duplica movimento | PASSOU | Mesmo payload retorna o mesmo ID; payload divergente retorna `409`. |
| Auditoria contém campos obrigatórios e antes/depois permitido | PASSOU | Contrato HTTP, sanitização unitária, integração e captura da tela de auditoria. |
| Logs não expõem credenciais nem conteúdo pessoal | PASSOU | Logs estruturados registraram código, correlação e status; teste rejeita chaves sensíveis na auditoria. |

### Limitações conhecidas

- Recuperação de senha, MFA, control plane global, retenção jurídica definitiva e
  Administrador NORTH operacional continuam fora do sprint, conforme planejado.
- O contrato do Administrador NORTH foi modelado e testado como temporário,
  justificado, auditado e somente leitura; não existe interface global neste ciclo.
- Os achados moderados da auditoria completa são de desenvolvimento e não aparecem
  em `npm audit --omit=dev`.

## Revisão corretiva de isolamento de testes — 2026-11-05

A auditoria posterior à entrega inicial confirmou que o reset verificava ambiente e
host, mas não o nome do banco, e que integração/E2E podiam herdar `DATABASE_URL`.
Portanto, a afirmação anterior de proteção por nome não correspondia ao código. O
sprint voltou temporariamente a `PARCIAL` e só foi concluído novamente após esta
correção.

Evidências da revisão:

- `TEST_DATABASE_URL` tornou-se obrigatória, sem fallback; o único banco destrutivo
  permitido é o local `north_test`, distinto do destino normalizado de
  `DATABASE_URL`;
- a conexão é novamente validada com `SELECT current_database()` antes de qualquer
  `TRUNCATE`; o reset usa a mesma conexão que foi validada;
- nove testes unitários cobrem ambiente, variável ausente, URLs equivalentes, banco
  principal, nome/host inválidos, banco conectado divergente e não vazamento de
  credenciais;
- a integração real passou em `north_test` com 10/10 casos, incluindo recusa de uma
  conexão aberta para `north`;
- o E2E passou em web `3100`/API `3101` enquanto desenvolvimento permaneceu ativo em
  `3000`/`3001`; ao final, somente as portas de desenvolvimento estavam ouvindo;
- uma colisão simulada em `3100` foi recusada antes do preparo do banco e o listener
  existente permaneceu intacto;
- uma sentinela de sessão identificada por
  `11111111-1111-4111-8111-111111111111` permaneceu presente e inalterada após
  integração e E2E. Foi removida isoladamente ao final; as contagens do banco `north`
  retornaram ao estado inicial: 3 usuários, 24 materiais, 5 movimentos, 45 eventos
  de auditoria e 10 sessões;
- a migração versionada foi reaplicada a `north_test` vazio; o bootstrap seguinte foi
  idempotente;
- gates finais: formatação, lint, tipos, 16 unitários, 10 integrações, 1 E2E e build
  concluíram com código 0. A primeira tentativa unitária no sandbox encontrou
  `EPERM` no diretório temporário; a repetição sem essa restrição passou sem alterar
  testes.
