# Integrações

| Integração                 | Objetivo                                               | Origem          | Destino                | Autenticação                                    | Erros e retentativas                                     | Status                                    |
| -------------------------- | ------------------------------------------------------ | --------------- | ---------------------- | ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| WhatsApp Business Platform | Receber/enviar mensagens e status                      | Meta            | Comunicação/CRM        | OAuth/tokens por empresa via onboarding oficial | Webhook idempotente, fila e reprocessamento              | CONFIRMADO; desenho detalhado PENDENTE    |
| Mensagens do Instagram     | Receber/enviar mensagens e status                      | Meta            | Comunicação/CRM        | OAuth e ativos Meta por empresa                 | Webhook idempotente, fila e reprocessamento              | CONFIRMADO; requisitos de conta PENDENTES |
| Asaas                      | Cobrar/confirmar sinal e saldo final e consultar taxas | Financeiro      | Conta Asaas da empresa | API Key da instalação, criptografada            | Webhook idempotente, fila e conciliação                  | CONFIRMADO                                |
| Bancos/Open Finance        | Não integrar no escopo atual                           | —               | —                      | —                                               | Saldos e movimentos externos são informados pela empresa | EXCLUÍDO                                  |
| Armazenamento de arquivos  | Guardar artes e evidências isoladas                    | Arte/Documentos | Provedor de objetos    | Credencial de serviço                           | Retentativa e integridade                                | PENDENTE                                  |
| n8n                        | Orquestrar integrações e automações não transacionais  | Eventos NORTH   | APIs NORTH/terceiros   | Conta de serviço com escopo mínimo              | Fila, idempotência e fila de erro                        | CONFIRMADO; licença a validar             |

## Contratos e dados

Integrações devem versionar contratos e registrar empresa, correlação, origem,
identificador externo e horário. Conteúdo de mensagens e artes segue política de
privacidade e retenção ainda a definir.

## Segurança e idempotência

Segredos ficam fora do código e são rotacionáveis. Webhooks precisam de validação
de assinatura, proteção contra replay, chave de idempotência, registro de tentativa
e fila de reprocessamento sem duplicar pedido ou pagamento.

## Integração Asaas

### Conexão da empresa

- Gestor cria uma API Key na própria conta Asaas e informa uma vez ao NORTH.
- Backend valida ambiente e credencial, consulta dados/taxas e configura o Webhook.
- Credencial fica criptografada em cofre de segredos, nunca em frontend ou logs;
  depois do cadastro, o painel mostra apenas identificação mascarada e status.
- Sandbox e Produção são conexões diferentes e não compartilham chave ou dados.

O Asaas é a única integração financeira externa. Contas bancárias ou caixas externos
podem existir como contas manuais no NORTH, mas não terão sincronização bancária.

### Preços e taxas

- Consultar `GET /v3/myAccount/fees/` para recuperar condições vigentes daquela conta.
- Mostrar origem Asaas, horário da atualização, modalidade, taxa, prazo e estimativa
  de valor líquido; a taxa efetiva/valor líquido do pagamento prevalece na conciliação.
- Não copiar tarifas públicas para constantes: condições podem variar por contrato.

### Cobranças

- Relacionar cliente NORTH ao ID Asaas e usar `externalReference` para correlação.
- Criar cobranças de sinal e saldo com chaves idempotentes internas.
- Para cartão, preferir `invoiceUrl` hospedada pelo Asaas; o NORTH não captura cartão.
- Receber mudanças por Webhook, persistir evento, responder rapidamente e processar
  de forma assíncrona.
- Webhooks são `at least once`; deduplicar pelo `id` do evento e reconciliar falhas.
- Configurar `authToken` próprio do Webhook, diferente da API Key da conta.

Fontes oficiais Asaas consultadas em 2026-10-30:

- https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1
- https://docs.asaas.com/docs/chaves-de-api
- https://docs.asaas.com/docs/webhooks-1
- https://docs.asaas.com/reference/recuperar-taxas-da-conta
- https://docs.asaas.com/docs/criando-um-cliente
- https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito
- https://www.asaas.com/precos-e-taxas

## Divisão de responsabilidades — proposta

### Meta

- Conta empresarial, números/ativos do canal, API hospedada, webhooks, envio e status.
- Aprovação de templates, políticas, janela de atendimento, qualidade e preço do canal.
- Embedded Signup/onboarding e permissões para administrar ativos em nome da empresa.

### NORTH

- Caixa de entrada unificada, cliente, conversa, memória operacional e auditoria.
- Orquestração de IA, prompts, RAG isolado por empresa, ferramentas do ERP e segurança.
- Painel do gestor, regras de autonomia, custos internos e transferência para humano.
- Retenção, exclusão, exportação e consentimentos sob responsabilidade contratual.

### Opção não escolhida

A Meta oferece Meta Business Agent Platform, que também fornece infraestrutura de
agente/IA. Não é obrigatória para usar WhatsApp ou Instagram; foi decidido preservar
a inteligência como capacidade do NORTH.

## Papel proposto do n8n

- Integrar serviços externos, notificações, rotinas agendadas e efeitos assíncronos.
- Acelerar experimentos de orquestração do agente por trás de uma API estável.
- Nunca decidir autorização, editar saldo diretamente ou substituir transações do ERP.
- Nunca ser o único lugar onde uma conversa, pagamento ou movimento é registrado.
- Receber apenas credenciais e dados da instalação necessários para aquela execução.

Se clientes apenas usam resultados de workflows mantidos pela nossa equipe, o uso
é diferente de permitir que configurem automações. Caso o painel altere lógica de
workflows, será necessária licença comercial segundo a documentação atual do n8n.

## Custos da mensageria

- A Meta cobra mensagens entregues por categoria e mercado; não há um único saldo de
  créditos pré-pagos aplicável a todas as empresas.
- No acesso direto, a cobrança usual é por cartão ou linha de crédito faturada;
  arranjos com Solution Provider podem transferir a cobrança ao provedor.
- Custo Meta, custo do modelo/embeddings e custo de n8n/infraestrutura são medidos
  separadamente por empresa, mesmo quando apresentados em um painel consolidado.
- Valores e categorias vêm de configuração/tabelas vigentes, nunca ficam fixos no código.

## Regras vigentes verificadas em 2026-10-30

- Contato iniciado pela empresa exige opt-in e template aprovado quando aplicável.
- Dentro da janela de atendimento de 24 horas, automação é permitida, com caminho
  claro e direto para atendimento humano.
- Dados de conversas não serão usados para treinar ou melhorar modelos gerais.
- O produto será um ERP com IA especializada em atendimento da empresa, não um
  assistente de IA geral distribuído pelo WhatsApp.

Fontes oficiais:

- https://whatsappbusiness.com/developers/developer-hub/
- https://whatsappbusiness.com/partners/become-a-partner/
- https://whatsappbusiness.com/policy/
- https://www.whatsapp.com/legal/business-solution-terms
- https://ai.meta.com/meta-business-agent/platform/
- https://whatsappbusiness.com/pt-br/resources/faq/
- https://whatsappbusiness.com/products/platform-pricing/
