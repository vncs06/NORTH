# ADR-006 — Exceções operacionais e financeiras assistidas

- Status: CONFIRMADO
- Data: 2026-10-30
- Responsável pela decisão: responsável do produto

## Contexto

Cancelamentos, alterações após aprovação, refações e anomalias de pagamento afetam
simultaneamente estoque, produção, preço, recebimentos e relação com o cliente. Uma
regra automática rígida não atende todas as empresas de personalizados e poderia
executar uma decisão comercial ou financeira inadequada.

## Decisão

O NORTH detecta a situação, reúne evidências, calcula impactos, recomenda caminhos e
mantém o caso organizado. O gestor conserva a decisão final e pode configurar formas
inteligentes de tratamento quando desejar. Toda decisão registra regra aplicada,
dados considerados, ator, motivo, data e efeitos gerados.

### Cancelamento e alteração

- Cancelamento calcula reservas, consumos, serviços e pagamentos antes da decisão.
- Alteração após aprovação cria nova versão; histórico, preço, prazo e arte anteriores
  permanecem consultáveis.
- Diferença de preço e prazo é recalculada. Cobrança adicional depende da política
  configurada pelo gestor.

### Refação

- Erro da empresa tem custos assumidos pela empresa e auditados.
- Mudança solicitada pelo cliente após aprovação pode gerar cobrança se a empresa
  assim configurar.
- Defeito de material/fornecedor registra perda, custo e eventual crédito recuperável.

### Pagamentos

- Pagamento parcial ou sinal insuficiente gera aviso; o gestor decide a continuidade.
- Duplicidade ou excedente gera alerta; crédito e reembolso não são presumidos.
- Estorno ou chargeback abre revisão; o gestor decide os efeitos comerciais.
- Eventos originais nunca são apagados; correções e compensações são novos eventos.

## Emissão fiscal

A emissão fiscal não integra o primeiro incremento. O financeiro manterá uma fronteira
de integração e eventos suficientes para um provedor fiscal futuro, sem acoplamento
prematuro.

## Consequências

- A interface precisa mostrar impacto e evidência antes de pedir uma decisão.
- Permissões, limites e automações são configuráveis por empresa.
- Operações críticas exigem idempotência, trilha de auditoria e movimentos
  compensatórios.
- Revisão jurídica/fiscal continua necessária antes de transformar políticas da
  empresa em execução automática.
