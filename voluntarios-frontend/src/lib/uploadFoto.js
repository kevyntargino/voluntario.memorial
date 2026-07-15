import { buildApiUrl } from './api';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadFotoUsuario({ token, file }) {
  if (!file) {
    throw new Error('Selecione uma imagem.');
  }

  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    throw new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('A imagem deve ter no máximo 5MB.');
  }

  const assinaturaResposta = await fetch(buildApiUrl('/api/auth/me/foto-upload-url'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
    }),
  });
  const assinatura = await assinaturaResposta.json();

  if (!assinaturaResposta.ok) {
    throw new Error(assinatura.erro || 'Não foi possível preparar o upload da foto.');
  }

  const uploadResposta = await fetch(assinatura.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResposta.ok) {
    throw new Error('Não foi possível enviar a foto para o storage.');
  }

  return assinatura.publicUrl;
}
