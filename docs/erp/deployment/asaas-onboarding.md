# Onboarding Asaas por instalação

## Estado e responsabilidade

Cada instalação do NORTH começa em `NOT_CONFIGURED`. A conta Asaas, credenciais,
tarifas e recebimentos pertencem exclusivamente à empresa cliente. O NORTH não mantém
conta central e não solicita credenciais durante o desenvolvimento.

Classificação da verificação externa: `PENDENTE DE IMPLANTAÇÃO POR EMPRESA`.

## Pré-requisitos

- conta Asaas administrada pela empresa;
- `NORTH_PUBLIC_BASE_URL` configurada pela implantação com HTTPS público e sem redirect;
- chave mestra de segredos da instalação configurada;
- gestor autenticado no NORTH;
- e-mail da empresa destinado a alertas de falha do Webhook.

## Configuração pelo gestor

1. No Asaas, abra **Menu do usuário → Integrações → Chaves de API** e crie uma chave
   para o ambiente correto. A chave é exibida uma vez; não a envie por chat ou ticket.
2. No NORTH, abra **Configurações → Pagamentos → Asaas**.
3. Leia a explicação de propriedade da conta e escolha Sandbox ou Produção. As chaves
   são diferentes e Produção pode gerar cobranças reais.
4. Cole a API Key no campo protegido. Ela não será exibida novamente.
5. Informe e confirme o e-mail de alertas do Webhook. Ele não é login.
6. Informe um token de 32–255 caracteres, sem espaços e diferente da API Key, ou use
   **Gerar token seguro**. O valor gerado só aparece nessa ação.
7. Confira a URL somente leitura terminada em
   `/api/v1/webhooks/asaas/payments` e solicite **Validar e conectar**.
8. O NORTH autentica, consulta `/v3/myAccount/fees/` e cria ou reconcilia um Webhook
   v3 com envio `SEQUENTIALLY` e os eventos financeiros usados pelo domínio.
9. Somente após `ACTIVE`, habilite Pix, boleto e/ou cartão. Ativar não envia cobranças
   antigas; o gestor escolhe posteriormente as pendências elegíveis.

## Primeira homologação controlada

Realize primeiro em Sandbox com cliente e documento fictícios matematicamente válidos.
Crie a obrigação pelo fluxo normal do NORTH, processe a outbox, confirme uma cobrança
de teste e verifique: inbox persistida, HTTP 200, worker, pagamento único, prontidão,
reserva única e quantidade física inalterada. Faça replay controlado do mesmo ID e
confirme ausência de efeito duplicado. Só então repita a configuração em Produção com
uma chave própria e uma cobrança controlada autorizada pela empresa.

Registre somente: ambiente, datas, correlação, IDs externos truncados, códigos HTTP,
contagens e estados. Nunca registre chave, token, e-mail completo, CPF/CNPJ completo,
payload integral, URL com segredo ou dados de cartão.

## Taxas, rotação e desconexão

- Taxas exibidas vêm da conta e possuem data de consulta; a condição efetiva do
  pagamento prevalece.
- Rotação valida a nova chave e consulta taxas antes de substituir a chave atual.
- Rotação do token exige ação explícita e reconciliação do Webhook.
- Desconexão verifica jobs e cobranças pendentes, remove/desabilita o Webhook enquanto
  a chave funciona e só então elimina os segredos. O histórico financeiro permanece.

## Diagnóstico

- `401`: chave ausente, inválida, revogada ou usada no ambiente errado.
- `403`: permissão insuficiente ou requisição GET com body indevido.
- `429`: limite temporário; aguarde o backoff e não duplique a operação.
- timeout: consulte/reconcilie por identificador, nome e URL antes de repetir.
- fila interrompida: verifique os logs de Webhooks no Asaas, corrija o endpoint e
  reative a fila; o receptor deve persistir e responder exatamente HTTP 200 rapidamente.
- `NORTH_PUBLIC_BASE_URL` ausente/insegura: corrija a implantação; nunca derive a URL
  do header Host ou de entrada fornecida pelo cliente.

Fontes oficiais consultadas em 2026-11-08: guias de API Keys, autenticação, criação e
recebimento de Webhooks, FAQ, taxas, clientes e cobranças da documentação Asaas v3.
