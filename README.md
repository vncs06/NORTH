# NORTH ERP

Incrementos verticais dos Sprints 001 a 003: instalação de empresa única,
autenticação local, gestão de usuários, razão imutável de estoque, clientes,
catálogo configurável, fichas técnicas versionadas, precificação explicável e
orçamentos imutáveis com revisão explícita, pedidos, arte versionada, sinal Asaas e
reserva rastreável de materiais.

## Requisitos

- Node.js 24;
- npm 11;
- Docker Desktop com Compose;
- Chromium do Playwright para o teste E2E.

## Preparação local

```powershell
Copy-Item .env.example .env
npm install
docker compose -f infra/compose/compose.yaml up -d
npm run db:generate
npm run db:migrate
```

O bootstrap recebe os dados por variáveis de ambiente e não possui cadastro público
de empresa:

```powershell
$env:BOOTSTRAP_COMPANY_NAME='Empresa de Demonstração'
$env:BOOTSTRAP_TIMEZONE='America/Manaus'
$env:BOOTSTRAP_MANAGER_NAME='Gestor Local'
$env:BOOTSTRAP_MANAGER_EMAIL='gestor@example.test'
$env:BOOTSTRAP_MANAGER_PASSWORD='<defina-uma-senha-local-forte>'
npm run db:bootstrap
```

Repetir exatamente o mesmo bootstrap é seguro. Tentar provisionar outra empresa no
mesmo banco falha por regra transacional e constraint de instalação única.

## Execução

```powershell
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- Saúde: `http://localhost:3001/api/v1/health`

O cookie seguro deve usar `SESSION_COOKIE_SECURE=true` sob HTTPS. A configuração
local usa `false` apenas para HTTP de desenvolvimento.

## Isolamento entre desenvolvimento e testes

O banco de desenvolvimento é `north`, configurado exclusivamente por `DATABASE_URL`.
Integração e E2E exigem uma segunda variável, `TEST_DATABASE_URL`, apontando para o
banco local dedicado e allowlisted `north_test`. Os comandos de teste não fazem
fallback para `DATABASE_URL` e não exigem que ela seja trocada manualmente.

Antes de qualquer `TRUNCATE`, migração ou bootstrap de teste, a infraestrutura exige
`NODE_ENV=test`, compara os destinos normalizados, valida host e nome e confirma o
banco conectado com `SELECT current_database()`. O banco `north` é recusado de forma
explícita. Erros não exibem URL completa nem senha.

Com o PostgreSQL do Compose ativo e as duas URLs definidas como no `.env.example`:

```powershell
npm run db:test:prepare
npm run db:test:migrate
npm run db:test:reset
npm run db:test:bootstrap
npm run db:test:verify-sprint-002-migration
npm run db:test:verify-sprint-003-migration
npm run test:integration
npm run test:e2e
```

`db:test:prepare` cria `north_test` de forma idempotente usando nome fixo. Para uma
limpeza opcional ao fim da revisão, `npm run db:test:drop` remove somente esse banco
allowlisted, após repetir as mesmas validações. Nenhum desses comandos recria, limpa
ou remove `north`.

O desenvolvimento permanece em web `3000` e API `3001`. O E2E faz preflight e sobe
seus próprios processos em web `3100` e API `3101`, com build Next isolado em
`.next-e2e`; encerra apenas esses processos ao terminar. Se uma porta E2E estiver
ocupada, a execução falha antes de tocar no banco ou no processo existente.

## Gates de qualidade

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
npm audit --omit=dev
```

`test:integration` exige PostgreSQL real e `TEST_DATABASE_URL`. `test:e2e` possui as
mesmas travas e também exige portas E2E exclusivas. As proteções podem ser verificadas
isoladamente com `npm run test:database-safety`.

## Catálogo, orçamento e pedido

Após autenticar, o menu oferece clientes, catálogo, fichas, preços e orçamentos. O
gestor configura produtos, variantes, técnicas, fichas e políticas; gestor e
funcionário podem cadastrar clientes, simular e emitir orçamentos dentro dos limites
de desconto aplicáveis. A emissão persiste custos, consumo, disponibilidade, fórmula
e política usados. Alterações posteriores só entram em uma revisão explícita.

O consumo mostrado no orçamento continua sendo apenas demanda prevista. A conversão
explícita em pedido copia esse snapshot. Uma reserva só é criada depois de arte
aprovada, sinal confirmado ou exceção financeira gerencial e avaliação do saldo. A
reserva altera apenas `reserved_quantity`; o físico não é consumido neste sprint.

Na revisão R1 do Sprint 003, a política de sinal aceita percentual ou valor fixo. A
configuração gerencial do Asaas consulta taxas da própria conta, versiona absorção ou
repasse por meio, rotaciona a chave somente após validação e desconecta apenas depois
de analisar pendências e remover o Webhook. Cartão usa exclusivamente a experiência
hospedada do Asaas; o NORTH não recebe dados de cartão.

Na revisão R2, cada instalação começa com o Asaas não configurado. O gestor usa
`Configurações → Pagamentos → Asaas` para escolher Sandbox ou Produção, informar a
API Key e o e-mail de alertas, informar ou gerar explicitamente o token e validar a
conexão. A URL do Webhook é derivada de `NORTH_PUBLIC_BASE_URL` e exibida somente para
leitura. A chave e o token nunca voltam pela API. Sem estado `ACTIVE`, somente a
cobrança automática fica bloqueada; os demais módulos continuam funcionando.

Artes PNG, JPEG e PDF ficam em armazenamento privado, fora do banco e ignorado pelo
Git. API key, token do webhook e documento de cobrança são cifrados com AES-256-GCM.
Em execução não local, `NORTH_SECRET_MASTER_KEY` é obrigatória. O worker processa
outbox/inbox com repetição segura; o webhook persiste antes de responder HTTP 200.

Desenvolvimento e E2E usam um stub contratual estrito, sem credenciais externas. A
homologação real deve ocorrer durante a implantação de cada empresa, primeiro em
Sandbox e depois, quando aprovada, em Produção. Seu estado documental é
`PENDENTE DE IMPLANTAÇÃO POR EMPRESA`; nenhum segredo deve ser passado por argumento,
log, chat ou commit.

## Arquitetura e segurança

- monorepo npm com `apps/web`, `apps/api`, `apps/worker` e pacotes compartilhados;
- Next.js App Router, NestJS e PostgreSQL 18.1;
- Prisma mantém schema, cliente gerado e migrações; SQL tipado é usado nos casos que
  exigem locks, advisory lock, idempotência e ordenação determinística;
- sessão opaca persistida somente como SHA-256, senha Argon2id, CSRF e validação de
  origem nas mutações;
- movimentos de estoque e auditoria são append-only também no banco;
- valores monetários são centavos inteiros e quantidades trafegam como strings
  decimais exatas com até seis casas;
- snapshots emitidos e versões ativas/arquivadas são protegidos contra sobrescrita
  por constraints e triggers, além das invariantes da API.

Esta entrega não declara prontidão de produção: recuperação de senha, MFA, control
plane global, política jurídica de retenção e homologação por instalação permanecem
pendentes. Produção, consumo, qualidade, cobrança de saldo, entrega e estorno
automático não fazem parte do Sprint 003.
