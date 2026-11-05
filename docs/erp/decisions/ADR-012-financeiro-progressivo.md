# ADR-012 — Financeiro progressivo por cobertura de dados

- Status: CONFIRMADO
- Data: 2026-11-05
- Responsável pela decisão: responsável do produto

## Contexto

Pedidos, cobranças e recebimentos já geram dados financeiros automaticamente. Nem
toda empresa cadastrará imediatamente despesas e contas a pagar, mas a ausência
desses dados não deve impedir indicadores úteis nem produzir uma visão enganosa de
caixa completo.

## Decisão

O NORTH oferece um financeiro progressivo:

1. pedidos, cobranças e recebimentos alimentam entradas realizadas e previstas;
2. contas a pagar e despesas ficam disponíveis para cadastro pela empresa;
3. quando saídas são cadastradas, passam a compor fluxo líquido, projeções e
   indicadores;
4. cada painel informa período, fontes consideradas e nível de cobertura dos dados.

Sem despesas, a interface apresenta movimentação/projeção baseada em pedidos e
recebimentos, nunca “lucro” ou “caixa líquido completo”. O sistema não inventa saídas
que a empresa não forneceu.

## Integridade

- Títulos, parcelas, pagamentos e correções são eventos rastreáveis.
- Valores realizados e previstos aparecem separados.
- Cancelamentos, estornos e reembolsos usam movimentos compensatórios.
- Indicadores podem ser recalculados, mas os lançamentos de origem não são
  sobrescritos.

## Consequências

- O produto entrega valor financeiro mesmo com adoção gradual.
- A qualidade dos indicadores fica visível ao gestor.
- Contas a pagar e despesas exigem estados, vencimentos, pagamentos e auditoria.
- Contabilidade formal não é presumida por este módulo.
