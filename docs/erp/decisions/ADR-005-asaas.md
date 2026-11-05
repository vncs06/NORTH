# ADR-005 — Asaas por empresa para cobranças

- Status: CONFIRMADO
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

O ERP cobra sinal e saldo final. Cada empresa deve receber diretamente em sua conta,
conhecer suas condições comerciais e controlar os meios disponíveis.

## Decisão

Integrar diretamente com a API do Asaas usando uma credencial própria por instalação.
O gestor cadastra a API Key da sua conta no painel; o backend valida, armazena em
cofre de segredos, consulta condições vigentes e configura Webhooks.

O NORTH não criará uma conta financeira central nem misturará valores de empresas.
Subcontas/BaaS não fazem parte do primeiro ciclo e exigiriam avaliação regulatória e
contratual específica.

## Segurança

- API Key nunca retorna ao navegador depois do cadastro e nunca aparece em logs.
- Sandbox e Produção permanecem separados.
- Webhook usa `authToken` próprio e eventos são deduplicados pelo ID.
- Cartão usa preferencialmente a fatura hospedada pelo Asaas.
- Rotação/revogação da credencial é operação auditada do administrador da empresa.

## Custos e transparência

O painel consulta `GET /v3/myAccount/fees/`, registra quando a informação foi obtida
e mostra taxa, prazo e estimativa líquida. Condição efetiva do contrato e do pagamento
prevalece; tarifas não serão fixadas no código.

## Fontes oficiais consultadas em 2026-10-30

- https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1
- https://docs.asaas.com/docs/chaves-de-api
- https://docs.asaas.com/docs/webhooks-1
- https://docs.asaas.com/reference/recuperar-taxas-da-conta
- https://www.asaas.com/precos-e-taxas
