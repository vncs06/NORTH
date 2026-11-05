# Fluxos operacionais

Para cada processo documentar: gatilho, ator, pré-condições, etapas, estados, validações, efeitos entre módulos, cancelamentos, falhas e critérios de aceite.

## Fluxo 1 — demanda até liberação da produção

- Gatilho: contato recebido por WhatsApp ou Instagram.
- Responsável: funcionário, gestor e cliente.
- Caminho principal: registrar cliente e demanda; montar orçamento; criar/versionar
  arte; obter aprovação; converter em pedido; registrar sinal; liberar produção
  somente quando as duas condições forem satisfeitas.
- Exceções: rejeição ou alteração da arte, mudança de preço, cancelamento, pagamento
  duplicado ou insuficiente. O sistema alerta, calcula impactos e abre uma decisão
  auditável para o gestor; não apaga históricos nem aplica compensação financeira
  irreversível sem a decisão configurada/autorizada.
- Permissões: funcionário executa as atividades operacionais; o cliente confirma pelo
  canal e o gestor registra a versão aprovada, configura preço e autoriza exceções.
- Dados alterados: cliente, interação, orçamento, arte/versão, aprovação, pedido,
  título/parcela, pagamento, auditoria e reserva prevista de estoque.
- Testes: não liberar sem sinal; não liberar sem arte; liberar exatamente uma vez
  quando ambos existirem; rejeitar acesso cruzado entre instalações; preservar versão
  aprovada e histórico de preço.

## Fluxos seguintes

- Pedido liberado -> calcular consumo previsto pela ficha técnica -> reservar ->
  registrar consumo real -> produção/qualidade/refação. CONFIRMADO.
- Qualidade aprovada -> saldo final pago -> entrega. CONFIRMADO.

## Fluxo de alteração após aprovação

- O gestor registra a solicitação e cria nova versão da arte/pedido.
- O sistema preserva a versão anterior e simula efeitos em preço, prazo, reserva,
  produção e cobrança.
- Cobrança adicional ao cliente segue a política configurada pela empresa.
- A nova versão só substitui a vigente após confirmação; toda transição é consultável.

## Fluxo de cancelamento, refação e exceção financeira

- Cancelamento calcula materiais reservados/consumidos, trabalho executado, valores
  recebidos e possíveis movimentos compensatórios; o gestor decide e justifica.
- Refação registra causa: responsabilidade da empresa, alteração do cliente ou
  defeito de material/fornecedor. Custos, consumo adicional e eventual crédito ou
  cobrança permanecem vinculados à ocorrência.
- Pagamento parcial/insuficiente, duplicidade, excedente, estorno ou chargeback gera
  alerta e caso auditável. O gestor decide liberar, bloquear, creditar, reembolsar ou
  adotar outra tratativa permitida.

## Fluxo de prazo e produção configurável

- O pedido recebe uma estimativa do gestor durante seu planejamento.
- O NORTH compara produto, variante, técnica, quantidade, etapas e histórico de
  pedidos semelhantes da mesma empresa e apresenta sua estimativa com amostra e
  confiança.
- O gestor confirma o prazo prometido. Recálculos posteriores não mudam esse
  compromisso sem uma ação explícita e auditada.
- Estados principais protegem os invariantes do ERP; a empresa pode configurar
  etapas internas como impressão, prensa, costura, acabamento e embalagem.
- Desvio entre previsto e realizado alimenta o aprendizado agregado da empresa.
- Risco de atraso alerta o gestor; mensagem automática ao cliente respeita o perfil
  de autonomia do agente.

## Fluxo de entrega

- A empresa habilita retirada, entrega própria e/ou transportadora.
- O pedido registra modo, custo, responsável, referência de rastreio quando houver e
  comprovante de conclusão.
- Integração automática com transportadoras não é obrigatória no primeiro incremento.

## Fluxo de compra e reposição

- O NORTH detecta risco de falta e sugere itens e quantidades, sem criar compra.
- Gestor ou funcionário cadastra/seleciona o fornecedor e cria o pedido de compra.
- O pedido registra itens, quantidades, custos previstos, estado e responsável.
- O recebimento pode ser parcial; cada parcela recebida gera entrada rastreável no
  estoque e preserva o saldo pendente do pedido.
- Divergência de quantidade, custo ou qualidade gera ocorrência auditada e não altera
  silenciosamente o pedido original.

## Fluxo financeiro progressivo

- Pedidos, cobranças e recebimentos alimentam automaticamente entradas realizadas e
  previstas.
- Sem despesas cadastradas, o painel mostra a movimentação baseada nesses dados e
  sinaliza cobertura parcial; não apresenta o resultado como caixa líquido completo.
- Gestor ou funcionário pode cadastrar contas a pagar e despesas. Cada saída registra
  categoria, valor, vencimento, estado, pagamento e responsável.
- A saída pode ser única, parcelada ou recorrente, conforme escolha do usuário.
- A empresa informa o saldo inicial de cada conta financeira; ajustes posteriores
  geram movimentos auditados.
- Conforme saídas são alimentadas, o NORTH amplia projeção, saldo líquido e
  indicadores, sempre exibindo fontes, período e cobertura.
- O painel compara resultado estimado e realizado por pedido usando receitas e custos
  vinculados, deixando explícito qualquer componente ausente.
- Correções geram eventos compensatórios; títulos e pagamentos anteriores não são
  apagados ou silenciosamente sobrescritos.

## Fluxo de cliente e recorrência comercial

- O cliente é cadastrado como pessoa física ou jurídica e pode possuir identidades de
  WhatsApp e Instagram.
- Quando dados e comportamento indicarem possível duplicidade entre canais, o NORTH
  apresenta uma sugestão explicável; somente o gestor confirma a unificação.
- O histórico consolidado preserva a origem de cada contato, mensagem e pedido.
- Em novo pedido, o gestor decide se reutiliza arte ou informações anteriores. O
  sistema cria uma nova referência/versão, recalcula preço e materiais atuais, mostra
  os dados anteriores como comparação e mantém os registros originais intactos.
- Inadimplência gera aviso; o gestor decide a continuidade e a decisão é auditada.

## Fluxo de pós-venda

- Reclamação, devolução ou garantia é aberta a partir do cliente e pedido de origem.
- A ocorrência registra evidências, responsável, estado e solução.
- Quando houver refação, devolução de material, crédito, reembolso ou nova cobrança,
  o NORTH calcula os impactos e o gestor confirma a solução; somente então os módulos
  correspondentes executam movimentos rastreáveis.
- Encerrar a ocorrência não apaga conversas, decisões ou efeitos anteriores.

## Fluxo de atendimento com IA — candidato

- Meta entrega mensagem recebida por webhook autenticado.
- Integração identifica empresa, canal, cliente e conversa de forma idempotente.
- Orquestrador recupera configuração e conhecimento apenas daquela empresa.
- IA responde ou aciona ferramentas permitidas do ERP; decisões sensíveis exigem
  autorização humana no perfil assistido. A empresa pode habilitar autonomia maior,
  sempre sujeita a permissões, limites, idempotência e auditoria.
- Gestor/funcionário assume imediatamente se o cliente pedir, houver baixa confiança,
  reclamação, exceção comercial ou falha.
- Resposta sai pela API da Meta e status de entrega/erro retorna ao histórico.
