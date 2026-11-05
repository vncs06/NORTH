# UX e design

## Usuários e jornadas

- Gestor conecta suas contas Meta, acompanha custos, define autonomia e supervisiona.
- Atendente acompanha fila, assume conversas e continua do ponto deixado pela IA.
- Demais papéis recebem tarefas e dados do atendimento conforme suas permissões.

## Hierarquia de informação

1. Situação dos canais e alertas críticos.
2. Conversas aguardando humano ou ação operacional.
3. Pedidos, produção, pagamentos e entregas relacionados à conversa.
4. Uso/custo, qualidade do atendimento e auditoria.

## Navegação e padrões de componentes

- Assistente guiado para conectar Meta e testar webhook/envio.
- Caixa de entrada omnichannel com origem claramente identificada.
- Painel de IA com linguagem de negócio, evitando expor parâmetros técnicos banais.
- Pré-visualização e teste antes de publicar mudanças do assistente.
- Histórico de versões e opção de restaurar configuração anterior.

## Responsividade e acessibilidade

Painel responsivo, navegação por teclado, contraste adequado, rótulos explícitos,
feedback não dependente apenas de cor e suporte a tecnologias assistivas.

## Estados vazios, erros e feedback

Exibir desconexão, token expirado, webhook atrasado, template rejeitado, limite de
custo, falha da IA e fila humana indisponível com causa e ação recomendada.

## Fluxos de tarefas frequentes

- Conectar conta/número e validar recebimento e envio.
- Conectar conta Asaas com guia para criar chave, validação, status, rotação e teste.
- Exibir meios habilitados, taxas vigentes, prazo de recebimento e estimativa líquida,
  sempre com data da consulta e aviso de que a condição contratual da conta prevalece.
- Simular preço mostrando custo de materiais, demais componentes, margem e preço final.
- Configurar identidade, tom, horários, conhecimento e ações permitidas à IA.
- Escolher perfil de autonomia: assistido ou autônomo supervisionado, com limites
  explícitos, simulação e botão geral de pausa.
- Definir quando transferir para humano e quais equipes recebem a conversa.
- Revisar respostas, fontes recuperadas, ações executadas e custos por conversa.
- Definir orçamento mensal de atendimento; mostrar total, detalhamento Meta/IA,
  projeção e alertas. n8n e infraestrutura não viram carteira do gestor.
- Aos 80%, notificar o gestor e oferecer aumento do orçamento ou manutenção do limite.
- Aos 100%, manter recebimento, pausar respostas do agente e criar transferência humana.
- Pausar a automação sem interromper o recebimento de mensagens.
