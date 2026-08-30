# Recicla Belô

WebApp responsivo para gestão de cooperativas de reciclagem, catadores, produção, pesagens e pagamentos em Belo Horizonte. A interface foi desenhada com elementos amplos, contraste forte, navegação móvel e tema escuro.

## Recursos disponíveis

- painel com catadores ativos, total coletado, valor a pagar, média por catador e coletas realizadas;
- paginação inteligente e responsiva no painel, catadores, cooperativas, pesagem/produção, configurações, ficha do catador e relatórios, com totais calculados diretamente no PostgreSQL;
- cadastro e edição de catadores em etapas, com CPF mascarado, nome como identificação mínima, demais dados opcionais, múltiplos contatos, endereço assistido por CEP e foto opcional;
- pagamento opcional por Pix ou conta bancária; ao habilitá-lo, o sistema exige os dados necessários para o recebimento e, quando a conta é de terceiro, nome e CPF do titular;
- cooperativas e associações com responsável e vínculo de catadores;
- pesagem guiada com confirmação final em modal, código e nome do catador, ponto, material, peso, data e hora, status e cálculo acumulado da meta do ciclo operacional;
- materiais configuráveis por unidade, quantidade de referência, valor e situação ativa/inativa;
- meta configurável por material e meta geral opcional com prêmio fixo, seleção dos materiais válidos, escolha auditável para registrar cada entrega dentro ou fora da meta, crédito de peso excedente para um ciclo futuro, progresso individual e comemoração ao atingir o alvo;
- ativação e inativação de catadores sem apagar seu cadastro ou histórico; catadores inativos não aparecem nem são aceitos em novas pesagens;
- cadastro, edição, ativação e exclusão lógica dos responsáveis pela pesagem, preservando os nomes utilizados no histórico;
- cadastro, edição, ativação, desativação e exclusão segura de pontos de apoio; locais usados em pesagens permanecem preservados no histórico e podem ser desativados;
- ciclo operacional independente por catador, preservado mesmo após a meia-noite, com fechamento explícito que bloqueia novos lançamentos, reabertura justificada e trilha de auditoria;
- atividade recente identificada com foto, código, nome e dados do catador, totais do caixa, pesagens, correções e motivo de reabertura;
- ficha completa do catador com contatos, endereço, meios de pagamento, histórico, ganhos por material, metas e caixas;
- exclusão definitiva e confirmada do catador, removendo cadastro, contatos, endereço, pagamento, fotos, pesagens, metas, caixas e movimentações em uma única transação, com motivo mínimo preservado na auditoria;
- relatório detalhado e filtrável das reciclagens, com edição justificada, exclusão lógica e histórico auditável;
- central de notificações persistida no PostgreSQL, com abertura direcionada, leitura individual, exclusão, limpeza, contador global e rolagem infinita paginada por cursor;
- tema claro/escuro, identidade visual configurável e layout responsivo para Android, iOS e desktop;
- menu móvel com rolagem própria, áreas seguras do iPhone e proteção contra estouro horizontal da página;
- API autenticada, PostgreSQL com UUID, auditoria, índices e pesquisa textual em português.
- conta administrativa editável sob demanda: nome/e-mail e senha ficam ocultos até a ação escolhida, exigem a senha atual, geram auditoria e a troca de senha revoga as sessões anteriores.
- dashboard com indicadores acumulados calculados a partir das pesagens válidas; os valores não são zerados automaticamente e somente mudam por operações explícitas e auditadas;
- atividade recente limitada aos últimos 30 dias e a 100 eventos no dashboard, com exclusão individual disponível somente ao administrador mediante senha, motivo e confirmação explícita;
- relatórios sem edição direta, com resumo diário, pesagens completas e livro de auditoria, todos paginados e filtráveis; exclusões definitivas são exclusivas do administrador e possuem confirmação reforçada;
- limpeza administrativa transacional dos dados operacionais de teste, preservando catadores, cooperativas, usuários, permissões, materiais e configurações e zerando automaticamente os indicadores calculados;
- exportação CSV de todos os registros do período filtrado, permitindo escolher individualmente as colunas e protegendo contra fórmulas maliciosas em planilhas.
- exportação Excel completa dos catadores, com aba própria para produção de crachás e abas organizadas de cadastro, contatos e pagamento; o download exige permissão específica e gera registro de auditoria.
- contas operacionais com permissões granulares escolhidas pelo administrador e validadas no backend para painel, catadores, cooperativas, pesagens, relatórios, caixas e configurações.
- pagamento transacional ao catador com permissão específica de **Pagador(a)**, confirmação do valor e da forma de pagamento, identificação automática do usuário autenticado, proteção contra duplicidade e recibo imprimível.

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

O comando encerra automaticamente um frontend anterior deste mesmo projeto que tenha ficado órfão, inicia o PostgreSQL, aguarda o banco ficar saudável, aplica migrações e seed, valida a API e só então inicia o novo frontend. Por padrão, o frontend abre em `http://localhost:3001` e a API em `http://localhost:3333`; a porta do frontend pode ser alterada por `PORTA_FRONTEND` no `.env`. Conflitos externos continuam sendo informados sem trocar a porta silenciosamente. `Ctrl+C` encerra frontend, backend e banco na ordem segura.

## Instalação de produção em VPS

Depois de clonar o repositório em uma VPS com Ubuntu, Debian, Fedora, Rocky Linux ou AlmaLinux, execute um único comando:

```bash
sudo bash scripts/instalar-producao.sh
```

O instalador solicita o domínio, o e-mail do certificado e, na primeira instalação, os dados administrativos. Também pode funcionar sem perguntas:

```bash
sudo bash scripts/instalar-producao.sh \
  --dominio reciclabelo.vupi.us \
  --email-certificado administrador@vupi.us \
  --nao-interativo
```

O processo é idempotente e pode ser executado novamente após atualizações. Ele:

1. instala ou repara Docker Compose, NGINX, Certbot e utilitários suportados;
2. valida o domínio e gera segredos ausentes sem substituir credenciais existentes;
3. escolhe portas locais livres na primeira instalação;
4. constrói imagens isoladas, executando TypeScript, lint, build e testes antes de substituir os containers;
5. mantém PostgreSQL e arquivos de catadores em volumes persistentes;
6. não publica a porta do banco e vincula frontend/API somente ao endereço local da VPS;
7. aplica somente migrações pendentes e cria o administrador somente quando ainda não existe;
8. testa a saúde dos serviços, reinicia uma vez quando necessário e apresenta diagnóstico automático se continuar falhando;
9. cria exclusivamente o virtual host do domínio informado, valida o NGINX e restaura a configuração anterior se ela for inválida;
10. solicita e renova HTTPS pelo Let's Encrypt quando o DNS estiver disponível.

O script não altera regras de firewall nem virtual hosts de outras aplicações. Se o DNS ainda não estiver propagado, mantém a aplicação em HTTP e pode ser executado novamente para concluir o certificado.

Para atualizar uma instalação existente:

```bash
git pull --ff-only
sudo bash scripts/instalar-producao.sh
```

Para diagnosticar manualmente:

```bash
docker compose -f docker-compose.producao.yml ps
docker compose -f docker-compose.producao.yml logs --tail 100 api frontend banco
sudo nginx -t
```

## Acesso administrativo inicial

- usuário: `admin@reciclabelo`
- senha inicial: valor local de `ADMIN_SENHA` no arquivo `.env`

Não existe tela pública de cadastro. A senha solicitada para o ambiente local fica somente no `.env` ignorado pelo Git. Em Configurações → Conta do administrador, o usuário autenticado pode alterar nome, e-mail ou senha confirmando a senha atual. Não execute o seed para trocar uma senha de produção: o seed é destinado apenas à preparação inicial e substituiria a senha pelo valor do `.env`.

### Contas restritas para a equipe

O administrador pode abrir **Configurações → Usuários e permissões** e criar uma ou mais contas operacionais. Para cada conta, ele escolhe individualmente as permissões de consulta, cadastro, edição, exclusão, caixa, pagamentos, relatórios e configurações. A permissão **Efetuar pagamentos (Pagador(a))** autoriza registrar pagamentos aos catadores e emitir recibos; ela exige também a permissão de consulta dos catadores. A API nega por padrão qualquer operação não concedida; rotas de administração de usuários e da conta principal nunca podem ser delegadas. Cada conta também possui nome, e-mail, senha forte e situação ativa/bloqueada. Alterar permissões, senha ou situação revoga imediatamente todas as sessões anteriores, e a mudança fica registrada na auditoria.

## Variáveis de ambiente

O arquivo [`.env.example`](.env.example) documenta todas as configurações:

- identidade: nome, descrição, ícone, favicon e cores;
- URLs e origens autorizadas;
- porta, expiração de sessão, segredo JWT e limite de fotos;
- host, porta, nome, usuário, senha, SSL e URL do PostgreSQL;
- nome, e-mail e senha inicial do administrador.

O `.env` real é ignorado pelo Git. Apenas o `.env.example`, sem segredos de produção, deve ser versionado.

## Banco de dados

As tabelas e colunas usam nomes claros em português do Brasil. A estrutura cobre usuários, cooperativas, catadores, contatos, endereços, contas financeiras, fotos, pontos de apoio, responsáveis, materiais, pesagens, itens de pesagem, caixas individuais, pagamentos e seus itens de origem, movimentações financeiras, notificações, auditoria e o histórico permanente de limpezas administrativas.

Em **Configurações → Limpeza de dados**, somente o administrador pode remover todos os dados operacionais de teste. A operação exige motivo, a frase exata exibida na modal e a senha atual. Pesagens, caixas, movimentações, notificações operacionais, Atividade recente e auditoria visível são apagadas na mesma transação; catadores, cooperativas, usuários, permissões, materiais e demais configurações são preservados. Um comprovante técnico imutável da limpeza fica em uma tabela de segurança separada e não reaparece nos relatórios comuns.

Notificações ligadas a registros removidos são eliminadas pelas rotas de exclusão e por uma migração de saneamento. A consulta também ignora referências órfãs, evitando que uma instalação sem catadores ou pesagens exiba avisos antigos.

O pagamento é calculado exclusivamente pelo backend, dentro da mesma transação que registra a pesagem. Quando a meta geral está ativa, ela soma somente os materiais e entregas marcados para contabilização; o peso usado até completar o alvo não recebe o preço dos materiais e libera uma única vez o prêmio fixo configurado. A parcela que ultrapassar o alvo pode ser paga imediatamente pelo preço do material ou, por escolha explícita, guardada como crédito de peso para um ciclo futuro. O crédito nunca é pago duas vezes e é consumido em ordem cronológica. Um material inválido para metas, ou uma entrega elegível escolhida como fora da meta, não aumenta o progresso e recebe pagamento imediato. Sem meta geral, cada material válido usa sua própria meta; meta por material igual a zero significa pagamento imediato. Configuração, decisões e parcelas liquidadas ficam congeladas no item da pesagem, e edições ou exclusões recalculam a cadeia histórica do catador.

O SQL único e completo está em `servidor/sql/recicla-belo-completo.sql`. Ele contém extensões, tipos, tabelas, chaves estrangeiras, restrições, índices de busca textual e dados iniciais. Para regenerá-lo após novas migrações, execute `npm run sql:gerar`.

Para aplicar migrações e dados iniciais manualmente:

```bash
npm --prefix servidor run migrar
npm --prefix servidor run seed
```

As buscas de catadores, cooperativas, pesagens e relatórios usam `to_tsvector`, consulta full-text por prefixos e índices GIN. Os resultados começam a aparecer durante a digitação, sem exigir o termo completo e sem usar `LIKE` ou `ILIKE` nas pesquisas principais.

## Segurança e privacidade

- senhas armazenadas apenas como hash bcrypt;
- sessão JWT em cookie `HttpOnly`, `SameSite=Strict`, com emissor, público e algoritmo verificados;
- versão de sessão conferida no banco, permitindo revogar todas as sessões anteriores após a troca da senha;
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
