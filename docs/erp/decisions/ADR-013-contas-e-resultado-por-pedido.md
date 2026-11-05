# ADR-013 — Contas financeiras e resultado por pedido

- Status: CONFIRMADO
- Data: 2026-11-05
- Responsável pela decisão: responsável do produto

## Contexto

O financeiro progressivo precisa representar tanto dados automáticos do Asaas quanto
informações fornecidas pela empresa, sem depender de integração bancária ampla. O
gestor também precisa comparar o resultado esperado na venda com o que ocorreu na
produção e no recebimento.

## Decisão

- Contas a pagar podem ser únicas, parceladas ou recorrentes, conforme escolha do
  usuário em cada cadastro.
- A empresa informa o saldo inicial de cada conta financeira com data de referência.
- Asaas é a única integração financeira; outras contas e movimentos são manuais.
- Cada pedido apresenta lucro estimado e realizado.

## Resultado do pedido

O resultado estimado usa o snapshot da proposta: receita esperada, materiais,
perdas, taxas, mão de obra e outros componentes que a empresa tenha ativado.

O resultado realizado usa recebimentos, consumo real de materiais, perdas, refações,
taxas efetivas e demais custos diretamente vinculados ao pedido. Componentes ausentes
reduzem a cobertura e são exibidos como não informados, não como custo zero confiável.

## Integridade

- Saldo inicial, ajustes e pagamentos são movimentos; não se sobrescreve o total.
- Alterar recorrência não reescreve parcelas já realizadas.
- Estorno, cancelamento e correção geram eventos compensatórios.
- Dados manuais e integrados têm origem visível e são auditáveis.

## Consequências

- O caixa funciona sem Open Finance, desde que a empresa alimente os dados desejados.
- Indicadores devem distinguir realizado, previsto e nível de cobertura.
- Resultado por pedido é gerencial e não substitui contabilidade formal.
