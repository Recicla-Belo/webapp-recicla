export const URL_API = process.env.NEXT_PUBLIC_URL_API ?? "http://localhost:3333";

export class ErroApi extends Error {
  constructor(mensagem: string, public readonly status: number) {
    super(mensagem);
  }
}

export async function requisitarApi<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const cabecalhos = new Headers(opcoes.headers);
  if (opcoes.body && !(opcoes.body instanceof FormData) && !cabecalhos.has("content-type")) cabecalhos.set("content-type", "application/json");
  const resposta = await fetch(`${URL_API}${caminho}`, { ...opcoes, headers: cabecalhos, credentials: "include" });
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
  cooperativa: string | null; contatos: Array<{ tipo: string; valor: string }>; total_quilos: number; tem_foto: boolean;
};

export type CooperativaApi = {
  uuid: string; nome: string; nome_responsavel: string; telefone: string | null; observacao: string | null;
  status: "ativo" | "inativo"; catadores_ativos: number;
};

export type MaterialApi = {
  uuid: string; nome: string; tipo_material: string; unidade: string; quantidade_referencia: string | number;
  valor_referencia: string | number; status: "ativo" | "inativo";
};

export type NotificacaoApi = {
  uuid: string; tipo: string; titulo: string; mensagem: string; entidade: string | null; entidade_uuid: string | null;
  lida_em: string | null; criado_em: string;
};
