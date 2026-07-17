# Arquitetura e API

## Arquitetura geral

O sistema e dividido em dois projetos:

- `voluntarios-api`: API REST em Express, com Prisma Client e PostgreSQL.
- `voluntarios-frontend`: SPA React/Vite que consome a API.

A API aplica um middleware global em `/api` que exige token Bearer, exceto para `POST /api/auth/login` e proxy publico de fotos. Cada arquivo de rota tambem valida o usuario e, quando necessario, exige permissao administrativa.

## Modelo de dados

### Usuarios

Tabela `usuarios`.

Campos principais: nome, email unico, senha hash, telefone, foto, nascimento, sexo e permissoes.

Permissoes:

- `ADMINISTRADOR`
- `LIDER_EQUIPE`
- `VOLUNTARIO`

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

Tambem registra justificativa, substituto e usuario que atribuiu a escala.

### Conteudo e comunicacao

- `avisos`: comunicados globais, por equipe ou individuais.
- `avisos_destinatarios`: usuarios direcionados por aviso.
- `avisos_visualizacoes`: leitura de avisos.
- `manuais`: arquivos e descricoes de treinamento.
- `ordens_culto`: conteudo ou anexo de uma ordem de culto.

### Notificacoes

- `notificacoes`: notificacoes internas por usuario.
- `web_push_subscriptions`: inscricoes Web Push.

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

- `GET /escalas`: lista escalas.
- `GET /escalas/minhas`: lista escalas do usuario autenticado.
- `PATCH /escalas/:id/status`: voluntario altera status da participacao.

Rotas administrativas:

- `GET /escalas/admin`: lista dados para administracao.
- `POST /escalas/admin/eventos`: cria evento.
- `DELETE /escalas/admin/eventos/:id/ocorrencias`: exclui uma ocorrencia ou remove futuras ocorrencias de evento recorrente.
- `PATCH /escalas/admin/recorrentes/:id`: edita evento/escala recorrente.
- `POST /escalas/admin/esporadicas`: cria escala/evento esporadico.
- `POST /escalas/admin/recorrentes`: cria escala/evento recorrente.

### Equipes

- `GET /equipes/minhas`: lista equipes do usuario, incluindo permissao de gerenciamento.
- `POST /equipes/:equipeId/voluntarios`: adiciona voluntario a equipe.
- `DELETE /equipes/:equipeId/voluntarios/:usuarioId`: remove voluntario da equipe.
- `POST /equipes/:equipeId/substituicoes/:participacaoId/atribuir`: atribui substituto.
- `POST /equipes/:equipeId/escalas`: cria escala da equipe.
- `PATCH /equipes/:equipeId/escalas/:escalaId`: edita escala da equipe.
- `DELETE /equipes/:equipeId/escalas/:escalaId`: remove escala da equipe.

Administradores podem gerenciar qualquer equipe. Lideres podem gerenciar apenas equipes lideradas por eles.

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

- `POST /ordens-culto/admin`: cria ordem de culto. Requer administrador.
- `GET /ordens-culto/:id/arquivo`: gera acesso ao anexo.

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

- manutencao de ocorrencias de eventos/escalas;
- geracao de notificacoes automaticas.

## Testes existentes

A API possui testes para:

- utilitarios de telefone;
- notificacoes;
- regras de escalas;
- servico de eventos;
- geracao de PDF.

Execute com:

```bash
cd voluntarios-api
npm test
```
