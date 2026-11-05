# ADR-008 — Aprendizado operacional da empresa

- Status: CONFIRMADO
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

O modo real de operar de uma empresa aparece nas decisões repetidas do gestor. Um
preço calculado pode ser frequentemente ajustado para outro valor; determinados
produtos podem consumir mais tempo; descontos e exceções podem seguir padrões que
não estavam explícitos na configuração inicial.

## Decisão

O NORTH usará decisões auditadas do gestor como evidências do comportamento
operacional da empresa. Em situações semelhantes, padrões recorrentes adaptarão
automaticamente as sugestões futuras de preço, prazo, desconto, etapas e outras
decisões assistidas.

O objeto do aprendizado é a empresa, não a pessoa. A identidade do ator permanece na
auditoria da operação, mas não será usada para ranking, avaliação de desempenho ou
perfil individual de comportamento.

## Limites

- Sugestão pode evoluir automaticamente; regra efetiva exige ação autorizada.
- Um ajuste isolado não vira padrão global.
- Propostas, pedidos, preços e movimentos anteriores não são reescritos.
- Cada sugestão identifica o contexto, os dados considerados, a amostra, a recência,
  a confiança e, quando aplicável, o impacto financeiro ou operacional.
- Aceite, rejeição e correção pelo gestor viram novas evidências.
- Dados e padrões de uma empresa nunca influenciam outra empresa.

## Propostas comerciais

Propostas não possuem vencimento automático. Elas preservam o snapshot de itens,
preço, condições, sinal, prazo e cálculo. Uma nova recomendação pode levar o gestor a
criar nova versão ou proposta, mas nunca altera silenciosamente a anterior.

## Consequências

- O modelo precisa distinguir evidência, padrão, sugestão e regra publicada.
- A interface deve explicar por que a sugestão mudou.
- Métricas devem medir erro, aceitação e correção sem avaliar funcionários.
- O gestor precisa poder ignorar, corrigir e, quando aplicável, desativar categorias
  de sugestão.
