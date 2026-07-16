import 'dotenv/config'; // ISSO DEVE SER A PRIMEIRA LINHA DO ARQUIVO!
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.routes.js';
import escalasRoutes from './routes/escalas.routes.js';
import equipesRoutes from './routes/equipes.routes.js';
import avisosRoutes from './routes/avisos.routes.js';
import manuaisRoutes from './routes/manuais.routes.js';
import notificacoesRoutes from './routes/notificacoes.routes.js';
import adminRoutes from './routes/admin.routes.js';
import ordensCultoRoutes from './routes/ordens-culto.routes.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { gerarNotificacoesAutomaticas } from './services/notificacoes.service.js';
import { garantirOcorrenciasEventos } from './services/eventos.service.js';

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET e obrigatorio em producao.');
  }

  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

function protegerApi(req, res, next) {
  const rotaPublica = (req.method === 'POST' && req.path === '/auth/login')
    || (req.method === 'GET' && req.path.startsWith('/auth/fotos/'));

  if (rotaPublica) {
    return next();
  }

  const authorization = req.headers.authorization || '';
  const [tipo, token] = authorization.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  try {
    jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

// ==========================================
// MIDDLEWARES GLOBAIS
// ==========================================
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ==========================================
// REGISTRO DE ROTAS
// ==========================================
// Exposição da rota de login
app.use('/api', protegerApi);
app.use('/api/auth', authRoutes);
app.use('/api/escalas', escalasRoutes);
app.use('/api/equipes', equipesRoutes);
app.use('/api/avisos', avisosRoutes);
app.use('/api/manuais', manuaisRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ordens-culto', ordensCultoRoutes);

// Rota de Health Check para verificar se o servidor está online
app.get('/', (req, res) => {
  res.status(200).json({ mensagem: 'API do sistema MCom está online!' });
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`[Servidor] API rodando com sucesso na porta ${PORT}`);
  console.log(`[Servidor] Rota de login exposta em: http://localhost:${PORT}/api/auth/login`);
});

if (process.env.NODE_ENV !== 'test') {
  garantirOcorrenciasEventos(prisma).catch((erro) => {
    console.warn('[WARN] Falha na manutenção inicial das escalas:', erro.message);
  });
  gerarNotificacoesAutomaticas(prisma).catch((erro) => {
    console.warn('[WARN] Falha ao gerar notificações iniciais:', erro.message);
  });

  setInterval(() => {
    garantirOcorrenciasEventos(prisma).catch((erro) => {
      console.warn('[WARN] Falha na manutenção automática das escalas:', erro.message);
    });
    gerarNotificacoesAutomaticas(prisma).catch((erro) => {
      console.warn('[WARN] Falha ao gerar notificações automáticas:', erro.message);
    });
  }, 60 * 60 * 1000);
}
