# ADR-015 — Stack TypeScript e monólito modular

- Status: PADRÃO TÉCNICO
- Data: 2026-11-05
- Responsável pela decisão: Engenharia NORTH

## Contexto

O NORTH ainda não possui código. O domínio exige transações fortes para estoque e
finanças, webhooks, jobs idempotentes, interface responsiva e integrações de IA. Uma
arquitetura distribuída desde o início aumentaria falhas e operação sem benefício
comprovado.

## Decisão

Adotar monorepo TypeScript com Next.js no frontend, NestJS na API, worker próprio,
PostgreSQL 18 e Prisma ORM 7. A API usa o NodeAdapter do NestJS. Processamento
assíncrono começa com inbox/outbox e jobs persistidos no PostgreSQL.

O domínio fica em pacotes independentes de framework. Web, API e worker compartilham
contratos e casos de uso, mas somente a API/worker autorizados acessam persistência.

## Alternativas consideradas

- Next.js como backend completo: rejeitado porque a própria documentação o posiciona
  como BFF, enquanto o NORTH precisa de webhooks, jobs e domínio transacional amplo.
- Microsserviços: adiados até haver necessidade real de escala ou isolamento.
- Banco NoSQL principal: rejeitado; relações, transações e reconciliação favorecem
  PostgreSQL.
- n8n como backend: rejeitado; permanece apenas na automação interna.

## Consequências

- Um deploy contém processos distintos, mas um único modelo de domínio.
- Transações locais resolvem a maior parte das invariantes.
- Extração futura usa eventos e portas já definidos.
- Atualizações de framework e banco seguem versões suportadas e lockfile revisado.
