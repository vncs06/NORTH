# Segurança e permissões

## Empresa única e isolamento

Cada instalação atende uma única empresa. Não há cadastro de várias empresas, troca
de contexto ou vínculo do mesmo usuário com instalações diferentes. Dados, arquivos,
cache, filas, buscas, relatórios e backups restaurados permanecem limitados à empresa
provisionada. A arquitetura física de replicação será definida tecnicamente.

## Papéis e escopos

- Administrador NORTH: papel global e separado das empresas, mantido pelo criador do
  sistema; acesso ao histórico completo para administração, segurança e auditoria.
- Gestor: papel máximo; empresa, usuários, configurações, preços, operação,
  indicadores, exceções autorizadas, canais, IA, conhecimento e registro da
  aprovação da arte.
- Funcionário: acesso operacional comum a atendimento, arte, produção, estoque,
  compras, financeiro e entrega; não executa ações reservadas ao gestor.

Não existem papéis departamentais, acúmulo de papéis ou matriz personalizável. O
produto mantém somente Gestor e Funcionário dentro da empresa.

## Autorização server-side

Nenhuma permissão depende apenas da interface. Cada comando e consulta verifica
usuário, empresa da instalação, vínculo, papel/escopo, estado do recurso e autorização
da operação.

Somente o Gestor salva, valida, rotaciona ou desconecta a integração Asaas e habilita
meios de pagamento. Funcionário pode consultar apenas o estado operacional seguro.
API Key, token e e-mail completo são cifrados; GET, auditoria e logs retornam somente
estado, datas e valores mascarados. O Administrador NORTH permanece somente leitura e
não recebe esses segredos.

## Dados pessoais e retenção

Mensagens, mídias, artes e memória permanecem durante o vínculo ativo da empresa com
o NORTH. No encerramento, a empresa tem 30 dias para exportação antes da eliminação
auditada, ressalvadas obrigações legais de conservação. Bases legais, consentimentos,
categorias e prazos exigem revisão de privacidade. Artes, conversas, credenciais e
segredos têm acesso restrito, URLs temporárias e não aparecem em logs técnicos.

## Auditoria, backup e restauração

Auditar login, mudança de acesso, preço, aprovação de arte, liberação de produção,
movimentos de estoque, pagamentos, estornos, cancelamentos e exportações. O ator
histórico permanece identificável depois de sua desativação. Somente o Administrador
NORTH acessa o histórico completo entre instalações. Esse acesso usa autenticação
reforçada, exige motivo, é somente leitura por padrão e gera sua própria auditoria.
Backups devem ser criptografados e restaurações testadas em ambiente isolado.

## Riscos e verificações

- Testes automatizados de isolamento entre instalações e de autorização por papel.
- Prevenir enumeração de IDs e acesso cruzado a arquivos.
- Revogar sessões/acessos ao desativar usuário ou empresa.
- Não declarar conformidade legal sem avaliação jurídica e operacional aplicável.
- Tratar mensagens e documentos recuperados pelo RAG como dados não confiáveis; eles
  não podem conceder permissão nem substituir validações das ferramentas do ERP.
