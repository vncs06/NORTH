# Handoff — Sprint 001

### 1. Resultado

O Sprint 001 está novamente `CONCLUÍDO` após a revisão corretiva de segurança. O
incremento vertical original continua funcionando e nenhuma regra de estoque,
dinheiro, papel ou permissão foi alterada.

A falha confirmada pela auditoria era real: o reset antigo aceitava qualquer banco
local quando `NODE_ENV=test`, integração/E2E podiam herdar `DATABASE_URL` e o handoff
afirmava uma trava de nome inexistente. A correção agora exige
`TEST_DATABASE_URL`, permite exclusivamente o banco local `north_test`, compara o
destino normalizado com o banco de desenvolvimento, recusa `north` e confirma o nome
real com `SELECT current_database()` antes da primeira instrução destrutiva.

O E2E usa processos próprios em web `3100` e API `3101`, com CORS/origem e URL da API
coerentes e build web em `.next-e2e`. O desenvolvimento permaneceu ativo em `3000` e
`3001` durante integração e E2E. Ao terminar, `3100/3101` estavam livres e somente
os processos de desenvolvimento continuavam ouvindo.

Uma sentinela temporária no banco `north` permaneceu intacta após integração e E2E e
foi removida isoladamente. As contagens retornaram exatamente ao estado inicial: 3
usuários, 24 materiais, 5 movimentos, 45 eventos de auditoria e 10 sessões. Passaram
16 testes unitários, 10 de integração com PostgreSQL real, 1 E2E, formatação, lint,
tipos e build. Nenhum item do Sprint 002 foi iniciado.

### 2. Alterações

- Segurança de banco de teste: criados
  `packages/testing/src/database-safety.ts`, `validate-test-database.ts`,
  `prepare-test-database.ts`, `drop-test-database.ts`,
  `run-with-test-database.ts` e `managed-process.ts`; alterados
  `reset-database.ts` e `index.ts`.
- E2E isolado: criados `e2e-ports.ts`, `check-e2e-ports.ts`,
  `build-e2e-web.ts` e `start-e2e-service.ts`; alterados
  `playwright.config.ts`, `apps/web/next.config.ts`, `apps/web/package.json`,
  `apps/api/src/main.ts`, `.gitignore`, `.prettierignore` e
  `eslint.config.mjs`.
- Testes: criado `packages/testing/src/database-safety.unit.test.ts`; alterados
  `apps/api/src/sprint-001.integration.test.ts` e `e2e/sprint-001.spec.ts` para
  verificar o banco real conectado.
- Orquestração: alterado `package.json` com fluxos `db:test:*`, execução isolada de
  integração/E2E, preflight de portas e aliases legados seguros. Uma chave duplicada
  `db:reset:test` foi removida sem mudar o valor efetivo do script.
- Configuração: `.env.example` agora documenta `TEST_DATABASE_URL` para
  `north_test`, `E2E_WEB_PORT=3100` e `E2E_API_PORT=3101`.
- Documentação: alterados `README.md`,
  `docs/erp/sprints/SPRINT-001-fundacao-estoque.md` e este handoff; criado
  `docs/erp/learning-candidates/LC-002-isolamento-banco-testes.md` como candidato
  local não promovido.
- Preservação: nenhum arquivo preexistente foi descartado, nenhum volume foi removido
  e os servidores de desenvolvimento não foram encerrados.

### 3. Banco e migrações

Nenhuma nova migração foi necessária. A migração versionada existente
`20261105120000_sprint_001` permaneceu inalterada e foi aplicada com sucesso desde um
`north_test` vazio; repetições retornaram `No pending migrations to apply`.

O fluxo dedicado é:

- `db:test:prepare`: valida a política antes da conexão administrativa e cria somente
  o nome fixo `north_test`, de forma idempotente;
- `db:test:migrate`: substitui `DATABASE_URL` apenas no processo filho pela URL já
  validada de teste e preserva a URL de desenvolvimento em
  `DEVELOPMENT_DATABASE_URL` para a comparação de segurança;
- `db:test:reset`: valida a configuração, conecta diretamente à URL de teste,
  confirma `current_database() = north_test` e só então executa `TRUNCATE` pela mesma
  conexão;
- `db:test:bootstrap`: executa exclusivamente em `north_test` e foi repetido com
  resultado idempotente;
- `db:test:drop`: opção de limpeza que aceita apenas o nome fixo allowlisted. Não foi
  usada nesta revisão, portanto `north_test` permanece disponível.

O banco principal `north` nunca foi migrado, truncado, recriado ou removido pelos
testes corretivos. A prova final somente leitura mostrou
`north|3|24|5|45|10|false`, onde o último campo confirma a ausência da sentinela já
removida. `north_test` foi o banco realmente conectado pelas suítes.

### 4. Comandos executados

| Comando ou prova | Código | Resultado real |
| --- | ---: | --- |
| Leitura integral de `AGENTS.md`, índice, Prompt 001, protocolo, sprint, handoff, configurações, fontes/testes e ADRs obrigatórios | 0 | Precedência, limites e critérios carregados antes das alterações. |
| `git status --short`, inventário com `rg --files` e inspeções somente leitura | 0 | Workspace sem baseline e com trabalho preexistente preservado. |
| `npm run test:database-safety` | 0 | 1 arquivo, 9 testes de proteção aprovados. |
| Reset direto com `NODE_ENV` diferente de `test` | 1 esperado | `Reset recusado: NODE_ENV deve ser test.` |
| Reset direto sem `TEST_DATABASE_URL` | 1 esperado | `Configuração de teste recusada: TEST_DATABASE_URL ausente.` |
| Reset com URLs normalizadas apontando ao mesmo destino | 1 esperado | `Banco de teste recusado: TEST_DATABASE_URL aponta para o mesmo banco de DATABASE_URL.` |
| Reset com banco declarado `north` | 1 esperado | `Banco de teste recusado: o banco principal north nunca é permitido.` |
| Reset com nome local fora da allowlist | 1 esperado | `Banco de teste recusado: use exclusivamente o banco north_test.` |
| Reset com host remoto | 1 esperado | `Banco de teste recusado: o host deve ser local.` |
| `npm run test:integration` sem `TEST_DATABASE_URL` | 1 esperado | Falhou com segurança antes de qualquer mutação. |
| `npm run db:test:prepare` | 0 | `north_test` criado na primeira prova e reconhecido idempotentemente nas seguintes. |
| `npm run db:test:migrate` contra banco vazio | 0 | Migração `20261105120000_sprint_001` aplicada exclusivamente em `north_test`. |
| `npm run db:test:reset` | 0 | Somente `north_test` foi limpo após validação pré e pós-conexão. |
| `npm run db:test:bootstrap` duas vezes | 0 / 0 | Primeira execução provisionou; segunda retornou `repeated: true`. |
| Listener temporário em `3100` + `npm run e2e:ports:check` | 1 esperado | `E2E recusado: a porta exclusiva 3100 já está ocupada.`; listener e banco preservados. |
| `npm run test:integration` final | 0 | 1 arquivo, 10/10 testes; inclui conexão real a `north` recusada após `current_database()`. |
| `npm run test:e2e` com desenvolvimento ativo | 0 | 1/1 fluxo aprovado em 17,3 s usando `north_test`, web 3100 e API 3101. |
| SQL de criação/leitura da sentinela antes das suítes | 0 | Sessão fake `11111111-1111-4111-8111-111111111111`; contagens iniciais `3/24/5/45/10`. |
| SQL de conferência após integração e E2E | 0 | Sentinela presente e contagens `3/24/5/45/11`; somente a sessão criada foi acréscimo. |
| Remoção SQL pelo ID exato da sentinela | 0 | Apenas a sentinela foi removida; contagens restauradas a `3/24/5/45/10`. |
| `npm run format:check` | 0 | Todos os arquivos abrangidos seguem Prettier. |
| `npm run lint` | 0 | ESLint sem erro ou warning. |
| `npm run typecheck` | 0 | TypeScript sem erro. |
| `npm run test` no sandbox | 1 ambiental | Três suítes impediram import por `EPERM`; nenhum teste foi coletado. |
| `npm run test` fora do sandbox | 0 | 3 arquivos, 16/16 testes aprovados sem alterar testes ou regras. |
| `npm run build` | 0 | API e worker compilados; web Next gerou 8 páginas/rotas. |
| Verificação final de portas e bancos | 0 | `3000/3001 LISTEN`; `3100/3101 FREE`; `north` intacto. |

Tentativas de diagnóstico que também retornaram falha, sem mutação:

- uma execução manual com credencial local incorreta terminou com código 1 e
  PostgreSQL `28P01`; a repetição usou a configuração local documentada;
- uma tentativa de carregar `.env` terminou com código 1 porque o arquivo não existe
  no workspace; nenhum segredo foi criado ou impresso;
- a primeira implementação do executor filho no Windows retornou `spawn EINVAL`;
  foi substituída por invocação restrita via `ComSpec`;
- a primeira propagação do processo filho comparou a URL de teste consigo mesma e
  recusou corretamente; `DEVELOPMENT_DATABASE_URL` passou a preservar a referência
  original;
- o primeiro E2E tentou um segundo `next dev` no mesmo diretório e encontrou o lock
  do Next; o servidor E2E passou a usar build/saída isolados em `.next-e2e`.

### 5. Matriz de aceite

| Critério | Estado | Evidência reproduzível |
| --- | --- | --- |
| Reset recusa banco principal | PASSOU | CLI recusou `north`; teste unitário específico passou. |
| Ausência de `TEST_DATABASE_URL` falha com segurança | PASSOU | CLI e integração terminaram com código 1 antes de conexão destrutiva. |
| URLs iguais são recusadas | PASSOU | Destinos diferentes em texto, mas normalizados como iguais, foram recusados. |
| Nome de banco inadequado é recusado | PASSOU | `north` e nome fora da allowlist foram recusados separadamente. |
| Host destrutivo deve ser local | PASSOU | Host remoto recusado antes da conexão. |
| Banco real conectado é verificado | PASSOU | Reset usa `current_database()`; integração abriu `north` e recebeu recusa. |
| Erros não vazam credenciais | PASSOU | Teste com senha-sentinela confirma ausência da senha e URL completa. |
| Reset funciona no banco permitido | PASSOU | `db:test:reset` código 0 em `north_test`. |
| Integração usa banco dedicado | PASSOU | 10/10 em PostgreSQL real; etapas registraram `north_test`. |
| E2E usa banco dedicado | PASSOU | Spec valida a conexão antes do fluxo; execução 1/1 em `north_test`. |
| E2E funciona com desenvolvimento ativo | PASSOU | `3000/3001` permaneceram ouvindo durante o E2E em `3100/3101`. |
| E2E encerra somente seus servidores | PASSOU | Depois da suíte, `3100/3101 FREE` e `3000/3001 LISTEN`. |
| Colisão de porta falha sem interferência | PASSOU | Preflight retornou código 1 antes do banco e preservou o listener. |
| Banco de desenvolvimento permanece intacto | PASSOU | Sentinela/contagens preservadas; estado final igual ao inicial. |
| Banco de teste é preparado de modo previsível | PASSOU | Nome fixo, migração desde vazio e bootstrap repetido. |
| Todos os gates do Sprint 001 continuam passando | PASSOU | Formato, lint, tipos, 16 unitários, 10 integrações, 1 E2E e build com código 0. |
| Segunda empresa é impedida | PASSOU | Integração mantém bootstrap idempotente e rejeição divergente. |
| Gestor cria/desativa funcionário e revoga sessão | PASSOU | Integração/E2E cobrem criação, desativação e `401` da sessão antiga. |
| Material, custo e quantidade obedecem ao contrato | PASSOU | Validações, centavos, histórico e decimal exato permanecem aprovados. |
| Razão é imutável, compensatória e auditada | PASSOU | Testes bloqueiam alteração e cobrem compensação/correlação. |
| Saldo negativo respeita papéis | PASSOU | Funcionário recebe `409`; gestor confirma com evento auditado. |
| Concorrência e idempotência preservam saldo | PASSOU | Integração real mantém serialização e replay sem duplicação. |
| Auditoria/logs não expõem dados sensíveis | PASSOU | Sanitização, logs e nova proteção não imprimem credenciais. |

### 6. Decisões e desvios

- A política é mais estrita que o sufixo `_test`: operações destrutivas aceitam
  exclusivamente `north_test`. Isso elimina nomes arbitrários.
- A URL é normalizada por host, porta padrão e nome decodificado. A referência de
  desenvolvimento é preservada em `DEVELOPMENT_DATABASE_URL` apenas para validação;
  desenvolvimento continua usando `DATABASE_URL`.
- Reset usa conexão `pg` própria para garantir que a conexão verificada seja a mesma
  que executa o `TRUNCATE`.
- O E2E usa build de produção isolado porque o Next 16 mantém lock por diretório.
  `reuseExistingServer` continua `false`.
- `START_HTTP_SERVER=true` existe apenas no launcher E2E para permitir API HTTP sob
  `NODE_ENV=test` de forma explícita.
- O defeito e a afirmação incorreta anteriores foram preservados no histórico.
- Não houve desvio funcional dos ADR-002, ADR-006, ADR-009, ADR-010, ADR-011,
  ADR-015 ou ADR-016.

### 7. Problemas e riscos

Não há bloqueio restante. Riscos conhecidos:

- a allowlist fixa atende ao ambiente local atual; testes paralelos futuros exigirão
  decisão explícita sem relaxar a proteção;
- os launchers Windows dependem de `ComSpec`; argumentos são restritos e não aceitam
  texto arbitrário;
- `.next-e2e` é artefato local ignorado e recriável;
- o repositório receberá agora seu baseline por autorização posterior do responsável.

Mensagens completas relevantes encontradas nesta revisão:

```text
Error: spawn EINVAL
    code: 'EINVAL',
    syscall: 'spawn'
```

```text
Banco de teste recusado: TEST_DATABASE_URL aponta para o mesmo banco de DATABASE_URL.
```

```text
⨯ Another next dev server is already running. PID 21268 is using C:\Users\tamba\Documents\ChatGPT\NORTH\apps\web\.next\dev\lock
```

```text
E2E recusado: a porta exclusiva 3100 já está ocupada.
```

```text
error: password authentication failed for user "north"
  severity: 'FATAL',
  code: '28P01',
  file: 'auth.c',
  routine: 'auth_failed'
```

```text
Get-Content: Cannot find path '.env' because it does not exist.
Exception: DATABASE_URL ausente no .env
```

```text
Error: EPERM: operation not permitted, rename 'C:\Users\tamba\AppData\Local\Packages\sandbox.{26824dd9-8600-4386-801d-53f14fd3157a}\AC\Temp\S93uX5aKwSCzWKO8Ha98X\ssr\.tmp-1793900414979-ddg8r6l26zf' -> 'C:\Users\tamba\AppData\Local\Packages\sandbox.{26824dd9-8600-4386-801d-53f14fd3157a}\AC\Temp\S93uX5aKwSCzWKO8Ha98X\ssr\e9202843dcb56a06106d38caf3b6724bc8d4804f'
```

A última falha era ambiental: a repetição fora do sandbox passou 16/16 sem mudar
código ou testes.

### 8. Como executar

1. Copiar `.env.example` para `.env` e manter `DATABASE_URL` em `north` e
   `TEST_DATABASE_URL` em `north_test`; não trocar manualmente uma pela outra.
2. Executar `npm install`,
   `docker compose -f infra/compose/compose.yaml up -d`, `npm run db:generate` e
   `npm run db:migrate` para preparar desenvolvimento.
3. Definir `BOOTSTRAP_*` localmente e executar `npm run db:bootstrap` quando
   necessário.
4. Executar `npm run dev`; desenvolvimento usa web `3000`, API `3001` e
   exclusivamente `DATABASE_URL`.
5. Usar `npm run db:test:prepare`, `npm run db:test:migrate`,
   `npm run db:test:validate`, `npm run db:test:reset` e
   `npm run db:test:bootstrap` somente com `TEST_DATABASE_URL`.
6. Executar `npm run test`, `npm run test:integration` e `npm run test:e2e`.
   O desenvolvimento em `3000/3001` pode continuar ativo.
7. Executar `npm run format:check`, `npm run lint`, `npm run typecheck` e
   `npm run build`.
8. A limpeza opcional `npm run db:test:drop` remove somente `north_test`; não
   remove volume nem toca em `north`.

### 9. Próximo passo recomendado

Auditar o commit/push desta revisão e, somente após a aceitação humana, preparar o
próximo incremento. Não iniciar o Sprint 002 nesta entrega.
