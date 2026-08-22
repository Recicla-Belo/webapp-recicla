# Recicla Belô

WebApp responsivo para gestão de cooperativas de reciclagem, catadores, produção, pesagens e pagamentos em Belo Horizonte. A interface foi desenhada com elementos amplos, contraste forte, navegação móvel e tema escuro.

## Recursos disponíveis

- painel com catadores ativos, total coletado, valor a pagar, média por catador e coletas realizadas;
- cadastro de catadores em etapas, com nome como identificação mínima e os demais dados opcionais, múltiplos contatos, endereço assistido por CEP e foto opcional;
- pagamento opcional por Pix ou conta bancária; ao habilitá-lo, o sistema exige os dados necessários para o recebimento e, quando a conta é de terceiro, nome e CPF do titular;
- cooperativas e associações com responsável e vínculo de catadores;
- pesagem guiada com confirmação final em modal, código e nome do catador, ponto, material, peso, data e hora, status e cálculo proporcional do valor;
- materiais configuráveis por unidade, quantidade de referência, valor e situação ativa/inativa;
- meta diária configurável por material, progresso individual por catador e comemoração ao atingir a meta;
- caixa diário independente por catador, com fechamento que bloqueia novos lançamentos, reabertura justificada e trilha de auditoria;
- ficha completa do catador com contatos, endereço, meios de pagamento, histórico, ganhos por material, metas e caixas;
- relatório detalhado e filtrável das reciclagens, com edição justificada, exclusão lógica e histórico auditável;
- central de notificações persistida no PostgreSQL, com leitura individual, marcação coletiva e limpeza;
- tema claro/escuro, identidade visual configurável e layout responsivo para Android, iOS e desktop;
- menu móvel com rolagem própria, áreas seguras do iPhone e proteção contra estouro horizontal da página;
- API autenticada, PostgreSQL com UUID, auditoria, índices e pesquisa textual em português.

## Arquitetura

O repositório mantém frontend e backend juntos, mas desacoplados:

```text
app/                         frontend React + TypeScript
  componentes/               telas e componentes por domínio
  configuracao/              leitura centralizada do ambiente
  dados/                     cliente tipado da API, sem dados simulados
  tipos/                     contratos TypeScript
servidor/                    API REST Fastify + TypeScript
  migracoes/                 estrutura e dados iniciais PostgreSQL
  src/banco/                 conexão, migração e seed
  src/configuracao/          validação das variáveis de ambiente
  src/tipos/                 extensões de tipos
scripts/                     instalação e inicialização automatizadas
public/                      favicon e cartão social
```

Essa separação permite publicar o frontend e a API no mesmo servidor ou em serviços distintos. A API é a autoridade dos cálculos financeiros e nunca confia no valor calculado no navegador.

## Tecnologias

- React 19, Vinext, Vite 8 e TypeScript;
- Fastify 5, Zod, JWT e bcrypt;
- PostgreSQL 18.6 em Docker Compose;
- UUID nativo com `gen_random_uuid()`;
- Full-text search do PostgreSQL com configuração `portuguese` e índice GIN;
- CSS responsivo, preferência de movimento reduzido e tema escuro.

O método HTTP `QUERY` não foi adotado porque não é padronizado nem amplamente aceito por navegadores, proxies e ferramentas. Consultas usam `GET`; criações usam `POST`; alterações devem usar `PATCH`; exclusões usam `DELETE`. GraphQL não é necessário no escopo atual e aumentaria custo operacional sem resolver um problema real.

## Requisitos

- Linux, macOS, WSL ou Windows com terminal compatível;
- Node.js 24 ou superior;
- npm 11 ou superior;
- Docker Engine com Docker Compose v2;
- 2 GB de memória livre recomendados.

No Ubuntu Server e em distribuições com `apt`, `dnf`, `yum`, `pacman` ou `apk`, o instalador tenta preparar automaticamente as ferramentas ausentes.

## Instalação automática

No Linux, macOS ou WSL:

```bash
chmod +x scripts/instalar-e-iniciar.sh
./scripts/instalar-e-iniciar.sh
```

O script:

1. verifica e instala ferramentas essenciais quando necessário;
2. cria `.env` a partir de `.env.example`, gera segredos fortes e não sobrescreve configurações existentes;
3. instala dependências com os arquivos de lock;
4. inicia e aguarda o PostgreSQL 18.6;
5. aplica migrações de modo idempotente;
6. cria ou atualiza o administrador com senha protegida por bcrypt;
7. inicia frontend e API e encerra ambos corretamente ao receber `Ctrl+C`.

Para somente instalar e preparar o banco:

```bash
./scripts/instalar-e-iniciar.sh --somente-instalar
```

## Instalação manual

```bash
cp .env.example .env
docker compose up -d banco
npm ci
npm --prefix servidor ci
npm --prefix servidor run migrar
npm --prefix servidor run seed
```

Inicie banco, backend e frontend no mesmo terminal:

```bash
npm run dev
```

O comando inicia o PostgreSQL, aguarda o banco ficar saudável, aplica migrações e seed, valida a API e só então inicia o frontend. Por padrão, o frontend abre em `http://localhost:3001` e a API em `http://localhost:3333`; a porta do frontend pode ser alterada por `PORTA_FRONTEND` no `.env`. Se a porta configurada estiver ocupada, o comando informa o conflito em vez de trocar silenciosamente. `Ctrl+C` encerra frontend, backend e banco.

## Acesso administrativo inicial

- usuário: `admin@reciclabelo`
- senha inicial: valor local de `ADMIN_SENHA` no arquivo `.env`

Não existe tela pública de cadastro. A senha solicitada para o ambiente local fica somente no `.env` ignorado pelo Git. Troque `ADMIN_SENHA`, `SEGREDO_JWT` e as credenciais do banco antes de qualquer publicação. Execute novamente `npm --prefix servidor run seed` para atualizar a senha do administrador.

## Variáveis de ambiente

O arquivo [`.env.example`](.env.example) documenta todas as configurações:

- identidade: nome, descrição, ícone, favicon e cores;
- URLs e origens autorizadas;
- porta, expiração de sessão, segredo JWT e limite de fotos;
- host, porta, nome, usuário, senha, SSL e URL do PostgreSQL;
- nome, e-mail e senha inicial do administrador.

O `.env` real é ignorado pelo Git. Apenas o `.env.example`, sem segredos de produção, deve ser versionado.

## Banco de dados

As tabelas e colunas usam nomes claros em português do Brasil. A estrutura cobre usuários, cooperativas, catadores, contatos, endereços, contas financeiras, fotos, pontos de apoio, responsáveis, materiais, pesagens, itens de pesagem, caixas individuais, movimentações financeiras, notificações e auditoria.

O pagamento é calculado exclusivamente pelo backend com o preço e a quantidade de referência vigentes no material. A meta não retira o pagamento do peso anterior: ela acompanha o objetivo diário e, depois de atingida, cada novo lançamento continua sendo pago normalmente conforme o material. O valor e a meta são gravados como fotografia histórica na pesagem para que mudanças futuras de configuração não alterem lançamentos já realizados.

O SQL único e completo está em `servidor/sql/recicla-belo-completo.sql`. Ele contém extensões, tipos, tabelas, chaves estrangeiras, restrições, índices de busca textual e dados iniciais. Para regenerá-lo após novas migrações, execute `npm run sql:gerar`.

Para aplicar migrações e dados iniciais manualmente:

```bash
npm --prefix servidor run migrar
npm --prefix servidor run seed
```

As buscas de catadores e cooperativas usam `to_tsvector`, `websearch_to_tsquery` e índices GIN. `LIKE` e `ILIKE` não são usados nas pesquisas principais.

## Segurança e privacidade

- senhas armazenadas apenas como hash bcrypt;
- sessão JWT em cookie `HttpOnly`, `SameSite=Strict`, com emissor, público e algoritmo verificados;
- proteção automática de toda rota sob `/api/`, inclusive rotas adicionadas futuramente;
- autorização administrativa conferida no banco em cada requisição autenticada;
- limite global de requisições e limite reforçado contra força bruta no login;
- cabeçalhos de segurança, respostas sem detalhes internos e logs com credenciais ocultadas;
- CORS limitado às origens declaradas;
- validação de entrada com Zod e parâmetros SQL posicionais;
- cálculo do pagamento repetido e confirmado no servidor;
- upload limitado a JPG, PNG ou WebP, com nome UUID e hash SHA-256;
- arquivos pessoais fora do versionamento;
- transações nas operações com múltiplas tabelas;
- trilha de auditoria persistente para registrar alterações relevantes;
- pesagens nunca são apagadas fisicamente pela interface: correções preservam os valores anteriores e exclusões permanecem identificadas no relatório com motivo, usuário, IP, data e hora;

Fotos e dados pessoais devem seguir a LGPD. Em produção, prefira armazenamento de objetos privado com criptografia, backup, política de retenção e URLs temporárias.

## Verificações

```bash
npm run build
npm run lint
npm --prefix servidor run verificar
npm test
```

Com a aplicação iniciada por `npm run dev`, o teste integrado abaixo cria registros temporários, valida sessão, proteção, cadastros, pesagem, cálculos, painel, relatório e notificações, e remove os registros ao terminar:

```bash
npm run test:integracao
```

Para conferir o banco:

```bash
docker compose ps
docker compose exec banco psql -U reciclabelo -d reciclabelo -c "SELECT version();"
```

## Versionamento

Repositório previsto: `https://github.com/Recicla-Belo/webapp-recicla.git`

```bash
git add .
git commit -m "feat: cria primeira versão do Recicla Belô"
git branch -M main
git remote add origin https://github.com/Recicla-Belo/webapp-recicla.git
git push -u origin main
```
