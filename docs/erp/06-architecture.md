# Arquitetura técnica

## Decisão-base

PADRÃO TÉCNICO — monólito modular TypeScript, dividido em processos web, API e
worker, com PostgreSQL como fonte canônica. O produto usa um único código-base, mas
cada empresa recebe uma instalação lógica isolada e um banco próprio.

A separação em módulos preserva transações e simplicidade operacional. Serviços
independentes só serão extraídos quando carga, segurança ou ciclo de implantação
justificarem a mudança.

## Stack

- Runtime: Node.js 24 LTS, atualizado dentro da linha LTS.
- Frontend: Next.js 16 com App Router e TypeScript.
- API: NestJS 12 com NodeAdapter e contratos HTTP versionados.
- Persistência: PostgreSQL 18, Prisma ORM 7 e SQL tipado/raw quando bloqueios,
  recursos específicos do PostgreSQL ou consultas analíticas exigirem.
- Processamento assíncrono: inbox/outbox e tabela de jobs no PostgreSQL, executadas
  por worker idempotente.
- Arquivos: porta S3-compatible; provedor definido por ambiente.
- Busca vetorial futura: pgvector no PostgreSQL da instalação antes de considerar um
  banco vetorial separado.
- Automação: n8n consome eventos e chama APIs do NORTH; nunca acessa tabelas do
  domínio diretamente.
- Observabilidade: OpenTelemetry para traces/métricas e logs estruturados com
  correlação, sem segredos ou conteúdo pessoal por padrão.

As versões exatas serão fixadas no lockfile ao criar o código. Atualizações de major
exigem ADR ou registro de migração; patches de segurança seguem manutenção normal.

## Estrutura de execução

- `web`: interface responsiva do gestor e funcionário; não contém regras canônicas.
- `api`: autenticação, autorização, comandos, consultas, webhooks e invariantes.
- `worker`: jobs, outbox, notificações, projeções e integrações assíncronas.
- `postgres`: estado canônico, auditoria, inbox/outbox e jobs.
- `object-storage`: artes, anexos e comprovantes por URLs temporárias.
- `n8n`: automações internas externas ao núcleo.
- `control-plane`: provisionamento, saúde, mensalidade e acesso auditado do
  Administrador NORTH; evolui separadamente do ERP da empresa.

## Isolamento por empresa

- Uma instalação operacional contém apenas uma empresa.
- Cada instalação possui banco, segredos, namespace de arquivos e configuração
  próprios.
- Não existe seletor de empresa ou vínculo multiempresa na aplicação.
- O Administrador NORTH usa um plano de controle separado e credenciais de curta
  duração; consultas administrativas são somente leitura por padrão e auditadas.

## Transações e dados

- Dinheiro é armazenado em centavos inteiros (`bigint`).
- Quantidades usam `numeric` com escala definida por domínio; nunca ponto flutuante.
- Datas de negócio guardam data/fuso quando relevante; instantes usam UTC.
- Saldos de estoque e financeiro derivam de movimentos; não são corrigidos por edição
  silenciosa de total.
- Reserva, consumo, pagamento e compensação usam transações e chaves de idempotência.
- Webhooks entram primeiro em inbox deduplicada; efeitos externos saem por outbox.
- Migrações são versionadas, revisadas, aplicadas por pipeline e usam expand/contract
  quando houver risco de incompatibilidade.

## Autenticação e autorização

- Usuários da empresa são locais à instalação: Gestor ou Funcionário.
- Senhas usam Argon2id; sessões usam cookies `HttpOnly`, `Secure` e `SameSite`.
- MFA é obrigatório em produção para Gestor e Administrador NORTH.
- Toda autorização ocorre na API; esconder botão não constitui controle de acesso.
- Administrador NORTH não é usuário operacional e não recebe poder de mutação pelo
  simples acesso à auditoria.

## Integrações

- Meta e Asaas chegam por webhooks autenticados, persistidos e idempotentes.
- Chamadas externas têm timeout, retentativa limitada, circuit breaker quando
  aplicável e fila de erro inspecionável.
- n8n opera depois da persistência do evento e somente por APIs com escopo mínimo.
- IA/RAG usam adaptadores de provedor, orçamento e ferramentas autorizadas; nenhum
  modelo escreve diretamente no banco.

## Implantação

- Desenvolvimento local: Docker Compose para dependências e processos executáveis
  pelo workspace.
- Produção: imagens imutáveis e ambiente isolado por empresa, com PostgreSQL gerenciado
  ou dedicado, armazenamento de objetos, TLS e cofre de segredos.
- Backups criptografados, restauração testada e retenção definida antes da produção.
- O provedor de nuvem permanece intercambiável; contratos usam PostgreSQL e S3, não
  APIs proprietárias no domínio.

## Fontes técnicas verificadas em 2026-11-05

- https://nodejs.org/en/about/previous-releases
- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/guides/backend-for-frontend
- https://docs.nestjs.com/techniques/performance
- https://www.postgresql.org/support/versioning/
- https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
- https://www.prisma.io/docs/cli/v7/migrate
- https://opentelemetry.io/docs/languages/js/

## Pendências técnicas não bloqueantes do Sprint 1

- Provedor de produção para containers, PostgreSQL e objetos.
- Provedor/modelo de IA e avaliação de qualidade/custo.
- Licença e topologia definitiva do n8n.
- Configuração final do Embedded Signup Meta e revisão do aplicativo.
- Política jurídica de retenção e eliminação por categoria.
