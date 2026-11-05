# ADR-010 — Administrador NORTH e auditoria global

- Status: CONFIRMADO
- Data: 2026-11-04
- Responsável pela decisão: responsável do produto

## Contexto

Cada instalação atende uma empresa e o gestor é o papel máximo dentro dela. Ainda é
necessário um papel do criador do NORTH para administração, segurança e consulta do
histórico completo, sem confundi-lo com um funcionário da empresa cliente.

## Decisão

Criar o papel global **Administrador NORTH**, atribuído ao criador do sistema. Somente
esse papel acessa a visão completa de auditoria entre instalações. Ele não pertence à
hierarquia operacional da empresa e não substitui o gestor em decisões comerciais,
financeiras, produtivas ou de estoque.

## Controles obrigatórios

- autenticação reforçada e sessão administrativa separada;
- acesso somente leitura por padrão;
- motivo obrigatório para abrir dados de uma instalação;
- registro de quem acessou, quando, qual instalação e quais recursos consultou;
- nenhuma ação invisível: consultas e exportações administrativas também são auditadas;
- segredos, credenciais e dados de pagamento protegidos não são revelados pela visão
  de auditoria.

Qualquer capacidade futura de alterar dados de uma empresa exigirá decisão específica,
permissão distinta e mecanismo de intervenção auditada; não é concedida por este ADR.

## Consequências

- Painel administrativo e autenticação ficam separados do ERP da empresa.
- O gestor continua sendo a maior autoridade operacional dentro da instalação.
- Incidentes e suporte podem ser investigados sem conceder acesso global a usuários
  das empresas.
- Retenção e exibição de dados pessoais continuam sujeitas à política de privacidade e
  às bases legais aplicáveis.
