import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalizarTelefone } from '../utils/telefone.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});
const router = Router();
const R2_DEFAULT_PUBLIC_URL = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com/voluntarios';
const R2_DEFAULT_ENDPOINT = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com';
const R2_DEFAULT_BUCKET = 'voluntarios';

function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET e obrigatorio em producao.');
  }

  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

function getFotoProxyUrl(req, key) {
  return `${getApiBaseUrl(req)}/api/auth/fotos/${key}`;
}

function extrairKeyFoto(urlFoto, req) {
  if (!urlFoto || typeof urlFoto !== 'string') {
    return null;
  }

  const proxyMarker = '/api/auth/fotos/';
  const proxyIndex = urlFoto.indexOf(proxyMarker);

  if (proxyIndex >= 0) {
    return decodeURIComponent(urlFoto.slice(proxyIndex + proxyMarker.length).split('?')[0]);
  }

  const config = getR2Config();
  const prefixosR2 = [
    `${config.publicUrl}/`,
    `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/`,
  ];
  const prefixoEncontrado = prefixosR2.find((prefixo) => urlFoto.startsWith(prefixo));

  if (!prefixoEncontrado) {
    return null;
  }

  return decodeURIComponent(urlFoto.slice(prefixoEncontrado.length).split('?')[0]);
}

function normalizarUrlFoto(urlFoto, req) {
  if (!urlFoto || typeof urlFoto !== 'string') {
    return urlFoto;
  }

  const key = extrairKeyFoto(urlFoto, req);
  return key ? getFotoProxyUrl(req, key) : urlFoto;
}

function sanitizeUsuario(usuario, req = null) {
  return {
    id: usuario.id,
    nomeCompleto: usuario.nomeCompleto,
    email: usuario.email,
    telefone: usuario.telefone,
    urlFoto: req ? normalizarUrlFoto(usuario.urlFoto, req) : usuario.urlFoto,
    dataNascimento: usuario.dataNascimento
      ? usuario.dataNascimento.toISOString().slice(0, 10)
      : null,
    sexo: usuario.sexo,
    permissoes: usuario.permissoes,
  };
}

function getR2Config() {
  return {
    endpoint: process.env.R2_ENDPOINT || R2_DEFAULT_ENDPOINT,
    bucket: process.env.R2_BUCKET || R2_DEFAULT_BUCKET,
    publicUrl: (process.env.R2_PUBLIC_URL || R2_DEFAULT_PUBLIC_URL).replace(/\/$/, ''),
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  };
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function encodeS3Path(path) {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function criarPresignedUrl({ key, method = 'PUT', expiresIn = 600 }) {
  const config = getR2Config();

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('Credenciais R2 não configuradas.');
  }

  const endpointUrl = new URL(config.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${config.accessKeyId}/${scope}`;
  const canonicalUri = `/${config.bucket}/${encodeS3Path(key)}`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQueryString = Array.from(params.entries())
    .map(([paramKey, value]) => `${encodeURIComponent(paramKey)}=${encodeURIComponent(value)}`)
    .sort()
    .join('&');
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `host:${endpointUrl.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    hash(canonicalRequest),
  ].join('\n');
  const signature = hmac(getSigningKey(config.secretAccessKey, dateStamp, region, service), stringToSign, 'hex');

  params.set('X-Amz-Signature', signature);

  return `${endpointUrl.origin}${canonicalUri}?${params.toString()}`;
}

function criarPresignedPutUrl({ key, expiresIn = 600 }) {
  return criarPresignedUrl({ key, method: 'PUT', expiresIn });
}

function criarPresignedGetUrl({ key, expiresIn = 300 }) {
  return criarPresignedUrl({ key, method: 'GET', expiresIn });
}

function criarPresignedDeleteUrl({ key, expiresIn = 300 }) {
  return criarPresignedUrl({ key, method: 'DELETE', expiresIn });
}

function getApiBaseUrl(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  return (process.env.API_PUBLIC_URL || `${protocol}://${host}`).replace(/\/$/, '');
}

async function apagarFotoDoStorage(key) {
  if (!key || !key.startsWith('usuarios/')) {
    return;
  }

  const deleteUrl = criarPresignedDeleteUrl({ key });
  const resposta = await fetch(deleteUrl, { method: 'DELETE' });

  if (!resposta.ok && resposta.status !== 404) {
    const detalhe = await resposta.text().catch(() => '');
    console.warn('[WARN] Falha ao excluir foto do R2:', resposta.status, detalhe);
  }
}

async function autenticar(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [, token] = authorization.split(' ');

  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não informado.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, permissoes: true },
    });

    if (!usuario) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    req.usuarioAutenticado = usuario;
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
      getJwtSecret()
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
      usuario: sanitizeUsuario(usuario, req)
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

    return res.status(200).json({ usuario: sanitizeUsuario(usuario, req) });
  } catch (erro) {
    console.error('[ERRO LOG] /me:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/fotos/usuarios/:usuarioId/:arquivo', async (req, res) => {
  try {
    const { usuarioId, arquivo } = req.params;

    if (!/^[0-9a-f-]{36}$/i.test(usuarioId) || !/^[a-zA-Z0-9._-]+$/.test(arquivo)) {
      return res.status(400).send('Imagem inválida.');
    }

    const key = `usuarios/${usuarioId}/${arquivo}`;
    const signedUrl = criarPresignedGetUrl({ key });
    const resposta = await fetch(signedUrl);

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      console.error('[ERRO LOG] Leitura R2 falhou:', resposta.status, detalhe);
      return res.status(resposta.status === 404 ? 404 : 502).send('Imagem não encontrada.');
    }

    const contentType = resposta.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await resposta.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buffer);
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).send('Storage R2 não configurado.');
    }

    console.error('[ERRO LOG] GET /fotos/usuarios/:usuarioId/:arquivo:', erro);
    return res.status(500).send('Erro interno no servidor.');
  }
});

router.post('/me/foto-upload-url', autenticar, async (req, res) => {
  try {
    const { fileName, contentType } = req.body ?? {};
    const tiposPermitidos = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    if (!tiposPermitidos[contentType]) {
      return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG, WEBP ou GIF.' });
    }

    const extensaoOriginal = typeof fileName === 'string' && fileName.includes('.')
      ? fileName.split('.').pop().toLowerCase()
      : tiposPermitidos[contentType];
    const extensao = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensaoOriginal)
      ? (extensaoOriginal === 'jpeg' ? 'jpg' : extensaoOriginal)
      : tiposPermitidos[contentType];
    const random = crypto.randomBytes(8).toString('hex');
    const key = `usuarios/${req.usuarioAutenticado.id}/${Date.now()}-${random}.${extensao}`;
    const uploadUrl = criarPresignedPutUrl({ key });

    return res.status(200).json({
      uploadUrl,
      publicUrl: getFotoProxyUrl(req, key),
      key,
      expiresIn: 600,
    });
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    }

    console.error('[ERRO LOG] POST /me/foto-upload-url:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/me/foto', autenticar, async (req, res) => {
  try {
    const { fileName, contentType, base64 } = req.body ?? {};
    const tiposPermitidos = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };

    if (!tiposPermitidos[contentType]) {
      return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG, WEBP ou GIF.' });
    }

    if (typeof base64 !== 'string' || !base64.trim()) {
      return res.status(400).json({ erro: 'Arquivo da foto não foi enviado.' });
    }

    const base64Limpo = base64.includes(',') ? base64.split(',').pop() : base64;
    const buffer = Buffer.from(base64Limpo, 'base64');

    if (buffer.length === 0) {
      return res.status(400).json({ erro: 'Arquivo da foto está vazio.' });
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ erro: 'A imagem deve ter no máximo 5MB.' });
    }

    const extensaoOriginal = typeof fileName === 'string' && fileName.includes('.')
      ? fileName.split('.').pop().toLowerCase()
      : tiposPermitidos[contentType];
    const extensao = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensaoOriginal)
      ? (extensaoOriginal === 'jpeg' ? 'jpg' : extensaoOriginal)
      : tiposPermitidos[contentType];
    const random = crypto.randomBytes(8).toString('hex');
    const key = `usuarios/${req.usuarioAutenticado.id}/${Date.now()}-${random}.${extensao}`;
    const uploadUrl = criarPresignedPutUrl({ key });
    const uploadResposta = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: buffer,
    });

    if (!uploadResposta.ok) {
      const detalhe = await uploadResposta.text().catch(() => '');
      console.error('[ERRO LOG] Upload R2 falhou:', uploadResposta.status, detalhe);
      return res.status(502).json({ erro: 'Não foi possível enviar a foto para o storage.' });
    }

    return res.status(200).json({
      publicUrl: getFotoProxyUrl(req, key),
      key,
    });
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    }

    console.error('[ERRO LOG] POST /me/foto:', erro);
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

    const sexosPermitidos = ['MASCULINO', 'FEMININO'];

    if (sexo && !sexosPermitidos.includes(sexo)) {
      return res.status(400).json({ erro: 'Sexo informado é inválido.' });
    }

    const usuarioAtual = await prisma.usuario.findUnique({
      where: { id: req.usuarioAutenticado.id },
      select: { urlFoto: true },
    });
    const proximaUrlFoto = typeof urlFoto === 'string' && urlFoto.trim()
      ? normalizarUrlFoto(urlFoto.trim(), req)
      : null;

    const usuario = await prisma.usuario.update({
      where: { id: req.usuarioAutenticado.id },
      data: {
        nomeCompleto: nomeCompleto.trim(),
        telefone: normalizarTelefone(telefone),
        urlFoto: proximaUrlFoto,
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

    const keyAnterior = extrairKeyFoto(usuarioAtual?.urlFoto, req);
    const keyAtual = extrairKeyFoto(proximaUrlFoto, req);

    if (keyAnterior && keyAnterior !== keyAtual) {
      apagarFotoDoStorage(keyAnterior).catch((deleteError) => {
        console.warn('[WARN] Falha ao remover foto antiga do storage:', deleteError.message);
      });
    }

    return res.status(200).json({
      mensagem: 'Perfil atualizado com sucesso.',
      usuario: sanitizeUsuario(usuario, req),
    });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /me:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/me/senha', autenticar, async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarNovaSenha } = req.body ?? {};

    if (!senhaAtual || !novaSenha || !confirmarNovaSenha) {
      return res.status(400).json({ erro: 'Informe a senha atual, a nova senha e a confirmação.' });
    }

    if (String(novaSenha).length < 6) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 dígitos.' });
    }

    if (String(novaSenha) !== String(confirmarNovaSenha)) {
      return res.status(400).json({ erro: 'A nova senha e a confirmação precisam ser iguais.' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioAutenticado.id },
      select: {
        id: true,
        senhaHash: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const senhaAtualValida = await bcrypt.compare(String(senhaAtual), usuario.senhaHash);

    if (!senhaAtualValida) {
      return res.status(400).json({ erro: 'Senha atual incorreta.' });
    }

    const senhaHash = await bcrypt.hash(String(novaSenha), 10);

    await prisma.usuario.update({
      where: { id: req.usuarioAutenticado.id },
      data: { senhaHash },
    });

    await prisma.logAuditoria.create({
      data: {
        acao: 'REDEFINICAO_SENHA',
        descricao: 'Usuário alterou a própria senha.',
        usuarioId: req.usuarioAutenticado.id,
        ipOrigem: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || null,
      },
    }).catch((auditError) => {
      console.warn('[WARN] Falha ao registrar alteração de senha na auditoria:', auditError.message);
    });

    return res.status(200).json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (erro) {
    console.error('[ERRO LOG] PATCH /me/senha:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;
