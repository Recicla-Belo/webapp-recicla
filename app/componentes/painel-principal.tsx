const indicadores = [
  { rotulo: "Catadores ativos", valor: "48", variacao: "+4 este mês", icone: "CA" },
  { rotulo: "Total coletado", valor: "12.480 kg", variacao: "+8,2% no período", icone: "KG" },
  { rotulo: "Valor a pagar", valor: "R$ 18.940", variacao: "32 pagamentos", icone: "R$" },
  { rotulo: "Média por catador", valor: "260 kg", variacao: "+12 kg na média", icone: "ME" },
  { rotulo: "Coletas realizadas", valor: "186", variacao: "+21 esta semana", icone: "CO" },
];

export function PainelPrincipal({ onNovaPesagem }: { onNovaPesagem: () => void }) {
  return <>
    <div className="chamada">
      <div><span className="etiqueta">RESUMO DO DIA</span><h2>O trabalho de hoje gera<br/><em>impacto para sempre.</em></h2><p>Acompanhe os resultados da operação e valorize quem faz Belo Horizonte mais sustentável.</p></div>
      <div className="impacto"><strong>3,2t</strong><span>de resíduos desviados<br/>de aterros esta semana</span></div>
    </div>
    <section className="secao-indicadores">
      <div className="titulo-secao"><div><h2>Indicadores principais</h2><p>Visão consolidada da operação neste mês</p></div><button type="button" className="filtro">Agosto de 2026⌄</button></div>
      <div className="grade-indicadores">{indicadores.map((item, indice) => <article className="cartao-indicador" key={item.rotulo}><div className={`icone-indicador cor-${indice}`}>{item.icone}</div><p>{item.rotulo}</p><strong>{item.valor}</strong><small>↗ {item.variacao}</small></article>)}</div>
    </section>
    <div className="grade-inferior">
      <section className="painel"><div className="titulo-secao"><div><h2>Produção da semana</h2><p>Volume coletado por dia</p></div><strong className="total-periodo">3.248 kg <small>+12,4%</small></strong></div><div className="grafico" aria-label="Gráfico de produção semanal">{[62,78,55,92,72,96,44].map((altura, i)=><div className="barra-grupo" key={i}><div className="barra" style={{height:`${altura}%`}}/><span>{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i]}</span></div>)}</div></section>
      <section className="painel atividade"><div className="titulo-secao"><div><h2>Atividade recente</h2><p>Últimas pesagens registradas</p></div><button type="button" onClick={onNovaPesagem}>Registrar →</button></div>{[["JS","José Santos","Latinha · 42,8 kg","R$ 299,60"],["MC","Maria Conceição","Papelão · 86,2 kg","R$ 86,20"],["AP","André Pereira","Material misturado · 61 kg","R$ 73,20"]].map((a)=><div className="linha-atividade" key={a[1]}><span>{a[0]}</span><div><strong>{a[1]}</strong><small>{a[2]}</small></div><b>{a[3]}</b></div>)}</section>
    </div>
  </>;
}
