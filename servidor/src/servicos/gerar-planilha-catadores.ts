import ExcelJS from "exceljs";

export type ContatoCatadorExportacao = {
  tipo: string;
  valor: string;
  principal: boolean;
  observacao: string | null;
};

export type ContaCatadorExportacao = {
  tipo: "pix" | "conta_bancaria";
  tipo_chave_pix: string | null;
  chave_pix: string | null;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  tipo_conta: string | null;
  de_terceiro: boolean;
  nome_titular: string | null;
  cpf_titular: string | null;
  relacao_titular: string | null;
};

export type CatadorParaExportacao = {
  uuid: string;
  codigo: string;
  nome_completo: string;
  apelido: string | null;
  genero: string | null;
  raca_cor: string | null;
  data_nascimento: string | Date | null;
  cpf: string | null;
  status: "ativo" | "inativo";
  cooperativa: string | null;
  responsavel_cooperativa: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  referencia: string | null;
  contatos: ContatoCatadorExportacao[];
  contas_financeiras: ContaCatadorExportacao[];
  tem_foto: boolean;
  total_quilos: number;
  total_ganhos: number;
  total_pesagens: number;
  criado_em: string;
  atualizado_em: string;
};

const CORES = {
  verde: "FF087443",
  verdeEscuro: "FF064E3B",
  verdeClaro: "FFDCFCE7",
  verdeMuitoClaro: "FFF0FDF4",
  branco: "FFFFFFFF",
  cinza: "FF64748B",
  cinzaClaro: "FFF1F5F9",
  borda: "FFD7E3DD",
  alerta: "FFFFF7D6",
};

type ColunaPlanilha = { cabecalho: string; largura: number; formato?: string };

function texto(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "Não informado";
  return String(valor);
}

function formatarCpf(valor: string | null) {
  if (!valor) return "Não informado";
  const numeros = valor.replace(/\D/g, "");
  return numeros.length === 11 ? numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : valor;
}

function formatarCep(valor: string | null) {
  if (!valor) return "Não informado";
  const numeros = valor.replace(/\D/g, "");
  return numeros.length === 8 ? numeros.replace(/(\d{5})(\d{3})/, "$1-$2") : valor;
}

function dataSomenteDia(valor: string | Date | null) {
  if (!valor) return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate(), 12);
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  return ano && mes && dia ? new Date(ano, mes - 1, dia, 12) : null;
}

function nomeParaCracha(catador: CatadorParaExportacao) {
  return catador.apelido?.trim() || catador.nome_completo;
}

function contatoPrincipal(catador: CatadorParaExportacao) {
  return catador.contatos.find((contato) => contato.principal)?.valor ?? catador.contatos[0]?.valor ?? "Não informado";
}

function enderecoCompleto(catador: CatadorParaExportacao) {
  return [catador.logradouro, catador.numero, catador.complemento, catador.bairro, catador.cidade, catador.estado]
    .filter(Boolean)
    .join(", ") || "Não informado";
}

function prepararPlanilha(planilha: ExcelJS.Worksheet, titulo: string, descricao: string, colunas: ColunaPlanilha[]) {
  const ultimaColuna = Math.max(colunas.length, 1);
  planilha.mergeCells(1, 1, 1, ultimaColuna);
  planilha.mergeCells(2, 1, 2, ultimaColuna);
  planilha.getCell(1, 1).value = titulo;
  planilha.getCell(2, 1).value = descricao;
  planilha.getRow(1).height = 34;
  planilha.getRow(2).height = 30;
  planilha.getCell(1, 1).font = { name: "Aptos Display", size: 20, bold: true, color: { argb: CORES.branco } };
  planilha.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.verdeEscuro } };
  planilha.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };
  planilha.getCell(2, 1).font = { name: "Aptos", size: 11, color: { argb: CORES.verdeEscuro } };
  planilha.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.verdeClaro } };
  planilha.getCell(2, 1).alignment = { vertical: "middle", wrapText: true };

  const linhaCabecalho = planilha.getRow(4);
  linhaCabecalho.values = colunas.map((coluna) => coluna.cabecalho);
  linhaCabecalho.height = 28;
  linhaCabecalho.eachCell((celula) => {
    celula.font = { name: "Aptos", size: 11, bold: true, color: { argb: CORES.branco } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.verde } };
    celula.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celula.border = { bottom: { style: "medium", color: { argb: CORES.verdeEscuro } } };
  });
  colunas.forEach((coluna, indice) => {
    const colunaExcel = planilha.getColumn(indice + 1);
    colunaExcel.width = coluna.largura;
    if (coluna.formato) colunaExcel.numFmt = coluna.formato;
  });
  planilha.views = [{ state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 90 }];
  planilha.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  planilha.headerFooter.oddFooter = "&LRecicla Belô&C&P de &N&RExportação confidencial";
  planilha.properties.tabColor = { argb: CORES.verde };
}

function finalizarTabela(planilha: ExcelJS.Worksheet, quantidadeLinhas: number, quantidadeColunas: number) {
  const ultimaLinha = Math.max(4 + quantidadeLinhas, 4);
  if (quantidadeLinhas > 0) planilha.autoFilter = { from: { row: 4, column: 1 }, to: { row: ultimaLinha, column: quantidadeColunas } };
  for (let numeroLinha = 5; numeroLinha <= ultimaLinha; numeroLinha += 1) {
    const linha = planilha.getRow(numeroLinha);
    linha.height = 26;
    linha.eachCell({ includeEmpty: true }, (celula) => {
      celula.font = { name: "Aptos", size: 10, color: { argb: CORES.verdeEscuro } };
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: numeroLinha % 2 === 0 ? CORES.verdeMuitoClaro : CORES.branco } };
      celula.alignment = { vertical: "middle", wrapText: false };
      celula.border = { bottom: { style: "hair", color: { argb: CORES.borda } } };
    });
  }
  if (quantidadeLinhas === 0) {
    planilha.mergeCells(5, 1, 5, quantidadeColunas);
    planilha.getCell(5, 1).value = "Nenhum catador cadastrado no momento da exportação.";
    planilha.getCell(5, 1).font = { italic: true, color: { argb: CORES.cinza } };
    planilha.getCell(5, 1).alignment = { horizontal: "center", vertical: "middle" };
    planilha.getRow(5).height = 32;
  }
}

function criarCapa(pasta: ExcelJS.Workbook, catadores: CatadorParaExportacao[], geradoEm: Date) {
  const planilha = pasta.addWorksheet("Orientações", { views: [{ showGridLines: false, zoomScale: 100 }] });
  planilha.properties.tabColor = { argb: CORES.verdeEscuro };
  planilha.columns = Array.from({ length: 8 }, () => ({ width: 18 }));
  planilha.mergeCells("A1:H2");
  planilha.getCell("A1").value = "Recicla Belô — Catadores cadastrados";
  planilha.getCell("A1").font = { name: "Aptos Display", size: 24, bold: true, color: { argb: CORES.branco } };
  planilha.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.verdeEscuro } };
  planilha.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  planilha.getRow(1).height = 35;
  planilha.getRow(2).height = 35;

  planilha.mergeCells("A4:H4");
  planilha.getCell("A4").value = "Arquivo organizado para produção de crachás e conferência cadastral";
  planilha.getCell("A4").font = { size: 15, bold: true, color: { argb: CORES.verdeEscuro } };

  const ativos = catadores.filter((catador) => catador.status === "ativo").length;
  const comFoto = catadores.filter((catador) => catador.tem_foto).length;
  const indicadores = [
    ["A6", "B6", "Total de catadores", catadores.length],
    ["C6", "D6", "Cadastros ativos", ativos],
    ["E6", "F6", "Cadastros inativos", catadores.length - ativos],
    ["G6", "H6", "Com foto cadastrada", comFoto],
  ] as const;
  indicadores.forEach(([inicio, fim, rotulo, valor]) => {
    planilha.mergeCells(`${inicio}:${fim}`);
    const celula = planilha.getCell(inicio);
    celula.value = { richText: [{ text: `${valor}\n`, font: { bold: true, size: 20, color: { argb: CORES.verdeEscuro } } }, { text: rotulo, font: { size: 10, color: { argb: CORES.cinza } } }] };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.verdeClaro } };
    celula.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celula.border = { top: { style: "thin", color: { argb: CORES.borda } }, bottom: { style: "thin", color: { argb: CORES.borda } }, left: { style: "thin", color: { argb: CORES.borda } }, right: { style: "thin", color: { argb: CORES.borda } } };
  });
  planilha.getRow(6).height = 62;

  planilha.mergeCells("A9:H10");
  planilha.getCell("A9").value = "CONFIDENCIAL: este arquivo contém dados pessoais e financeiros. Compartilhe somente com pessoas autorizadas, use exclusivamente para a finalidade informada e exclua cópias desnecessárias após o uso.";
  planilha.getCell("A9").fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.alerta } };
  planilha.getCell("A9").font = { bold: true, color: { argb: "FF7C5700" }, size: 11 };
  planilha.getCell("A9").alignment = { vertical: "middle", wrapText: true };

  const orientacoes = [
    ["Produção de crachás", "Relação enxuta com código, nome, nome preferido, cooperativa, contato e situação da foto."],
    ["Cadastro completo", "Dados pessoais, endereço, situação cadastral e totais históricos de produção."],
    ["Contatos", "Uma linha para cada telefone, WhatsApp, e-mail ou contato de recado cadastrado."],
    ["Dados de pagamento", "Informações Pix ou bancárias, incluindo titularidade de terceiros quando informada."],
  ];
  planilha.getCell("A12").value = "Como usar as abas";
  planilha.getCell("A12").font = { size: 15, bold: true, color: { argb: CORES.verdeEscuro } };
  orientacoes.forEach(([titulo, descricao], indice) => {
    const linha = 14 + indice * 2;
    planilha.mergeCells(linha, 1, linha, 2);
    planilha.mergeCells(linha, 3, linha, 8);
    planilha.getCell(linha, 1).value = titulo;
    planilha.getCell(linha, 1).font = { bold: true, color: { argb: CORES.verde } };
    planilha.getCell(linha, 3).value = descricao;
    planilha.getCell(linha, 3).font = { color: { argb: CORES.cinza } };
    planilha.getCell(linha, 3).alignment = { wrapText: true };
    planilha.getRow(linha).height = 30;
  });
  planilha.mergeCells("A23:H23");
  planilha.getCell("A23").value = `Gerado em ${geradoEm.toLocaleString("pt-BR", { timeZone: "America/Bahia" })} · Todos os dados representam uma fotografia do cadastro nesse momento.`;
  planilha.getCell("A23").font = { italic: true, color: { argb: CORES.cinza }, size: 10 };
}

export async function gerarPlanilhaCatadores(catadores: CatadorParaExportacao[], geradoEm = new Date()) {
  const pasta = new ExcelJS.Workbook();
  pasta.creator = "Recicla Belô";
  pasta.company = "Recicla Belô";
  pasta.subject = "Relação completa de catadores cadastrados";
  pasta.title = "Catadores cadastrados — Recicla Belô";
  pasta.description = "Exportação confidencial para produção de crachás e conferência cadastral.";
  pasta.created = geradoEm;
  pasta.modified = geradoEm;
  pasta.lastPrinted = geradoEm;
  pasta.calcProperties.fullCalcOnLoad = true;

  criarCapa(pasta, catadores, geradoEm);

  const colunasCracha: ColunaPlanilha[] = [
    { cabecalho: "Código", largura: 18 }, { cabecalho: "Nome completo", largura: 34 }, { cabecalho: "Nome no crachá", largura: 28 },
    { cabecalho: "Cooperativa / Associação", largura: 30 }, { cabecalho: "Situação", largura: 14 }, { cabecalho: "Contato principal", largura: 24 },
    { cabecalho: "Foto cadastrada", largura: 18 }, { cabecalho: "UUID do cadastro", largura: 38 },
  ];
  const crachas = pasta.addWorksheet("Produção de crachás");
  prepararPlanilha(crachas, "Produção de crachás", "Use esta aba como fonte principal para diagramar e conferir os crachás dos catadores.", colunasCracha);
  catadores.forEach((catador) => crachas.addRow([catador.codigo, catador.nome_completo, nomeParaCracha(catador), texto(catador.cooperativa), catador.status === "ativo" ? "Ativo" : "Inativo", contatoPrincipal(catador), catador.tem_foto ? "Sim" : "Não", catador.uuid]));
  finalizarTabela(crachas, catadores.length, colunasCracha.length);
  crachas.getColumn(1).numFmt = "@";
  crachas.getColumn(8).numFmt = "@";

  const colunasCadastro: ColunaPlanilha[] = [
    { cabecalho: "Código", largura: 18 }, { cabecalho: "Nome completo", largura: 34 }, { cabecalho: "Apelido / nome preferido", largura: 28 },
    { cabecalho: "Situação", largura: 14 }, { cabecalho: "Gênero", largura: 18 }, { cabecalho: "Raça / Cor", largura: 18 },
    { cabecalho: "Data de nascimento", largura: 19, formato: "dd/mm/yyyy" }, { cabecalho: "CPF", largura: 18 },
    { cabecalho: "Cooperativa / Associação", largura: 30 }, { cabecalho: "Responsável da cooperativa", largura: 28 },
    { cabecalho: "CEP", largura: 13 }, { cabecalho: "Logradouro", largura: 32 }, { cabecalho: "Número", largura: 12 },
    { cabecalho: "Complemento", largura: 22 }, { cabecalho: "Bairro", largura: 22 }, { cabecalho: "Cidade", largura: 22 },
    { cabecalho: "UF", largura: 8 }, { cabecalho: "Referência", largura: 30 }, { cabecalho: "Endereço completo", largura: 48 },
    { cabecalho: "Quantidade de contatos", largura: 20, formato: "0" }, { cabecalho: "Contato principal", largura: 24 },
    { cabecalho: "Foto cadastrada", largura: 18 }, { cabecalho: "Total coletado (kg)", largura: 20, formato: "#,##0.000" },
    { cabecalho: "Total histórico liberado (R$)", largura: 27, formato: "R$ #,##0.00" }, { cabecalho: "Pesagens concluídas", largura: 20, formato: "0" },
    { cabecalho: "Cadastrado em", largura: 20, formato: "dd/mm/yyyy hh:mm" }, { cabecalho: "Atualizado em", largura: 20, formato: "dd/mm/yyyy hh:mm" },
    { cabecalho: "UUID do cadastro", largura: 38 },
  ];
  const cadastro = pasta.addWorksheet("Cadastro completo");
  prepararPlanilha(cadastro, "Cadastro completo dos catadores", "Dados pessoais, vínculo, endereço e totais históricos. Campos não preenchidos aparecem como “Não informado”.", colunasCadastro);
  catadores.forEach((catador) => cadastro.addRow([
    catador.codigo, catador.nome_completo, texto(catador.apelido), catador.status === "ativo" ? "Ativo" : "Inativo", texto(catador.genero), texto(catador.raca_cor),
    dataSomenteDia(catador.data_nascimento), formatarCpf(catador.cpf), texto(catador.cooperativa), texto(catador.responsavel_cooperativa), formatarCep(catador.cep),
    texto(catador.logradouro), texto(catador.numero), texto(catador.complemento), texto(catador.bairro), texto(catador.cidade), texto(catador.estado), texto(catador.referencia),
    enderecoCompleto(catador), catador.contatos.length, contatoPrincipal(catador), catador.tem_foto ? "Sim" : "Não", Number(catador.total_quilos), Number(catador.total_ganhos),
    Number(catador.total_pesagens), new Date(catador.criado_em), new Date(catador.atualizado_em), catador.uuid,
  ]));
  finalizarTabela(cadastro, catadores.length, colunasCadastro.length);
  [1, 8, 11, 13, 28].forEach((coluna) => { cadastro.getColumn(coluna).numFmt = "@"; });

  const contatosDetalhados = catadores.flatMap((catador) => catador.contatos.map((contato) => ({ catador, contato })));
  const colunasContatos: ColunaPlanilha[] = [
    { cabecalho: "Código", largura: 18 }, { cabecalho: "Nome completo", largura: 34 }, { cabecalho: "Tipo", largura: 18 },
    { cabecalho: "Contato", largura: 34 }, { cabecalho: "Principal", largura: 14 }, { cabecalho: "Observação", largura: 32 },
  ];
  const contatos = pasta.addWorksheet("Contatos");
  prepararPlanilha(contatos, "Contatos cadastrados", "Cada telefone, WhatsApp, e-mail ou contato de recado ocupa uma linha própria.", colunasContatos);
  contatosDetalhados.forEach(({ catador, contato }) => contatos.addRow([catador.codigo, catador.nome_completo, contato.tipo, contato.valor, contato.principal ? "Sim" : "Não", texto(contato.observacao)]));
  finalizarTabela(contatos, contatosDetalhados.length, colunasContatos.length);
  contatos.getColumn(1).numFmt = "@";
  contatos.getColumn(4).numFmt = "@";

  const pagamentosDetalhados = catadores.flatMap((catador) => catador.contas_financeiras.map((conta) => ({ catador, conta })));
  const colunasPagamento: ColunaPlanilha[] = [
    { cabecalho: "Código", largura: 18 }, { cabecalho: "Nome completo", largura: 34 }, { cabecalho: "Forma de pagamento", largura: 22 },
    { cabecalho: "Tipo de chave Pix", largura: 20 }, { cabecalho: "Chave Pix", largura: 34 }, { cabecalho: "Banco", largura: 26 },
    { cabecalho: "Agência", largura: 16 }, { cabecalho: "Conta", largura: 20 }, { cabecalho: "Tipo de conta", largura: 18 },
    { cabecalho: "Conta de terceiro", largura: 19 }, { cabecalho: "Nome do titular", largura: 32 }, { cabecalho: "CPF do titular", largura: 18 },
    { cabecalho: "Relação com o catador", largura: 24 },
  ];
  const pagamentos = pasta.addWorksheet("Dados de pagamento");
  prepararPlanilha(pagamentos, "Dados de pagamento", "Acesso restrito: informações Pix e bancárias ativas registradas para o recebimento dos catadores.", colunasPagamento);
  pagamentosDetalhados.forEach(({ catador, conta }) => pagamentos.addRow([
    catador.codigo, catador.nome_completo, conta.tipo === "pix" ? "Chave Pix" : "Conta bancária", texto(conta.tipo_chave_pix), texto(conta.chave_pix),
    texto(conta.banco), texto(conta.agencia), texto(conta.numero_conta), texto(conta.tipo_conta), conta.de_terceiro ? "Sim" : "Não", texto(conta.nome_titular),
    formatarCpf(conta.cpf_titular), texto(conta.relacao_titular),
  ]));
  finalizarTabela(pagamentos, pagamentosDetalhados.length, colunasPagamento.length);
  [1, 5, 7, 8, 12].forEach((coluna) => { pagamentos.getColumn(coluna).numFmt = "@"; });

  const conteudo = await pasta.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.from(conteudo);
}
