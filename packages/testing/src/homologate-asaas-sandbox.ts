import 'dotenv/config';

const required = ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_AUTH_TOKEN', 'ASAAS_WEBHOOK_PUBLIC_URL'] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  process.stderr.write(
    `BLOQUEADO: homologação real exige variáveis seguras ausentes: ${missing.join(', ')}. ` +
      'Não informe segredos em argumentos ou no repositório.\n',
  );
  process.exitCode = 2;
} else if (!process.env.ASAAS_WEBHOOK_PUBLIC_URL!.startsWith('https://')) {
  process.stderr.write('BLOQUEADO: ASAAS_WEBHOOK_PUBLIC_URL deve usar HTTPS público.\n');
  process.exitCode = 2;
} else {
  process.stdout.write(
    'Pré-condições presentes. A homologação real deve ser executada pelo fluxo autenticado e conferida no painel Sandbox.\n',
  );
}
