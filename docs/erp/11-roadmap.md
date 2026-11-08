# Roadmap

## Objetivo e marco inicial

Entregar primeiro uma instalação de empresa única com autenticação, materiais,
movimentos, saldos e auditoria; depois evoluir verticalmente até pedido, produção,
financeiro e atendimento inteligente.

## Entregas verticais

| Marco | Estado      | Fluxo utilizável                                                      | Dependências                     | Critérios de aceite                                             |
| ----- | ----------- | --------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| M1    | CONCLUÍDO   | Login -> material -> movimento -> saldo -> auditoria                  | ADR-015/016; PostgreSQL          | Razão imutável, idempotência, papéis e concorrência testados    |
| M2A   | CONCLUÍDO   | Produto/ficha -> cliente -> orçamento versionado                      | M1                               | Cálculo explicável, snapshot imutável e nenhuma reserva         |
| M2B   | CONCLUÍDO   | Orçamento -> pedido -> arte+sinal -> reserva                          | M2A; onboarding Asaas autônomo   | Fluxo local completo; homologação externa por implantação       |
| M3    | PLANEJADO   | Pedido -> consumo real -> produção -> qualidade/refação               | M2B                              | Movimentos rastreáveis e sem consumo duplo                      |
| M4    | PLANEJADO   | Qualidade -> saldo final -> entrega -> financeiro progressivo         | M3                               | Webhook conciliado, contas manuais e resultado por pedido       |
| M5    | PLANEJADO   | Meta -> IA/humano -> demanda/pedido integrado                         | M2-M4; onboarding Meta, IA e n8n | Webhook idempotente, orçamento de IA e transferência humana     |

O escopo histórico de M2 foi dividido em M2A e M2B para reduzir risco transacional.
M2A corresponde ao Sprint 002 concluído e calcula apenas demanda prevista. M2B
corresponde ao Sprint 003: conversão explícita em pedido, arte versionada, sinal,
webhook e reserva, sem iniciar consumo ou produção. A revisão R2 concluiu o onboarding
autônomo da conta de cada empresa, contrato estrito e bloqueio seguro sem conexão.
Homologação real permanece `PENDENTE DE IMPLANTAÇÃO POR EMPRESA`, sem bloquear M2B.

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
