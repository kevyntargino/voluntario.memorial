import 'dotenv/config'; // ISSO DEVE SER A PRIMEIRA LINHA DO ARQUIVO!
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import escalasRoutes from './routes/escalas.routes.js';
import equipesRoutes from './routes/equipes.routes.js';
import avisosRoutes from './routes/avisos.routes.js';

const app = express();

// ==========================================
// MIDDLEWARES GLOBAIS
// ==========================================
app.use(cors()); 
app.use(express.json()); 

// ... O resto do seu código continua exatamente igual (app.use, app.get e app.listen)
// Ensina o Express a ler corpos de requisição em JSON
app.use(express.json()); 

// ==========================================
// REGISTRO DE ROTAS
// ==========================================
// Exposição da rota de login
app.use('/api/auth', authRoutes);
app.use('/api/escalas', escalasRoutes);
app.use('/api/equipes', equipesRoutes);
app.use('/api/avisos', avisosRoutes);

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
