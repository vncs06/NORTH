# Roadmap

## Objetivo e marco inicial

Entregar primeiro uma instalação de empresa única com autenticação, materiais,
movimentos, saldos e auditoria; depois evoluir verticalmente até pedido, produção,
financeiro e atendimento inteligente.

## Entregas verticais

| Marco | Fluxo utilizável                                              | Dependências                     | Critérios de aceite                                          |
| ----- | ------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| M1    | Login -> material -> movimento -> saldo -> auditoria          | ADR-015/016; PostgreSQL          | Razão imutável, idempotência, papéis e concorrência testados |
| M2    | Produto/ficha -> orçamento -> pedido -> arte+sinal -> reserva | M1; Asaas Sandbox                | Cálculo explicável e produção só libera com arte+sinal       |
| M3    | Pedido -> consumo real -> produção -> qualidade/refação       | M2                               | Movimentos rastreáveis e sem consumo duplo                   |
| M4    | Qualidade -> saldo final -> entrega -> financeiro progressivo | M3                               | Webhook conciliado, contas manuais e resultado por pedido    |
| M5    | Meta -> IA/humano -> demanda/pedido integrado                 | M2-M4; onboarding Meta, IA e n8n | Webhook idempotente, orçamento de IA e transferência humana  |

## Riscos e decisões bloqueantes

- Provedor/arquitetura de IA e limites de ações autônomas.
- Regras de transferência humana, retenção de conversas e fontes do RAG.
- Processo de aprovação Meta, requisitos de contas e custos por empresa.
- Evidência da confirmação externa usada pelo gestor ao aprovar uma arte.

## Fora de escopo e comercialização

- E-commerce público está definitivamente fora do NORTH.
- Emissão fiscal não entra no primeiro incremento; haverá fronteira para integração.
- Implantação mais mensalidade é o modelo comercial confirmado; valores e condições
  serão definidos separadamente.
- Contas a pagar e despesas são opcionais no uso, mas fazem parte do produto; sem
  esses dados, indicadores financeiros deixam explícita a cobertura parcial.
- Contabilidade formal permanece fora do escopo; o NORTH oferece gestão e indicadores
  gerenciais, sem se apresentar como sistema contábil.
