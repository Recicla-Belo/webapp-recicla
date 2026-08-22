import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as aguardar } from "node:timers/promises";

try {
  process.loadEnvFile?.(".env");
} catch {
  // O instalador cria o .env; os valores padrão mantêm o diagnóstico legível.
}

const noWindows = process.platform === "win32";
const executorNpm = process.execPath;
const npmCli = process.env.npm_execpath;
const docker = noWindows ? "docker.exe" : "docker";
const portaFrontend = process.env.PORTA_FRONTEND ?? "3000";
const processos = new Set();
let encerrando = false;

function titulo(mensagem) {
  console.log(`\n\x1b[32m[Recicla Belô]\x1b[0m ${mensagem}`);
}

function executar(comando, argumentos, opcoes = {}) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: process.cwd(), stdio: "inherit", env: process.env, windowsHide: true, ...opcoes,
  });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`Falha ao executar: ${comando} ${argumentos.join(" ")}`);
}

function processoAtivo(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function liberarFrontendAnterior() {
  const arquivoTrava = resolve(".vinext/dev/lock.json");
  if (!existsSync(arquivoTrava)) return;
  try {
    const trava = JSON.parse(readFileSync(arquivoTrava, "utf8"));
    const pid = Number(trava.pid);
    const pertenceAoProjeto = resolve(String(trava.cwd ?? "")) === resolve(process.cwd());
    if (!pertenceAoProjeto || !Number.isInteger(pid) || pid <= 0 || pid === process.pid) {
      throw new Error("A trava do frontend não pertence a este projeto.");
    }
    if (processoAtivo(pid)) {
      titulo("Encerrando um frontend anterior que ficou aberto...");
      if (noWindows) spawnSync("taskkill.exe", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else process.kill(pid, "SIGTERM");
      await aguardar(1_500);
      if (processoAtivo(pid)) throw new Error(`Não foi possível encerrar o frontend anterior (processo ${pid}). Encerre-o e execute npm run dev novamente.`);
    }
    if (existsSync(arquivoTrava)) unlinkSync(arquivoTrava);
  } catch (erro) {
    if (erro instanceof SyntaxError && existsSync(arquivoTrava)) unlinkSync(arquivoTrava);
    else if (erro instanceof Error && erro.message === "A trava do frontend não pertence a este projeto.") throw erro;
  }
}

function estadoBanco() {
  const resultado = spawnSync(docker, ["inspect", "--format={{.State.Health.Status}}", "recicla-belo-postgres-v18"], {
    cwd: process.cwd(), encoding: "utf8", windowsHide: true,
  });
  return resultado.status === 0 ? resultado.stdout.trim() : "indisponivel";
}

async function esperarBanco() {
  for (let tentativa = 1; tentativa <= 40; tentativa += 1) {
    if (estadoBanco() === "healthy") return;
    await aguardar(1_000);
  }
  throw new Error("O PostgreSQL não ficou saudável. Consulte: docker compose logs banco");
}

function iniciarProcesso(nome, argumentos) {
  if (!npmCli) throw new Error("Execute este supervisor através de: npm run dev");
  const processo = spawn(executorNpm, [npmCli, ...argumentos], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  processos.add(processo);
  processo.once("exit", (codigo, sinal) => {
    processos.delete(processo);
    if (!encerrando) void encerrar(codigo ?? (sinal ? 1 : 0), `${nome} foi encerrado inesperadamente.`);
  });
  return processo;
}

async function esperarApi(processo) {
  for (let tentativa = 1; tentativa <= 30; tentativa += 1) {
    if (processo.exitCode !== null) throw new Error("A API não conseguiu iniciar. Verifique se a porta 3333 já está em uso.");
    try {
      const resposta = await fetch("http://127.0.0.1:3333/saude", { signal: AbortSignal.timeout(1_000) });
      if (resposta.ok) return;
    } catch {
      // A API ainda está iniciando; a próxima tentativa ocorre após o intervalo.
    }
    await aguardar(500);
  }
  throw new Error("A API iniciou, mas não respondeu ao teste de saúde.");
}

async function esperarFrontend(processo) {
  const endereco = `http://localhost:${portaFrontend}`;
  for (let tentativa = 1; tentativa <= 60; tentativa += 1) {
    if (processo.exitCode !== null) {
      throw new Error(`O frontend não conseguiu iniciar. Verifique se a porta ${portaFrontend} já está em uso.`);
    }
    try {
      const resposta = await fetch(endereco, { signal: AbortSignal.timeout(1_000) });
      if (resposta.ok) return endereco;
    } catch {
      // O frontend ainda está compilando; a próxima tentativa ocorre após o intervalo.
    }
    await aguardar(500);
  }
  throw new Error("O frontend iniciou, mas não respondeu ao teste de disponibilidade.");
}

function encerrarArvore(processo) {
  if (!processo?.pid || processo.exitCode !== null) return;
  if (noWindows) spawnSync("taskkill.exe", ["/pid", String(processo.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else processo.kill("SIGTERM");
}

async function encerrar(codigo = 0, mensagem, aoReceberSinal = false) {
  if (encerrando) return;
  encerrando = true;
  if (mensagem) console.error(`\n[Recicla Belô] ${mensagem}`);
  for (const processo of processos) encerrarArvore(processo);
  if (noWindows && aoReceberSinal) {
    const limpeza = spawn(docker, ["compose", "stop", "banco"], {
      cwd: process.cwd(), stdio: "ignore", windowsHide: true, detached: true,
    });
    limpeza.unref();
  } else {
    spawnSync(docker, ["compose", "stop", "banco"], { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
  }
  process.exitCode = codigo;
}

async function principal() {
  try {
    if (!npmCli) throw new Error("Não foi possível localizar o npm. Execute: npm run dev");
    titulo("Preparando banco, backend e frontend...");
    await liberarFrontendAnterior();
    executar(docker, ["compose", "version"], { stdio: "ignore" });
    if (!existsSync("servidor/node_modules")) {
      titulo("Instalando dependências do backend...");
      executar(executorNpm, [npmCli, "install", "--prefix", "servidor"]);
    }
    titulo("Iniciando PostgreSQL 18.6...");
    executar(docker, ["compose", "up", "-d", "banco"]);
    await esperarBanco();
    titulo("Aplicando migrações e preparando o administrador...");
    executar(executorNpm, [npmCli, "--prefix", "servidor", "run", "migrar"]);
    executar(executorNpm, [npmCli, "--prefix", "servidor", "run", "seed"]);
    titulo("Iniciando a API...");
    const api = iniciarProcesso("A API", ["--prefix", "servidor", "run", "desenvolver"]);
    await esperarApi(api);
    titulo("API saudável. Iniciando o frontend...");
    const frontend = iniciarProcesso("O frontend", ["run", "dev:frontend"]);
    const enderecoFrontend = await esperarFrontend(frontend);
    titulo(`Aplicação pronta em ${enderecoFrontend}. Pressione Ctrl+C para encerrar tudo.`);
  } catch (erro) {
    await encerrar(1, erro instanceof Error ? erro.message : String(erro));
  }
}

process.once("SIGINT", () => void encerrar(0, "Encerrando a aplicação...", true));
process.once("SIGTERM", () => void encerrar(0, "Encerrando a aplicação...", true));
process.once("uncaughtException", (erro) => void encerrar(1, erro.message));
process.once("unhandledRejection", (erro) => void encerrar(1, String(erro)));

await principal();
