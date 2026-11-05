# Prompt 001 — Executar o Sprint 001 do NORTH

Copie todo o conteúdo abaixo para o agente executor.

---

Você é o agente de implementação responsável pelo Sprint 001 do NORTH ERP. Trabalhe
diretamente no workspace `C:\Users\tamba\Documents\ChatGPT\NORTH` e entregue um
incremento vertical executável, testado e documentado. Não entregue apenas uma base
de pastas, CRUDs desconectados ou protótipos sem persistência real.

## 1. Objetivo verificável

Implementar o fluxo completo:

`bootstrap da empresa -> login -> criação de funcionário -> cadastro de material ->
saldo inicial/recebimento -> saldo físico/reservado/disponível -> ajuste compensatório
-> auditoria -> revogação de funcionário`

Ao final, esse fluxo deve funcionar na interface e na API, usando PostgreSQL real,
migrações versionadas, autorização server-side, movimentos imutáveis, idempotência e
testes de concorrência.

## 2. Estado inicial esperado

- O workspace contém documentação, mas ainda não contém aplicação.
- Não há repositório Git inicializado.
- Node.js 24, npm, Python e Docker estão disponíveis.
- Não existem dados de produção nem migrações anteriores.

Confirme o estado real antes de alterar. Se encontrar código ou mudanças que não
correspondam a esse estado, preserve-os, avalie o conflito e informe antes de qualquer
ação destrutiva.

## 3. Leitura obrigatória antes de planejar

Leia integralmente, nesta ordem:

1. `AGENTS.md`
2. `docs/erp/INDEX.md`
3. `docs/erp/sprints/SPRINT-001-fundacao-estoque.md`
4. `docs/erp/02-business-rules.md`
5. `docs/erp/03-domain-model.md`
6. `docs/erp/04-workflows.md`
7. `docs/erp/06-architecture.md`
8. `docs/erp/07-security-permissions.md`
9. `docs/erp/09-ux-guidelines.md`
10. `docs/erp/10-test-strategy.md`
11. `docs/erp/13-intelligent-inventory.md`
12. `docs/erp/14-technical-blueprint.md`
13. `docs/erp/15-agent-execution-protocol.md`
14. `docs/erp/decisions/ADR-002-estoque-unificado.md`
15. `docs/erp/decisions/ADR-006-excecoes-operacionais-financeiras.md`
16. `docs/erp/decisions/ADR-009-instancia-de-empresa-unica.md`
17. `docs/erp/decisions/ADR-010-administrador-north-auditoria.md`
18. `docs/erp/decisions/ADR-011-acesso-simplificado.md`
19. `docs/erp/decisions/ADR-015-stack-e-monolito-modular.md`
20. `docs/erp/decisions/ADR-016-implantacao-isolada-e-control-plane.md`

Não comece o scaffold antes dessa leitura. No plano inicial, cite quais regras e ADRs
governam cada parte do trabalho.

## 4. Decisões bloqueadas

Não reinterpretar nem substituir:

- uma instalação atende exatamente uma empresa;
- não existe seletor ou usuário multiempresa;
- dentro da empresa existem somente Gestor e Funcionário;
- todos os funcionários têm o mesmo acesso operacional;
- preço/custo e exceções críticas continuam reservados ao gestor quando documentado;
- Administrador NORTH é externo à empresa e somente leitura por padrão;
- estoque é um razão de movimentos imutáveis;
- correção é compensação, nunca edição/exclusão de movimento;
- saldo negativo exige aviso e confirmação do gestor;
- dinheiro usa centavos inteiros; quantidade usa decimal exato;
- API é a autoridade de permissão e invariantes;
- n8n, IA e frontend não escrevem diretamente no banco;
- este sprint não inclui Meta, Asaas, IA/RAG, n8n, pedidos, produção ou arquivos.

Se uma biblioteca ou gerador criar um modelo multi-tenant, RBAC departamental ou
edição direta de saldo, adapte ou remova essa estrutura.

## 5. Arquitetura que deve ser criada

Use npm workspaces e TypeScript:

```text
apps/web
apps/api
apps/worker
packages/domain
packages/application
packages/database
packages/auth
packages/contracts
packages/observability
packages/testing
infra/compose
```

- `web`: Next.js 16 App Router.
- `api`: NestJS 12 com NodeAdapter.
- `worker`: processo Node/Nest sem HTTP, preparado para inbox/outbox/jobs.
- banco: PostgreSQL 18.
- ORM/migrações: Prisma ORM 7; use SQL tipado/raw somente quando necessário para lock,
  precisão, constraint ou concorrência.
- testes unitários: Vitest.
- E2E de interface: Playwright.
- observabilidade: logs estruturados com `correlationId`; preparar OpenTelemetry sem
  exigir backend externo neste sprint.

Fixe versões compatíveis no `package-lock.json`. Não use tags flutuantes em imagens de
produção; no Compose local, documente a versão selecionada. Crie `.env.example` sem
segredos e `.gitignore` antes de gerar arquivos temporários.

Se o workspace continuar sem Git, inicialize `git init`. Não configure remoto, não
publique e não force commit. Nunca apague a documentação existente.

## 6. Infraestrutura local

Crie Docker Compose suficiente para PostgreSQL 18 com healthcheck e volume nomeado.
Não adicione Redis, MinIO, n8n ou serviços externos sem necessidade do Sprint 001.

Forneça comandos documentados para:

- subir e parar dependências;
- instalar pacotes;
- aplicar migrações;
- executar bootstrap/seed;
- iniciar web, API e worker;
- executar cada categoria de teste.

O bootstrap deve receber dados por CLI/env e ser idempotente. Não coloque senha fixa
real no repositório. Dados de demonstração só podem existir em ambiente de
desenvolvimento/teste e devem ser claramente identificados.

## 7. Implementação funcional obrigatória

Implemente integralmente o modelo, casos de uso, endpoints, matriz de autorização,
validações e telas descritos em
`docs/erp/sprints/SPRINT-001-fundacao-estoque.md`.

Pontos que não podem ficar como TODO:

- singleton da instalação garantido no banco/aplicação;
- bootstrap idempotente do primeiro gestor;
- login, logout, `me`, sessão persistida e revogação imediata;
- criação/listagem/desativação de funcionário pelo gestor;
- material com código único normalizado, unidade-base, mínimo e status;
- histórico de custo, alterável somente pelo gestor;
- saldo inicial, recebimento, ajustes de entrada/saída e compensação;
- projeção física/reservada/disponível transacional e reconstruível;
- `Idempotency-Key` com detecção de payload divergente;
- lock/controle concorrente real no PostgreSQL;
- bloqueio de saldo negativo para funcionário e confirmação explícita do gestor;
- auditoria append-only sanitizada;
- paginação estável de materiais, movimentos e auditoria;
- interface responsiva e acessível para o fluxo E2E.

`reserved_quantity` permanece zero neste sprint, mas deve existir no contrato de saldo.
Não crie reserva manual sem pedido apenas para preencher a coluna.

## 8. Segurança mínima

- Hash de senha Argon2id.
- Token de sessão aleatório; guardar somente hash.
- Cookies `HttpOnly`, `Secure` em produção e `SameSite` apropriado.
- Proteção CSRF/origin para mutações autenticadas.
- Rate limit de login simples e testável, sem depender de serviço externo.
- Validação de entrada na borda e regras repetidas no domínio quando forem invariantes.
- Respostas nunca incluem hash de senha, token, cookie, SQL ou stack trace.
- Auditoria nunca registra senha, token, cookie ou segredos.
- Desativar usuário revoga todas as sessões.
- O gestor não pode desativar o último gestor ativo sem mecanismo substituto; para este
  sprint, rejeite a operação com erro de domínio claro.

MFA é requisito de produção da arquitetura, mas não implemente fluxo incompleto neste
sprint. Registre como pendência explícita de produção, não como critério que passou.

## 9. Transações, idempotência e concorrência

Para todo movimento:

1. validar autenticação, papel, material e payload;
2. iniciar transação;
3. adquirir/verificar registro de idempotência;
4. bloquear saldo/projeção do material;
5. calcular o novo saldo com decimal exato;
6. aplicar política de saldo negativo;
7. inserir movimento, projeção e auditoria na mesma transação;
8. confirmar transação;
9. retornar movimento e saldo resultante.

Escreva teste concorrente que realmente dispare requisições/transações paralelas
contra PostgreSQL. Mock unitário não demonstra esse critério.

Mesma chave + mesmo payload deve devolver o recurso original sem segundo movimento.
Mesma chave + payload diferente deve retornar `409 IDEMPOTENCY_KEY_REUSED`.

## 10. UX mínima

Implemente as rotas de interface definidas no sprint. Garanta:

- estados de carregamento, vazio, sucesso, erro e conflito;
- formulários com labels, foco, mensagens próximas ao campo e navegação por teclado;
- valores BRL e quantidades formatados sem perder precisão;
- antes/depois visível ao registrar movimento;
- explicação clara quando a operação exige confirmação do gestor;
- nenhuma ação reservada apenas “escondida”: a API deve rejeitar acesso indevido.

Não gaste o sprint com branding avançado, animações ou dashboards genéricos. Priorize
clareza operacional e fluxo completo.

## 11. Testes e comandos obrigatórios

Crie scripts raiz previsíveis e execute, no mínimo:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run build
```

Também demonstre:

- migração em banco vazio;
- bootstrap repetido sem duplicar instalação/gestor;
- teste de concorrência;
- teste de idempotência igual e divergente;
- restauração de um backup de teste ou, se a infraestrutura local impedir, marque
  explicitamente `NÃO EXECUTADO` com causa e não conclua o sprint como completo.

Não reduza testes para fazê-los passar. Corrija a implementação ou registre falha.

## 12. Documentação obrigatória ao implementar

Atualize:

- `README.md` raiz com setup e comandos;
- `.env.example`;
- `docs/erp/sprints/SPRINT-001-fundacao-estoque.md` com status e evidências;
- `docs/erp/06-architecture.md` somente se a implementação exigir refinamento real;
- novo ADR apenas se alterar uma decisão técnica relevante.

Não modifique regra de negócio confirmada para adequá-la ao código. Se houver conflito,
pare a parte afetada e reporte.

## 13. Fora de escopo explícito

Não implementar:

- múltiplas empresas no mesmo banco/instalação;
- papéis por departamento ou permissões personalizáveis;
- produtos, fichas técnicas, orçamento, arte, pedido ou produção;
- fornecedores e compras;
- Meta, Instagram, WhatsApp, Asaas, bancos ou Open Finance;
- IA, embeddings, RAG ou pgvector;
- n8n ou Redis;
- arquivos e armazenamento S3;
- e-commerce;
- plano de controle global completo;
- deploy em nuvem ou uso de credenciais reais.

Pode criar portas/interfaces futuras somente quando necessárias à arquitetura atual,
sem implementar fluxo fictício ou código morto volumoso.

## 14. Condições de parada

Pare somente a parte afetada e peça decisão se:

- regra confirmada conflitar com outra regra/ADR de maior precedência;
- uma solução exigir mudar dinheiro, estoque, permissão, privacidade ou contrato;
- uma migração puder destruir dados que surgiram no workspace;
- a dependência necessária for incompatível com Node 24/PostgreSQL 18 e não houver
  alternativa segura dentro da arquitetura.

Falha de instalação, lint, build ou teste deve ser diagnosticada. Se a rede/sandbox
bloquear dependências, registre comando e erro completos e solicite a autorização
necessária; não substitua a stack silenciosamente.

## 15. Handoff obrigatório

Ao terminar, use exatamente as nove seções de
`docs/erp/15-agent-execution-protocol.md`:

1. Resultado
2. Alterações
3. Banco e migrações
4. Comandos executados
5. Matriz de aceite
6. Decisões e desvios
7. Problemas e riscos
8. Como executar
9. Próximo passo recomendado

Na matriz, copie cada critério de aceite do Sprint 001 e marque `PASSOU`, `FALHOU`,
`NÃO EXECUTADO` ou `BLOQUEADO` com evidência. Não use frases genéricas como “tudo
funcionando”.

Não inicie o Sprint 002. Entregue o handoff e aguarde revisão.

---
