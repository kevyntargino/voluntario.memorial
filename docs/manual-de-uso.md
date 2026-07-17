# Manual de uso

## Acesso ao sistema

1. Abra o frontend do sistema.
2. Informe email e senha.
3. Ao entrar, o sistema carrega sua sessao e direciona para a tela inicial.

Usuarios de teste do ambiente seed:

- Administrador: `admin@teste.com` / `Admin@123`
- Lider: `lider@teste.com` / `Lider@123`
- Voluntario: `voluntario@teste.com` / `Voluntario@123`

## Tela inicial

A tela inicial apresenta um resumo da experiencia do usuario autenticado. A navegacao principal permite acessar:

- Perfil.
- Escalas.
- Minha equipe.
- Avisos.
- Manuais.
- Administracao, quando o usuario possui permissao.

Em dispositivos moveis, a navegacao inferior facilita o acesso rapido aos modulos.

## Perfil

No perfil, o usuario pode:

- Atualizar nome, telefone, data de nascimento e sexo.
- Alterar a propria senha.
- Enviar ou atualizar foto.

O sistema pode exibir uma notificacao de conclusao de perfil quando ainda faltarem dados importantes.

## Escalas do voluntario

Em **Escalas**, o voluntario acompanha suas proximas participacoes e historico.

Acoes comuns:

1. Conferir data, local, equipe e evento.
2. Confirmar presenca quando estiver disponivel.
3. Solicitar substituicao quando nao puder participar.
4. Informar justificativa quando necessario.

Status possiveis:

- `PENDENTE`: ainda sem confirmacao.
- `CONFIRMADA`: presenca confirmada.
- `PEDIU_SUBSTITUICAO`: voluntario solicitou substituto.
- `AUSENTE`: ausencia registrada.

## Minha equipe

Esta area mostra as equipes vinculadas ao usuario.

Voluntarios podem consultar membros e escalas da equipe.

Lideres de equipe podem, nas equipes que lideram:

- Adicionar voluntarios.
- Remover voluntarios.
- Criar escalas.
- Editar escalas.
- Excluir escalas.
- Atribuir substitutos para pedidos de substituicao.

Administradores tambem podem realizar essas acoes.

## Avisos

Em **Avisos**, o usuario visualiza comunicados direcionados a ele. Um aviso pode ser:

- Global.
- Direcionado a uma equipe.
- Direcionado a lideres.
- Direcionado a voluntarios.
- Direcionado a usuarios especificos.

Ao abrir ou marcar um aviso, ele pode ser registrado como visualizado.

## Manuais

Em **Manuais**, o usuario acessa documentos de apoio. Os manuais podem ser gerais ou vinculados a uma equipe especifica.

Use esta area para consultar procedimentos, arquivos de treinamento e orientacoes operacionais.

## Notificacoes

O sistema possui notificacoes internas e suporte a notificacoes push.

O usuario pode receber avisos sobre:

- Nova escala.
- Confirmacao de escala.
- Pedido de substituicao.
- Atribuicao como substituto.
- Avisos importantes.

Quando o navegador permitir, o app pode solicitar autorizacao para notificacoes push.

## Instalacao como aplicativo

O frontend possui suporte PWA. Em navegadores compativeis, o usuario pode instalar o sistema no celular ou computador usando o prompt de instalacao exibido pelo app ou o menu do navegador.

## Administracao

A area administrativa e restrita a usuarios com permissao `ADMINISTRADOR`.

### Dashboard

O dashboard mostra informacoes gerais do sistema:

- Total de voluntarios.
- Total de equipes.
- Lista de equipes.
- Usuarios cadastrados.
- Ultimas escalas.
- Proxima escala.

### Gerenciar usuarios

O administrador pode criar, editar e remover usuarios.

Campos principais:

- Nome completo.
- Email.
- Telefone.
- Data de nascimento.
- Sexo.
- Permissoes.
- Equipes.
- Equipes lideradas.

Ao criar usuario, o sistema usa senha temporaria baseada no primeiro nome quando aplicavel. Recomenda-se orientar o usuario a trocar a senha no primeiro acesso.

### Gerenciar equipes

O administrador pode criar e excluir equipes, alem de relacionar voluntarios e lideres.

Boas praticas:

- Definir ao menos um lider para cada equipe operacional.
- Manter nomes de equipe claros e padronizados.
- Remover voluntarios somente quando nao fizerem mais parte da equipe.

### Gerenciar eventos e escalas

Eventos podem ser recorrentes ou esporadicos.

Eventos recorrentes:

- Semanais: usam dia da semana e horario.
- Mensais: usam dia da semana e semana do mes.

Eventos esporadicos:

- Usados para conferencias, noites especiais, workshops e outras datas especificas.

Ao criar ou editar eventos, confira:

- Titulo.
- Local.
- Descricao.
- Tipo.
- Frequencia.
- Datas.
- Equipes participantes.
- Voluntarios escalados.

### Substituicoes

Quando um voluntario pede substituicao:

1. O lider ou administrador acessa a equipe/escala.
2. Verifica a justificativa.
3. Escolhe um substituto disponivel.
4. O sistema registra o substituto e envia notificacao quando configurado.

### Avisos administrativos

O administrador pode criar avisos para publicos diferentes:

- Todos.
- Lideres.
- Voluntarios.
- Equipes selecionadas.
- Usuarios selecionados.

Tambem pode ocultar avisos sem remove-los ou excluir definitivamente.

### Manuais administrativos

O administrador pode cadastrar, atualizar e remover manuais. Um manual pode ter:

- Titulo.
- Descricao.
- Versao.
- Data.
- Arquivo.
- Equipe vinculada.
- Estado oculto.

### Ordens de culto

O administrador pode cadastrar uma ordem de culto com texto e/ou anexo, vinculando a uma data ou evento.

## Recomendacoes operacionais

- Mantenha usuarios com permissoes minimas necessarias.
- Revise escalas futuras com antecedencia.
- Use avisos para comunicados que precisam ficar registrados.
- Use notificacoes push como apoio, nao como unico meio de comunicacao.
- Atualize manuais quando houver mudanca de procedimento.
- Evite apagar historico de escalas sem necessidade.
