# LC-004 — Ciclo seguro de credencial, taxas e desconexão Asaas

Status: `DRAFT` — candidato local; não incorporado à skill `3E`.

## Contexto

Uma integração financeira não está completa quando apenas cria cobranças. A mesma
fronteira precisa tratar validade da credencial, permissões de consulta, condições
comerciais vigentes, Webhook externo e obrigações ainda em reconciliação.

## Candidato reutilizável

1. validar a nova credencial e as permissões necessárias antes da troca atômica;
2. registrar somente fingerprint e resultado, nunca o segredo;
3. versionar taxa e política comercial separadamente e congelar ambas no documento;
4. bloquear novas operações antes de desconectar;
5. remover o Webhook enquanto a credencial ainda funciona;
6. manter estado pendente/erro quando a remoção externa não puder ser comprovada;
7. preservar inbox, cobranças e eventos financeiros após a desconexão;
8. testar rotação, desconexão e criação concorrentes com banco real.

## Evidência no NORTH

A revisão 003-R1 aplica esse padrão em conexão Asaas, snapshots de taxas, políticas
por meio, outbox/inbox e testes PostgreSQL. A generalização deve ser revisada antes
de eventual promoção para a skill compartilhada.
