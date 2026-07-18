# Visao geral

O Sistema MCom de Voluntarios centraliza a operacao de equipes de comunicacao. Ele organiza voluntarios, liderancas, escalas, eventos, avisos, manuais, ordens de culto e notificacoes em uma experiencia web responsiva com suporte a instalacao como PWA.

## Objetivos

- Reduzir trabalho manual na montagem e acompanhamento de escalas.
- Dar visibilidade para voluntarios sobre proximas responsabilidades.
- Permitir que lideres gerenciem suas equipes sem acesso administrativo total.
- Centralizar comunicados e materiais de treinamento.
- Registrar status de participacao: pendente, confirmada, substituicao solicitada e ausente.

## Perfis de acesso

### Administrador

Tem acesso completo ao painel administrativo. Pode cadastrar usuarios, equipes, eventos, escalas, avisos, manuais e ordens de culto.

### Lider de equipe

Pode gerenciar as equipes que lidera: adicionar voluntarios, definir os voluntarios de cada escala e atribuir substitutos quando houver pedido de substituicao. A criacao/exclusao de escalas e eventos e a remocao de voluntarios ficam a cargo do administrador.

### Voluntario

Consulta suas escalas, confirma presenca, solicita substituicao, acessa avisos, manuais e atualiza seu proprio perfil.

## Modulos funcionais

- **Autenticacao e perfil**: login, sessao JWT, edicao de dados pessoais, senha e foto.
- **Equipes**: agrupamento de voluntarios e lideres por area.
- **Eventos**: compromissos recorrentes ou esporadicos que originam escalas, com manutencao automatica de ocorrencias futuras.
- **Escalas**: atribuicoes de voluntarios por equipe e data.
- **Modelos de voluntarios**: definicao de quem atende cada semana do mes em um evento recorrente, aplicada automaticamente as escalas geradas.
- **Avisos**: comunicados globais, por equipe ou direcionados, com registro de leitura.
- **Manuais**: documentos PDF, PNG ou JPEG de apoio, gerais ou vinculados a equipes.
- **Ordens de culto**: PDF vinculado a uma ocorrencia especifica de evento.
- **Notificacoes**: alertas internos, stream em tempo real (SSE) e Web Push.

## Tecnologias

- Backend: Node.js, Express 5, Prisma 7 com driver adapter para PostgreSQL (`@prisma/adapter-pg` + `pg`), JWT, bcrypt e web-push.
- Frontend: React 19, Vite, Tailwind CSS, lucide-react e oxlint, com roteamento proprio e code splitting por pagina.
- Banco: PostgreSQL.
- Arquivos: Cloudflare R2 ou servico S3 compativel (URLs pre-assinadas).
- Deploy previsto: API no Render e frontend em Vercel.

## Fluxo basico

1. Administrador cria equipes e usuarios.
2. Administrador define lideres e voluntarios das equipes.
3. Administrador cria eventos recorrentes ou esporadicos, opcionalmente com um modelo de voluntarios por semana do mes.
4. Sistema gera e mantem as ocorrencias de escalas automaticamente.
5. Lideres e administradores ajustam os voluntarios de cada escala.
6. Voluntarios confirmam, pedem substituicao ou visualizam informacoes.
7. Avisos e notificacoes mantem todos informados.
