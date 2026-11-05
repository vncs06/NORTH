# ADR-002 — Motor unificado de estoque

- Status: CONFIRMADO
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

Camisas, canecas e outros itens representam saldo e precisam ser consumidos de
forma inteligente pela produção. Separar motores de estoque aumentaria a
complexidade sem melhorar o controle.

## Decisão

Usar um único motor de estoque e um único modelo de movimentações para todo item.
Cada item da empresa mantém quantidades física, reservada e disponível, reconciliáveis
com entradas, saídas, reservas, liberações, consumos, perdas, devoluções e ajustes.

A classificação do item e sua unidade de medida são metadados. Elas permitem que
fichas técnicas calculem o consumo previsto conforme produto, variante, técnica e
quantidade, sem criar estoques separados.

## Consequências

- Uma camisa e uma caneca seguem as mesmas regras de saldo, embora sejam SKUs distintos.
- Tinta, papel, vinil e embalagem também podem ter saldo e unidade próprios.
- A ordem de produção registra previsto e realizado, inclusive perda e refação.
- Ao liberar produção, o sistema reserva o previsto; a produção registra o consumo
  real, com diferenças tratadas como devolução, perda, complemento ou refação.
