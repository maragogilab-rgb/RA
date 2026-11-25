#!/usr/bin/env bash
# Instala as melhores skills de design gráfico de terceiros (GitHub) para o Claude Code.
# Uso:
#   bash scripts/instalar-skills-design.sh            # instala em ~/.claude/skills (todos os projetos)
#   bash scripts/instalar-skills-design.sh --projeto  # instala em .claude/skills deste projeto
# Requer: git. Rode de novo para atualizar.
set -euo pipefail

DEST="$HOME/.claude/skills"
[ "${1:-}" = "--projeto" ] && DEST="$(cd "$(dirname "$0")/.." && pwd)/.claude/skills"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# repositório | pasta da skill no repositório | nome da pasta instalada
SKILLS=(
  "anthropics/skills|skills/frontend-design|frontend-design"
  "anthropics/skills|skills/canvas-design|canvas-design"
  "anthropics/skills|skills/algorithmic-art|algorithmic-art"
  "anthropics/skills|skills/brand-guidelines|brand-guidelines"
  "anthropics/skills|skills/theme-factory|theme-factory"
  "anthropics/skills|skills/slack-gif-creator|slack-gif-creator"
  "pbakaus/impeccable|plugin/skills/impeccable|impeccable"
  "Leonxlnx/taste-skill|skills/taste-skill|design-taste-frontend"
  "nextlevelbuilder/ui-ux-pro-max-skill|.claude/skills/ui-ux-pro-max|ui-ux-pro-max"
  "nextlevelbuilder/ui-ux-pro-max-skill|.claude/skills/banner-design|banner-design"
  "nextlevelbuilder/ui-ux-pro-max-skill|.claude/skills/brand|brand"
  "Nutlope/hallmark|skills/hallmark|hallmark"
  "kaankiziltug/logo-design-skill|skills/logo-design|logo-design"
  "fatihaydost/brand-identity-skill|skills/brand-identity|brand-identity"
  "meodai/skill.color-expert|.|color-expert"
  "upbrew-tech/svg-creator-skill|.|svg-creator"
  "remotion-dev/skills|skills/remotion-create|remotion-create"
  "remotion-dev/skills|skills/remotion-render|remotion-render"
)

for linha in "${SKILLS[@]}"; do
  IFS='|' read -r repo sub nome <<<"$linha"
  pasta="$TMP/${repo//\//__}"
  if [ ! -d "$pasta" ]; then
    echo "↓ $repo"
    git clone --quiet --depth 1 "https://github.com/$repo.git" "$pasta" || { echo "  ✗ não consegui baixar $repo"; continue; }
  fi
  if [ ! -f "$pasta/$sub/SKILL.md" ]; then echo "  ✗ $repo/$sub sem SKILL.md (repositório mudou?)"; continue; fi
  rm -rf "$DEST/$nome"
  mkdir -p "$DEST/$nome"
  (cd "$pasta/$sub" && tar --exclude=.git -cf - .) | (cd "$DEST/$nome" && tar -xf -)
  echo "  ✓ $nome"
done

echo
echo "Skills instaladas em: $DEST"
echo "Reinicie o Claude Code para carregá-las. Leia a licença de cada repositório antes de uso comercial."
