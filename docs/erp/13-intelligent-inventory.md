# Saldo inteligente de materiais

## Objetivo

Dar ao gestor uma visão confiável do que existe, do que já está comprometido, do
que cada pedido consumirá e do que precisa ser comprado, sem reduzir estoque a um
campo editável sem histórico.

## Quantidades por item da empresa

- **Física:** quantidade contada/recebida menos saídas físicas confirmadas.
- **Reservada:** comprometida com pedidos liberados para produção.
- **Disponível:** física menos reservada, respeitando bloqueios.
- **Prevista:** demanda simulada por orçamentos; não compromete saldo.
- **Em compra:** quantidade de pedidos de compra ainda não recebidos.
- **Projetada:** disponível mais entradas previstas menos demanda futura considerada.

Não haverá localização física no escopo atual. Cada empresa possui um saldo
consolidado por material. Cada material define uma unidade-base (`un`, `m`, `m²`,
`ml`, `g` etc.); conversões complexas ficam fora do MVP.

## Fluxo confirmado

1. Gestor cadastra material, unidade, custo e demais parâmetros.
2. Ficha técnica relaciona produto/variante/técnica aos materiais previstos.
3. Orçamento calcula necessidade e custo sem movimentar estoque.
4. Arte aprovada e sinal recebido liberam o pedido e reservam o previsto.
5. Produção recebe o previsto pré-preenchido e registra o consumo real.
6. Diferenças são classificadas como sobra devolvida, perda, consumo adicional ou
   refação; cada operação gera movimento.
7. Conclusão libera reservas não consumidas e atualiza indicadores de rendimento.

Se o saldo for insuficiente, o sistema alerta e explica a falta. O gestor pode
prosseguir, assumindo a exceção com motivo e auditoria; o NORTH não bloqueia a decisão.

## Formação de preço

Material é a base obrigatória. O gestor pode ativar ou desativar componentes como
perda prevista, mão de obra, custo operacional, taxa de pagamento e margem. A
simulação explica cada componente e orçamentos emitidos preservam um snapshot.

O gestor escolhe cálculo por markup ou margem desejada. A interface mostra custo,
percentual, preço calculado e diferença entre os métodos para evitar interpretação
ambígua, preservando no orçamento qual método e parâmetros foram usados.

A proposta comercial não expira automaticamente. Quando o gestor ajusta repetidamente
o valor sugerido em contextos semelhantes, o NORTH passa a adaptar a próxima sugestão
à prática observada da empresa. O valor anterior continua intacto e a sugestão informa
evidências, amostra e confiança; alteração de tabela ou regra continua dependendo de
ação autorizada.

## Movimentos obrigatórios

Recebimento, reserva, liberação de reserva, consumo, devolução, perda, ajuste e
inventário. Todo movimento registra tenant, item, quantidade, unidade, ator, origem,
horário, correlação e motivo quando aplicável.

## Concorrência e correção

- Reserva e consumo são transacionais para impedir uso duplo do mesmo saldo.
- Reprocessar comando ou evento não duplica movimento.
- Correção gera movimento compensatório; não apaga histórico.
- Inventário registra contagem, divergência, aprovação e ajuste resultante.

## Aprendizado operacional

O sistema compara previsto e realizado em ordens concluídas do mesmo produto,
variante e técnica. Ele pode identificar padrões de consumo, perda e refação e gerar
sugestões com tamanho da amostra, dispersão, confiança e impacto estimado.

Não existe quantidade mínima fixa para começar a sugerir. Com pouca evidência, a
sugestão aparece com confiança baixa; o usuário autorizado decide se ela é útil.

O aprendizado é isolado por empresa e não altera regras sozinho. Uma sugestão pode:

- propor quantidade, rendimento ou perda da ficha técnica;
- melhorar o preenchimento do consumo previsto;
- ajustar aviso de reposição;
- destacar combinações frequentes de materiais.

Ordens excepcionais, canceladas ou marcadas como refação são analisadas separadamente
para não distorcer o consumo normal. O aprendizado usa dados agregados da empresa por
produto, variante e técnica; não cria ranking nem perfil de consumo de funcionários.
Alterações em ficha técnica ou estoque mínimo exigem aceite de gestor ou papel
autorizado e preservam a evidência usada.

## Avisos de reposição

Emitir avisos explicáveis combinando saldo, reservas, consumo recente e estoque mínimo
definido pelo gestor. O sistema não compra automaticamente; apenas informa e sugere
quantidade.

O usuário pode transformar a sugestão em pedido de compra, escolhendo fornecedor,
itens, quantidades e custos. Recebimentos parciais ou totais geram entradas no razão
de estoque e mantêm vínculo com o pedido e o fornecedor.

## Decisões pendentes

Nenhuma decisão de negócio pendente para o núcleo do saldo inteligente.
