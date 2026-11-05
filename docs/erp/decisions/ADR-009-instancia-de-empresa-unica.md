# ADR-009 — Uma empresa por sistema

- Status: CONFIRMADO
- Data: 2026-11-03
- Responsável pela decisão: responsável do produto
- Supera: ADR-001

## Contexto

O NORTH será comercializado e replicado para diferentes empresas de personalizados.
Isso não significa que uma instalação terá várias empresas ou que um usuário poderá
alternar entre organizações dentro do sistema.

## Decisão

Cada sistema provisionado atende exatamente uma empresa. A empresa possui suas
configurações, usuários, canais, conhecimento, integrações, estoque e financeiro. Um
usuário pertence somente à empresa daquele sistema e não existe seletor de empresa.

O mesmo produto e código-base podem ser replicados para outras empresas. A forma
física de provisionar aplicação, banco, arquivos, filas e credenciais será uma decisão
técnica posterior, desde que preserve o isolamento entre instalações.

## Acesso

- O Administrador NORTH é um papel global separado, pertencente ao criador do sistema,
  e acessa a auditoria completa conforme ADR-010.
- O gestor é o papel máximo da empresa; não existe papel adicional de proprietário.
- Dentro da empresa existem somente Gestor e Funcionário; não há papéis
  departamentais nem permissões personalizadas, conforme ADR-011.
- A desativação de um funcionário revoga acesso e sessões, mas preserva sua identidade
  nos eventos históricos de auditoria, conforme política de retenção aplicável.

## Consequências

- Não há vínculo de usuário com várias empresas nem troca de contexto empresarial.
- Configurações e integrações pertencem à única empresa da instalação.
- Testes validam isolamento entre ambientes provisionados e autorização dentro da
  empresa.
- O provisionamento e a atualização de múltiplas instalações precisam ser
  automatizados operacionalmente.
