export const ambiente = {
  nomeAplicacao: process.env.NEXT_PUBLIC_NOME_APLICACAO ?? "CataNexo",
  descricaoAplicacao: process.env.NEXT_PUBLIC_DESCRICAO_APLICACAO ?? "Conecta trabalho, reciclagem e gestão",
  iconeAplicacao: process.env.NEXT_PUBLIC_ICONE_APLICACAO ?? "/catanexo.svg",
  favicon: process.env.NEXT_PUBLIC_FAVICON ?? "/catanexo.svg",
  corPrimaria: process.env.NEXT_PUBLIC_COR_PRIMARIA ?? "#167347",
  corPrimariaEscura: process.env.NEXT_PUBLIC_COR_PRIMARIA_ESCURA ?? "#075c37",
  corFundo: process.env.NEXT_PUBLIC_COR_FUNDO ?? "#f5f7f6",
} as const;
