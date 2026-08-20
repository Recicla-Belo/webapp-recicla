export type Pagina = "painel" | "catadores" | "cooperativas" | "pesagem" | "relatorios" | "configuracoes";

export interface Catador {
  uuid: string;
  codigo: string;
  nomeCompleto: string;
  apelido?: string;
  telefone: string;
  cooperativa: string;
  status: "Ativo" | "Inativo";
  iniciais: string;
  totalQuilos: number;
}

export interface Cooperativa {
  uuid: string;
  nome: string;
  responsavel: string;
  catadoresAtivos: number;
  telefone: string;
}

export interface Material {
  uuid: string;
  nome: string;
  tipo: string;
  unidade: string;
  quantidadeReferencia: number;
  valorReferencia: number;
  ativo: boolean;
  cor: string;
}

export interface Pesagem {
  uuid: string;
  codigo: string;
  data: string;
  catador: string;
  material: string;
  peso: number;
  valor: number;
  pontoApoio: string;
  responsavel: string;
}
