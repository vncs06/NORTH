# ADR-014 — CRM multicanal e pós-venda rastreável

- Status: CONFIRMADO
- Data: 2026-11-05
- Responsável pela decisão: responsável do produto

## Contexto

O mesmo cliente pode conversar por WhatsApp e Instagram, repetir pedidos e voltar com
reclamações ou solicitações de garantia. Unificações automáticas ou reutilização sem
versionamento poderiam juntar pessoas erradas e alterar evidências históricas.

## Decisão

- Clientes podem ser pessoa física ou jurídica.
- O NORTH sugere unificar identidades multicanal quando houver evidências, mas não
  executa a mesclagem automaticamente; somente o gestor confirma.
- O gestor decide se arte ou informações anteriores serão reutilizadas em novo pedido.
- Inadimplência gera alerta; o gestor decide como prosseguir.
- Reclamações, devoluções e garantias ficam vinculadas ao cliente e ao pedido.
- Pedido repetido recalcula preço e materiais atuais, apresenta os dados anteriores
  como referência e deixa o gestor confirmar o preço final.
- Em devolução ou garantia, o NORTH calcula efeitos de estoque e financeiro e o gestor
  confirma a solução antes de qualquer movimento compensatório.

## Preservação de histórico

- Unificação mantém os identificadores e a origem de contatos e interações.
- Reutilização cria uma nova referência ou versão; nunca altera o pedido anterior.
- Decisões por exceção registram ator, motivo, data e efeitos.
- Pós-venda coordena movimentos de estoque e financeiro sem apagar lançamentos de
  origem.

## Consequências

- O CRM precisa de resolução de identidade explicável e reversível por correção.
- O histórico do cliente pode ser consolidado sem perder a procedência dos dados.
- Políticas específicas de garantia e devolução continuam configuráveis e sujeitas às
  obrigações aplicáveis.
