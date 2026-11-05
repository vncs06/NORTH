# Governança de IA, RAG, custos e retenção

## Responsabilidades confirmadas

- IA, RAG e memória são capacidades do NORTH.
- Meta fornece os canais; n8n executa automações internas.
- Cada empresa controla fontes, autonomia e orçamento dentro das políticas do produto.

## Medidores de custo

| Medidor           | Origem                                    | Unidade candidata                       | Controle do NORTH                                        |
| ----------------- | ----------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| Meta              | Mensagens entregues por categoria/mercado | Mensagem/categoria                      | Medir, projetar, alertar e limitar envios automatizados  |
| IA                | Modelo, embeddings e outros serviços      | Tokens, chamadas ou unidade do provedor | Roteamento de modelo, orçamento e limites por instalação |
| Automação interna | n8n e infraestrutura                      | Execuções e recursos                    | Controle operacional do NORTH; não é carteira do gestor  |

PADRÃO TÉCNICO: custos são lançamentos rastreáveis, não apenas um total sobrescrito.
O painel mostra realizado, comprometido/projetado e limite configurado.
Para o gestor, o orçamento de atendimento consolida Meta + IA e permite abrir o
detalhamento. n8n/infraestrutura compõem o custo e o preço do NORTH, não um terceiro
saldo que a empresa precise administrar.

O sistema alerta o gestor ao atingir 80%. Depois do alerta, ele pode aumentar o
orçamento ou manter o limite. Se alcançar 100% sem aumento, o NORTH continua
recebendo mensagens, pausa respostas pagas do agente e transfere para humano.

## Autonomia

- **Assistido:** agente responde, coleta dados e cria rascunhos; humano confirma ações
  sensíveis.
- **Autônomo supervisionado:** empresa delega ações selecionadas e define orçamento,
  valores máximos, descontos, horários, ações proibidas e botão geral de pausa.
- Ambos respeitam autorização no servidor, instalação, idempotência e auditoria.

## RAG, memória e dados ao vivo

Não tratar toda informação da mesma forma:

- Catálogo descritivo, FAQ, políticas e outras fontes publicadas pelo gestor entram
  no RAG com fonte, versão e instalação.
- Preço, estoque, pedido e pagamento são consultados ao vivo nas APIs do ERP; não
  devem depender de vetores potencialmente desatualizados.
- Histórico de conversa é memória do atendimento, não conhecimento global confiável.
- Aprendizados extraídos de conversas aparecem como sugestões; só viram conhecimento
  permanente quando o gestor os publica.
- Mensagens e documentos recuperados são dados não confiáveis e nunca instruções para
  elevar permissão, ignorar política ou executar uma ferramenta.

## Aprendizado operacional da empresa

O NORTH observa decisões auditadas do gestor como evidência da prática daquela
empresa. Ajustes recorrentes em preço, desconto, prazo, etapas e exceções podem mudar
as próximas sugestões em contextos semelhantes.

Esse aprendizado:

- é isolado por empresa e não depende de perfil ou ranking individual;
- preserva contexto, recência, amostra, confiança e resposta à sugestão;
- pode adaptar automaticamente uma sugestão, mas não reescreve propostas, pedidos ou
  movimentos anteriores;
- não transforma sozinho uma sugestão em preço, política ou regra efetiva;
- permite ao gestor aceitar, rejeitar ou corrigir, produzindo nova evidência.

## Retenção

Mensagens, imagens, áudios, artes e memória de conversas permanecem disponíveis
enquanto a empresa utilizar o NORTH. Isso não autoriza transformar automaticamente
conversas em conhecimento permanente do RAG.

Regras já definidas:

- excluir uma fonte também remove seus fragmentos e embeddings;
- dados de uma empresa nunca alimentam RAG de outra;
- exclusão de conversa não apaga automaticamente pedidos, pagamentos ou auditoria;
- anexos, mensagens, vetores e logs de execução têm ciclos próprios;
- encerramento de contrato inclui uma janela confirmada de 30 dias para exportação,
  seguida de eliminação auditável, sujeita às exceções legais obrigatórias.

## Cobrança Meta verificada em 2026-10-30

A cobrança padrão da WhatsApp Business Platform não é um pacote universal de créditos
pré-pagos. No acesso direto, a Meta informa cartão ou linha de crédito faturada; os
preços são por mensagem entregue, categoria e mercado. O Meta Business Agent possui
cobrança própria baseada em token, mas não será usado como nossa IA.

Fontes oficiais:

- https://whatsappbusiness.com/pt-br/resources/faq/
- https://whatsappbusiness.com/products/platform-pricing/
