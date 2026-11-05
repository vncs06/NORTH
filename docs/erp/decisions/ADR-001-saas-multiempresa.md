# ADR-001 — Produto SaaS multiempresa

- Status: SUPERADO por ADR-009
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

O ERP não será desenvolvido para uma única empresa. O mesmo produto será usado por
outras empresas do setor de personalizados, cada uma com usuários, preços, clientes,
artes, pedidos, estoque e financeiro próprios.

## Decisão

Construir o produto como SaaS multiempresa. Toda operação e consulta será autorizada
no servidor e limitada à empresa ativa. O isolamento também alcança arquivos, cache,
filas, buscas, relatórios, auditoria, exportações e rotinas administrativas.

## Alternativas consideradas

- Instância separada por cliente: maior isolamento físico, mas maior custo operacional.
- Aplicação compartilhada sem limite explícito de empresa: rejeitada por risco de
  vazamento e impossibilidade de autorização consistente.

## Consequências

- Entidades de negócio precisam de vínculo imutável com a empresa proprietária.
- Testes de isolamento são obrigatórios em todos os incrementos.
- Configurações comerciais pertencem à empresa e não viram padrão global sem decisão.
- A estratégia física de banco e arquivos será registrada em ADR técnico posterior.

## Superação

Em 2026-11-03, o responsável esclareceu que cada sistema atende uma única empresa e
que usuários não alternam entre empresas. O produto continua replicável para várias
empresas, mas não como uma instalação operacional multiempresa. Ver ADR-009.
