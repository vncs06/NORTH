# ADR-004 — n8n como camada interna de automação

- Status: CONFIRMADO
- Data: 2026-10-30
- Recomendação: adotar n8n atrás das APIs do NORTH, fora do núcleo transacional

## Contexto

O atendimento inteligente exige integrar Meta, modelos de IA, documentos, alertas
e serviços futuros. n8n acelera conectores e fluxos, mas o ERP precisa preservar
isolamento entre instalações, autorização, idempotência, auditoria e transações.

## Decisão

Usar n8n como executor interno de integrações, rotinas e efeitos assíncronos. O
backend do NORTH recebe e persiste eventos, controla instalação e autorização, mantém o
estado canônico e expõe ferramentas idempotentes. n8n consome eventos e chama essas
ferramentas sem acesso direto às tabelas de domínio.

Não usar n8n como:

- banco de conversas, RAG ou fonte de verdade;
- camada de autenticação/autorização;
- mecanismo direto de pagamentos ou movimentações de estoque;
- único receptor dos webhooks da Meta;
- editor exposto aos clientes no primeiro ciclo.

## Escala e operação

Em produção, filas, concorrência, retenção de execuções, credenciais e dados binários
precisam ser dimensionados. O modo de filas do n8n separa processo principal e
workers usando Redis e banco compartilhado, permitindo escala horizontal.

## Licença

O cliente poderá configurar o comportamento do agente no painel do NORTH, mas não
alterará lógica de workflows n8n inicialmente. Antes da produção, o caso será
validado com a n8n. A documentação atual exige licença comercial quando clientes
configuram workflows, mesmo por interface própria; editor incorporado exige OEM.

## Fontes oficiais consultadas em 2026-10-30

- https://support.n8n.io/article/can-i-use-your-license-for-my-use-case
- https://n8n.io/oem/
- https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/
- https://n8n.io/pricing/
