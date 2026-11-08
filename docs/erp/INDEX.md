# Índice e fonte de verdade do NORTH

## Finalidade

Este índice define como humanos e agentes devem localizar requisitos e resolver
conflitos. Nenhuma implementação deve depender de memória da conversa quando a
decisão já estiver documentada.

## Precedência

Quando dois documentos divergirem, use esta ordem:

1. decisão mais recente com status `CONFIRMADO` em `decisions/`;
2. regra confirmada em `02-business-rules.md`;
3. especificação do sprint em execução;
4. modelo de domínio e fluxos (`03` e `04`);
5. arquitetura, segurança, integrações e testes (`06` a `14`);
6. visão, descoberta, capacidades e roadmap (`00`, `01`, `05`, `11`);
7. documentos marcados `HIPÓTESE`, `PENDENTE` ou templates.

Uma decisão `PADRÃO TÉCNICO` pode ser refinada pela engenharia, mas não pode mudar
uma regra de negócio confirmada. Qualquer conflito real deve ser registrado e levado
ao responsável antes de uma alteração irreversível.

## Leitura por responsabilidade

| Tema                         | Documentos principais                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Produto e escopo             | `00-product-vision.md`, `05-capability-map.md`                                |
| Regras confirmadas           | `02-business-rules.md`, `open-questions.md`                                   |
| Entidades, estados e eventos | `03-domain-model.md`, `04-workflows.md`                                       |
| Arquitetura                  | `06-architecture.md`, `14-technical-blueprint.md`                             |
| Segurança e acesso           | `07-security-permissions.md`, ADR-009 a ADR-011, ADR-016                      |
| Integrações                  | `08-integrations.md`, ADR-003 a ADR-005                                       |
| UX                           | `09-ux-guidelines.md`                                                         |
| Testes                       | `10-test-strategy.md`                                                         |
| Roadmap                      | `11-roadmap.md`, `sprints/`                                                   |
| IA e aprendizado             | `12-ai-governance.md`, ADR-003, ADR-007, ADR-008                              |
| Estoque inteligente          | `13-intelligent-inventory.md`, ADR-002                                        |
| Execução por agentes         | `15-agent-execution-protocol.md`, `agent-prompts/README.md`, `agent-prompts/` |

## Decisões superadas

- ADR-001 foi superado pelo ADR-009. O produto é replicável, mas cada instalação
  operacional atende uma única empresa.

Agentes não devem implementar a alternativa superada apenas porque aparece no
histórico.

## Estado atual

- Discovery funcional: fechado para o escopo acordado.
- Regras confirmadas: 104.
- Perguntas documentadas: 70.
- Pendência jurídica: Q-052, política definitiva de retenção/eliminação.
- Arquitetura-base: definida em ADR-015 e ADR-016.
- Implementação: M1 concluído no commit `013bc8d`; Sprint 001 formalmente aceito
  em 2026-11-05. O Sprint 002 foi concluído e auditado na branch versionada pelo
  commit `b3aa5b5` (implementação em `d504940`).
- Sprint 003/M2B: concluído no código-base após a revisão R2 de onboarding autônomo.
  Cada instalação inicia sem Asaas, o gestor conecta a conta da própria empresa e o
  fluxo local é demonstrado com contrato oficial, stub estrito, PostgreSQL e E2E. A
  homologação externa é `PENDENTE DE IMPLANTAÇÃO POR EMPRESA` e não bloqueia o
  incremento; nenhuma conta real foi homologada nesta revisão.

## Regra de atualização

Ao concluir trabalho material:

- altere a regra/ADR quando a decisão mudar;
- atualize o sprint com evidências reais;
- não altere contadores deste índice sem conferir os arquivos-fonte;
- não apague decisões superadas; marque a substituição e a decisão sucessora.
