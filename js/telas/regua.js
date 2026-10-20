// Régua de cobrança da CARTEIRA: uma linha por evento de ação.
import { get, qs } from "../api.js";
import { cabecalhoOrdenavel, debounce, el, limpar, linhaEstado, mensagemErro, moeda, data, paginacao, plural, seletorSimples } from "../ui.js";
import { abrirFatura } from "./acao_modal.js";
import { carteiraParam, ehAdmin, seletorCarteira } from "./comum.js";

export async function telaRegua(c, estado) {
  const admin = ehAdmin(estado);
  const f = (estado.filtros.regua ||= { municipio: "todos", acao: "", de: "", ate: "", busca: "", ordem: "data_acao", direcao: "desc", pagina: 1 });
  const colunas = [
    ...(admin ? [{ chave: "carteira", titulo: "Carteira", classe: "col-carteira" }] : []),
    { chave: "municipio", titulo: "Município", classe: "col-municipio" },
    { chave: "conta", titulo: "Conta de contrato", classe: "col-conta" },
    { chave: "nome", titulo: "Nome", classe: "col-nome" },
    { chave: "vencimento", titulo: "Vencimento líquido", classe: "col-data" },
    { chave: "montante", titulo: "Montante", classe: "col-valor" },
    { chave: "forma_pagamento", titulo: "Forma de pagamento", classe: "col-forma" },
    { chave: "acao", titulo: "Ação", classe: "col-acao" },
    { chave: "data_acao", titulo: "Data da ação", classe: "col-data" },
    { titulo: "", classe: "col-controles" },
  ];
  const N = colunas.length;
  let req = 0;

  const munSel = seletorSimples([{ valor: "todos", rotulo: "Todos" }], f.municipio, (v) => { f.municipio = v; f.pagina = 1; carregar(); }, { "aria-label": "Município" });
  const acoes = [{ valor: "", rotulo: "Todas" }].concat(estado.catalogo.map((a) => ({ valor: String(a.id), rotulo: `${a.etapa}. ${a.nome}` })));
  const acaoSel = seletorSimples(acoes, f.acao, (v) => { f.acao = v; f.pagina = 1; carregar(); }, { "aria-label": "Ação" });
  const de = el("input", { type: "date", value: f.de, "aria-label": "Data da ação: início" });
  const ate = el("input", { type: "date", value: f.ate, "aria-label": "Data da ação: fim" });
  de.addEventListener("change", () => { f.de = de.value; f.pagina = 1; carregar(); });
  ate.addEventListener("change", () => { f.ate = ate.value; f.pagina = 1; carregar(); });
  const busca = el("input", { type: "search", placeholder: "Conta ou nome", value: f.busca, "aria-label": "Buscar por conta ou nome" });
  busca.addEventListener("input", debounce(() => { f.busca = busca.value.trim(); f.pagina = 1; carregar(); }));
  const limparPeriodo = el("button", { class: "btn btn-pequeno", type: "button", onclick: () => { de.value = ate.value = ""; f.de = f.ate = ""; carregar(); } }, "Limpar período");

  const resumo = el("span", { class: "resumo-regua" });
  const thead = el("thead");
  const tbody = el("tbody");
  const rodape = el("div", { class: "tabela-rodape" });
  c.append(
    el("div", { class: "tela-cabecalho" }, el("h1", { text: "Todas as ações da carteira" }),
      !admin ? el("span", { class: "carteira-tag", text: `Carteira ${estado.usuario.carteira_nome}` }) : null),
    el("div", { class: "filtros" },
      admin ? el("label", { class: "filtro" }, el("span", { text: "Carteira" }), seletorCarteira(estado, async (v) => { estado.carteiraSel = v; f.municipio = "todos"; await carregarMunicipios(); carregar(); })) : null,
      el("label", { class: "filtro" }, el("span", { text: "Município" }), munSel),
      el("label", { class: "filtro" }, el("span", { text: "Ação" }), acaoSel),
      el("div", { class: "filtro" }, el("span", { text: "Período da ação" }), el("div", { class: "linha-controles" }, de, el("span", { text: "até" }), ate, limparPeriodo)),
      el("label", { class: "filtro filtro-busca" }, el("span", { text: "Busca" }), busca),
    ),
    el("p", { class: "nota" }, resumo, " Uma fatura com várias ações aparece em várias linhas; por isso esta tela não soma valores."),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela-regua" }, thead, tbody)),
    rodape,
  );

  async function carregarMunicipios() {
    const d = await get(`/api/municipios${qs({ carteira: carteiraParam(estado) })}`);
    const ops = [{ valor: "todos", rotulo: "Todos" }].concat(d.municipios.map((m) => ({ valor: String(m.id), rotulo: m.nome })));
    if (d.pendentes) ops.push({ valor: "sem", rotulo: "Não identificado" });
    limpar(munSel).append(...ops.map((o) => el("option", { value: o.valor, text: o.rotulo })));
    if (!ops.some((o) => o.valor === f.municipio)) f.municipio = "todos";
    munSel.value = f.municipio;
  }

  async function carregar() {
    const minha = ++req;
    limpar(thead).append(cabecalhoOrdenavel(colunas, f.ordem, f.direcao, (o, d) => { f.ordem = o; f.direcao = d; f.pagina = 1; carregar(); }));
    limpar(tbody).append(linhaEstado(N, "Carregando ações...", "carregando"));
    limpar(rodape); resumo.textContent = "";
    let r;
    try {
      r = await get(`/api/regua${qs({ carteira: carteiraParam(estado), municipio: f.municipio, acao: f.acao, de: f.de, ate: f.ate, busca: f.busca, ordem: f.ordem, direcao: f.direcao, pagina: f.pagina })}`);
    } catch (e) {
      if (minha !== req) return;
      limpar(tbody).append(linhaEstado(N, mensagemErro(e), "erro", el("button", { class: "btn btn-pequeno", onclick: carregar }, "Tentar novamente")));
      return;
    }
    if (minha !== req) return;
    f.pagina = r.pagina;
    resumo.textContent = `${plural(r.eventos, "ação", "ações")} em ${plural(r.faturas, "fatura", "faturas")}.`;
    limpar(tbody);
    if (!r.itens.length) tbody.append(linhaEstado(N, "Nenhuma ação registrada para os filtros escolhidos. As ações são registradas pelo botão Registrar ação, na tela Faturas.", "vazio"));
    for (const it of r.itens) {
      tbody.append(el("tr", { class: it.paga ? "linha-paga-suave" : "" },
        admin ? el("td", { class: "col-carteira", text: it.carteira_nome }) : null,
        el("td", { class: "col-municipio", text: it.municipio_nome || "Não identificado" }),
        el("td", { class: "col-conta" }, el("span", { class: "ident", text: it.conta })),
        el("td", { class: "col-nome", text: it.nome, title: it.nome }),
        el("td", { class: "col-data", text: data(it.vencimento) }),
        el("td", { class: "col-valor", text: moeda(it.montante_centavos) }),
        el("td", { class: "col-forma", text: it.forma_pagamento || "—", title: it.forma_pagamento ? "" : "Sem informação" }),
        el("td", { class: "col-acao" }, el("span", { class: "etapa", text: it.acao_etapa }), ` ${it.acao_nome}`),
        el("td", { class: "col-data", text: data(it.data_acao) }),
        el("td", { class: "col-controles" },
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => abrirFatura(it.fatura_id, estado, { editarEventoId: it.id, aoAlterar: carregar }) }, "Editar"),
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => abrirFatura(it.fatura_id, estado, { aoAlterar: carregar }) }, "Abrir fatura")),
      ));
    }
    rodape.append(paginacao(r.pagina, r.paginas, r.eventos, 200, (p) => { f.pagina = p; carregar(); }));
  }

  await carregarMunicipios();
  await carregar();
}
