# Modelo de domínio

## Contextos e entidades

- **Organização e acesso:** Instalação, Empresa, Usuário, Gestor, Funcionário e
  AdministradorNORTH.
- **CRM:** ClientePF/PJ, Contato, IdentidadeDeCanal, Interação, CanalDeOrigem,
  SugestãoDeUnificação e UnificaçãoDeCliente.
- **Comercial:** TabelaDePreço, RegraDePreço, ComponenteDePreço, PolíticaDeDesconto,
  Simulação, Orçamento, ItemPersonalizado e Pedido.
- **Arte:** Arte, VersãoDeArte, SolicitaçãoDeAprovação, Aprovação/Rejeição.
- **Produção:** OrdemDeProdução, ModeloDeEtapas, Etapa, Apontamento,
  EstimativaDoGestor, EstimativaDoNorth, PrazoPrometido, ControleDeQualidade e Refação.
- **Estoque:** ItemDeEstoque, Classificação, Unidade, CustoVigente, HistóricoDeCusto,
  FichaTécnica, ComponentePrevisto, Reserva, Movimentação, Inventário,
  AmostraDeConsumo e SugestãoDeAjuste. Todos usam o mesmo razão por empresa.
- **Compras:** Fornecedor, PedidoDeCompra, ItemDeCompra, Recebimento e
  OcorrênciaDeFornecedor.
- **Financeiro:** ContaAsaasConectada, CondiçãoDeTaxa, Título, Parcela, Cobrança,
  Pagamento, ContaAPagar, Despesa, CategoriaFinanceira, Estorno, Chargeback,
  Reembolso, DecisãoFinanceira, ContaFinanceira, SaldoInicial, Recorrência,
  Conciliação, ProjeçãoDeCaixa, CoberturaFinanceira e ResultadoDoPedido.
- **Entrega:** ConfiguraçãoDeEntrega, Expedição, Retirada/EntregaPrópria/Transportadora,
  ReferênciaDeRastreio e Comprovante.
- **Pós-venda:** Ocorrência, Reclamação, Devolução, Garantia, Evidência e Solução.
- **Atendimento inteligente:** Conversa, Mensagem, ConfiguraçãoDoAgente,
  PerfilDeAutonomia, FonteDeConhecimento, TrechoRecuperado, AçãoDoAgente,
  TransferênciaHumana e CustoDeExecução.
- **Aprendizado da empresa:** EvidênciaOperacional, ContextoDaDecisão,
  PadrãoDaEmpresa, SugestãoAdaptativa, Confiança e RespostaÀSugestão.

## Estados e transições

Estados candidatos do pedido: RASCUNHO -> AGUARDANDO_ARTE -> AGUARDANDO_APROVACAO ->
AGUARDANDO_SINAL -> LIBERADO_PARA_PRODUCAO -> EM_PRODUCAO -> EM_QUALIDADE ->
AGUARDANDO_SALDO -> PRONTO_PARA_ENTREGA -> ENTREGUE.

CANCELADO e EM_REFAÇÃO são transições controladas. O sistema calcula e apresenta os
efeitos de estoque, produção e finanças; o gestor confirma a decisão e o sistema
executa movimentos compensatórios auditáveis. Alteração posterior à aprovação cria
uma nova versão, sem sobrescrever arte, preço, prazo ou produção anteriores.

## Invariantes

- Uma empresa nunca acessa dados ou arquivos de outra.
- O Administrador NORTH não é usuário operacional da empresa; seu acesso ao histórico
  completo ocorre por fronteira administrativa separada e também é auditado.
- Uma ordem de produção só é liberada quando a versão da arte estiver aprovada e o
  sinal exigido estiver registrado como recebido, salvo exceção explícita e auditada
  do gestor diante de pagamento parcial ou insuficiente.
- Uma entrega só é liberada quando o saldo final exigível estiver quitado.
- Aprovar nova versão da arte não altera silenciosamente a versão usada na produção.
- Um pagamento não pode ser registrado duas vezes para a mesma operação externa.
- Um recebimento duplicado ou excedente não é apagado nem compensado automaticamente;
  o gestor decide entre crédito, reembolso ou outra tratativa permitida.
- Estorno ou chargeback abre revisão do gestor; qualquer bloqueio, continuidade ou
  compensação resultante precisa ser explícita e auditada.
- Alterar custo, ficha técnica ou regra de preço não muda silenciosamente orçamento
  já emitido; cada orçamento preserva o snapshot usado no cálculo.
- Propostas comerciais não expiram automaticamente e permanecem com o snapshot
  original até uma ação explícita criar nova versão, substituir ou encerrar a proposta.
- Unificar clientes nunca apaga identidades, contatos, canais ou interações de origem;
  somente o gestor confirma a operação, que preserva o vínculo e pode ser auditada.
- Reutilizar arte ou pedido cria referência/cópia versionada para o novo pedido e não
  modifica o registro original.
- Pedido repetido recalcula preço, materiais e disponibilidade com dados vigentes;
  valores anteriores são referência e o gestor confirma o preço do novo pedido.
- Devolução ou garantia não movimenta estoque ou finanças pela simples abertura da
  ocorrência; o gestor confirma a solução e seus efeitos compensatórios.
- Desconto aplicado identifica política, limite, ator e impacto no preço; exceções
  autorizadas não sobrescrevem o valor originalmente calculado.
- Uma cobrança Asaas pertence a uma empresa, pedido e parcela, e seu evento externo
  só pode produzir uma transição local uma vez.
- Indicadores financeiros identificam se usam apenas pedidos/recebimentos ou também
  contas a pagar e despesas; cobertura parcial nunca é rotulada como caixa completo.
- Uma saída financeira só existe quando cadastrada ou recebida de integração válida;
  projeções não criam despesas presumidas nem movimentos realizados.
- Saldo inicial e ajustes de conta são movimentos auditáveis; o total atual não é
  corrigido por sobrescrita silenciosa.
- Lucro estimado e realizado identificam receitas, custos diretos, componentes
  opcionais considerados e cobertura; custo ausente não é tratado como zero confiável.
- Saldo disponível de estoque não pode ficar incorreto por reservas concorrentes.
- Simular necessidade não movimenta saldo; reservar, liberar, consumir, devolver,
  perder e ajustar sempre geram movimentos distintos e rastreáveis.
- Consumo real de uma ordem não pode ser lançado duas vezes por reprocessamento.
- O saldo exibido deve ser reconciliável com movimentos; correções geram ajustes,
  nunca alteração silenciosa do histórico.
- Aprendizado operacional nunca altera ficha técnica, perda prevista ou estoque
  mínimo sem ação explícita e auditada de usuário autorizado.
- Uma nova previsão de duração não altera silenciosamente o prazo já prometido ao
  cliente; o gestor confirma mudanças de compromisso.
- Estimativas do NORTH usam somente histórico da empresa da instalação, mostram amostra e
  confiança e não criam avaliação individual de funcionário.
- Ajustes recorrentes podem mudar sugestões futuras, mas nunca reescrevem registros
  passados nem transformam silenciosamente uma sugestão em regra efetiva.
- O agente nunca recebe mais permissões que a empresa concedeu ao seu perfil de
  serviço; autonomia não remove validações, idempotência ou auditoria.
- Contexto, vetores, arquivos, mensagens e custos de IA permanecem na instalação correta.

## Integração entre contextos

- `ArteAprovada` e `SinalRecebido` reavaliam a elegibilidade do pedido para produção.
- `PedidoLiberadoParaProducao` cria a reserva do previsto calculado pela ficha
  técnica e a ordem de produção, de forma idempotente.
- `ProducaoConcluida` gera consumo/perdas e encaminha o pedido à qualidade.
- `QualidadeAprovada` cria a cobrança Asaas do saldo final de forma idempotente.
- `PagamentoFinalRecebido` reavalia a elegibilidade para entrega.
- `PagamentoInsuficienteDetectado`, `PagamentoDuplicadoDetectado`, `EstornoRecebido`
  e `ChargebackRecebido` criam alertas e casos de decisão do gestor.
- `AlteracaoPosAprovacaoSolicitada` cria uma nova versão e reavalia preço, prazo,
  reserva, cobrança e a versão liberada para produção.
- `RefacaoAberta` registra causa, responsabilidade, consumo adicional e política de
  cobrança; defeito de fornecedor também pode originar crédito a receber.
- `EstimativaDoGestorInformada` e o histórico de pedidos semelhantes produzem uma
  `PrevisaoDePrazoCalculada`; o gestor confirma o `PrazoPrometido`.
- `RiscoDeAtrasoDetectado` alerta o gestor e somente comunica o cliente de forma
  automática quando a autonomia configurada permitir.
- `DecisaoDoGestorRegistrada` alimenta evidências da empresa; padrões recorrentes
  geram `SugestaoAdaptada`, preservando contexto, amostra, confiança e explicação.
- `PedidoCriado`, `CobrancaCriada` e `PagamentoRecebido` atualizam a projeção de
  entradas; `ContaAPagarCadastrada` e `DespesaPaga` acrescentam saídas e ampliam a
  cobertura dos indicadores.
- `SaldoInicialInformado` abre o razão da conta na data de referência; pagamentos e
  recebimentos posteriores atualizam seu saldo por movimentos.
- `PedidoConcluido` calcula resultado realizado com receitas e custos vinculados,
  preservando o resultado estimado usado na decisão comercial.
- `PossivelClienteDuplicadoDetectado` cria sugestão de unificação com evidências, sem
  mesclagem automática.
- `OcorrenciaPosVendaAberta` vincula reclamação, devolução ou garantia ao pedido e
  coordena os efeitos confirmados em estoque, produção e financeiro.

## Consistência e concorrência

- Escopo de empresa obrigatório em chaves, consultas, arquivos, jobs e eventos.
- Registro de pagamentos e webhooks deve usar chave de idempotência.
- Reserva/consumo de estoque precisa de controle transacional de concorrência.
- Quantidade física, reservada e disponível são dimensões do mesmo item da empresa,
  não estoques independentes.
- Cancelamentos, estornos e ajustes usam eventos compensatórios e trilha de auditoria.
