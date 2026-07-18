# Sistema MCom de Voluntarios

Sistema web para gerenciamento de voluntarios, equipes, escalas, eventos, avisos, manuais, ordens de culto e notificacoes do Ministerio de Comunicacao.

## Estrutura do projeto

- `voluntarios-api/`: API Node.js com Express, Prisma e PostgreSQL.
- `voluntarios-frontend/`: aplicacao React/Vite com suporte a PWA.
- `docs/`: documentacao tecnica e manual de uso.
- `render.yaml`: configuracao de deploy da API no Render.

## Principais recursos

- Login com JWT e controle por permissoes (um usuario pode acumular mais de uma).
- Perfis: `ADMINISTRADOR`, `LIDER_EQUIPE` e `VOLUNTARIO`.
- Cadastro e gerenciamento de usuarios e equipes.
- Criacao de eventos recorrentes (semanal/mensal) e esporadicos, com geracao e manutencao automatica de ocorrencias.
- Modelos de voluntarios por semana do mes, aplicados automaticamente as escalas geradas.
- Escalas por equipe, com confirmacao, ausencia, pedido e atribuicao de substituicao.
- Avisos globais, por equipe, por perfil ou por usuarios especificos, com controle de leitura.
- Biblioteca de manuais em PDF, PNG ou JPEG, gerais ou por equipe.
- Ordens de culto em PDF vinculadas a uma ocorrencia de evento.
- Notificacoes internas, stream em tempo real (SSE) e Web Push.
- Upload de fotos, manuais e anexos via Cloudflare R2/S3 compativel.
- Frontend responsivo com tema claro/escuro e instalacao como PWA.

## Como rodar localmente

### API

```bash
cd voluntarios-api
npm install
npm run db:migrate
npm run seed
npm run dev
```

A API roda por padrao em `http://localhost:3000`.
Crie antes um `.env` conforme [Instalacao, ambiente e deploy](docs/instalacao-e-deploy.md).

### Frontend

```bash
cd voluntarios-frontend
npm install
npm run dev
```

O frontend usa `VITE_API_URL` ou `http://localhost:3000` por padrao.

## Usuarios de teste do seed

- Administrador: `admin@teste.com` / `Admin@123`
- Lider: `lider@teste.com` / `Lider@123`
- Voluntario: `voluntario@teste.com` / `Voluntario@123`

O seed tambem cria equipes (Midia, Iluminacao, Filmagem, Fotografia, DTV, Direcao e Redes Sociais), voluntarios adicionais (senha `Mcom@123`) e escalas de exemplo.

## Documentacao

- [Visao geral](docs/visao-geral.md)
- [Instalacao, ambiente e deploy](docs/instalacao-e-deploy.md)
- [Arquitetura e API](docs/arquitetura-e-api.md)
- [Manual de uso](docs/manual-de-uso.md)

## Testes

```bash
cd voluntarios-api
npm test
```

O frontend possui script de lint:

```bash
cd voluntarios-frontend
npm run lint
```
