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

Pode gerenciar as equipes que lidera. Consegue adicionar/remover voluntarios, criar ou editar escalas da equipe e atribuir substitutos quando houver pedido de substituicao.

### Voluntario

Consulta suas escalas, confirma presenca, solicita substituicao, acessa avisos, manuais e atualiza seu proprio perfil.

## Modulos funcionais

- **Autenticacao e perfil**: login, sessao JWT, edicao de dados pessoais, senha e foto.
- **Equipes**: agrupamento de voluntarios e lideres por area.
- **Eventos**: compromissos recorrentes ou esporadicos que originam escalas.
- **Escalas**: atribuicoes de voluntarios por equipe e data.
- **Avisos**: comunicados globais, por equipe ou direcionados.
- **Manuais**: documentos e arquivos de apoio, opcionamente vinculados a equipes.
- **Ordens de culto**: roteiro/conteudo vinculado a eventos ou datas.
- **Notificacoes**: alertas internos, stream em tempo real e Web Push.

## Tecnologias

- Backend: Node.js, Express, Prisma, PostgreSQL, JWT, bcrypt, web-push.
- Frontend: React, Vite, lucide-react, CSS/Tailwind/PostCSS.
- Banco: PostgreSQL.
- Arquivos: Cloudflare R2 ou servico S3 compativel.
- Deploy previsto: API no Render e frontend em Vercel.

## Fluxo basico

1. Administrador cria equipes e usuarios.
2. Administrador define lideres e voluntarios das equipes.
3. Administrador cria eventos recorrentes ou esporadicos.
4. Sistema gera ou mantem ocorrencias de escalas.
5. Lideres e administradores atribuem voluntarios.
6. Voluntarios confirmam, pedem substituicao ou visualizam informacoes.
7. Avisos e notificacoes mantem todos informados.
