import crypto from 'node:crypto';

const R2_DEFAULT_PUBLIC_URL = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com/voluntarios';
const R2_DEFAULT_ENDPOINT = 'https://a66b8eca7a1e0672558565df261c389a.r2.cloudflarestorage.com';
const R2_DEFAULT_BUCKET = 'voluntarios';

export function getR2Config() {
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

function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

export function criarPresignedUrl({ key, method = 'GET', expiresIn = 300 }) {
  const config = getR2Config();

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error('Credenciais R2 não configuradas.');
  }

  const endpointUrl = new URL(config.endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
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
  const signature = hmac(getSigningKey(config.secretAccessKey, dateStamp), stringToSign, 'hex');

  params.set('X-Amz-Signature', signature);

  return `${endpointUrl.origin}${canonicalUri}?${params.toString()}`;
}

export async function fetchComTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('TIMEOUT_STORAGE');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extrairKeyStorageDeUrl(url, { proxyMarkers = [] } = {}) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  for (const marker of proxyMarkers) {
    const index = url.indexOf(marker);

    if (index >= 0) {
      return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
    }
  }

  const config = getR2Config();
  const prefixos = [
    `${config.publicUrl}/`,
    `${config.endpoint.replace(/\/$/, '')}/${config.bucket}/`,
  ];
  const prefixoEncontrado = prefixos.find((prefixo) => url.startsWith(prefixo));

  if (!prefixoEncontrado) {
    return null;
  }

  return decodeURIComponent(url.slice(prefixoEncontrado.length).split('?')[0]);
}

export async function apagarObjetoStorage(key, { prefixosPermitidos = [], label = 'arquivo' } = {}) {
  if (!key || (prefixosPermitidos.length > 0 && !prefixosPermitidos.some((prefixo) => key.startsWith(prefixo)))) {
    return false;
  }

  const deleteUrl = criarPresignedUrl({ key, method: 'DELETE', expiresIn: 300 });
  const resposta = await fetchComTimeout(deleteUrl, { method: 'DELETE' }, 60000);

  if (!resposta.ok && resposta.status !== 404) {
    const detalhe = await resposta.text().catch(() => '');
    throw new Error(`Falha ao excluir ${label} do storage (${resposta.status}). ${detalhe}`.trim());
  }

  return true;
}
