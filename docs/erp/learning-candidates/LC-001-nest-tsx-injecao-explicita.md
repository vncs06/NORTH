# LC-001 — Injeção explícita ao executar NestJS com tsx

- Estado: candidato local; não promovido para conhecimento transversal.
- Origem: Sprint 001 do NORTH ERP.
- Escopo: técnica de runtime, sem regra de negócio ou dado proprietário.

## Observação

Ao executar controllers do NestJS diretamente com `tsx`, depender somente de
`emitDecoratorMetadata` deixou dependências de construtor indefinidas neste ambiente.
O sintoma apareceu como `TypeError` em uma rota autenticada, embora o build TypeScript
estivesse válido.

## Padrão candidato

Usar `@Inject(Token)` explicitamente nas dependências de controllers e serviços cujo
runtime de desenvolvimento/teste é `tsx`, e cobrir a inicialização real da aplicação
por teste HTTP. O teste evita que sucesso de compilação seja confundido com container
de dependências funcional.

## Evidência e limite

O fluxo HTTP passou após a injeção explícita. A observação ainda precisa ser
reproduzida em outro projeto/runtime antes de qualquer promoção; pode ser específica
da combinação de ESM, decorators e executor usada neste workspace.
