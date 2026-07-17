# Instalacao, ambiente e deploy

## Requisitos

- Node.js compativel com as dependencias do projeto.
- npm.
- PostgreSQL.
- Banco configurado em `DATABASE_URL`.
- Opcional: bucket Cloudflare R2/S3 para fotos, manuais e anexos.
- Opcional: chaves VAPID para Web Push.

## API local

Entre na pasta da API:

```bash
cd voluntarios-api
npm install
```

Crie um arquivo `.env` com as variaveis necessarias:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/voluntarios"
DIRECT_URL="postgresql://usuario:senha@localhost:5432/voluntarios"
JWT_SECRET="troque-esta-chave"
PORT=3000
EVENT_TIME_ZONE="America/Campo_Grande"
```

Execute migracoes e seed:

```bash
npm run db:migrate
npm run seed
npm run dev
```

Scripts disponiveis:

- `npm run dev`: inicia a API com nodemon.
- `npm run build`: aplica migracoes de forma segura e gera Prisma Client.
- `npm run db:migrate`: executa `prisma migrate deploy`.
- `npm run db:migrate:safe`: tenta migracoes e usa fallback para schema de manuais.
- `npm run seed`: recria dados de teste.
- `npm start`: inicia em modo producao.
- `npm test`: executa testes com `node --test`.

## Frontend local

Entre na pasta do frontend:

```bash
cd voluntarios-frontend
npm install
```

Opcionalmente crie `.env`:

```env
VITE_API_URL="http://localhost:3000"
```

Execute:

```bash
npm run dev
```

Scripts disponiveis:

- `npm run dev`: inicia Vite.
- `npm run build`: gera build de producao.
- `npm run preview`: serve o build localmente.
- `npm run lint`: executa oxlint.

## Variaveis de ambiente da API

- `DATABASE_URL`: conexao principal com PostgreSQL.
- `DIRECT_URL`: conexao direta usada por Prisma e scripts quando disponivel.
- `JWT_SECRET`: segredo de assinatura JWT. Obrigatorio em producao.
- `PORT`: porta da API. Padrao: `3000`.
- `NODE_ENV`: use `production` em producao e `test` nos testes.
- `EVENT_TIME_ZONE`: fuso usado por eventos e escalas. Padrao: `America/Campo_Grande`.
- `API_PUBLIC_URL`: URL publica da API, usada em links/proxies de arquivos.
- `R2_ENDPOINT`: endpoint S3/R2.
- `R2_BUCKET`: bucket de arquivos.
- `R2_PUBLIC_URL`: URL publica do bucket quando aplicavel.
- `R2_ACCESS_KEY_ID`: chave de acesso ao storage.
- `R2_SECRET_ACCESS_KEY`: segredo de acesso ao storage.
- `VAPID_PUBLIC_KEY`: chave publica para Web Push.
- `VAPID_PRIVATE_KEY`: chave privada para Web Push.
- `VAPID_SUBJECT`: contato VAPID. Padrao local: `mailto:admin@mcom.local`.

## Variaveis do frontend

- `VITE_API_URL`: URL base da API. Se nao for definida, o frontend usa `http://localhost:3000`.

## Seed

O seed limpa as tabelas principais e cria usuarios, equipes, eventos, escalas, avisos, manuais e dados de teste.

Credenciais principais:

- Administrador: `admin@teste.com` / `Admin@123`
- Lider: `lider@teste.com` / `Lider@123`
- Voluntario: `voluntario@teste.com` / `Voluntario@123`

Aviso: `npm run seed` executa `TRUNCATE` nas tabelas do sistema. Use somente em ambientes de desenvolvimento ou homologacao.

## Deploy da API no Render

O arquivo `render.yaml` define:

- Servico web `voluntarios-api`.
- `rootDir`: `voluntarios-api`.
- Build: `npm ci && npm run build`.
- Start: `npm start`.
- Variaveis esperadas: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- `EVENT_TIME_ZONE` configurado como `America/Campo_Grande`.

## Deploy do frontend na Vercel

O frontend possui `vercel.json` com rewrite para SPA:

- Todas as rotas nao iniciadas por `/api/` apontam para `index.html`.
- `sw.js` usa `Cache-Control: no-cache`.
- `manifest.webmanifest` usa cache publico de 1 hora.

Configure `VITE_API_URL` na Vercel apontando para a URL publica da API.

## Checklist de producao

- Definir `JWT_SECRET` forte e exclusivo.
- Configurar `DATABASE_URL` e `DIRECT_URL`.
- Rodar migracoes antes do start.
- Configurar CORS conforme necessidade do dominio publico.
- Configurar R2/S3 se uploads forem usados.
- Configurar VAPID se Web Push for usado.
- Validar `VITE_API_URL` no build do frontend.
- Evitar executar seed em banco de producao.
