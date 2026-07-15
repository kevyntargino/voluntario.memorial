import { Router } from 'express';
import crypto from 'crypto';
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

const R2_DEFAULT_ENDPOINT = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com';
const R2_DEFAULT_BUCKET = 'voluntarios';
const MAX_PDF_SIZE = 15 * 1024 * 1024;

function getJwtSecret() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET e obrigatorio em producao.');
  }

  return process.env.JWT_SECRET || 'chave_temporaria_dev';
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

function getApiBaseUrl(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  return (process.env.API_PUBLIC_URL || `${protocol}://${host}`).replace(/\/$/, '');
}

function getManualArquivoUrl(req, id) {
  return `${getApiBaseUrl(req)}/api/manuais/${id}/arquivo`;
}

function formatarManual(manual, req) {
  return {
    id: manual.id,
    titulo: manual.titulo,
    descricao: manual.descricao,
    versao: manual.versao,
    dataManual: manual.dataManual,
    oculto: manual.oculto,
    arquivoUrl: getManualArquivoUrl(req, manual.id),
    criadoEm: manual.criadoEm,
    atualizadoEm: manual.atualizadoEm,
  };
}

function validarPdf(arquivo) {
  if (!arquivo || typeof arquivo !== 'object') {
    return { erro: 'Envie um arquivo PDF.' };
  }

  if (arquivo.contentType !== 'application/pdf') {
    return { erro: 'O arquivo precisa ser um PDF.' };
  }

  if (typeof arquivo.base64 !== 'string' || !arquivo.base64.trim()) {
    return { erro: 'Arquivo PDF não foi enviado.' };
  }

  const base64Limpo = arquivo.base64.includes(',') ? arquivo.base64.split(',').pop() : arquivo.base64;
  const buffer = Buffer.from(base64Limpo, 'base64');

  if (buffer.length === 0) {
    return { erro: 'O PDF enviado está vazio.' };
  }

  if (buffer.length > MAX_PDF_SIZE) {
    return { erro: 'O PDF deve ter no máximo 15MB.' };
  }

  return { buffer };
}

async function uploadPdfManual({ manualId, arquivo }) {
  const validacao = validarPdf(arquivo);

  if (validacao.erro) {
    return validacao;
  }

  const random = crypto.randomBytes(8).toString('hex');
  const key = `manuais/${manualId}/${Date.now()}-${random}.pdf`;
  const uploadUrl = criarPresignedUrl({ key, method: 'PUT' });
  const resposta = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: validacao.buffer,
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    console.error('[ERRO LOG] Upload PDF R2 falhou:', resposta.status, detalhe);
    return { erro: 'Não foi possível enviar o PDF para o storage.' };
  }

  return { key };
}

async function apagarArquivoStorage(key) {
  if (!key || !key.startsWith('manuais/')) {
    return;
  }

  const deleteUrl = criarPresignedUrl({ key, method: 'DELETE', expiresIn: 300 });
  const resposta = await fetch(deleteUrl, { method: 'DELETE' });

  if (!resposta.ok && resposta.status !== 404) {
    const detalhe = await resposta.text().catch(() => '');
    console.warn('[WARN] Falha ao excluir PDF do R2:', resposta.status, detalhe);
  }
}

router.get('/', autenticar, async (req, res) => {
  try {
    const manuais = await prisma.manual.findMany({
      where: { oculto: false },
      orderBy: { dataManual: 'desc' },
    });

    return res.status(200).json({ manuais: manuais.map((manual) => formatarManual(manual, req)) });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/manuais:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/admin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const manuais = await prisma.manual.findMany({
      orderBy: { dataManual: 'desc' },
    });

    return res.status(200).json({ manuais: manuais.map((manual) => formatarManual(manual, req)) });
  } catch (erro) {
    console.error('[ERRO LOG] GET /api/manuais/admin:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.get('/:id/arquivo', autenticar, async (req, res) => {
  try {
    const manual = await prisma.manual.findUnique({
      where: { id: req.params.id },
      select: {
        titulo: true,
        arquivoKey: true,
        oculto: true,
      },
    });

    if (!manual || !manual.arquivoKey) {
      return res.status(404).json({ erro: 'Manual não encontrado.' });
    }

    const isAdmin = req.usuarioAutenticado?.permissoes?.includes('ADMINISTRADOR');

    if (manual.oculto && !isAdmin) {
      return res.status(404).json({ erro: 'Manual não encontrado.' });
    }

    const signedUrl = criarPresignedUrl({ key: manual.arquivoKey, method: 'GET', expiresIn: 300 });
    const resposta = await fetch(signedUrl);

    if (!resposta.ok) {
      const detalhe = await resposta.text().catch(() => '');
      console.error('[ERRO LOG] Leitura PDF R2 falhou:', resposta.status, detalhe);
      return res.status(resposta.status === 404 ? 404 : 502).json({ erro: 'Arquivo do manual não encontrado.' });
    }

    const buffer = Buffer.from(await resposta.arrayBuffer());
    const nomeArquivo = `${manual.titulo || 'manual'}.pdf`.replace(/[^\w.-]+/g, '-');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buffer);
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    }

    console.error('[ERRO LOG] GET /api/manuais/:id/arquivo:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.post('/admin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, descricao, versao, oculto, arquivo } = req.body ?? {};
    const tituloLimpo = typeof titulo === 'string' ? titulo.trim() : '';
    const versaoLimpa = typeof versao === 'string' && versao.trim() ? versao.trim() : '1.0';

    if (tituloLimpo.length < 3) {
      return res.status(400).json({ erro: 'Título do manual é obrigatório.' });
    }

    const id = crypto.randomUUID();
    const upload = await uploadPdfManual({ manualId: id, arquivo });

    if (upload.erro) {
      return res.status(400).json({ erro: upload.erro });
    }

    const manual = await prisma.manual.create({
      data: {
        id,
        titulo: tituloLimpo,
        descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
        versao: versaoLimpa,
        oculto: Boolean(oculto),
        arquivoKey: upload.key,
        arquivoUrl: getManualArquivoUrl(req, id),
      },
    });

    return res.status(201).json({
      mensagem: 'Manual cadastrado com sucesso.',
      manual: formatarManual(manual, req),
    });
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    }

    console.error('[ERRO LOG] POST /api/manuais/admin:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.patch('/admin/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { titulo, descricao, versao, oculto, arquivo } = req.body ?? {};
    const manualAtual = await prisma.manual.findUnique({
      where: { id: req.params.id },
    });

    if (!manualAtual) {
      return res.status(404).json({ erro: 'Manual não encontrado.' });
    }

    const tituloLimpo = typeof titulo === 'string' ? titulo.trim() : manualAtual.titulo;

    if (tituloLimpo.length < 3) {
      return res.status(400).json({ erro: 'Título do manual é obrigatório.' });
    }

    let arquivoKey = manualAtual.arquivoKey;
    let apagarKey = null;

    if (arquivo) {
      const upload = await uploadPdfManual({ manualId: manualAtual.id, arquivo });

      if (upload.erro) {
        return res.status(400).json({ erro: upload.erro });
      }

      apagarKey = manualAtual.arquivoKey;
      arquivoKey = upload.key;
    }

    const manual = await prisma.manual.update({
      where: { id: manualAtual.id },
      data: {
        titulo: tituloLimpo,
        descricao: typeof descricao === 'string' && descricao.trim() ? descricao.trim() : null,
        versao: typeof versao === 'string' && versao.trim() ? versao.trim() : manualAtual.versao,
        oculto: Boolean(oculto),
        arquivoKey,
        arquivoUrl: getManualArquivoUrl(req, manualAtual.id),
      },
    });

    if (apagarKey && apagarKey !== arquivoKey) {
      apagarArquivoStorage(apagarKey).catch((deleteError) => {
        console.warn('[WARN] Falha ao remover PDF antigo do storage:', deleteError.message);
      });
    }

    return res.status(200).json({
      mensagem: 'Manual atualizado com sucesso.',
      manual: formatarManual(manual, req),
    });
  } catch (erro) {
    if (erro.message === 'Credenciais R2 não configuradas.') {
      return res.status(500).json({ erro: 'Storage R2 não configurado no servidor.' });
    }

    console.error('[ERRO LOG] PATCH /api/manuais/admin/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

router.delete('/admin/:id', autenticar, exigirAdmin, async (req, res) => {
  try {
    const manual = await prisma.manual.findUnique({
      where: { id: req.params.id },
      select: { arquivoKey: true },
    });

    if (!manual) {
      return res.status(404).json({ erro: 'Manual não encontrado.' });
    }

    await prisma.manual.delete({
      where: { id: req.params.id },
    });

    if (manual.arquivoKey) {
      apagarArquivoStorage(manual.arquivoKey).catch((deleteError) => {
        console.warn('[WARN] Falha ao remover PDF do storage:', deleteError.message);
      });
    }

    return res.status(200).json({ mensagem: 'Manual excluído com sucesso.' });
  } catch (erro) {
    console.error('[ERRO LOG] DELETE /api/manuais/admin/:id:', erro);
    return res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente mais tarde.' });
  }
});

export default router;
