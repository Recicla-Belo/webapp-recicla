#!/usr/bin/env bash
set -Eeuo pipefail

COR_VERDE='\033[0;32m'
COR_AMARELA='\033[0;33m'
COR_VERMELHA='\033[0;31m'
SEM_COR='\033[0m'
RAIZ_PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARQUIVO_COMPOSE="$RAIZ_PROJETO/docker-compose.producao.yml"
ARQUIVO_ENV="$RAIZ_PROJETO/.env"
DOMINIO=""
EMAIL_CERTIFICADO=""
SEM_HTTPS=false
NAO_INTERATIVO=false
PRIMEIRA_INSTALACAO=false
SENHA_ADMIN_GERADA=""

informar() { printf "${COR_VERDE}[Recicla Belô]${SEM_COR} %s\n" "$1"; }
alertar() { printf "${COR_AMARELA}[Atenção]${SEM_COR} %s\n" "$1"; }
falhar() { printf "${COR_VERMELHA}[Erro]${SEM_COR} %s\n" "$1" >&2; exit 1; }

uso() {
  cat <<'EOF'
Uso:
  sudo bash scripts/instalar-producao.sh [opções]

Opções:
  --dominio DOMINIO             Domínio público, por exemplo reciclabelo.vupi.us
  --email-certificado EMAIL     E-mail usado pelo Let's Encrypt
  --sem-https                    Configura somente HTTP
  --nao-interativo              Exige domínio por argumento e gera credenciais ausentes
  --ajuda                       Mostra esta ajuda

O script é idempotente: pode ser executado novamente após um git pull para
revalidar, aplicar migrações e atualizar os containers com segurança.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dominio) [ "$#" -ge 2 ] || falhar "Informe o domínio após --dominio."; DOMINIO="$2"; shift 2 ;;
    --email-certificado) [ "$#" -ge 2 ] || falhar "Informe o e-mail após --email-certificado."; EMAIL_CERTIFICADO="$2"; shift 2 ;;
    --sem-https) SEM_HTTPS=true; shift ;;
    --nao-interativo) NAO_INTERATIVO=true; shift ;;
    --ajuda|-h) uso; exit 0 ;;
    *) falhar "Opção desconhecida: $1" ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  falhar "Execute com privilégios administrativos: sudo bash scripts/instalar-producao.sh"
fi

cd "$RAIZ_PROJETO"
[ -f "$ARQUIVO_COMPOSE" ] || falhar "docker-compose.producao.yml não foi encontrado. Execute o script dentro do repositório."
[ -f package-lock.json ] || falhar "package-lock.json não foi encontrado."

DIRETORIO_TRAVA="/var/lock/recicla-belo-producao.lock"
mkdir "$DIRETORIO_TRAVA" 2>/dev/null || falhar "Outra instalação do Recicla Belô já está em andamento."
trap 'rmdir "$DIRETORIO_TRAVA" 2>/dev/null || true' EXIT

diagnosticar_falha() {
  local codigo=$?
  printf "\n${COR_VERMELHA}[Diagnóstico automático]${SEM_COR} A instalação falhou na linha %s.\n" "${BASH_LINENO[0]:-desconhecida}" >&2
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose -f "$ARQUIVO_COMPOSE" ps 2>/dev/null || true
    docker compose -f "$ARQUIVO_COMPOSE" logs --tail 60 banco api frontend 2>/dev/null || true
  fi
  command -v nginx >/dev/null 2>&1 && nginx -t 2>&1 || true
  printf "Corrija a causa indicada acima e execute o mesmo comando novamente; etapas concluídas serão reaproveitadas.\n" >&2
  exit "$codigo"
}
trap diagnosticar_falha ERR

instalar_pacotes() {
  informar "Verificando Docker, NGINX, Certbot e utilitários..."
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y ca-certificates curl git gnupg nginx certbot python3-certbot-nginx openssl iproute2 dnsutils
    if ! command -v docker >/dev/null 2>&1; then apt-get install -y docker.io; fi
    if ! docker compose version >/dev/null 2>&1; then
      apt-get install -y docker-compose-v2 2>/dev/null || apt-get install -y docker-compose-plugin
    fi
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git nginx certbot python3-certbot-nginx openssl iproute bind-utils docker docker-compose-plugin
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git nginx certbot python3-certbot-nginx openssl iproute bind-utils docker docker-compose-plugin
  else
    falhar "Distribuição não suportada automaticamente. Use Ubuntu, Debian, Fedora, Rocky Linux ou AlmaLinux."
  fi
  command -v docker >/dev/null 2>&1 || falhar "Docker não pôde ser instalado."
  docker compose version >/dev/null 2>&1 || falhar "Docker Compose v2 não está disponível."
  systemctl enable --now docker
  systemctl enable --now nginx
}

ler_env() {
  local chave="$1" arquivo="${2:-$ARQUIVO_ENV}" linha
  [ -f "$arquivo" ] || return 0
  linha="$(grep -m1 -E "^${chave}=" "$arquivo" 2>/dev/null || true)"
  linha="${linha#*=}"
  linha="${linha%$'\r'}"
  if [[ "$linha" == \"*\" ]]; then linha="${linha:1:${#linha}-2}"; fi
  printf '%s' "$linha"
}

normalizar_dominio() {
  local valor="$1"
  valor="${valor#http://}"; valor="${valor#https://}"; valor="${valor%%/*}"; valor="${valor%%:*}"
  printf '%s' "${valor,,}"
}

validar_dominio() {
  [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]
}

solicitar_configuracao() {
  local dominio_anterior nome_admin email_admin senha_admin senha_banco segredo_jwt
  dominio_anterior="$(ler_env DOMINIO_APLICACAO)"
  [ -n "$DOMINIO" ] || DOMINIO="$dominio_anterior"
  if [ -z "$DOMINIO" ] && ! $NAO_INTERATIVO; then read -r -p "Domínio da plataforma (ex.: reciclabelo.vupi.us): " DOMINIO; fi
  DOMINIO="$(normalizar_dominio "$DOMINIO")"
  validar_dominio "$DOMINIO" || falhar "Domínio inválido: '$DOMINIO'. Informe apenas o host, sem https:// ou caminhos."

  if [ -z "$EMAIL_CERTIFICADO" ]; then EMAIL_CERTIFICADO="$(ler_env EMAIL_CERTIFICADO)"; fi
  if [ -z "$EMAIL_CERTIFICADO" ] && ! $SEM_HTTPS && ! $NAO_INTERATIVO; then read -r -p "E-mail para avisos do certificado TLS: " EMAIL_CERTIFICADO; fi
  if ! $SEM_HTTPS && [[ ! "$EMAIL_CERTIFICADO" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    falhar "Informe um e-mail válido para o certificado ou use --sem-https."
  fi

  nome_admin="$(ler_env ADMIN_NOME)"; [ -n "$nome_admin" ] || nome_admin="Administrador"
  email_admin="$(ler_env ADMIN_EMAIL)"; [ -n "$email_admin" ] || email_admin="admin@reciclabelo"
  senha_admin="$(ler_env ADMIN_SENHA)"
  senha_banco="$(ler_env BANCO_SENHA)"
  segredo_jwt="$(ler_env SEGREDO_JWT)"
  if [ ! -f "$ARQUIVO_ENV" ] || [[ "$senha_admin$senha_banco$segredo_jwt" == *"__GERAR_"* ]]; then PRIMEIRA_INSTALACAO=true; fi

  if $PRIMEIRA_INSTALACAO && ! $NAO_INTERATIVO; then
    local entrada_nome entrada_email entrada_senha
    read -r -p "Nome do administrador [$nome_admin]: " entrada_nome; [ -z "$entrada_nome" ] || nome_admin="$entrada_nome"
    read -r -p "E-mail do administrador [$email_admin]: " entrada_email; [ -z "$entrada_email" ] || email_admin="$entrada_email"
    read -r -s -p "Senha inicial do administrador (mínimo 12; Enter para gerar): " entrada_senha; printf '\n'
    [ -z "$entrada_senha" ] || senha_admin="$entrada_senha"
  fi
  if [ ${#senha_admin} -lt 12 ] || [[ "$senha_admin" == *"__GERAR_"* ]]; then senha_admin="Admin!$(openssl rand -hex 12)"; SENHA_ADMIN_GERADA="$senha_admin"; fi
  if [ ${#senha_banco} -lt 24 ] || [[ "$senha_banco" == *"__GERAR_"* ]]; then senha_banco="$(openssl rand -hex 32)"; fi
  if [ ${#segredo_jwt} -lt 64 ] || [[ "$segredo_jwt" == *"__GERAR_"* ]]; then segredo_jwt="$(openssl rand -hex 64)"; fi
  [[ "$email_admin" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || falhar "O e-mail do administrador é inválido."
  [[ "$nome_admin" != *$'\n'* && "$nome_admin" != *'"'* ]] || falhar "O nome do administrador contém caracteres não permitidos no arquivo de ambiente."
  [[ "$senha_admin" != *$'\n'* && "$senha_admin" != *'"'* && "$senha_admin" != *'\\'* ]] || falhar "A senha informada contém aspas, barra invertida ou quebra de linha. Use outra senha."

  local porta_frontend porta_api
  porta_frontend="$(ler_env PORTA_FRONTEND)"; [ -n "$porta_frontend" ] || porta_frontend="$(encontrar_porta 3101 3199)"
  porta_api="$(ler_env PORTA_API)"; [ -n "$porta_api" ] || porta_api="$(encontrar_porta 3333 3399)"

  umask 077
  local temporario_env
  temporario_env="$(mktemp "$RAIZ_PROJETO/.env.producao.XXXXXX")"
  cat > "$temporario_env" <<EOF
# Gerado e preservado por scripts/instalar-producao.sh
DOMINIO_APLICACAO="$DOMINIO"
EMAIL_CERTIFICADO="$EMAIL_CERTIFICADO"
NEXT_PUBLIC_NOME_APLICACAO="$(ler_env NEXT_PUBLIC_NOME_APLICACAO "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_DESCRICAO_APLICACAO="$(ler_env NEXT_PUBLIC_DESCRICAO_APLICACAO "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_ICONE_APLICACAO="$(ler_env NEXT_PUBLIC_ICONE_APLICACAO "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_FAVICON="$(ler_env NEXT_PUBLIC_FAVICON "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_COR_PRIMARIA="$(ler_env NEXT_PUBLIC_COR_PRIMARIA "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_COR_PRIMARIA_ESCURA="$(ler_env NEXT_PUBLIC_COR_PRIMARIA_ESCURA "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_COR_FUNDO="$(ler_env NEXT_PUBLIC_COR_FUNDO "${ARQUIVO_ENV:-.env}")"
NEXT_PUBLIC_URL_API=""
AMBIENTE="producao"
CONFIAR_PROXY="true"
HOST_API="127.0.0.1"
PORTA_FRONTEND="$porta_frontend"
PORTA_API="$porta_api"
ORIGEM_FRONTEND="https://$DOMINIO,http://$DOMINIO"
SEGREDO_JWT="$segredo_jwt"
EXPIRACAO_SESSAO="8h"
LIMITE_ARQUIVO_MB="8"
PASTA_ARQUIVOS="/dados/arquivos"
BANCO_HOST="banco"
BANCO_PORTA="5432"
BANCO_NOME="reciclabelo"
BANCO_USUARIO="reciclabelo"
BANCO_SENHA="$senha_banco"
BANCO_SSL="false"
URL_BANCO="postgresql://reciclabelo:$senha_banco@banco:5432/reciclabelo"
ADMIN_EMAIL="$email_admin"
ADMIN_SENHA="$senha_admin"
ADMIN_NOME="$nome_admin"
EOF
  # Mantém os padrões visuais quando o arquivo anterior ainda não existia.
  sed -i 's|NEXT_PUBLIC_NOME_APLICACAO=""|NEXT_PUBLIC_NOME_APLICACAO="Recicla Belô"|; s|NEXT_PUBLIC_DESCRICAO_APLICACAO=""|NEXT_PUBLIC_DESCRICAO_APLICACAO="Gestão que transforma"|; s|NEXT_PUBLIC_ICONE_APLICACAO=""|NEXT_PUBLIC_ICONE_APLICACAO="/favicon.svg"|; s|NEXT_PUBLIC_FAVICON=""|NEXT_PUBLIC_FAVICON="/favicon.svg"|; s|NEXT_PUBLIC_COR_PRIMARIA=""|NEXT_PUBLIC_COR_PRIMARIA="#167347"|; s|NEXT_PUBLIC_COR_PRIMARIA_ESCURA=""|NEXT_PUBLIC_COR_PRIMARIA_ESCURA="#075c37"|; s|NEXT_PUBLIC_COR_FUNDO=""|NEXT_PUBLIC_COR_FUNDO="#f5f7f6"|' "$temporario_env"
  if [ -f "$ARQUIVO_ENV" ]; then cp -a "$ARQUIVO_ENV" "$ARQUIVO_ENV.backup.$(date +%Y%m%d%H%M%S)"; fi
  mv "$temporario_env" "$ARQUIVO_ENV"
  chmod 600 "$ARQUIVO_ENV"
  if [ -n "$SENHA_ADMIN_GERADA" ]; then
    local arquivo_credenciais="/root/reciclabelo-credenciais-iniciais.txt"
    umask 077
    printf 'Domínio: %s\nAdministrador: %s\nSenha inicial: %s\n' "$DOMINIO" "$email_admin" "$SENHA_ADMIN_GERADA" > "$arquivo_credenciais"
    chmod 600 "$arquivo_credenciais"
    alertar "Credenciais iniciais salvas com permissão restrita em $arquivo_credenciais."
  fi
}

porta_ocupada() { ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)$1$"; }
encontrar_porta() {
  local porta="$1" limite="$2"
  while [ "$porta" -le "$limite" ]; do
    if ! porta_ocupada "$porta"; then printf '%s' "$porta"; return 0; fi
    porta=$((porta + 1))
  done
  falhar "Nenhuma porta livre encontrada entre $1 e $2."
}

compose() { docker compose -f "$ARQUIVO_COMPOSE" "$@"; }

esperar_servico() {
  local servico="$1" tentativas="${2:-36}" id estado tentativa
  id="$(compose ps -q "$servico")"
  [ -n "$id" ] || return 1
  for ((tentativa=1; tentativa<=tentativas; tentativa++)); do
    estado="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
    [ "$estado" = "healthy" ] && return 0
    [ "$estado" = "exited" ] && return 1
    sleep 2
  done
  return 1
}

construir_e_iniciar() {
  informar "Validando configuração e construindo imagens com testes automáticos..."
  compose config --quiet
  compose build --pull
  informar "Iniciando o PostgreSQL e aplicando migrações..."
  compose up -d banco
  esperar_servico banco 40 || { compose restart banco; esperar_servico banco 30; }
  compose run --rm --no-deps api node dist/banco/migrar.js

  local total_usuarios
  total_usuarios="$(compose exec -T banco psql -U "$(ler_env BANCO_USUARIO)" -d "$(ler_env BANCO_NOME)" -Atqc "SELECT count(*) FROM usuarios WHERE administrador=TRUE" | tr -d '[:space:]')"
  if [ "$total_usuarios" = "0" ]; then
    informar "Criando a conta administrativa inicial..."
    compose run --rm --no-deps api node dist/banco/seed.js
  else
    informar "Conta administrativa existente preservada; a senha não será redefinida."
  fi

  informar "Iniciando API e frontend..."
  compose up -d --remove-orphans api frontend
  esperar_servico api 36 || { alertar "A API não respondeu; reiniciando uma vez..."; compose restart api; esperar_servico api 30; }
  esperar_servico frontend 36 || { alertar "O frontend não respondeu; reiniciando uma vez..."; compose restart frontend; esperar_servico frontend 30; }
}

configurar_nginx() {
  local porta_frontend porta_api destino habilitado temporario backup conflito
  porta_frontend="$(ler_env PORTA_FRONTEND)"; porta_api="$(ler_env PORTA_API)"
  destino="/etc/nginx/sites-available/$DOMINIO.conf"
  habilitado="/etc/nginx/sites-enabled/$DOMINIO.conf"
  temporario="$(mktemp)"
  backup=""
  conflito="$(grep -RslE "server_name[[:space:]]+([^;[:space:]]+[[:space:]]+)*${DOMINIO//./\\.}([[:space:];]|$)" /etc/nginx/sites-enabled 2>/dev/null | grep -vF "$habilitado" | head -n1 || true)"
  [ -z "$conflito" ] || falhar "O domínio já está configurado em $conflito. Remova o conflito antes de continuar."

  cat > "$temporario" <<EOF
upstream reciclabelo_frontend {
    server 127.0.0.1:$porta_frontend;
    keepalive 16;
}
upstream reciclabelo_api {
    server 127.0.0.1:$porta_api;
    keepalive 16;
}
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO;
    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://reciclabelo_api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    location / {
        proxy_pass http://reciclabelo_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF
  if [ -f "$destino" ]; then backup="$destino.backup.$(date +%Y%m%d%H%M%S)"; cp -a "$destino" "$backup"; fi
  install -m 644 "$temporario" "$destino"; rm -f "$temporario"
  ln -sfn "$destino" "$habilitado"
  if ! nginx -t; then
    if [ -n "$backup" ]; then cp -a "$backup" "$destino"; else rm -f "$destino" "$habilitado"; fi
    nginx -t || true
    falhar "A configuração do NGINX foi revertida porque a validação falhou."
  fi
  systemctl reload nginx
  curl --fail --silent --show-error --max-time 10 -H "Host: $DOMINIO" http://127.0.0.1/ >/dev/null
}

configurar_https() {
  $SEM_HTTPS && { alertar "HTTPS não foi solicitado. Execute novamente sem --sem-https depois que o DNS estiver pronto."; return 0; }
  if ! getent ahosts "$DOMINIO" >/dev/null 2>&1; then
    alertar "O DNS de $DOMINIO ainda não responde. O site ficou disponível em HTTP; execute novamente após a propagação."
    return 0
  fi
  informar "Solicitando ou renovando o certificado HTTPS..."
  local tentativa
  for tentativa in 1 2 3; do
    if certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring -m "$EMAIL_CERTIFICADO" -d "$DOMINIO"; then
      nginx -t && systemctl reload nginx
      curl --fail --silent --show-error --max-time 15 "https://$DOMINIO/" >/dev/null || alertar "O certificado foi instalado, mas a verificação externa ainda não respondeu. Verifique DNS ou proxy."
      return 0
    fi
    [ "$tentativa" -eq 3 ] || { alertar "Certificado ainda indisponível; tentando novamente..."; sleep 8; }
  done
  alertar "A aplicação está saudável em HTTP, mas o certificado não pôde ser emitido. Corrija o DNS e execute o mesmo comando novamente."
}

verificar_resultado() {
  local porta_frontend porta_api
  porta_frontend="$(ler_env PORTA_FRONTEND)"; porta_api="$(ler_env PORTA_API)"
  curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$porta_frontend/" >/dev/null
  curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$porta_api/saude" >/dev/null
  compose ps
  informar "Instalação concluída: https://$DOMINIO"
  informar "Para atualizar: git pull --ff-only && sudo bash scripts/instalar-producao.sh"
  if [ -n "$SENHA_ADMIN_GERADA" ]; then
    alertar "Consulte /root/reciclabelo-credenciais-iniciais.txt e transfira a senha para um gerenciador seguro."
  fi
}

instalar_pacotes
solicitar_configuracao
construir_e_iniciar
configurar_nginx
configurar_https
verificar_resultado
