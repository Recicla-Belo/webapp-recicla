import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { gerarPlanilhaCatadores, type CatadorParaExportacao } from "./gerar-planilha-catadores.js";

const catador: CatadorParaExportacao = {
  uuid: "11111111-1111-4111-8111-111111111111",
  codigo: "CAT-0001",
  nome_completo: "Maria da Silva",
  apelido: "Maria",
  genero: "Feminino",
  raca_cor: "Parda",
  data_nascimento: "1985-04-10",
  cpf: "01234567890",
  status: "ativo",
  cooperativa: "Asmare",
  responsavel_cooperativa: "Responsável pelo cadastro",
  cep: "30110000",
  logradouro: "Rua da Bahia",
  numero: "100",
  complemento: null,
  bairro: "Centro",
  cidade: "Belo Horizonte",
  estado: "MG",
  referencia: "=2+2",
  contatos: [{ tipo: "whatsapp", valor: "31999999999", principal: true, observacao: null }],
  contas_financeiras: [{ tipo: "pix", tipo_chave_pix: "CPF", chave_pix: "01234567890", banco: null, agencia: null, numero_conta: null, tipo_conta: null, de_terceiro: false, nome_titular: null, cpf_titular: null, relacao_titular: null }],
  tem_foto: true,
  total_quilos: 25.5,
  total_ganhos: 200,
  total_pesagens: 2,
  criado_em: "2026-08-28T12:00:00.000Z",
  atualizado_em: "2026-08-28T12:00:00.000Z",
};

test("gera um arquivo Excel válido, organizado e com os dados completos", async () => {
  const conteudo = await gerarPlanilhaCatadores([catador], new Date("2026-08-28T14:00:00.000Z"));
  assert.deepEqual([...conteudo.subarray(0, 2)], [0x50, 0x4b]);

  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(conteudo as never);
  assert.deepEqual(pasta.worksheets.map((planilha) => planilha.name), ["Orientações", "Produção de crachás", "Cadastro completo", "Contatos", "Dados de pagamento"]);
  assert.equal(pasta.getWorksheet("Produção de crachás")?.getCell("A5").value, "CAT-0001");
  assert.equal(pasta.getWorksheet("Produção de crachás")?.getCell("C5").value, "Maria");
  assert.equal(pasta.getWorksheet("Cadastro completo")?.getCell("H5").value, "012.345.678-90");
  assert.equal(pasta.getWorksheet("Cadastro completo")?.getCell("R5").value, "=2+2");
  assert.equal(pasta.getWorksheet("Contatos")?.getCell("D5").value, "31999999999");
  assert.equal(pasta.getWorksheet("Dados de pagamento")?.getCell("E5").value, "01234567890");
});
