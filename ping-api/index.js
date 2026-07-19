const http = require('node:http');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (erro) {
    // Em produção, as variáveis podem ser fornecidas diretamente pelo ambiente.
    if (erro.code !== 'ENOENT') {
      throw erro;
    }
  }
}

const voluntariosApiUrl = process.env.VOLUNTARIOS_API_URL?.trim();
const port = Number(process.env.PORT || 3001);

const servidor = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/hello' || req.url === '/ping/hello')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('world');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  return res.end('Not found');
});

async function consultarVoluntariosApi() {
  if (!voluntariosApiUrl) {
    console.warn('[VOLUNTARIOS API] VOLUNTARIOS_API_URL não definida; consulta ignorada.');
    return;
  }

  const url = `${voluntariosApiUrl.replace(/\/$/, '')}/hello`;

  try {
    const resposta = await fetch(url, { method: 'GET' });
    const resultado = await resposta.text();
    console.log(`[VOLUNTARIOS API] GET ${url} (${resposta.status}): ${resultado}`);
  } catch (erro) {
    console.error(`[VOLUNTARIOS API] Falha ao consultar ${url}:`, erro.message);
  }
}

consultarVoluntariosApi();
setInterval(consultarVoluntariosApi, 10 * 1000);

servidor.listen(port, () => {
  console.log(`[PING API] Servidor ouvindo na porta ${port}`);
});
