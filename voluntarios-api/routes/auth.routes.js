import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});
const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body ?? {};
    const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';

    // 1. Validação de dados de entrada
    if (!emailNormalizado || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    // 2. Busca do usuário pelo e-mail (garantindo normalização)
    const usuario = await prisma.usuario.findUnique({
      where: { email: emailNormalizado },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        senhaHash: true,
        permissoes: true,
        urlFoto: true,
      }
    });

    // 3. Segurança contra enumeração de usuários
    if (!usuario) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // 4. Verificação criptográfica da senha
    const senhaValida = await bcrypt.compare(String(senha), usuario.senhaHash);

    if (!senhaValida) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // 5. Geração do Token JWT (Sessão)
    const token = jwt.sign(
      { 
        id: usuario.id, 
        permissoes: usuario.permissoes 
      },
      process.env.JWT_SECRET || 'chave_temporaria_dev',
      { expiresIn: '2h' }
    );

    // 6. Registro de Auditoria (Observabilidade)
    await prisma.logAuditoria.create({
      data: {
        acao: 'LOGIN',
        descricao: 'Usuário autenticado via e-mail e senha.',
        usuarioId: usuario.id,
        ipOrigem: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || null,
      }
    }).catch((auditError) => {
      console.warn('[WARN] Falha ao registrar login na auditoria:', auditError.message);
    });

    // 7. Retorno de sucesso
    return res.status(200).json({
      mensagem: 'Autenticação bem-sucedida.',
      token,
      usuario: {
        id: usuario.id,
        nomeCompleto: usuario.nomeCompleto,
        email: usuario.email,
        permissoes: usuario.permissoes,
        urlFoto: usuario.urlFoto
      }
    });

  } catch (erro) {
    console.error('[ERRO LOG] /login:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;
