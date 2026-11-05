# Registro de prompts de execução

## Finalidade

Esta pasta contém os comandos completos entregues aos agentes que implementam o
NORTH. Cada arquivo é uma instrução versionada e auditável: depois de executado, seu
conteúdo não deve ser reescrito para aparentar que um problema já estava previsto.
Correções devem receber um novo prompt ou uma revisão explicitamente identificada.

## Fluxo de trabalho

1. O responsável copia integralmente o prompt autorizado para o agente executor.
2. O executor lê os documentos indicados antes de alterar o projeto.
3. O executor implementa somente o incremento autorizado e executa as verificações.
4. O executor devolve as nove seções definidas em
   `../15-agent-execution-protocol.md`, incluindo erros completos e evidências.
5. O resultado é auditado contra o sprint e as regras confirmadas.
6. Se houver defeito ou bloqueio, é criado um prompt corretivo específico. Se o
   aceite estiver completo, é criado o prompt do próximo incremento.

Um resumo livre como “foi feito” não encerra um sprint e não autoriza o seguinte.

## Estados

- `PREPARADO`: pronto para ser entregue ao executor.
- `EM EXECUÇÃO`: enviado ao executor, aguardando handoff.
- `EM AUDITORIA`: handoff recebido e sendo confrontado com os critérios.
- `ACEITO`: todos os critérios obrigatórios possuem evidência suficiente.
- `CORREÇÃO NECESSÁRIA`: há falha, desvio ou evidência insuficiente.
- `BLOQUEADO`: depende de decisão ou condição externa claramente identificada.

## Registro atual

| Prompt                              | Incremento                              | Estado      | Próxima ação                              |
| ----------------------------------- | --------------------------------------- | ----------- | ----------------------------------------- |
| `PROMPT-001-executar-sprint-001.md` | Fundação, acesso e estoque transacional | `PREPARADO` | Entregar integralmente ao agente executor |

## Regra de numeração

- `PROMPT-NNN-executar-sprint-NNN.md`: implementação principal do sprint.
- `PROMPT-NNN-RX-corrigir-<tema>.md`: correção do mesmo incremento, sendo `X` a
  revisão sequencial.
- Um prompt corretivo deve citar o handoff anterior, o erro observado, a evidência
  esperada e os arquivos que podem ser alterados.

## Conteúdo de retorno que deve ser preservado

Ao devolver o resultado nesta conversa, mantenha:

- todos os nove títulos do handoff;
- comandos, códigos de saída e trechos relevantes dos erros;
- matriz completa de critérios de aceite;
- lista de arquivos e migrações;
- qualquer decisão tomada pelo executor que não estivesse expressamente autorizada;
- instruções de reprodução do problema.

Não remova caminhos, mensagens de erro ou critérios que falharam para encurtar o
relato. Esses dados serão usados para escrever o próximo prompt sem depender da
memória da execução.
