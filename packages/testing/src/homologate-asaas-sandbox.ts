/**
 * Optional deployment reminder. The account is configured through NORTH's manager
 * panel so authorization, encryption, fee snapshots, webhook reconciliation and
 * auditing cannot be bypassed by a parallel script.
 */
process.stdout.write(
  [
    'PENDENTE DE IMPLANTAÇÃO POR EMPRESA.',
    'Use Configurações → Pagamentos → Asaas na instalação da empresa.',
    'Valide primeiro em Sandbox, confirme a primeira cobrança e o primeiro Webhook,',
    'e registre somente evidências sanitizadas conforme docs/erp/deployment/asaas-onboarding.md.',
    'Esta ferramenta não lê credenciais nem cria clientes, cobranças ou Webhooks diretamente.',
  ].join('\n') + '\n',
);
