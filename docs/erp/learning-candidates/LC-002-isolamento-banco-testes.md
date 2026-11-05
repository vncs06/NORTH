# LC-002 — Isolamento destrutivo por banco allowlisted

- Estado: candidato local; não promovido para conhecimento transversal.
- Origem: revisão corretiva do Sprint 001 do NORTH ERP.
- Escopo: infraestrutura de teste e segurança operacional, sem regra de negócio.

## Observação

Validar apenas `NODE_ENV=test` e host local não separa um banco de teste do banco de
desenvolvimento: ambos podem estar no mesmo servidor. Comparar somente as strings de
conexão também é insuficiente, pois formas diferentes podem apontar para o mesmo
destino.

## Padrão candidato

Para operações destrutivas locais, exigir variável exclusiva sem fallback, banco de
nome fixo/allowlisted, host local, ambiente de teste e desigualdade dos destinos após
normalizar host, porta e nome. Repetir a validação após conectar usando
`SELECT current_database()` e executar a mutação pela mesma conexão validada. A
mensagem de recusa não deve incluir credenciais.

Portas de E2E também devem ser exclusivas e verificadas antes de preparar o banco,
para que uma colisão não afete serviços de desenvolvimento já ativos.

## Evidência e limite

O padrão foi exercitado por nove testes unitários de segurança, um teste de integração
contra conexão real divergente, recusas por CLI e E2E em `3100/3101` enquanto
`3000/3001` permaneceram ativos. A promoção exige evidência em outro projeto e revisão
da política de allowlist para ambientes que não sejam locais.
