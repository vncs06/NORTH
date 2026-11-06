# LC-003 — Inbox de webhook antes do ACK e reserva atômica

## Classificação

- Tipo: `pattern`
- Evidência: `TESTED`
- Escore: 7/10
- Destino: candidato local; não promover nem publicar automaticamente

## Contexto

Um fluxo de pedido depende de confirmação financeira assíncrona e, quando elegível,
reserva materiais sem consumir o saldo físico.

## Afirmação candidata

Persistir o evento externo em uma inbox com chave única antes de responder HTTP 200,
processá-lo por worker idempotente e executar prontidão mais reserva na mesma
transação reduz duplicação e estados híbridos. A reserva deve ser um movimento
imutável separado do consumo físico e possuir compensação explícita no cancelamento.

## Evidência

- teste PostgreSQL de webhook repetido sem duplicar efeito;
- E2E com saldo físico inalterado e reservado criado uma única vez;
- cancelamento integrado com movimento inverso `RELEASE`;
- restauração de backup contendo inbox, pedidos e movimentos.

## Limites e contraexemplos

O padrão não define regras comerciais de sinal, chargeback ou tolerância de estoque.
Essas regras continuam específicas do negócio. Confirmação externa real ainda exige
homologação do provedor; stub local não prova conectividade, TLS nem configuração da
conta Sandbox.

## Privacidade e origem

Texto generalizado, sem dados pessoais, segredos, valores comerciais ou código
proprietário. Permanece no projeto porque não atingiu o limiar de promoção e porque
a homologação externa ainda está bloqueada.
