# Estratégia de testes

## Pirâmide

- Unitários: políticas de preço, saldo, estados, autorização e aprendizado.
- Integração: PostgreSQL real, migrações, transações, locks, inbox/outbox e jobs.
- Contrato: HTTP, eventos, Meta, Asaas, armazenamento e ferramentas de IA.
- Ponta a ponta: Playwright nos fluxos essenciais do gestor e funcionário.

## Invariantes prioritárias

- sistema contém uma única empresa;
- funcionário não executa ação reservada ao gestor;
- saldo deriva do razão e não sofre consumo/reserva duplicados;
- dinheiro e quantidades mantêm precisão;
- reprocessar comando, webhook ou job não duplica efeito;
- correção gera compensação e preserva histórico;
- Administrador NORTH é somente leitura por padrão e seu acesso é auditado.

## Concorrência e falhas

- duas reservas simultâneas não consomem o mesmo disponível;
- webhooks repetidos produzem uma transição;
- worker pode falhar após efeito externo e retomar com reconciliação;
- timeout de integração não confirma operação sem evidência;
- timeout após criação possível de Webhook reconcilia por nome e URL antes de repetir;
- onboarding Asaas usa stub estrito, recusa contrato incompleto, valida ausência de
  segredo e demonstra concorrência/idempotência no PostgreSQL;
- migração interrompida tem procedimento de recuperação.

## Segurança

- testes negativos de autenticação e autorização em cada comando/consulta;
- IDs manipulados não atravessam instalação nem ampliam permissão;
- logs não contêm senha, token, API Key, cartão ou conteúdo de arte;
- URLs de arquivo são temporárias;
- sessões revogadas deixam de funcionar imediatamente.

## Gates por pull request

- formatação, lint e tipos;
- unitários e integração;
- build das aplicações;
- migração desde banco vazio;
- verificação de dependências e segredos;
- E2E do fluxo alterado quando aplicável.
- homologação Asaas real é checklist por instalação, não gate global do código-base.

## Evidências

Cada sprint registra comandos executados, resultados, limitações e testes não
realizados. Nenhum ambiente será declarado pronto para produção apenas por buildar.
