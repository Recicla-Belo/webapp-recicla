export const ambiente = {
  nomeAplicacao: process.env.NEXT_PUBLIC_NOME_APLICACAO ?? "Recicla Belô",
  descricaoAplicacao: process.env.NEXT_PUBLIC_DESCRICAO_APLICACAO ?? "Gestão que transforma",
  iconeAplicacao: process.env.NEXT_PUBLIC_ICONE_APLICACAO ?? "/favicon.svg",
  favicon: process.env.NEXT_PUBLIC_FAVICON ?? "/favicon.svg",
  corPrimaria: process.env.NEXT_PUBLIC_COR_PRIMARIA ?? "#167347",
  corPrimariaEscura: process.env.NEXT_PUBLIC_COR_PRIMARIA_ESCURA ?? "#075c37",
  corFundo: process.env.NEXT_PUBLIC_COR_FUNDO ?? "#f5f7f6",
} as const;
