# Descoberta do domínio

Projeto: NORTH ERP | Setor: Produtos personalizados

## Atores e responsabilidades

| Ator               | Responsabilidade inicial                                                                              | Status     |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ---------- |
| Gestor             | Papel máximo: configurar empresa e usuários, definir preços, acompanhar operação e autorizar exceções | CONFIRMADO |
| Atendimento/vendas | Registrar clientes, demandas, orçamentos e pedidos                                                    | CONFIRMADO |
| Designer           | Criar versões de arte e encaminhar para aprovação                                                     | CONFIRMADO |
| Produção           | Executar e registrar etapas de fabricação                                                             | CONFIRMADO |
| Estoque/compras    | Receber, reservar, movimentar e inventariar materiais                                                 | CONFIRMADO |
| Financeiro         | Registrar sinal, saldo final, estornos e conciliação                                                  | CONFIRMADO |
| Entrega            | Separar, despachar e comprovar entrega/retirada                                                       | CONFIRMADO |
| Cliente final      | Informar personalização, aprovar arte e pagar                                                         | CONFIRMADO |

## Processos atuais

- Entrada de demandas por WhatsApp e Instagram: CONFIRMADO.
- Etapas, ferramentas, responsáveis e exceções variam por empresa e serão mapeadas no
  onboarding; não existe um único processo atual global a ser confirmado no produto.

## Processos desejados

Fluxo candidato, sujeito às pendências registradas:
contato -> orçamento -> arte/versionamento -> aprovação -> pedido -> sinal ->
liberação de produção -> materiais -> produção -> qualidade -> pagamento final ->
entrega -> pós-venda.

Invariante confirmada: a produção não pode começar sem arte aprovada e sinal
registrado. Qualquer exceção futura exigirá permissão, motivo e auditoria.

## Glossário

- **Empresa da instalação:** única empresa atendida pelo sistema provisionado, com
  dados, usuários e configurações próprios.
- **Item de estoque:** qualquer item com saldo no motor unificado, como caneca,
  camisa, tinta, papel, vinil ou embalagem. Classificações não criam estoques separados.
- **Ficha técnica:** regra configurável que informa quais itens e quantidades uma
  personalização prevê consumir conforme produto, variante, técnica e quantidade.
- **Arte:** arquivo/versionamento que define a personalização de um item.
- **Aprovação:** aceite de uma versão específica da arte.
- **Sinal:** pagamento parcial que, com a arte aprovada, libera a produção.
- **Saldo final:** valor remanescente depois do sinal.

## Integrações e dependências

- WhatsApp e Instagram são canais confirmados com integração automática.
- Cada empresa conectará suas contas/canais e assumirá os custos definidos pela Meta.
- Asaas é o provedor financeiro confirmado. Emissão fiscal fica preparada para
  integração futura e transportadoras não terão integração obrigatória inicial.

## Hipóteses e validações

- CONFIRMADO: todos os itens usam o mesmo motor de saldo e serão consumidos de
  forma inteligente; o mecanismo candidato é uma ficha técnica configurável.
- CONFIRMADO: o cliente confirma a arte fora do painel e o gestor registra no
  painel a aprovação da versão correspondente, com ator e data auditados.
- CONFIRMADO: sinal é configurável por empresa e o saldo final precede a entrega.
- CONFIRMADO: IA, RAG e memória do NORTH sobre as APIs oficiais da Meta.
