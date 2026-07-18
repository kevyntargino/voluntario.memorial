export const paisesTelefone = [
  { ddi: '55', nome: 'Brasil' },
  { ddi: '1', nome: 'Estados Unidos / Canadá' },
  { ddi: '54', nome: 'Argentina' },
  { ddi: '591', nome: 'Bolívia' },
  { ddi: '56', nome: 'Chile' },
  { ddi: '595', nome: 'Paraguai' },
  { ddi: '598', nome: 'Uruguai' },
  { ddi: '351', nome: 'Portugal' },
  { ddi: '34', nome: 'Espanha' },
  { ddi: '44', nome: 'Reino Unido' },
  { ddi: '33', nome: 'França' },
  { ddi: '49', nome: 'Alemanha' },
  { ddi: '39', nome: 'Itália' },
  { ddi: '244', nome: 'Angola' },
  { ddi: '238', nome: 'Cabo Verde' },
  { ddi: '258', nome: 'Moçambique' },
  { ddi: '81', nome: 'Japão' },
  { ddi: '86', nome: 'China' },
  { ddi: '61', nome: 'Austrália' },
];

const codigosDdi = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86',
  '90', '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', '224',
  '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240',
  '241', '242', '243', '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257',
  '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299',
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375',
  '376', '377', '378', '379', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595',
  '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681',
  '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850', '852', '853', '855', '856',
  '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974',
  '975', '976', '977', '992', '993', '994', '995', '996', '998',
];

export function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function separarTelefone(valor) {
  const digitos = somenteDigitos(valor).slice(0, 15);

  if (!digitos) return { ddi: '55', numero: '' };

  const ddi = [...codigosDdi]
    .sort((a, b) => b.length - a.length)
    .find((codigo) => digitos.startsWith(codigo) && digitos.length - codigo.length >= 6);

  if (ddi) {
    return { ddi, numero: digitos.slice(ddi.length) };
  }

  return { ddi: '55', numero: digitos.slice(0, 11) };
}

export function formatarNumeroTelefone(numero, ddi = '55') {
  const limite = ddi === '55' ? 11 : Math.max(6, 15 - ddi.length);
  const digitos = somenteDigitos(numero).slice(0, limite);

  if (!digitos) return '';

  if (ddi === '55') {
    if (digitos.length <= 2) return `(${digitos}`;
    const ddd = digitos.slice(0, 2);
    const restante = digitos.slice(2);
    const tamanhoPrefixo = restante.length > 8 ? 5 : 4;
    const prefixo = restante.slice(0, tamanhoPrefixo);
    const sufixo = restante.slice(tamanhoPrefixo);
    return `(${ddd}) ${prefixo}${sufixo ? `-${sufixo}` : ''}`;
  }

  if (ddi === '1') {
    if (digitos.length <= 3) return `(${digitos}`;
    const area = digitos.slice(0, 3);
    const prefixo = digitos.slice(3, 6);
    const sufixo = digitos.slice(6, 10);
    return `(${area}) ${prefixo}${sufixo ? `-${sufixo}` : ''}`;
  }

  return digitos.match(/.{1,3}/g)?.join(' ') || digitos;
}

export function formatarTelefoneExibicao(valor) {
  if (!valor) return '';
  const { ddi, numero } = separarTelefone(valor);
  return `+${ddi} ${formatarNumeroTelefone(numero, ddi)}`.trim();
}

export function normalizarTelefoneBrasilParaLogin(valor) {
  const digitos = somenteDigitos(valor).slice(0, 13);

  if (!digitos) return '';

  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return digitos;
  }

  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }

  return '';
}

export function formatarTelefoneBrasilLogin(valor) {
  const digitos = somenteDigitos(valor).slice(0, 13);
  const numeroNacional = digitos.startsWith('55') && digitos.length > 11
    ? digitos.slice(2)
    : digitos;

  return formatarNumeroTelefone(numeroNacional.slice(0, 11), '55');
}
