// Contas sem município: associação direta.
import { get, post, qs } from "../api.js";
import { atualizarPendentes } from "../main.js";
import { el, limpar, linhaEstado, mensagemErro, moeda, data, plural, toast } from "../ui.js";
import { carteiraParam, ehAdmin, seletorCarteira } from "./comum.js";

export async function telaSemMunicipio(c, estado) {
  const admin = ehAdmin(estado);
  const tbody = el("tbody");
  const banner = el("div", { class: "faixa-sucesso", hidden: true, role: "status" });
  const N = admin ? 7 : 6;
  c.append(
    el("div", { class: "tela-cabecalho" }, el("h1", { text: "Contas sem município" }),
      !admin ? el("span", { class: "carteira-tag", text: `Carteira ${estado.usuario.carteira_nome}` }) : null),
    el("p", { class: "instrucao", text: "Escolha o município desta conta. O vínculo será utilizado nas próximas importações." }),
    admin ? el("div", { class: "filtros" }, el("label", { class: "filtro" }, el("span", { text: "Carteira" }), seletorCarteira(estado, (v) => { estado.carteiraSel = v; carregar(); }))) : null,
    banner,
    caixaCadastro(),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela-sem-municipio" },
      el("thead", {}, el("tr", {},
        el("th", { class: "col-conta", text: "Conta de contrato" }),
        el("th", { text: "Nome na planilha" }),
        admin ? el("th", { text: "Carteira" }) : null,
        el("th", { class: "col-num", text: "Faturas" }),
        el("th", { class: "col-valor", text: "Total" }),
        el("th", { text: "Município" }),
        el("th", { text: "Ações" }),
      )),
      tbody)),
  );

  function caixaCadastro() {
    const nome = el("input", { type: "text", maxlength: 120, placeholder: "Ex.: NOVA LOCALIDADE", "aria-label": "Nome do município" });
    const botao = el("button", { class: "btn btn-secundario", type: "button" }, "Cadastrar município");
    const msg = el("small", { class: "erro", role: "alert" });
    const enviar = async () => {
      msg.textContent = "";
      if (nome.value.trim().length < 2) { msg.textContent = "Informe o nome do município."; nome.focus(); return; }
      botao.disabled = true; botao.textContent = "Cadastrando...";
      try {
        const r = await post("/api/sem-municipio/municipios", { nome: nome.value, carteira: carteiraParam(estado) });
        mostrarSucesso(r.mensagem);
        toast(r.mensagem, "sucesso");
        nome.value = "";
        await carregar();
      } catch (e) { msg.textContent = mensagemErro(e); }
      botao.disabled = false; botao.textContent = "Cadastrar município";
    };
    botao.addEventListener("click", enviar);
    nome.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); enviar(); } });
    const destino = admin
      ? "Para o administrador, o município fica disponível para a carteira escolhida no filtro acima (com \"Todas as carteiras\", apenas é cadastrado)."
      : `O município fica disponível para a carteira ${estado.usuario.carteira_nome}. Se já existir com o mesmo nome, ele é reaproveitado (sem duplicar).`;
    return el("div", { class: "caixa-form" },
      el("h3", { text: "Cadastrar município" }),
      el("p", { class: "nota", text: destino }),
      el("div", { class: "caixa-cadastro-municipio" }, el("label", { class: "campo" }, el("span", { class: "campo-rotulo", text: "Nome do município" }), nome), botao),
      msg);
  }

  function mostrarSucesso(texto) {
    limpar(banner).append(el("span", { text: texto }), el("button", { class: "btn-fechar", "aria-label": "Fechar aviso", onclick: () => { banner.hidden = true; } }, "×"));
    banner.hidden = false;
  }

  async function carregar() {
    limpar(tbody).append(linhaEstado(N, "Carregando contas pendentes...", "carregando"));
    let d;
    try { d = await get(`/api/sem-municipio${qs({ carteira: carteiraParam(estado) })}`); }
    catch (e) { limpar(tbody).append(linhaEstado(N, mensagemErro(e), "erro", el("button", { class: "btn btn-pequeno", onclick: carregar }, "Tentar novamente"))); return; }
    limpar(tbody);
    if (!d.contas.length) {
      tbody.append(linhaEstado(N, "Nenhuma conta pendente. Todas as faturas desta carteira têm município.", "vazio"));
    }
    for (const conta of d.contas) {
      const opcoes = admin ? d.todos_municipios : conta.municipios_carteira;
      const sel = el("select", { "aria-label": `Município da conta ${conta.conta}` },
        el("option", { value: "", text: opcoes.length ? "Escolha o município..." : "Nenhum município disponível" }),
        ...opcoes.map((m) => el("option", { value: String(m.id), text: m.nome })));
      const botao = el("button", { class: "btn btn-primario btn-pequeno", type: "button", disabled: !opcoes.length }, "Associar");
      const msg = el("small", { class: "erro" });
      botao.addEventListener("click", async () => {
        msg.textContent = "";
        if (!sel.value) { msg.textContent = "Escolha o município."; sel.focus(); return; }
        botao.disabled = true; botao.textContent = "Associando...";
        try {
          const r = await post("/api/sem-municipio/associar", { conta: conta.conta, municipio_id: Number(sel.value) });
          mostrarSucesso(`Conta ${r.conta} associada a ${r.municipio}. ${plural(r.faturas_resolvidas, "fatura atualizada", "faturas atualizadas")}.`);
          toast(`Conta associada a ${r.municipio}.`, "sucesso");
          await carregar();
          atualizarPendentes();
        } catch (e) {
          msg.textContent = mensagemErro(e);
          botao.disabled = false; botao.textContent = "Associar";
        }
      });
      tbody.append(el("tr", {},
        el("td", { class: "col-conta" }, el("span", { class: "ident", text: conta.conta })),
        el("td", { text: conta.nomes.join(" / ") }),
        admin ? el("td", { text: conta.carteira_nome }) : null,
        el("td", { class: "col-num", text: conta.faturas, title: `Vencimentos de ${data(conta.primeiro_vencimento)} a ${data(conta.ultimo_vencimento)}` }),
        el("td", { class: "col-valor", text: moeda(conta.total_centavos) }),
        el("td", {}, sel, !opcoes.length ? el("small", { class: "dica", text: "Nenhum município disponível para esta carteira: cadastre-o acima ou solicite ao administrador." }) : null),
        el("td", {}, botao, msg),
      ));
    }
  }
  await carregar();
}
