# Protocolo de execução e handoff por agentes

## Objetivo

Garantir que cada agente receba contexto suficiente, trabalhe dentro do escopo e
entregue evidências que permitam ao responsável e ao próximo agente continuar sem
reconstruir decisões.

## Conteúdo obrigatório de cada prompt

Todo prompt de implementação deve incluir:

1. objetivo verificável do incremento;
2. workspace e estado inicial esperado;
3. documentos que devem ser lidos integralmente;
4. decisões bloqueadas que não podem ser reinterpretadas;
5. escopo e fora de escopo;
6. modelo de dados e contratos mínimos;
7. regras de autorização, auditoria, idempotência e concorrência;
8. telas e comportamento de UX;
9. testes e comandos obrigatórios;
10. critérios de aceite rastreáveis;
11. formato de handoff;
12. condições que exigem parar e pedir decisão.

## Condições para o agente parar

O agente deve interromper somente a parte afetada e relatar o bloqueio quando:

- documentação confirmada contém conflito que muda dinheiro, estoque, permissão,
  privacidade ou contrato;
- a solução exige ampliar o escopo funcional;
- credencial ou serviço externo indispensável está ausente;
- migração pode destruir dados existentes;
- a única forma de avançar violaria isolamento, auditoria ou segurança.

Problemas comuns de dependência, lint, tipos ou testes não justificam abandonar o
incremento: devem ser diagnosticados e corrigidos ou demonstrados como bloqueio real.

## Estados dos critérios

- `PASSOU`: implementado e demonstrado por teste ou verificação reproduzível.
- `FALHOU`: executado e obteve resultado incompatível.
- `NÃO EXECUTADO`: não foi tentado; incluir motivo.
- `BLOQUEADO`: depende de decisão, credencial ou condição externa específica.

## Formato obrigatório do handoff

O agente deve encerrar com exatamente estas seções:

### 1. Resultado

Resumo objetivo do fluxo que agora funciona e do que não ficou pronto.

### 2. Alterações

Lista de arquivos criados/alterados agrupados por aplicação, banco, testes,
infraestrutura e documentação.

### 3. Banco e migrações

Migrações criadas, tabelas/índices/constraints relevantes, forma de aplicar e risco de
compatibilidade.

### 4. Comandos executados

Para cada comando: comando completo, código de saída e resumo do resultado. Não usar
“testes passaram” sem listar os comandos.

### 5. Matriz de aceite

Uma linha por critério do sprint: `PASSOU`, `FALHOU`, `NÃO EXECUTADO` ou `BLOQUEADO`,
com evidência curta.

### 6. Decisões e desvios

Assunções técnicas, divergências da documentação e qualquer solução diferente do
prompt, com justificativa.

### 7. Problemas e riscos

Erros encontrados, dívida técnica, segurança, desempenho, concorrência e itens que
podem afetar o próximo incremento.

### 8. Como executar

Passos exatos para instalar, configurar ambiente, aplicar migração, iniciar serviços
e reproduzir o fluxo.

### 9. Próximo passo recomendado

Somente o próximo incremento seguro; não iniciar trabalho extra.

## Como o responsável deve devolver o resumo

Ao trazer o resultado para esta conversa, preserve as nove seções. Inclua mensagens
de erro completas quando houver falha e não resuma uma falha apenas como “não deu”.
Isso permite gerar o próximo prompt com base em evidência, não em suposição.
