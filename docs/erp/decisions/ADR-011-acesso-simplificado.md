# ADR-011 — Acesso simplificado da empresa

- Status: CONFIRMADO
- Data: 2026-11-04
- Responsável pela decisão: responsável do produto

## Contexto

Papéis separados para atendimento, design, produção, estoque, financeiro e entrega
aumentariam configuração e suporte sem corresponder à forma desejada de operar o
NORTH.

## Decisão

Dentro da empresa existem apenas dois papéis:

- **Gestor:** configura a empresa, usuários, integrações, preços, IA e autoriza ações
  críticas e exceções.
- **Funcionário:** possui o mesmo acesso operacional que qualquer outro funcionário,
  independentemente de departamento ou atividade.

Não existem papéis departamentais, acúmulo de papéis ou permissões personalizadas. O
Administrador NORTH permanece um papel externo e global, definido no ADR-010.

## Consequências

- A navegação e o suporte ficam mais simples.
- A autorização no servidor distingue somente gestor, funcionário e administrador
  NORTH.
- Funções críticas já reservadas ao gestor continuam protegidas.
- Se no futuro uma empresa exigir segregação de funções, isso será uma nova decisão,
  não uma complexidade antecipada no modelo atual.
