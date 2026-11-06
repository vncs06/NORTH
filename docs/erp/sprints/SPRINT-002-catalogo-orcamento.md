# Sprint 002 — Catálogo, ficha técnica, precificação e orçamento versionado

- Status: CONCLUÍDO
- Tipo: incremento vertical M2A
- Baseline: Sprint 001 aceito no commit `013bc8d`
- Branch: `sprint-002-catalogo-orcamento`

## Valor verificável

O gestor configura catálogo, ficha técnica e política de preço. Gestor ou funcionário
cadastra cliente, simula e emite orçamento com consumo previsto, custo e composição
explicável. A emissão preserva snapshot imutável; uma revisão explícita recalcula com
dados atuais sem apagar a versão anterior.

Orçamento não cria pedido, arte, cobrança, reserva ou movimento de estoque.

## Rastreabilidade

| Entrega | Origem |
| --- | --- |
| Empresa única e dois papéis | BR-001, BR-006, BR-067–073, ADR-009/011/016 |
| Catálogo configurável | BR-028 |
| Material como base e componentes opcionais | BR-029, BR-035 |
| Rendimento, perda e unidade-base | BR-038, BR-040, ADR-002 |
| Snapshot do orçamento | BR-036, Q-023 |
| Markup ou margem | BR-075, Q-056 |
| Política de desconto | BR-058, Q-041 |
| Proposta sem vencimento automático | BR-064, Q-040 |
| Cliente PF/PJ | BR-085, Q-063 |
| Versão e decisão explícita | ADR-006 |
| Monólito modular e banco isolado | ADR-015/016 |

## Escopo

1. Clientes PF/PJ com busca, cursor, estado, versão otimista e auditoria.
2. Produtos, variantes, técnicas e combinações genéricas configuráveis.
3. Fichas `DRAFT`, `ACTIVE` e `ARCHIVED`, componentes materiais e revisão.
4. Política versionada por `MARKUP` ou `MARGIN`.
5. Componentes adicionais fixos por orçamento, fixos por unidade ou percentuais
   sobre materiais.
6. Opções explícitas de desconto e limites para funcionário e gestor.
7. Rascunho, simulação, emissão, cancelamento gerencial e revisão de orçamento.
8. Snapshots estruturados de cliente, ficha, consumo, custo, disponibilidade,
   componentes, fórmula, desconto e ajuste manual.
9. Interface responsiva e versão HTML para impressão.
10. Auditoria, idempotência e concorrência em PostgreSQL real.

## Fórmulas confirmadas

```text
consumo_base = quantidade_solicitada / rendimento * quantidade_componente
consumo_com_perda = consumo_base * (1 + perda_bps / 10000)
custo_linha_centavos = HALF_UP(consumo_com_perda * custo_unitário_centavos)

MARKUP: preço = HALF_UP(custo * (10000 + markup_bps) / 10000)
MARGEM: preço = HALF_UP(custo * 10000 / (10000 - margem_bps))
```

Quantidades usam escala de seis casas, dinheiro usa centavos inteiros e todo
arredondamento persistido é determinístico `HALF_UP`.

## Invariantes

- Somente gestor altera catálogo, fichas e políticas.
- Uma combinação possui no máximo uma ficha ativa.
- Ficha ativa/arquivada e componentes usados não são sobrescritos.
- Material inativo ou sem custo vigente bloqueia ativação/emissão conforme o caso.
- Unidade do componente coincide com a unidade-base do material.
- Falta de saldo gera aviso, mas não bloqueia orçamento.
- Simulação e emissão não alteram `inventory_movements` nem
  `reserved_quantity`.
- Funcionário respeita limite próprio; gestor respeita limite gerencial.
- Ajuste manual de preço é exclusivo do gestor e exige motivo.
- Orçamento emitido é imutável e não possui `expires_at`.
- Revisão cria novo orçamento; o anterior só vira `SUPERSEDED` quando a nova revisão
  é emitida.
- Emissão captura ficha, custos e política de um conjunto consistente na transação.
- Operações reenviáveis usam `Idempotency-Key`.

## Estados

- Ficha técnica: `DRAFT -> ACTIVE -> ARCHIVED`.
- Orçamento: `DRAFT -> ISSUED -> SUPERSEDED` ou `ISSUED -> CANCELLED`.
- Revisão nasce `DRAFT` ligada ao documento anterior.

## Autorização

| Ação | Funcionário | Gestor |
| --- | --- | --- |
| Clientes | Consultar/criar/editar | Consultar/criar/editar |
| Catálogo e fichas | Consultar | Configurar/ativar/revisar |
| Política | Consultar visão operacional | Configurar/versionar |
| Orçamento | Criar/simular/emitir/revisar | Todas, incluindo ajuste e cancelamento |
| Auditoria | Não | Sim |

## Critérios de aceite

1. Cliente PF/PJ é persistido, pesquisável, versionado e auditado.
2. Catálogo representa caneca/camisa sem tabelas específicas de setor.
3. Ficha ativa é única, versionada, imutável e usa materiais reais.
4. Consumo e perda preservam precisão e valores intermediários.
5. Custos vigentes e componentes adicionais formam preço explicável.
6. Markup e margem produzem resultados distintos e corretos.
7. API rejeita desconto acima do limite do papel.
8. Ajuste manual exige gestor e motivo.
9. Emissão gera número único, snapshot consistente e imutável.
10. Alterações posteriores não modificam documento emitido.
11. Revisão usa dados atuais e preserva a versão anterior.
12. Concorrência/idempotência não duplicam emissão, ficha, revisão ou número.
13. Nenhum movimento/reserva é criado por orçamento.
14. Dados pessoais não aparecem em logs técnicos.
15. E2E completo passa em `north_test` e `3100/3101`.
16. Migração funciona desde vazio e sobre dados do Sprint 001.

## Testes obrigatórios

- Unitários: consumo, perda, HALF_UP, custos, componentes, markup, margem, desconto,
  ajuste manual e transições.
- Integração/HTTP: autorização, ficha ativa, emissão consistente, imutabilidade,
  revisão, idempotência, concorrência, preservação de estoque e auditoria.
- E2E: gestor configura; funcionário emite; gestor altera e revisa; versões são
  comparadas e estoque permanece igual.
- Regressão integral do Sprint 001, incluindo segurança do banco de teste.

## Fora de escopo

Pedido, arte, upload, Asaas, cobrança, webhook, reserva/consumo, produção, qualidade,
entrega, compras, financeiro, canais, IA/RAG, n8n, e-commerce, fiscal, PDF e envio da
proposta.

## Definição de pronto

Somente `CONCLUÍDO` quando todos os critérios tiverem evidência, migração e gates
retornarem zero, banco principal estiver intacto e o E2E isolado passar. Caso
contrário, o estado será `PARCIAL` ou `BLOQUEADO`.
