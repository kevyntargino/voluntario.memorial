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

function getJwtSecret() {
  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

function sanitizeUsuario(usuario) {
  return {
    id: usuario.id,
    nomeCompleto: usuario.nomeCompleto,
    email: usuario.email,
    telefone: usuario.telefone,
    urlFoto: usuario.urlFoto,
    dataNascimento: usuario.dataNascimento
      ? usuario.dataNascimento.toISOString().slice(0, 10)
      : null,
    sexo: usuario.sexo,
    permissoes: usuario.permissoes,
  };
}

async function autenticar(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [, token] = authorization.split(' ');

  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.usuarioAutenticado = payload;
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

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
        telefone: true,
        dataNascimento: true,
        sexo: true,
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
      getJwtSecret(),
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
      usuario: sanitizeUsuario(usuario)
    });

  } catch (erro) {
    console.error('[ERRO LOG] /login:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/me', autenticar, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioAutenticado.id },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        telefone: true,
        dataNascimento: true,
        sexo: true,
        permissoes: true,
        urlFoto: true,
      }
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    return res.status(200).json({ usuario: sanitizeUsuario(usuario) });
  } catch (erro) {
    console.error('[ERRO LOG] /me:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/me', autenticar, async (req, res) => {
  try {
    const {
      nomeCompleto,
      telefone,
      urlFoto,
      dataNascimento,
      sexo,
    } = req.body ?? {};

    if (typeof nomeCompleto !== 'string' || nomeCompleto.trim().length < 3) {
      return res.status(400).json({ erro: 'Nome completo deve ter pelo menos 3 caracteres.' });
    }

    const sexosPermitidos = ['MASCULINO', 'FEMININO', 'OUTRO', 'PREFIRO_NAO_INFORMAR'];

    if (sexo && !sexosPermitidos.includes(sexo)) {
      return res.status(400).json({ erro: 'Sexo informado é inválido.' });
    }

    const usuario = await prisma.usuario.update({
      where: { id: req.usuarioAutenticado.id },
      data: {
        nomeCompleto: nomeCompleto.trim(),
        telefone: typeof telefone === 'string' && telefone.trim() ? telefone.trim() : null,
        urlFoto: typeof urlFoto === 'string' && urlFoto.trim() ? urlFoto.trim() : null,
        dataNascimento: dataNascimento ? new Date(`${dataNascimento}T00:00:00.000Z`) : null,
        sexo: sexo || null,
      },
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        telefone: true,
        dataNascimento: true,
        sexo: true,
        permissoes: true,
        urlFoto: true,
      }
    });

    return res.status(200).json({
      mensagem: 'Perfil atualizado com sucesso.',
      usuario: sanitizeUsuario(usuario),
    });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /me:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;
