# ADR-007 — Gestão inteligente de tempo e prazo

- Status: CONFIRMADO
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

Empresas de personalizados precisam prometer prazos considerando produto, técnica,
quantidade, materiais e sua forma particular de produzir. O gestor possui contexto
operacional imediato, enquanto o NORTH pode reconhecer padrões no histórico da
própria empresa.

## Decisão

Cada pedido aceitará uma estimativa informada pelo gestor durante o planejamento. Em
paralelo, o NORTH calculará uma previsão usando pedidos semelhantes anteriores da
mesma empresa. A interface apresentará as duas estimativas, os fatores considerados,
a amostra e a confiança. O gestor confirma o prazo prometido ao cliente.

O prazo prometido é um compromisso versionado: novas previsões ou riscos não o
alteram silenciosamente. Mudanças exigem confirmação, motivo e auditoria.

## Processo configurável

O ERP preserva estados principais necessários às regras de aprovação, sinal,
produção, qualidade, saldo e entrega. Cada empresa configura etapas internas de
produção sem remover esses invariantes.

O previsto e o realizado por produto, variante, técnica e etapa alimentam o
aprendizado agregado da empresa. Não há ranking nem perfil individual de funcionário.

## Alertas

Quando houver risco de atraso, o NORTH alerta primeiro o gestor e explica os fatores.
Comunicação automática ao cliente somente ocorre se o perfil de autonomia do agente
permitir; caso contrário, a mensagem fica como sugestão ou aguarda aprovação.

## Consequências

- Estimativas precisam de versionamento, evidência e medição de erro.
- Pedidos com pouco histórico exibem confiança baixa, sem falsa precisão.
- O planejamento pode evoluir para considerar fila e capacidade sem mudar a regra
  de que o gestor confirma o compromisso comercial.
- Dados e modelos derivados permanecem isolados por empresa.
