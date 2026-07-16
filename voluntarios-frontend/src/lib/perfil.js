export const camposCadastro = [
  { campo: 'telefone', label: 'telefone' },
  { campo: 'dataNascimento', label: 'data de nascimento' },
  { campo: 'sexo', label: 'sexo' },
  { campo: 'urlFoto', label: 'foto de perfil' },
];

export function getCamposCadastroPendentes(usuario) {
  if (!usuario) return [];

  return camposCadastro.filter(({ campo }) => {
    const valor = usuario[campo];
    return valor === null || valor === undefined || String(valor).trim() === '';
  });
}
