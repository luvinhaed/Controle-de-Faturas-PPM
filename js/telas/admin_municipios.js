// Admin: Gerenciar municípios e contas (vínculos, municípios x carteiras, base inicial).
import { api, del, get, post, put, qs } from "../api.js";
import { abrirModal, campo, confirmar, dataHora, debounce, el, limpar, linhaEstado, mensagemErro, paginacao, seletorSimples, toast } from "../ui.js";

const ORIGENS = { base_inicial: "Base inicial", associacao: "Associação (carteira)", admin: "Administrador" };

export async function telaMunicipios(c, estado) {
  const abas = [
    ["contas", "Contas e municípios"], ["municipios", "Municípios e carteiras"], ["base", "Base inicial"],
  ];
  const sub = (estado.filtros.subMunicipios ||= "contas");
  const nav = el("div", { class: "sub-abas", role: "tablist" });
  const area = el("div");
  c.append(el("div", { class: "tela-cabecalho" }, el("h1", { text: "Gerenciar municípios e contas" })), nav, area);
  const ir = async (k) => {
    estado.filtros.subMunicipios = k;
    nav.querySelectorAll("button").forEach((b) => b.classList.toggle("ativa", b.dataset.k === k));
    limpar(area);
    try {
      if (k === "contas") await telaVinculos(area, estado);
      else if (k === "municipios") await telaListaMunicipios(area, estado);
      else await telaBase(area, estado);
    } catch (e) { area.append(el("p", { class: "erro", text: mensagemErro(e) })); }
  };
  for (const [k, t] of abas) nav.append(el("button", { type: "button", role: "tab", dataset: { k }, onclick: () => ir(k) }, t));
  await ir(sub);
}

// ------------------------------------------------------------ vínculos conta -> município
async function telaVinculos(area, estado) {
  const f = (estado.filtros.vinculos ||= { busca: "", pagina: 1 });
  let municipios = (await get("/api/admin/municipios")).municipios;
  const busca = el("input", { type: "search", placeholder: "Conta ou município", value: f.busca, "aria-label": "Buscar" });
  const tbody = el("tbody"); const rodape = el("div", { class: "tabela-rodape" });
  busca.addEventListener("input", debounce(() => { f.busca = busca.value.trim(); f.pagina = 1; carregar(); }));
  const novo = el("button", { class: "btn btn-primario", type: "button", onclick: () => editar(null) }, "Vincular conta");
  area.append(
    el("p", { class: "instrucao", text: "Cada conta de contrato tem um único município padrão, usado nas próximas importações. Alterar o vínculo não move faturas que já têm município, a menos que você marque essa opção." }),
    el("div", { class: "filtros" }, el("label", { class: "filtro filtro-busca" }, el("span", { text: "Busca" }), busca), el("div", { class: "filtro-direita" }, novo)),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {}, ...["Conta de contrato", "Município", "Origem", "Faturas", "Última alteração", ""].map((t) => el("th", { text: t })))), tbody)),
    rodape,
  );

  async function carregar() {
    limpar(tbody).append(linhaEstado(6, "Carregando...", "carregando")); limpar(rodape);
    let r;
    try { r = await get(`/api/admin/vinculos${qs({ busca: f.busca, pagina: f.pagina })}`); }
    catch (e) { limpar(tbody).append(linhaEstado(6, mensagemErro(e), "erro")); return; }
    limpar(tbody);
    if (!r.itens.length) tbody.append(linhaEstado(6, f.busca ? "Nenhum vínculo encontrado." : "Nenhum vínculo cadastrado. Carregue a base inicial na aba Base inicial.", "vazio"));
    for (const v of r.itens) {
      tbody.append(el("tr", {},
        el("td", { class: "ident", text: v.conta }), el("td", { text: v.municipio_nome }), el("td", { text: ORIGENS[v.origem] || v.origem }),
        el("td", { class: "col-num", text: v.faturas }), el("td", { class: "pequeno", text: `${v.atualizado_por} em ${dataHora(v.atualizado_em)}` }),
        el("td", { class: "col-controles" },
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => editar(v) }, "Alterar"),
          el("button", { class: "btn btn-pequeno btn-perigo-texto", type: "button", onclick: () => remover(v) }, "Remover")),
      ));
    }
    rodape.append(paginacao(r.pagina, r.paginas, r.quantidade, 100, (p) => { f.pagina = p; carregar(); }));
  }

  function editar(v) {
    const conta = el("input", { type: "text", value: v ? v.conta : "", inputmode: "numeric", class: "ident", disabled: !!v });
    const mun = seletorSimples([{ valor: "", rotulo: "Escolha o município..." }].concat(municipios.map((m) => ({ valor: String(m.id), rotulo: m.nome }))), v ? String(v.municipio_id) : "", null);
    const aplicar = el("input", { type: "checkbox" });
    const motivo = el("input", { type: "text", maxlength: 500, placeholder: "Opcional" });
    const erro = el("p", { class: "erro" });
    const salvar = el("button", { class: "btn btn-primario", type: "button" }, "Salvar vínculo");
    const cancelar = el("button", { class: "btn", type: "button" }, "Cancelar");
    const m = abrirModal({ titulo: v ? `Alterar vínculo da conta ${v.conta}` : "Vincular conta a município", largura: "media", botoes: [cancelar, salvar], conteudo: [
      campo("Conta de contrato", conta), campo("Município", mun),
      el("p", { class: "nota", text: "Faturas desta conta ainda sem município serão associadas automaticamente." }),
      el("label", { class: "opcao" }, aplicar, " Mover também as faturas desta conta que já têm município (exceto as com destino específico definido pelo admin)"),
      campo("Motivo", motivo), erro,
    ] });
    cancelar.addEventListener("click", m.fechar);
    salvar.addEventListener("click", async () => {
      erro.textContent = "";
      if (!conta.value.trim() || !mun.value) { erro.textContent = "Informe a conta e o município."; return; }
      salvar.disabled = true;
      try {
        const r = await put(`/api/admin/vinculos/${encodeURIComponent(conta.value.trim())}`, { municipio_id: Number(mun.value), aplicar_existentes: aplicar.checked, motivo: motivo.value });
        toast(`Vínculo salvo: ${r.conta} → ${r.municipio}. ${r.faturas_resolvidas} pendente(s) resolvida(s), ${r.faturas_movidas} movida(s).`, "sucesso", 7000);
        m.fechar(); carregar();
      } catch (e) { erro.textContent = mensagemErro(e); salvar.disabled = false; }
    });
  }

  async function remover(v) {
    if (!(await confirmar("Remover vínculo", `Remover o vínculo padrão da conta ${v.conta} (${v.municipio_nome})? As faturas já existentes não mudam; próximas importações desta conta ficarão sem município.`, { textoOk: "Remover", perigo: true }))) return;
    try { await del(`/api/admin/vinculos/${encodeURIComponent(v.conta)}`); toast("Vínculo removido.", "sucesso"); }
    catch (e) { toast(mensagemErro(e), "erro"); }
    carregar();
  }
  await carregar();
}

// ------------------------------------------------------------ municípios x carteiras
async function telaListaMunicipios(area, estado) {
  const tbody = el("tbody");
  const nome = el("input", { type: "text", placeholder: "Nome do município", maxlength: 120 });
  const marcas = estado.carteiras.map((cart) => ({ cart, inp: el("input", { type: "checkbox" }) }));
  const criar = el("button", { class: "btn btn-primario", type: "button" }, "Cadastrar município");
  const filtro = el("input", { type: "search", placeholder: "Filtrar municípios", "aria-label": "Filtrar municípios" });
  area.append(
    el("p", { class: "instrucao", text: "Marque em quais carteiras cada município está disponível. Usuários de carteira só podem associar contas a municípios marcados para a própria carteira; as particularidades do município são compartilhadas entre essas carteiras." }),
    el("div", { class: "caixa-form" }, el("h3", { text: "Cadastrar município" }),
      el("div", { class: "linha-controles" }, nome, ...marcas.map((x) => el("label", { class: "opcao" }, x.inp, ` ${x.cart.nome}`)), criar)),
    el("div", { class: "filtros" }, el("label", { class: "filtro filtro-busca" }, el("span", { text: "Filtro" }), filtro)),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {}, el("th", { text: "Município" }), el("th", { class: "col-num", text: "Contas" }), el("th", { class: "col-num", text: "Faturas" }),
        ...estado.carteiras.map((cart) => el("th", { class: "col-centro", text: cart.nome })), el("th", { text: "" }))),
      tbody)),
  );
  criar.addEventListener("click", async () => {
    if (!nome.value.trim()) { toast("Informe o nome do município.", "erro"); return; }
    criar.disabled = true;
    try {
      const r = await post("/api/admin/municipios", { nome: nome.value, carteiras: marcas.filter((x) => x.inp.checked).map((x) => x.cart.id) });
      toast(`Município ${r.nome} cadastrado.`, "sucesso"); nome.value = ""; marcas.forEach((x) => { x.inp.checked = false; });
      carregar();
    } catch (e) { toast(mensagemErro(e), "erro", 7000); }
    criar.disabled = false;
  });
  let lista = [];
  filtro.addEventListener("input", () => desenhar());
  async function carregar() {
    limpar(tbody).append(linhaEstado(4 + estado.carteiras.length, "Carregando...", "carregando"));
    try { lista = (await get("/api/admin/municipios")).municipios; }
    catch (e) { limpar(tbody).append(linhaEstado(4 + estado.carteiras.length, mensagemErro(e), "erro")); return; }
    desenhar();
  }
  function desenhar() {
    limpar(tbody);
    const n = filtro.value.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const visiveis = lista.filter((m) => !n || m.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(n));
    if (!visiveis.length) tbody.append(linhaEstado(4 + estado.carteiras.length, "Nenhum município cadastrado. Carregue a base inicial ou cadastre acima.", "vazio"));
    for (const m of visiveis) {
      const celulas = estado.carteiras.map((cart) => {
        const inp = el("input", { type: "checkbox", checked: m.carteira_ids.includes(cart.id), "aria-label": `${m.nome} na carteira ${cart.nome}` });
        inp.addEventListener("change", async () => {
          inp.disabled = true;
          try {
            await post("/api/admin/carteira-municipio", { carteira_id: cart.id, municipio_id: m.id, incluir: inp.checked });
            if (inp.checked) m.carteira_ids.push(cart.id); else m.carteira_ids = m.carteira_ids.filter((x) => x !== cart.id);
            toast(inp.checked ? `${m.nome} disponível para ${cart.nome}.` : `${m.nome} removido de ${cart.nome}.`, "sucesso", 2500);
          } catch (e) { inp.checked = !inp.checked; toast(mensagemErro(e), "erro", 8000); }
          inp.disabled = false;
        });
        return el("td", { class: "col-centro" }, inp);
      });
      tbody.append(el("tr", {}, el("td", { text: m.nome }), el("td", { class: "col-num", text: m.contas }), el("td", { class: "col-num", text: m.faturas }), ...celulas,
        el("td", { class: "col-controles" },
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => renomear(m) }, "Renomear"),
          !m.contas && !m.faturas ? el("button", { class: "btn btn-pequeno btn-perigo-texto", type: "button", onclick: () => excluir(m) }, "Excluir") : null)));
    }
  }
  async function renomear(m) {
    const inp = el("input", { type: "text", value: m.nome, maxlength: 120 });
    if (!(await confirmar("Renomear município", [campo("Novo nome", inp)], { textoOk: "Renomear" }))) return;
    try { await put(`/api/admin/municipios/${m.id}`, { nome: inp.value }); toast("Município renomeado.", "sucesso"); carregar(); }
    catch (e) { toast(mensagemErro(e), "erro", 7000); }
  }
  async function excluir(m) {
    if (!(await confirmar("Excluir município", `Excluir ${m.nome}? Só é possível porque não há contas nem faturas ligadas a ele.`, { textoOk: "Excluir", perigo: true }))) return;
    try { await del(`/api/admin/municipios/${m.id}`); toast("Município excluído.", "sucesso"); carregar(); }
    catch (e) { toast(mensagemErro(e), "erro", 7000); }
  }
  await carregar();
}

// ------------------------------------------------------------ base inicial
async function telaBase(area) {
  const arquivo = el("input", { type: "file", accept: ".csv,.txt,.md,.xlsx", "aria-label": "Arquivo da base" });
  const enviar = el("button", { class: "btn btn-primario", type: "button" }, "Carregar base");
  const resultado = el("div");
  const revisoes = el("div");
  area.append(
    el("p", { class: "instrucao", text: "A base inicial relaciona MUNICIPIO e CONTA CONTRATO. Ela só acrescenta vínculos que ainda não existem: nunca sobrescreve ajustes feitos no sistema e pode ser carregada novamente com segurança. Complementos grudados ao nome (ex.: \"FLORIANO Fundo Prev 3001205268\") são descartados." }),
    el("div", { class: "caixa-form" },
      el("h3", { text: "Enviar o arquivo da base" }),
      el("p", { class: "nota", text: "Use o arquivo dados_privados/dicionario_inicial.csv que acompanha o projeto (ele fica no seu computador e não vai para o site público). Também aceita CSV (; ou ,), tabela Markdown, texto separado por TAB ou XLSX com as colunas MUNICIPIO e CONTA CONTRATO." }),
      el("div", { class: "linha-controles" }, arquivo, enviar)),
    resultado, revisoes,
  );
  const executar = async (botao, fd) => {
    botao.disabled = true; const t = botao.textContent; botao.textContent = "Carregando...";
    try {
      const r = await api("POST", "/api/admin/base-inicial", fd, { formulario: true });
      limpar(resultado).append(el("div", { class: "faixa-sucesso" }, el("strong", { text: "Base carregada." })),
        el("ul", { class: "lista-resultado" },
          el("li", { text: `Linhas lidas: ${r.linhas_lidas}` }), el("li", { text: `Vínculos novos: ${r.inseridos}` }),
          el("li", { text: `Já existentes (iguais): ${r.ja_existentes}` }), el("li", { text: `Duplicadas consolidadas: ${r.duplicadas_consolidadas}` }),
          el("li", { text: `Municípios criados: ${r.municipios_criados}` }), el("li", { text: `Faturas pendentes resolvidas: ${r.faturas_resolvidas}` }),
          el("li", { text: `Divergentes (vínculo atual mantido, enviado para revisão): ${r.divergentes_mantidos}` }),
          el("li", { text: `Conflitos internos da base (enviados para revisão): ${r.conflitos_internos}` }),
          el("li", { text: `Linhas inválidas: ${r.invalidas.length}` })),
        r.invalidas.length ? el("ul", { class: "pequeno" }, ...r.invalidas.slice(0, 50).map((i) => el("li", { text: `Linha ${i.linha}: "${i.valor}" — ${i.motivo}` }))) : null);
      toast("Base inicial carregada.", "sucesso");
      carregarRevisoes();
    } catch (e) { limpar(resultado).append(el("p", { class: "erro", text: mensagemErro(e) })); }
    botao.disabled = false; botao.textContent = t;
  };
  enviar.addEventListener("click", () => {
    if (!arquivo.files.length) { toast("Escolha o arquivo.", "erro"); return; }
    const fd = new FormData(); fd.append("arquivo", arquivo.files[0]); fd.append("usar_padrao", "0"); executar(enviar, fd);
  });

  async function carregarRevisoes() {
    limpar(revisoes);
    let lista;
    try { lista = (await get("/api/admin/base-inicial/revisoes")).revisoes; }
    catch (e) { revisoes.append(el("p", { class: "erro", text: mensagemErro(e) })); return; }
    revisoes.append(el("h3", { text: `Vínculos para revisão (${lista.length})` }));
    if (!lista.length) { revisoes.append(el("p", { class: "vazio", text: "Nenhum vínculo aguardando revisão." })); return; }
    revisoes.append(el("div", { class: "tabela-caixa tabela-baixa" }, el("table", { class: "tabela tabela-compacta" },
      el("thead", {}, el("tr", {}, ...["Conta", "Município sugerido", "Vínculo atual", "Motivo", ""].map((t) => el("th", { text: t })))),
      el("tbody", {}, ...lista.map((r) => el("tr", {},
        el("td", { class: "ident", text: r.conta }), el("td", { text: r.municipio_nome }), el("td", { text: r.atual_municipio_nome || "—" }),
        el("td", { class: "pequeno", text: r.motivo }),
        el("td", { class: "col-controles" },
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => resolver(r, true) }, "Aplicar sugestão"),
          el("button", { class: "btn btn-pequeno", type: "button", onclick: () => resolver(r, false) }, "Descartar"))))))));
  }
  async function resolver(r, aplicar) {
    try { await post(`/api/admin/base-inicial/revisoes/${r.id}`, { aplicar }); toast(aplicar ? "Vínculo aplicado." : "Sugestão descartada.", "sucesso"); }
    catch (e) { toast(mensagemErro(e), "erro"); }
    carregarRevisoes();
  }
  await carregarRevisoes();
}
