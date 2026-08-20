#!/usr/bin/env bash
set -Eeuo pipefail

COR_VERDE='\033[0;32m'
COR_AMARELA='\033[0;33m'
SEM_COR='\033[0m'
RAIZ_PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ_PROJETO"

informar() { printf "${COR_VERDE}[Recicla Belô]${SEM_COR} %s\n" "$1"; }
alertar() { printf "${COR_AMARELA}[Atenção]${SEM_COR} %s\n" "$1"; }
falhar() { printf "[Erro] %s\n" "$1" >&2; exit 1; }

comando_administrativo() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; elif command -v sudo >/dev/null 2>&1; then sudo "$@"; else falhar "A instalação requer sudo ou execução como root."; fi
}

instalar_pacote() {
  local pacote="$1"
  if command -v apt-get >/dev/null 2>&1; then
    comando_administrativo apt-get update -y
    comando_administrativo apt-get install -y "$pacote"
  elif command -v dnf >/dev/null 2>&1; then comando_administrativo dnf install -y "$pacote"
  elif command -v yum >/dev/null 2>&1; then comando_administrativo yum install -y "$pacote"
  elif command -v pacman >/dev/null 2>&1; then comando_administrativo pacman -Sy --noconfirm "$pacote"
  elif command -v apk >/dev/null 2>&1; then comando_administrativo apk add --no-cache "$pacote"
  else falhar "Distribuição sem gerenciador de pacotes compatível (apt, dnf, yum, pacman ou apk)."; fi
}

garantir_ferramentas() {
  command -v curl >/dev/null 2>&1 || instalar_pacote curl
  command -v git >/dev/null 2>&1 || instalar_pacote git
  command -v openssl >/dev/null 2>&1 || instalar_pacote openssl

  if ! command -v docker >/dev/null 2>&1; then
    informar "Instalando Docker pelo instalador oficial..."
    local instalador_docker
    instalador_docker="$(mktemp)"
    curl --fail --silent --show-error --location https://get.docker.com --output "$instalador_docker"
    comando_administrativo sh "$instalador_docker"
    rm -f "$instalador_docker"
  fi
  docker compose version >/dev/null 2>&1 || falhar "Docker Compose v2 não está disponível. Atualize a instalação do Docker."

  local versao_node=0
  if command -v node >/dev/null 2>&1; then versao_node="$(node -p 'process.versions.node.split(".")[0]')"; fi
  if [ "$versao_node" -lt 24 ]; then
    informar "Instalando Node.js 24 LTS no perfil atual..."
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      local instalador_nvm
      instalador_nvm="$(mktemp)"
      curl --fail --silent --show-error --location https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh --output "$instalador_nvm"
      bash "$instalador_nvm"
      rm -f "$instalador_nvm"
    fi
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm install 24
    nvm use 24
  fi
}

preparar_ambiente() {
  if [ ! -f .env ]; then
    cp .env.example .env
    local segredo_jwt senha_banco senha_admin
    segredo_jwt="$(openssl rand -hex 32)"
    senha_banco="$(openssl rand -hex 16)"
    senha_admin="Admin!$(openssl rand -hex 10)"
    sed "s|^SEGREDO_JWT=.*|SEGREDO_JWT=\"${segredo_jwt}\"|; s|^BANCO_SENHA=.*|BANCO_SENHA=\"${senha_banco}\"|; s|^URL_BANCO=.*|URL_BANCO=\"postgresql://reciclabelo:${senha_banco}@localhost:55432/reciclabelo\"|; s|^ADMIN_SENHA=.*|ADMIN_SENHA=\"${senha_admin}\"|" .env > .env.novo
    mv .env.novo .env
    alertar "Senha inicial do administrador gerada para este ambiente: ${senha_admin}"
    alertar "Guarde-a em um gerenciador de senhas; ela não será versionada."
  fi
  mkdir -p servidor/arquivos
}

instalar_dependencias() {
  informar "Verificando dependências do frontend e do servidor..."
  npm ci
  npm --prefix servidor ci
}

iniciar_banco() {
  informar "Iniciando PostgreSQL 18.6..."
  docker compose up -d banco
  local tentativa=0
  until [ "$(docker inspect --format='{{.State.Health.Status}}' recicla-belo-postgres-v18 2>/dev/null || true)" = "healthy" ]; do
    tentativa=$((tentativa + 1))
    [ "$tentativa" -lt 40 ] || { docker compose logs banco; falhar "O banco não ficou saudável no tempo esperado."; }
    sleep 2
  done
}

preparar_banco() {
  informar "Aplicando migrações e preparando o administrador..."
  npm --prefix servidor run migrar
  npm --prefix servidor run seed
}

iniciar_aplicacao() {
  informar "Tudo pronto. Frontend e servidor serão iniciados agora."
  npm --prefix servidor run desenvolver &
  PID_SERVIDOR=$!
  npm run dev &
  PID_FRONTEND=$!
  trap 'kill "$PID_SERVIDOR" "$PID_FRONTEND" 2>/dev/null || true' EXIT INT TERM
  wait -n "$PID_SERVIDOR" "$PID_FRONTEND"
}

garantir_ferramentas
preparar_ambiente
instalar_dependencias
iniciar_banco
preparar_banco

if [ "${1:-}" = "--somente-instalar" ]; then
  informar "Instalação e banco concluídos."
else
  iniciar_aplicacao
fi
