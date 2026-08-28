export const URL_API = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";

export class ErroApi extends Error {
  constructor(mensagem: string, public readonly status: number) {
    super(mensagem);
  }
}

export async function requisitarApi<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const cabecalhos = new Headers(opcoes.headers);
  if (opcoes.body && !(opcoes.body instanceof FormData) && !cabecalhos.has("content-type")) cabecalhos.set("content-type", "application/json");
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API}${caminho}`, { ...opcoes, headers: cabecalhos, credentials: "include" });
  } catch (falha) {
    if (falha instanceof DOMException && falha.name === "AbortError") throw falha;
    throw new ErroApi("Não foi possível conectar ao servidor. Verifique se a aplicação foi iniciada com npm run dev e tente novamente.", 0);
  }
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({})) as { mensagem?: string };
    if (resposta.status === 401) window.dispatchEvent(new Event("reciclabelo:sessao-expirada"));
    throw new ErroApi(dados.mensagem ?? "Não foi possível concluir a operação.", resposta.status);
  }
  if (resposta.status === 204) return undefined as T;
  return resposta.json() as Promise<T>;
}

export type CatadorApi = {
  uuid: string; codigo: string; nome_completo: string; apelido: string | null; status: "ativo" | "inativo";
  cooperativa: string | null; contatos: Array<{ tipo: string; valor: string }>; endereco_resumo: string | null; total_quilos: number; total_ganhos: number;
  peso_hoje: number; meta_hoje: number; percentual_meta_hoje: number; status_caixa_hoje: "aberto" | "fechado"; tem_foto: boolean;
};

export type CooperativaApi = {
  uuid: string; nome: string; nome_responsavel: string; telefone: string | null; observacao: string | null;
  status: "ativo" | "inativo"; catadores_ativos: number;
};

export type MaterialApi = {
  uuid: string; nome: string; tipo_material: string; unidade: string; quantidade_referencia: string | number;
  valor_referencia: string | number; meta_diaria: string | number; contabiliza_meta: boolean; status: "ativo" | "inativo";
};

export type ProgressoMetaApi = {
  material_uuid: string; nome: string; unidade: string; meta: number; peso: number; ganho: number;
  percentual: number; falta: number; atingida: boolean; sem_meta?: boolean;
};

export type DetalheMetaGeralApi = {
  material_uuid: string; nome: string; unidade: string; peso: number; peso_meta: number;
  peso_excedente_pago: number; peso_excedente_credito: number; valor_bruto: number; valor_liberado: number; valor_premio: number;
};

export type MetaGeralApi = {
  ativa: boolean; meta: number; unidade: string; peso: number; percentual: number; falta: number; atingida: boolean;
  valorBruto: number; valorLiberado: number; valorPremio: number; valorPremioLiberado: number; valorExcedenteLiberado: number;
  creditoUtilizado: number; saldoCredito: number; detalhes: DetalheMetaGeralApi[];
};

export type ConfiguracaoMetaGeralApi = {
  uuid: string; ativa: boolean; meta_diaria: number; valor_premio: number; unidade: string; atualizado_em: string;
};

export type AdministradorApi = {
  uuid: string; nome: string; email: string; administrador: boolean; perfil: "administrador" | "operador_cadastro";
};

export type UsuarioContaApi = {
  uuid: string; nome: string; email: string; perfil: "administrador" | "operador_cadastro"; administrador: boolean;
  ativo: boolean; ultimo_acesso_em: string | null; criado_em: string; atualizado_em: string;
};

export type ResponsavelPesagemApi = {
  uuid: string; nome: string; status: "ativo" | "inativo"; criado_em: string; atualizado_em: string;
};

export type NotificacaoApi = {
  uuid: string; tipo: string; titulo: string; mensagem: string; entidade: string | null; entidade_uuid: string | null;
  lida_em: string | null; criado_em: string;
};
