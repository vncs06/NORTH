# ADR-003 — Meta como canal e inteligência do NORTH

- Status: CONFIRMADO
- Data: 2026-10-30
- Recomendação: IA/RAG próprios; Meta como canal e onboarding

## Contexto

O produto terá atendimento automático em WhatsApp e Instagram para várias empresas.
Cada empresa deve configurar seus ativos e assumir os custos dos canais. A Meta
oferece APIs de mensageria e também uma plataforma própria de agentes de IA.

## Decisão

Usar as APIs oficiais da Meta e o Embedded Signup para conectar ativos empresariais.
Manter no NORTH o estado da conversa, RAG isolado, prompts, ferramentas do ERP,
segurança, auditoria, custos de IA e transferência para humano.

Não adotar Meta Business Agent Platform como dependência central nesta fase. Ela
poderá ser oferecida futuramente como adaptador opcional se houver valor comprovado.

## Fronteira de responsabilidades

- Meta: identidade/ativos do canal, transporte, webhooks, templates, status, janela,
  qualidade, políticas e preços de mensageria.
- NORTH: atendimento especializado, conhecimento, memória, decisões, ferramentas,
  caixa de entrada, governança, observabilidade e integrações com o ERP.
- Empresa cliente: titularidade/configuração dos ativos, custos, conteúdo aprovado,
  consentimentos e usuários autorizados.

## Política e privacidade

- A automação sempre terá caminho claro e direto para atendimento humano.
- O produto não será apresentado como assistente de IA de uso geral.
- Dados do WhatsApp não serão usados para treinar ou melhorar modelos gerais.
- Mensagens, anexos e conhecimento serão isolados por empresa e sujeitos a retenção.

## Consequências

- Maior controle do produto, dos custos e da experiência omnichannel.
- Necessidade de operar modelos/provedores, RAG, segurança e observabilidade.
- Necessidade de aprovação/onboarding Meta como Tech Provider ou arranjo equivalente.
- Mudanças de política da Meta exigem monitoramento e adaptação do produto.

## Fontes oficiais consultadas em 2026-10-30

- https://whatsappbusiness.com/developers/developer-hub/
- https://whatsappbusiness.com/partners/become-a-partner/
- https://whatsappbusiness.com/policy/
- https://www.whatsapp.com/legal/business-solution-terms
- https://ai.meta.com/meta-business-agent/platform/
