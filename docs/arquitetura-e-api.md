# Arquitetura e API

## Arquitetura geral

O sistema e dividido em dois projetos:

- `voluntarios-api`: API REST em Express 5, com Prisma 7 usando driver adapter (`@prisma/adapter-pg` sobre um pool `pg`) e PostgreSQL.
- `voluntarios-frontend`: SPA React 19/Vite que consome a API, com roteamento proprio (sem react-router) e code splitting por pagina.

A API aplica um middleware global em `/api` que exige token Bearer, exceto para `POST /api/auth/login` e o proxy publico de fotos (`GET /api/auth/fotos/...`). Cada arquivo de rota revalida o usuario a partir do token e, quando necessario, exige permissao administrativa. O stream de notificacoes (`GET /api/notificacoes/stream`) autentica pelo token passado na query string, por ser um EventSource.

## Modelo de dados

### Usuarios

Tabela `usuarios`.

Campos principais: nome, email unico, senha hash, telefone, foto, nascimento, sexo e permissoes. Um usuario pode ter mais de uma permissao ao mesmo tempo (por exemplo, lider que tambem e voluntario).

Permissoes:

- `ADMINISTRADOR`
- `LIDER_EQUIPE`
- `VOLUNTARIO`

Tabela `tokens_redefinicao_senha`.

Reservada para o fluxo de redefinicao de senha por token. No momento nao ha rota exposta para redefinicao autonoma: a troca de senha e feita pelo proprio usuario em `PATCH /auth/me/senha` ou por um administrador que gera senha temporaria.

### Equipes

Tabela `equipes`.

Relaciona voluntarios e lideres. Tambem se conecta a escalas, eventos, manuais e avisos.

### Eventos e escalas

Tabela `eventos`.

Representa um compromisso recorrente ou esporadico:

- `TipoEscala`: `RECORRENTE` ou `ESPORADICA`.
- `FrequenciaEvento`: `NAO_REPETE`, `SEMANAL`, `MENSAL`.
- Campos de regra: data inicial, data final, dia da semana e semana do mes.

Tabela `escalas`.

Representa a ocorrencia de uma equipe em um evento/data. Pode ter voluntarios associados.

Tabela `voluntarios_escalas`.

Relaciona usuario e escala, com status:

- `PENDENTE`
- `CONFIRMADA`
- `PEDIU_SUBSTITUICAO`
- `AUSENTE`

Tambem registra justificativa, se o voluntario e substituto, o usuario que atribuiu a escala e as datas de ocorrencia do status e da substituicao (para lidar com status por ocorrencia em escalas recorrentes).

Tabela `modelos_escalas_voluntarios`.

Modelo de voluntarios de um evento por semana do mes (`semanaMes` de 1 a 5) e equipe. Ao gerar novas ocorrencias de um evento recorrente, os voluntarios do modelo correspondente sao atribuidos automaticamente as escalas daquela semana do mes.

### Conteudo e comunicacao

- `avisos`: comunicados globais, por equipe ou individuais.
- `avisos_destinatarios`: usuarios direcionados por aviso.
- `avisos_visualizacoes`: leitura de avisos.
- `manuais`: arquivos PDF e descricoes de treinamento.
- `ordens_culto`: PDF de uma ordem de culto vinculado a uma ocorrencia de evento.

### Notificacoes

- `notificacoes`: notificacoes internas por usuario, com chave unica para evitar duplicidade.
- `web_push_subscriptions`: inscricoes Web Push.

Tipos de notificacao (`TipoNotificacao`):

- `CONFIRMACAO_ESCALA`
- `SUBSTITUTO`
- `ALERTA_LIDER`
- `ORDEM_CULTO`
- `AVISO`

### Auditoria

- `logs_auditoria`: registros de login, alteracoes e outras acoes.

## Rotas

Todas as rotas abaixo ficam sob `/api`.

### Autenticacao e perfil

- `POST /auth/login`: autentica email e senha.
- `GET /auth/me`: retorna usuario autenticado.
- `GET /auth/fotos/usuarios/:usuarioId/:arquivo`: proxy de foto.
- `POST /auth/me/foto-upload-url`: gera URL assinada para upload de foto.
- `POST /auth/me/foto`: salva referencia da foto do usuario.
- `PATCH /auth/me`: atualiza dados pessoais.
- `PATCH /auth/me/senha`: altera senha.

### Administracao

Requer `ADMINISTRADOR`.

- `GET /admin/dashboard`: resumo administrativo, usuarios, equipes e escalas.
- `POST /admin/equipes`: cria equipe.
- `DELETE /admin/equipes/:id`: remove equipe.
- `POST /admin/usuarios`: cria usuario.
- `PATCH /admin/usuarios/:id`: atualiza usuario, permissoes e equipes.
- `DELETE /admin/usuarios/:id`: remove usuario.

### Escalas

- `GET /escalas`: lista escalas futuras. Aceita `?visao=minhas` para retornar apenas escalas do usuario autenticado.
- `GET /escalas/minhas`: lista escalas futuras do usuario autenticado.
- `PATCH /escalas/:id/status`: voluntario altera o status da participacao (`PENDENTE`, `CONFIRMADA` ou `PEDIU_SUBSTITUICAO`), informando a ocorrencia e a justificativa quando pede substituicao.

Rotas administrativas:

- `GET /escalas/admin`: lista equipes, eventos (com modelos de voluntarios e ordens de culto) e escalas para administracao.
- `POST /escalas/admin/eventos`: cria um evento (recorrente ou esporadico), gera as escalas das equipes selecionadas e aplica o modelo de voluntarios (`modeloVoluntarios`) quando informado.
- `PATCH /escalas/admin/eventos/:id/ocorrencias`: edita titulo, local e descricao de um evento e, em eventos que nao se repetem, reagenda a ocorrencia.
- `DELETE /escalas/admin/eventos/:id/ocorrencias`: exclui uma ocorrencia ou, em eventos recorrentes, encerra o evento e remove as ocorrencias futuras.
- `PATCH /escalas/admin/recorrentes/:id`: edita uma escala recorrente avulsa (dia da semana, semana do mes e horario).
- `POST /escalas/admin/esporadicas`: cria escala(s) esporadica(s) avulsa(s) para as equipes selecionadas.
- `POST /escalas/admin/recorrentes`: cria escala recorrente avulsa para as equipes selecionadas.

### Equipes

- `GET /equipes/minhas`: lista as equipes gerenciadas pelo usuario (todas, para administrador; as lideradas, para lider), com voluntarios, escalas futuras e permissao de gerenciamento. Restrita a lideres e administradores.
- `POST /equipes/:equipeId/voluntarios`: cadastra/vincula um voluntario a equipe (gera senha temporaria para novos usuarios).
- `DELETE /equipes/:equipeId/voluntarios/:usuarioId`: remove o voluntario da equipe. Restrita a administradores.
- `POST /equipes/:equipeId/substituicoes/:participacaoId/atribuir`: atribui um substituto a um pedido de substituicao.
- `PATCH /equipes/:equipeId/escalas/:escalaId`: define os voluntarios (e substitutos) de uma escala da equipe.
- `POST /equipes/:equipeId/escalas` e `DELETE /equipes/:equipeId/escalas/:escalaId`: reservadas; a criacao e a remocao de escalas sao feitas apenas pelo administrador (respondem 403).

Administradores podem gerenciar qualquer equipe. Lideres podem gerenciar apenas as equipes que lideram (exceto a remocao de voluntarios, que e exclusiva de administradores).

### Avisos

- `GET /avisos`: lista avisos visiveis ao usuario.
- `PATCH /avisos/:id/visualizar`: marca aviso como visualizado.

Rotas administrativas:

- `GET /avisos/admin/opcoes`: lista opcoes de destinatarios.
- `POST /avisos/admin`: cria aviso.
- `PATCH /avisos/admin/:id/ocultar`: oculta ou reexibe aviso.
- `DELETE /avisos/admin/:id`: remove aviso.

### Manuais

- `GET /manuais`: lista manuais visiveis.
- `GET /manuais/:id/arquivo`: gera acesso ao arquivo.

Rotas administrativas:

- `GET /manuais/admin`: lista manuais para administracao.
- `POST /manuais/admin`: cria manual.
- `PATCH /manuais/admin/:id`: atualiza manual.
- `DELETE /manuais/admin/:id`: remove manual.

### Ordens de culto

- `POST /ordens-culto/admin`: envia o PDF da ordem de culto para uma ocorrencia de evento (`eventoId` + `dataHora`), substituindo a anterior se existir, e notifica os voluntarios escalados. Requer administrador.
- `GET /ordens-culto/:id/arquivo`: retorna o PDF da ordem de culto (requer autenticacao).

### Notificacoes

- `GET /notificacoes`: lista notificacoes do usuario.
- `GET /notificacoes/stream`: stream SSE de notificacoes.
- `GET /notificacoes/push/public-key`: retorna chave publica VAPID e status.
- `POST /notificacoes/push/subscribe`: cadastra inscricao Web Push.
- `DELETE /notificacoes/push/subscribe`: remove inscricao Web Push.
- `PATCH /notificacoes/:id/visualizar`: marca uma notificacao como visualizada.
- `PATCH /notificacoes/visualizar-todas`: marca todas como visualizadas.

## Autenticacao

O login retorna um token JWT. As chamadas autenticadas devem enviar:

```http
Authorization: Bearer <token>
```

Em producao, `JWT_SECRET` e obrigatorio.

## Rotinas automaticas

Quando `NODE_ENV` nao e `test`, a API executa na inicializacao e depois a cada hora:

- manutencao de ocorrencias de eventos/escalas (gera novas ocorrencias futuras e aplica os modelos de voluntarios);
- geracao de notificacoes automaticas.

Alem disso, as rotas de escalas garantem as ocorrencias sob demanda ao serem consultadas, e as rotas de notificacoes disparam a geracao automatica com um limite (throttle) de dez minutos, para manter os dados atualizados entre as execucoes horarias.

## Testes existentes

A API possui testes para:

- utilitarios de telefone (`test/telefone.test.js`);
- regras/utilitarios de escalas (`test/escalas.utils.test.js`);
- servico de eventos (`test/eventos.service.test.js`);
- validacao/geracao de PDF (`test/pdf.service.test.js`).

Execute com:

```bash
cd voluntarios-api
npm test
```
