import { get, post, qs } from "../api.js";
import { icone } from "../icones.js";
import {
  SeletorBusca, cabecalhoOrdenavel, debounce, el, limpar, linhaEstado, mensagemErro, mesAno, moeda, data,
  dataHora, paginacao, seletorSimples, toast, plural,
} from "../ui.js";
import { abrirFatura } from "./acao_modal.js";
import { carteiraParam, classeLinha, ehAdmin, seletorCarteira } from "./comum.js";
import { abrirExportacao } from "./exportar.js";
import { abrirParticularidades } from "./particularidades.js";
import { abrirAjuste } from "./admin_registros.js";

const COLUNAS = [
  { chave: "conta", titulo: "Conta de contrato", classe: "col-conta" },
  { chave: "nome", titulo: "Nome", classe: "col-nome" },
  { chave: "vencimento", titulo: "Vencimento líquido", classe: "col-data" },
  { chave: "montante", titulo: "Montante", classe: "col-valor" },
  { chave: "forma_pagamento", titulo: "Forma de pagamento", classe: "col-forma" },
  { chave: "situacao", titulo: "Pago", classe: "col-pago" },
  { titulo: "Obs.", classe: "col-obs" },
  { titulo: "Ações", classe: "col-acoes" },
];
const NCOL = COLUNAS.length;

export async function telaFaturas(c, estado) {
  const admin = ehAdmin(estado);
  const f = (estado.filtros.faturas ||= { municipio: "todos", mes: "", busca: "", ocultar_pagas: false, ordem: "vencimento", direcao: "asc", pagina: 1 });
  let municipios = [];
  let pendentes = 0;
  let requisicao = 0;

  const titulo = el("h1");
  const atualizarTitulo = () => {
    const m = municipios.find((x) => String(x.id) === String(f.municipio));
    titulo.textContent = m ? `Faturas de ${m.nome}` : f.municipio === "sem" ? "Faturas sem município" : (admin && !estado.carteiraSel ? "Faturas de todas as carteiras" : "Faturas da carteira");
    btnPart.disabled = !m;
    btnPart.title = m ? `Ver particularidades de ${m.nome}` : "Escolha um município para ver as particularidades";
  };

  const seletorMun = new SeletorBusca({
    placeholder: "Buscar município...", rotuloAria: "Município",
    aoMudar: (v) => { f.municipio = String(v); f.pagina = 1; atualizarTitulo(); carregar(); },
  });
  const btnPart = el("button", { class: "btn btn-secundario", type: "button" }, "Ver particularidades");
  btnPart.addEventListener("click", () => {
    const m = municipios.find((x) => String(x.id) === String(f.municipio));
    if (m) abrirParticularidades(m, estado);
  });
  const mesSel = seletorSimples([{ valor: "", rotulo: "Todos os meses" }], f.mes, (v) => { f.mes = v; f.pagina = 1; carregar(); }, { "aria-label": "Mês de vencimento" });
  const busca = el("input", { type: "search", placeholder: "Conta ou nome", "aria-label": "Buscar por conta ou nome", value: f.busca });
  busca.addEventListener("input", debounce(() => { f.busca = busca.value.trim(); f.pagina = 1; carregar(); }));
  const ocultar = el("input", { type: "checkbox", checked: f.ocultar_pagas });
  ocultar.addEventListener("change", () => { f.ocultar_pagas = ocultar.checked; f.pagina = 1; carregar(); });
  const exportar = el("button", { class: "btn btn-secundario", type: "button", onclick: () => abrirExportacao(estado) }, icone("baixar"), "Exportar carteira");

  const filtros = el("div", { class: "filtros" },
    admin ? el("label", { class: "filtro" }, el("span", { text: "Carteira" }), seletorCarteira(estado, async (v) => {
      estado.carteiraSel = v; f.municipio = "todos"; f.mes = ""; f.pagina = 1;
      await carregarOpcoes(); carregar();
    })) : null,
    el("div", { class: "filtro filtro-municipio" }, el("span", { text: "Município" }), el("div", { class: "linha-controles" }, seletorMun.raiz, btnPart)),
    el("label", { class: "filtro" }, el("span", { text: "Mês de vencimento" }), mesSel),
    el("label", { class: "filtro filtro-busca" }, el("span", { text: "Busca" }), busca),
    el("label", { class: "filtro-check" }, ocultar, " Ocultar pagas"),
    el("div", { class: "filtro-direita" }, exportar),
  );

  const thead = el("thead");
  const tbody = el("tbody");
  const rodape = el("div", { class: "tabela-rodape" });
  c.append(
    el("div", { class: "tela-cabecalho" }, titulo, !admin ? el("span", { class: "carteira-tag", text: `Carteira ${estado.usuario.carteira_nome}` }) : null),
    filtros,
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela-faturas" }, thead, tbody)),
    rodape,
  );

  async function carregarOpcoes() {
    const cp = carteiraParam(estado);
    const [m, ms] = await Promise.all([get(`/api/municipios${qs({ carteira: cp })}`), get(`/api/faturas/meses${qs({ carteira: cp })}`)]);
    municipios = m.municipios; pendentes = m.pendentes;
    const opcoes = [{ valor: "todos", rotulo: "Todos os municípios" }]
      .concat(municipios.map((x) => ({ valor: String(x.id), rotulo: x.nome, extra: plural(x.faturas, "fatura", "faturas") })));
    if (pendentes > 0 || f.municipio === "sem") opcoes.push({ valor: "sem", rotulo: "Não identificado (sem município)" });
    if (!opcoes.some((o) => o.valor === String(f.municipio))) f.municipio = "todos";
    seletorMun.definirOpcoes(opcoes, String(f.municipio));
    limpar(mesSel).append(el("option", { value: "", text: "Todos os meses" }), ...ms.meses.map((x) => el("option", { value: x, text: mesAno(x) })));
    if (f.mes && !ms.meses.includes(f.mes)) f.mes = "";
    mesSel.value = f.mes;
    atualizarTitulo();
  }

  function desenharCabecalho(resp) {
    limpar(thead);
    thead.append(cabecalhoOrdenavel(COLUNAS, f.ordem, f.direcao, (ordem, direcao) => { f.ordem = ordem; f.direcao = direcao; f.pagina = 1; carregar(); }));
    const total = el("tr", { class: "linha-total" },
      el("td", { colspan: 3 }, el("strong", { text: "TOTAL FILTRADO" }), resp ? ` (${plural(resp.quantidade, "registro", "registros")})` : " (carregando...)"),
      el("td", { class: "col-valor" }, el("strong", { text: resp ? moeda(resp.total_centavos) : "—" })),
      el("td", { colspan: NCOL - 4 }),
    );
    thead.append(total);
  }

  async function carregar() {
    const minha = ++requisicao;
    desenharCabecalho(null);
    limpar(tbody).append(linhaEstado(NCOL, "Carregando faturas...", "carregando"));
    limpar(rodape);
    let resp;
    try {
      resp = await get(`/api/faturas${qs({
        carteira: carteiraParam(estado), municipio: f.municipio, mes: f.mes, busca: f.busca,
        ocultar_pagas: f.ocultar_pagas ? "1" : "", ordem: f.ordem, direcao: f.direcao, pagina: f.pagina,
      })}`);
    } catch (e) {
      if (minha !== requisicao) return;
      limpar(tbody).append(linhaEstado(NCOL, mensagemErro(e), "erro", el("button", { class: "btn btn-pequeno", onclick: carregar }, "Tentar novamente")));
      return;
    }
    if (minha !== requisicao) return;
    f.pagina = resp.pagina;
    desenharCabecalho(resp);
    limpar(tbody);
    if (!resp.itens.length) {
      const semDados = !municipios.length && !pendentes && !f.busca && !f.mes;
      tbody.append(linhaEstado(NCOL, semDados
        ? "Ainda não há faturas nesta carteira. O administrador precisa importar a planilha do mês."
        : "Nenhuma fatura encontrada para os filtros escolhidos.", "vazio"));
    }
    for (const item of resp.itens) desenharLinha(item);
    rodape.append(paginacao(resp.pagina, resp.paginas, resp.quantidade, resp.tamanho, (p) => { f.pagina = p; carregar(); }));
  }

  function desenharLinha(item, substituir) {
    const tr = el("tr", { class: classeLinha(item), dataset: { id: item.id } });
    const marca = el("input", { type: "checkbox", checked: item.paga, "aria-label": `Marcar fatura ${item.conta} de ${data(item.vencimento)} como paga` });
    marca.addEventListener("change", async () => {
      marca.disabled = true;
      try {
        const novo = await post(`/api/faturas/${item.id}/pagamento`, { paga: marca.checked, versao: item.versao });
        toast(novo.paga ? "Fatura marcada como paga." : "Pagamento desmarcado.", "sucesso", 2500);
        if (f.ocultar_pagas && novo.paga) { carregar(); return; }
        Object.assign(item, novo); desenharLinha(item, tr);
      } catch (e) {
        toast(mensagemErro(e), "erro"); marca.checked = item.paga;
        if (e.status === 409 || e.status === 404) carregar();
      } finally { marca.disabled = false; }
    });
    const pago = el("label", { class: "pago-controle", title: item.paga && item.paga_alterada_por ? `Marcada por ${item.paga_alterada_por} em ${dataHora(item.paga_alterada_em)}` : "" },
      marca, el("span", { class: `situacao situacao-${item.situacao}`, text: item.situacao_rotulo }));

    const btnObs = el("button", {
      class: `btn-icone btn-obs ${item.observacao ? "tem-conteudo" : ""}`, type: "button",
      title: item.observacao ? `Observação: ${item.observacao.slice(0, 200)}` : "Adicionar observação",
      "aria-label": item.observacao ? "Ver ou editar observação (há conteúdo)" : "Adicionar observação",
      "aria-expanded": "false",
    }, icone("nota"), item.observacao ? el("span", { class: "ponto", "aria-hidden": "true" }) : null);
    btnObs.addEventListener("click", () => alternarObservacao(item, tr, btnObs));

    const btnAcao = el("button", { class: "btn btn-pequeno btn-acao", type: "button", title: item.ultima_acao ? `Última ação: ${item.ultima_acao}` : "Nenhuma ação registrada" },
      icone("nota"), "Registrar ação", item.qtd_acoes ? el("span", { class: "contador", text: item.qtd_acoes }) : null);
    btnAcao.addEventListener("click", () => abrirFatura(item.id, estado, { aoAlterar: carregar }));
    const acoes = el("td", { class: "col-acoes" }, btnAcao);
    if (admin) acoes.append(el("button", { class: "btn-icone", type: "button", title: "Ajustar registro (admin)", "aria-label": "Ajustar registro", onclick: () => abrirAjuste(item.id, estado, carregar) }, icone("editar")));

    tr.append(
      el("td", { class: "col-conta" }, el("span", { class: "ident", text: item.conta }), item.corrigida ? el("span", { class: "marcador", title: "Registro ajustado manualmente pelo admin", text: "ajustada" }) : null),
      el("td", { class: "col-nome", text: item.nome, title: item.nome }),
      el("td", { class: "col-data", text: data(item.vencimento) }),
      el("td", { class: "col-valor", text: moeda(item.montante_centavos) }),
      el("td", { class: "col-forma", text: item.forma_pagamento || "—", title: item.forma_pagamento ? "" : "Sem informação" }),
      el("td", { class: "col-pago" }, pago),
      el("td", { class: "col-obs" }, btnObs),
      acoes,
    );
    if (substituir) {
      const aberto = substituir.nextElementSibling && substituir.nextElementSibling.classList.contains("linha-obs") ? substituir.nextElementSibling : null;
      if (aberto) aberto.remove();
      substituir.replaceWith(tr);
    } else tbody.append(tr);
  }

  function alternarObservacao(item, tr, botao) {
    const prox = tr.nextElementSibling;
    if (prox && prox.classList.contains("linha-obs")) { prox.remove(); botao.setAttribute("aria-expanded", "false"); return; }
    const texto = el("textarea", { rows: 3, maxlength: 5000, "aria-label": "Observação", placeholder: "Escreva a observação desta fatura..." });
    texto.value = item.observacao || "";
    const salvar = el("button", { class: "btn btn-primario btn-pequeno", type: "button" }, "Salvar observação");
    const cancelar = el("button", { class: "btn btn-pequeno", type: "button" }, "Cancelar");
    const info = el("small", { class: "obs-info", text: item.observacao_alterada_por ? `Última alteração: ${item.observacao_alterada_por} em ${dataHora(item.observacao_alterada_em)}` : "" });
    const linha = el("tr", { class: "linha-obs" }, el("td", { colspan: NCOL }, el("div", { class: "obs-editor" }, texto, el("div", { class: "obs-botoes" }, info, cancelar, salvar))));
    cancelar.addEventListener("click", () => { linha.remove(); botao.setAttribute("aria-expanded", "false"); });
    salvar.addEventListener("click", async () => {
      salvar.disabled = true; salvar.textContent = "Salvando...";
      try {
        const novo = await post(`/api/faturas/${item.id}/observacao`, { observacao: texto.value, versao: item.versao });
        Object.assign(item, novo);
        toast("Observação salva.", "sucesso", 2500);
        desenharLinha(item, tr);
      } catch (e) {
        toast(mensagemErro(e), "erro", 7000);
        salvar.disabled = false; salvar.textContent = "Salvar observação";
        if (e.status === 409 && e.dados && e.dados.detalhes) {
          Object.assign(item, e.dados.detalhes);
          info.textContent = `Texto atual no sistema: "${(item.observacao || "(vazio)").slice(0, 300)}". Revise e salve novamente.`;
        }
      }
    });
    tr.after(linha);
    botao.setAttribute("aria-expanded", "true");
    texto.focus();
  }

  desenharCabecalho(null);
  tbody.append(linhaEstado(NCOL, "Carregando...", "carregando"));
  await carregarOpcoes();
  await carregar();
}
