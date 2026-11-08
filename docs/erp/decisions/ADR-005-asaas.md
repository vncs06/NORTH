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

## Adendo confirmado — onboarding autônomo (2026-11-08)

Origem: esclarecimento explícito do responsável do produto no Prompt 003-R2.

- Cada instalação é entregue em `NOT_CONFIGURED`; o NORTH não mantém conta financeira
  central nem recebe credencial durante o desenvolvimento.
- O gestor conecta a conta da própria empresa pelo painel, escolhendo Sandbox ou
  Produção e informando API Key, e-mail de alertas e token de Webhook. O NORTH pode
  gerar o token somente após ação explícita.
- A URL receptora deriva da configuração confiável da instalação. Validar e conectar
  consulta taxas e cria ou reconcilia o Webhook; somente então o estado fica `ACTIVE`.
- Sem conexão ativa, cobranças automáticas ficam bloqueadas e os demais módulos
  continuam funcionando. Ativar a conexão não envia cobranças antigas automaticamente.
- A homologação real pertence ao checklist de implantação de cada empresa. O aceite do
  código-base usa contrato oficial atualizado, stub estrito, PostgreSQL e E2E, sem
  solicitar ou inventar credenciais reais.

Documentação oficial revisada em 2026-11-08. O contrato vigente exige `access_token`
e `User-Agent`; criação de Webhook inclui `name`, `url`, `email`, `enabled`,
`interrupted`, `apiVersion`, `authToken`, `sendType` e `events`.
