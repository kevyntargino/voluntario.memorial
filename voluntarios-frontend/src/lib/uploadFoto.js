import { buildApiUrl } from './api';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo da foto.'));
    reader.readAsDataURL(file);
  });
}

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

  const base64 = await readAsDataUrl(file);
  const uploadResposta = await fetch(buildApiUrl('/api/auth/me/foto'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      base64,
    }),
  });
  const dados = await uploadResposta.json();

  if (!uploadResposta.ok) {
    throw new Error(dados.erro || 'Não foi possível enviar a foto para o storage.');
  }

  return dados.publicUrl;
}
