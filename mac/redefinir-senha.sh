#!/bin/bash
# Cria uma senha nova para entrar no ERP (para quando a senha foi esquecida).
# Cole no Terminal:
#   curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/redefinir-senha.sh | bash
# Nenhum dado é apagado: só a senha muda.

set -euo pipefail

PASTA="$HOME/ERP-Maragogi-Lab"
NODE="$PASTA/node/bin/node"
DB="$PASTA/dados/erp.db"

falha() { printf '\n\033[1;31m%s\033[0m\n' "$1"; exit 1; }

[ -x "$NODE" ] && [ -d "$PASTA/app" ] || falha "Não encontrei o ERP neste Mac. Instale primeiro com o instalador."
[ -f "$DB" ] || falha "O ERP ainda não tem acesso criado. Rode o instalador de novo que ele pergunta e-mail e senha."

cd "$PASTA/app"
roda_node() { "$NODE" --disable-warning=ExperimentalWarning -e "$1"; }

printf '\n\033[1;34m==> Acessos cadastrados no ERP:\033[0m\n'
ERP_DB="$DB" roda_node "
  const { abrir } = require('./src/db');
  const db = abrir(process.env.ERP_DB);
  for (const u of db.prepare('SELECT email, nome, papel, ativo FROM usuarios ORDER BY id').all()) {
    console.log('  - ' + u.email + ' (' + u.nome + (u.papel === 'admin' ? ', administrador' : '') + (u.ativo ? '' : ', desativado') + ')');
  }"

PRIMEIRO=$(ERP_DB="$DB" roda_node "
  const { abrir } = require('./src/db');
  const u = abrir(process.env.ERP_DB).prepare(\"SELECT email FROM usuarios ORDER BY papel = 'admin' DESC, id LIMIT 1\").get();
  process.stdout.write(u ? u.email : '');")

# Sem Terminal interativo (ex.: rodado por um assistente) ou com --temporaria:
# cria uma senha temporária e mostra na tela, para trocar depois em Configurações → Minha conta.
TEMPORARIA=0
if [ "${1:-}" = "--temporaria" ] || ! { : </dev/tty; } 2>/dev/null; then TEMPORARIA=1; fi

if [ "$TEMPORARIA" = 1 ]; then
  EMAIL=$PRIMEIRO
  SENHA="erp-$(roda_node "process.stdout.write(require('crypto').randomBytes(6).toString('hex'))")"
  SENHA2=$SENHA
else
  printf '\nE-mail que vai receber a senha nova [%s]: ' "$PRIMEIRO"
  read -r EMAIL </dev/tty || true
  EMAIL=${EMAIL:-$PRIMEIRO}
fi

while [ "$TEMPORARIA" = 0 ]; do
  printf 'Nova senha (mínimo 8 caracteres; ela não aparece enquanto você digita): '
  read -rs SENHA </dev/tty; echo
  printf 'Repita a nova senha: '
  read -rs SENHA2 </dev/tty; echo
  if [ "${#SENHA}" -lt 8 ]; then echo "A senha precisa ter pelo menos 8 caracteres."; continue; fi
  if [ "$SENHA" != "$SENHA2" ]; then echo "As senhas não conferem. Vamos de novo."; continue; fi
  break
done

ERP_DB="$DB" ERP_EMAIL="$EMAIL" ERP_SENHA="$SENHA" roda_node "
  const { abrir } = require('./src/db');
  const { hashSenha } = require('./src/auth');
  const db = abrir(process.env.ERP_DB);
  const u = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(process.env.ERP_EMAIL);
  if (!u) { console.error('Esse e-mail não está cadastrado no ERP. Confira a lista acima.'); process.exit(1); }
  db.prepare('UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE id = ?').run(hashSenha(process.env.ERP_SENHA), u.id);
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
  db.close();" || falha "Não foi possível trocar a senha."
[ "$TEMPORARIA" = 1 ] && TEMP_MOSTRAR=$SENHA
unset SENHA SENHA2

# Reinicia o ERP para liberar o bloqueio de "muitas tentativas de login".
launchctl kickstart -k "gui/$(id -u)/com.maragogilab.erp" 2>/dev/null || true
sleep 2

if [ "$TEMPORARIA" = 1 ]; then
  printf '\n\033[1;32mPronto! Entre no ERP com:\n  E-mail: %s\n  Senha temporária: %s\033[0m\n' "$EMAIL" "$TEMP_MOSTRAR"
  printf 'Depois de entrar, troque a senha em Configurações → Minha conta.\n'
else
  printf '\n\033[1;32mPronto! Entre no ERP com o e-mail %s e a senha nova.\033[0m\n' "$EMAIL"
fi
[ -x "$PASTA/app/mac/abrir.sh" ] && /bin/bash "$PASTA/app/mac/abrir.sh" || true
