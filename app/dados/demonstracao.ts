import type { Catador, Cooperativa, Material, Pesagem } from "@/app/tipos/dominio";

export const catadores: Catador[] = [
  { uuid: "3b1c77c6-d459-4bc4-98a9-3c47d9689c01", codigo: "CAT-0048", nomeCompleto: "José dos Santos", apelido: "Zé", telefone: "(31) 98812-4471", cooperativa: "Asmare", status: "Ativo", iniciais: "JS", totalQuilos: 428.5 },
  { uuid: "1bc7d574-a8f1-4329-8b47-564db32d4d31", codigo: "CAT-0047", nomeCompleto: "Maria da Conceição", telefone: "(31) 99221-1180", cooperativa: "Coopesol Leste", status: "Ativo", iniciais: "MC", totalQuilos: 386.2 },
  { uuid: "6926e72c-c204-44ca-a64b-9aecdf23ea2e", codigo: "CAT-0046", nomeCompleto: "André Pereira Lima", apelido: "Dedé", telefone: "(31) 98714-2300", cooperativa: "Catunidos", status: "Ativo", iniciais: "AP", totalQuilos: 354.8 },
  { uuid: "22f299e8-a95a-40f5-9cc6-f15a3197b0d8", codigo: "CAT-0045", nomeCompleto: "Rita de Cássia Souza", telefone: "(31) 99109-7722", cooperativa: "Copemar", status: "Ativo", iniciais: "RC", totalQuilos: 298.4 },
];

export const cooperativas: Cooperativa[] = [
  { uuid: "0f404802-a452-4648-b5e2-6eb880f96ae2", nome: "Coopesol Leste", responsavel: "Ana Cláudia Ferreira", catadoresAtivos: 12, telefone: "(31) 3277-1001" },
  { uuid: "c923dc43-01cc-4b7a-9b17-b90225498d77", nome: "Asmare", responsavel: "Paulo Roberto Silva", catadoresAtivos: 16, telefone: "(31) 3201-0713" },
  { uuid: "0335a56e-5541-4dc4-936a-fd32c54b0761", nome: "Catunidos", responsavel: "Sônia Maria Costa", catadoresAtivos: 9, telefone: "(31) 3482-6400" },
  { uuid: "e27e9bd8-bfe2-4317-ae32-f0ed0d96e9bf", nome: "Copemar", responsavel: "Carlos Augusto Reis", catadoresAtivos: 11, telefone: "(31) 98634-1200" },
];

export const materiais: Material[] = [
  { uuid: "23d0c870-a4ee-4b55-8033-21062e5928e5", nome: "Material misturado", tipo: "Misto", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 1.2, ativo: true, cor: "#2d9163" },
  { uuid: "d3517e13-f6d3-4f17-91de-f708e17f7ae2", nome: "Latinha (Alumínio)", tipo: "Metal", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 7, ativo: true, cor: "#db8d2b" },
  { uuid: "40e60ba0-7f8b-4d5f-b868-f8751004c579", nome: "Papelão", tipo: "Papel", unidade: "kg", quantidadeReferencia: 1, valorReferencia: 1, ativo: true, cor: "#9b7045" },
];

export const pesagens: Pesagem[] = [
  { uuid: "2c794923-f555-48f5-ac66-c9cff79cfd99", codigo: "PES-0186", data: "20/08/2026 10:42", catador: "José dos Santos", material: "Latinha (Alumínio)", peso: 42.8, valor: 299.6, pontoApoio: "Praça da Estação", responsavel: "João da Silva" },
  { uuid: "ca207d2a-b484-45e0-9504-46042f1a9572", codigo: "PES-0185", data: "20/08/2026 09:18", catador: "Maria da Conceição", material: "Papelão", peso: 86.2, valor: 86.2, pontoApoio: "Viaduto Santa Tereza", responsavel: "Maria Aparecida" },
  { uuid: "ad2a7859-d3be-4150-9cd7-664dd75db03d", codigo: "PES-0184", data: "19/08/2026 16:35", catador: "André Pereira Lima", material: "Material misturado", peso: 61, valor: 73.2, pontoApoio: "Parque Municipal", responsavel: "Carlos Eduardo" },
];
