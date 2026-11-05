# ADR-016 — Instalação isolada e plano de controle

- Status: PADRÃO TÉCNICO
- Data: 2026-11-05
- Responsável pela decisão: Engenharia NORTH
- Complementa: ADR-009 e ADR-010

## Contexto

Cada sistema atende uma empresa, mas o mesmo produto precisa ser implantado,
atualizado e suportado para várias empresas. O Administrador NORTH precisa de visão
global sem transformar o ERP em aplicação operacional multiempresa.

## Decisão

Separar dois planos:

- **Plano da empresa:** web, API, worker, banco, arquivos, segredos e integrações da
  única empresa daquela instalação.
- **Plano de controle NORTH:** registro de instalações, versão, saúde, contrato,
  provisionamento e acesso administrativo temporário.

Cada empresa recebe banco próprio. Arquivos e segredos também usam fronteiras
exclusivas. O plano de controle não replica pedidos, conversas, estoque ou finanças.

## Auditoria administrativa

O Administrador NORTH solicita uma credencial curta, somente leitura e vinculada a
motivo. A instalação registra consultas sensíveis e exportações. Capacidade de
mutação exigirá decisão futura específica.

## Consequências

- Falha ou restauração de uma empresa não mistura dados com outra.
- Provisionamento, migrações e atualizações precisam ser automatizados.
- Custos por instalação ficam mensuráveis para implantação e mensalidade.
- Relatórios globais usam metadados operacionais, não dados de negócio dos clientes.
