# Instruções permanentes para agentes — NORTH

## Fonte de verdade

Antes de planejar ou alterar código, leia integralmente:

1. `docs/erp/INDEX.md`;
2. o arquivo do sprint recebido no prompt;
3. os documentos e ADRs que o sprint marcar como obrigatórios.

Não use somente o prompt como fonte de negócio. O prompt orienta a execução; as
regras confirmadas e os ADRs definem o comportamento. Se houver conflito, siga a
precedência descrita em `docs/erp/INDEX.md` e registre o conflito no handoff.

## Limites

- Não invente regras sobre dinheiro, estoque, privacidade, permissão, contrato,
  cancelamento ou dados pessoais.
- Não amplie o sprint por conveniência técnica.
- Não implemente e-commerce, multiempresa dentro da instalação, integração bancária
  além do Asaas ou papéis departamentais.
- Não transforme sugestão inteligente em alteração automática de regra de negócio.
- Não use n8n, IA ou interface para contornar autorização e invariantes da API.

## Engenharia obrigatória

- A API aplica autorização; a interface nunca é o único controle.
- Estoque e finanças usam movimentos imutáveis e compensações.
- Operações reenviáveis precisam de idempotência.
- Concorrência deve ser testada com PostgreSQL real.
- Segredos e dados pessoais não entram em logs técnicos.
- Migrações são versionadas e nunca usam sincronização destrutiva automática em
  produção.
- Preserve mudanças existentes do usuário e não apague arquivos fora do escopo.

## Como trabalhar

1. Inspecione o workspace e relate divergências entre código e documentação.
2. Escreva um plano curto associado aos critérios de aceite do sprint.
3. Implemente um fluxo vertical completo, não coleções de CRUDs desconectados.
4. Execute testes proporcionais ao risco e registre comandos e resultados reais.
5. Atualize a documentação afetada e o arquivo do sprint.
6. Entregue o handoff no formato de `docs/erp/15-agent-execution-protocol.md`.

Não declare conclusão quando houver critério de aceite não demonstrado. Use
`PASSOU`, `FALHOU`, `NÃO EXECUTADO` ou `BLOQUEADO`, com evidência.
