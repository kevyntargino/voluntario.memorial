import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { validarPdfBase64 } from '../services/pdf.service.js';
import { notificarOrdemCulto } from '../services/notificacoes.service.js';
import { escalaEstaEncerrada } from '../utils/escalas.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const router = Router();

const R2_DEFAULT_ENDPOINT = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com';
const R2_DEFAULT_BUCKET = 'voluntarios';

function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET e obrigatorio em producao.');
  }
  return process.env.JWT_SECRET || 'chave_temporaria_dev';
}

async function autenticar(req, res, next) {
  const [, token] = (req.headers.authorization || '').split(' ');
  if (!token) return res.status(401).json({ erro: 'Token de autenticação não informado.' });

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { id: true, permissoes: true },
    });
    if (!usuario) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    req.usuarioAutenticado = usuario;
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

function exigirAdmin(req, res, next) {
  if (!req.usuarioAutenticado?.permissoes?.includes('ADMINISTRADOR')) {
    return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
  }
  return next();
}

function getR2Config() {
  return {
    endpoint: process.env.R2_ENDPOINT || R2_DEFAULT_ENDPOINT,
    bucket: process.env.R2_BUCKET || R2_DEFAULT_BUCKET,
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

function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function criarPresignedUrl({ key, method, expiresIn = 600 }) {
  const config = getR2Config();
  if (!config.accessKeyId || !config.secretAccessKey) throw new Error('Credenciais R2 não configuradas.');

  const endpoint = new URL(config.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  });
  const canonicalQuery = Array.from(params.entries())
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .sort()
    .join('&');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${endpoint.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(config.secretAccessKey, dateStamp), stringToSign, 'hex');
  params.set('X-Amz-Signature', signature);
  return `${endpoint.origin}${canonicalUri}?${params.toString()}`;
}

async function fetchComTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('TIMEOUT_STORAGE');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function apagarArquivo(key) {
  if (!key?.startsWith('ordens-culto/')) return;
  const resposta = await fetch(criarPresignedUrl({ key, method: 'DELETE', expiresIn: 300 }), { method: 'DELETE' });
  if (!resposta.ok && resposta.status !== 404) console.warn('[WARN] Falha ao excluir ordem de culto antiga:', resposta.status);
}

function formatarOrdem(ordem) {
  return {
    id: ordem.id,
    titulo: ordem.titulo,
    dataHora: ordem.dataHora,
    arquivoUrl: `/api/ordens-culto/${ordem.id}/arquivo`,
  };
}

router.post('/admin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { eventoId, dataHora, arquivo } = req.body ?? {};
    const ocorrencia = new Date(dataHora);
    if (!eventoId || Number.isNaN(ocorrencia.getTime())) {
      return res.status(400).json({ erro: 'Evento e data da escala são obrigatórios.' });
    }
    const escala = await prisma.escala.findFirst({
      where: { eventoId, dataHora: ocorrencia },
      include: { evento: { select: { titulo: true } } },
    });
    if (!escala) return res.status(404).json({ erro: 'Ocorrência do evento não encontrada.' });
    if (escalaEstaEncerrada(ocorrencia)) {
      return res.status(409).json({ erro: 'Escalas passadas são somente para consulta e não podem ser alteradas.' });
    }

    const validacao = validarPdfBase64(arquivo);
    if (validacao.erro) return res.status(400).json({ erro: validacao.erro });

    const existente = await prisma.ordemCulto.findUnique({
      where: { eventoId_dataHora: { eventoId, dataHora: ocorrencia } },
    });
    const id = existente?.id || crypto.randomUUID();
    const key = `ordens-culto/${eventoId}/${ocorrencia.toISOString()}-${crypto.randomBytes(8).toString('hex')}.pdf`;
    const upload = await fetchComTimeout(criarPresignedUrl({ key, method: 'PUT' }), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: validacao.buffer,
    });
    if (!upload.ok) return res.status(502).json({ erro: 'Não foi possível enviar a ordem de culto para o storage.' });

    const dados = {
      titulo: `Ordem de culto - ${escala.evento?.titulo || escala.titulo || 'Evento'}`,
      dataCulto: ocorrencia,
      dataHora: ocorrencia,
      anexoUrl: `/api/ordens-culto/${id}/arquivo`,
      arquivoKey: key,
      eventoId,
      criadorId: req.usuarioAutenticado.id,
    };
    const ordem = existente
      ? await prisma.ordemCulto.update({ where: { id }, data: dados })
      : await prisma.ordemCulto.create({ data: { id, ...dados } });

    if (existente?.arquivoKey && existente.arquivoKey !== key) {
      apagarArquivo(existente.arquivoKey).catch((error) => console.warn('[WARN] Falha ao remover PDF substituído:', error.message));
    }

    const participacoes = await prisma.voluntarioEscala.findMany({
      where: {
        escala: { eventoId, dataHora: ocorrencia },
      },
      select: { usuarioId: true },
    });
    await notificarOrdemCulto(prisma, {
      ordem,
      eventoTitulo: escala.evento?.titulo || escala.titulo,
      usuarioIds: participacoes.map((participacao) => participacao.usuarioId),
    }).catch((notificationError) => {
      console.warn('[WARN] Falha ao notificar voluntários sobre a ordem de culto:', notificationError.message);
    });

    return res.status(200).json({ mensagem: 'Ordem de culto enviada com sucesso.', ordemCulto: formatarOrdem(ordem) });
  } catch (erro) {
    if (erro.message === 'TIMEOUT_STORAGE') return res.status(504).json({ erro: 'O envio do PDF demorou demais. Tente um arquivo menor.' });
    if (erro.message === 'Credenciais R2 não configuradas.') return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    console.error('[ERRO LOG] POST /api/ordens-culto/admin:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/:id/arquivo', autenticar, async (req, res) => {
  try {
    const ordem = await prisma.ordemCulto.findUnique({ where: { id: req.params.id }, select: { titulo: true, arquivoKey: true } });
    if (!ordem?.arquivoKey) return res.status(404).json({ erro: 'Ordem de culto não encontrada.' });
    const resposta = await fetchComTimeout(criarPresignedUrl({ key: ordem.arquivoKey, method: 'GET', expiresIn: 300 }));
    if (!resposta.ok) return res.status(resposta.status === 404 ? 404 : 502).json({ erro: 'Arquivo da ordem de culto não encontrado.' });
    const buffer = Buffer.from(await resposta.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${ordem.titulo.replace(/[^\w.-]+/g, '-')}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (erro) {
    if (erro.message === 'TIMEOUT_STORAGE') return res.status(504).json({ erro: 'O storage demorou demais para responder.' });
    console.error('[ERRO LOG] GET /api/ordens-culto/:id/arquivo:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;
