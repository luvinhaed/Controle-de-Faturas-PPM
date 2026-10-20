// Painel lateral "Particularidades de [MUNICÍPIO]".
// Conteúdo tratado SEMPRE como texto puro (nunca HTML/script).
import { get, put } from "../api.js";
import { icone } from "../icones.js";
import { confirmar, dataHora, el, limpar, mensagemErro, toast } from "../ui.js";

let contador = 0;
const novoId = (p) => `${p}${Date.now().toString(36)}${(contador++).toString(36)}`;

// Interpreta o texto copiado do Excel (TAB entre colunas, quebra de linha
// entre linhas, células com quebra de linha entre aspas).
export function lerTabelaColada(texto) {
  const linhas = [];
  let linha = [], celula = "", i = 0, aspas = false;
  texto = texto.replace(/\r\n?/g, "\n");
  while (i < texto.length) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celula += '"'; i += 2; continue; }
        aspas = false; i++; continue;
      }
      celula += ch; i++; continue;
    }
    if (ch === '"' && celula === "") { aspas = true; i++; continue; }
    if (ch === "\t") { linha.push(celula); celula = ""; i++; continue; }
    if (ch === "\n") { linha.push(celula); linhas.push(linha); linha = []; celula = ""; i++; continue; }
    celula += ch; i++;
  }
  if (celula !== "" || linha.length) { linha.push(celula); linhas.push(linha); }
  while (linhas.length && linhas[linhas.length - 1].every((c) => c.trim() === "")) linhas.pop();
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  return linhas.map((l) => l.concat(Array(largura - l.length).fill("")));
}

export async function abrirParticularidades(municipio, estado) {
  document.querySelectorAll(".painel-fundo").forEach((p) => p.remove());
  const corpo = el("div", { class: "painel-corpo" }, el("p", { class: "carregando", text: "Carregando particularidades..." }));
  const info = el("small", { class: "painel-info" });
  const salvar = el("button", { class: "btn btn-primario", type: "button", disabled: true }, "Salvar");
  const fecharBtn = el("button", { class: "btn", type: "button" }, "Fechar");
  const painel = el("aside", { class: "painel", role: "dialog", "aria-label": `Particularidades de ${municipio.nome}` },
    el("div", { class: "painel-topo" },
      el("h2", { text: `Particularidades de ${municipio.nome}` }),
      el("button", { class: "btn-fechar", title: "Fechar", "aria-label": "Fechar", onclick: () => fechar() }, "×")),
    corpo,
    el("div", { class: "painel-rodape" }, info, fecharBtn, salvar),
  );
  const fundo = el("div", { class: "painel-fundo" }, painel);
  document.body.append(fundo);

  let dados = null;
  let conteudo = { anotacoes: [], tabelas: [] };
  let alterado = false;
  const marcarAlterado = () => { alterado = true; salvar.disabled = false; info.textContent = "Alterações não salvas."; info.classList.add("pendente"); };

  async function fechar(forcar = false) {
    if (alterado && !forcar) {
      const ok = await confirmar("Descartar alterações?", "Há alterações não salvas nas particularidades. Fechar mesmo assim?", { textoOk: "Descartar e fechar", perigo: true });
      if (!ok) return;
    }
    fundo.remove();
    document.removeEventListener("keydown", teclas);
  }
  const teclas = (ev) => { if (ev.key === "Escape" && !document.querySelector(".modal-fundo")) fechar(); };
  document.addEventListener("keydown", teclas);
  fecharBtn.addEventListener("click", () => fechar());
  fundo.addEventListener("mousedown", (ev) => { if (ev.target === fundo) fechar(); });

  async function carregar() {
    try {
      dados = await get(`/api/particularidades/${municipio.id}`);
    } catch (e) {
      limpar(corpo).append(el("p", { class: "erro", text: mensagemErro(e) }), el("button", { class: "btn", onclick: carregar }, "Tentar novamente"));
      return;
    }
    conteudo = JSON.parse(JSON.stringify(dados.conteudo));
    alterado = false; salvar.disabled = true; info.classList.remove("pendente");
    info.textContent = dados.atualizado_em ? `Última alteração: ${dados.atualizado_por} em ${dataHora(dados.atualizado_em)}` : "Ainda sem particularidades salvas.";
    desenhar();
  }

  function autoAltura(t) { t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight + 2, 400)}px`; }

  function desenhar() {
    limpar(corpo);
    if (dados.carteiras && dados.carteiras.length > 1) {
      corpo.append(el("p", { class: "nota", text: `Compartilhado entre as carteiras: ${dados.carteiras.join(", ")}.` }));
    }
    // ---------------- anotações
    const lista = el("ul", { class: "anotacoes" });
    conteudo.anotacoes.forEach((a, i) => {
      const t = el("textarea", { rows: 1, "aria-label": `Anotação ${i + 1}`, maxlength: 4000 });
      t.value = a.texto;
      t.addEventListener("input", () => { a.texto = t.value; autoAltura(t); marcarAlterado(); });
      setTimeout(() => autoAltura(t), 0);
      lista.append(el("li", {}, el("span", { class: "marcador-topico", "aria-hidden": "true", text: "•" }), t,
        el("button", { class: "btn-icone", type: "button", title: "Excluir anotação", "aria-label": "Excluir anotação",
          onclick: () => { conteudo.anotacoes.splice(i, 1); marcarAlterado(); desenhar(); } }, icone("lixo"))));
    });
    if (!conteudo.anotacoes.length) lista.append(el("li", { class: "vazio", text: "Nenhuma anotação." }));
    corpo.append(
      el("h3", { text: "Anotações" }), lista,
      el("button", { class: "btn btn-secundario btn-pequeno", type: "button", onclick: () => {
        conteudo.anotacoes.push({ id: novoId("a"), texto: "" }); marcarAlterado(); desenhar();
        const ts = corpo.querySelectorAll(".anotacoes textarea"); if (ts.length) ts[ts.length - 1].focus();
      } }, icone("mais"), "Adicionar anotação"),
    );
    // ---------------- tabelas
    corpo.append(el("h3", { text: "Tabelas" }));
    if (!conteudo.tabelas.length) corpo.append(el("p", { class: "vazio", text: "Nenhuma tabela. Crie uma tabela ou cole do Excel." }));
    conteudo.tabelas.forEach((tab, ti) => corpo.append(desenharTabela(tab, ti)));
    const colar = el("div", { class: "area-colar", hidden: true });
    corpo.append(
      el("div", { class: "botoes-tabela" },
        el("button", { class: "btn btn-secundario btn-pequeno", type: "button", onclick: () => {
          conteudo.tabelas.push({ id: novoId("t"), titulo: "", linhas: [["Coluna 1", "Coluna 2"], ["", ""]] }); marcarAlterado(); desenhar();
        } }, icone("mais"), "Nova tabela"),
        el("button", { class: "btn btn-secundario btn-pequeno", type: "button", onclick: () => { colar.hidden = !colar.hidden; if (!colar.hidden) colar.querySelector("textarea").focus(); } }, icone("colar"), "Colar tabela do Excel"),
      ),
      colar,
    );
    const areaTexto = el("textarea", { rows: 5, placeholder: "Copie as células no Excel (Ctrl+C) e cole aqui (Ctrl+V). A primeira linha será o cabeçalho.", "aria-label": "Colar tabela do Excel" });
    const titulo = el("input", { type: "text", placeholder: "Título da tabela (opcional)", maxlength: 200 });
    colar.append(titulo, areaTexto, el("div", { class: "obs-botoes" },
      el("button", { class: "btn btn-pequeno", type: "button", onclick: () => { colar.hidden = true; areaTexto.value = ""; } }, "Cancelar"),
      el("button", { class: "btn btn-primario btn-pequeno", type: "button", onclick: () => {
        const linhas = lerTabelaColada(areaTexto.value);
        if (!linhas.length || !linhas[0].length) { toast("Nada para colar. Copie as células no Excel e cole na caixa.", "erro"); return; }
        if (linhas.length > 1000 || linhas[0].length > 40) { toast("Tabela grande demais (máximo 1000 linhas e 40 colunas).", "erro"); return; }
        conteudo.tabelas.push({ id: novoId("t"), titulo: titulo.value.trim(), linhas });
        marcarAlterado(); desenhar();
        toast(`Tabela colada: ${linhas.length} linha(s) e ${linhas[0].length} coluna(s). Clique em Salvar para gravar.`, "sucesso");
      } }, "Criar tabela"),
    ));
  }

  function desenharTabela(tab, ti) {
    const largura = tab.linhas[0] ? tab.linhas[0].length : 0;
    const titulo = el("input", { type: "text", class: "tabela-titulo", placeholder: "Título da tabela (opcional)", value: tab.titulo, maxlength: 200, "aria-label": "Título da tabela" });
    titulo.addEventListener("input", () => { tab.titulo = titulo.value; marcarAlterado(); });
    const tabela = el("table", { class: "tabela-livre" });
    const controlesCol = el("tr", { class: "controles-colunas" });
    for (let c = 0; c < largura; c++) {
      controlesCol.append(el("th", {}, el("button", { class: "btn-mini", type: "button", title: "Remover coluna", "aria-label": `Remover coluna ${c + 1}`,
        onclick: () => { if (largura <= 1) return; tab.linhas.forEach((l) => l.splice(c, 1)); marcarAlterado(); desenhar(); } }, "×")));
    }
    controlesCol.append(el("th"));
    tabela.append(el("thead", {}, controlesCol));
    const tb = el("tbody");
    tab.linhas.forEach((linha, li) => {
      const tr = el("tr", { class: li === 0 ? "cabecalho-livre" : "" });
      linha.forEach((valor, ci) => {
        const t = el("textarea", { rows: 1, "aria-label": `Linha ${li + 1}, coluna ${ci + 1}` });
        t.value = valor;
        t.addEventListener("input", () => { linha[ci] = t.value; autoAltura(t); marcarAlterado(); });
        setTimeout(() => autoAltura(t), 0);
        tr.append(el(li === 0 ? "th" : "td", {}, t));
      });
      tr.append(el("td", { class: "col-remover" }, li === 0 ? null : el("button", { class: "btn-mini", type: "button", title: "Remover linha", "aria-label": `Remover linha ${li + 1}`,
        onclick: () => { tab.linhas.splice(li, 1); marcarAlterado(); desenhar(); } }, "×")));
      tb.append(tr);
    });
    tabela.append(tb);
    return el("div", { class: "bloco-tabela" },
      el("div", { class: "bloco-tabela-topo" }, titulo,
        el("button", { class: "btn-icone", type: "button", title: "Excluir tabela", "aria-label": "Excluir tabela", onclick: async () => {
          if (await confirmar("Excluir tabela", "Excluir esta tabela das particularidades? (A exclusão só é gravada ao clicar em Salvar.)", { textoOk: "Excluir", perigo: true })) {
            conteudo.tabelas.splice(ti, 1); marcarAlterado(); desenhar();
          }
        } }, icone("lixo"))),
      el("div", { class: "tabela-livre-caixa" }, tabela),
      el("div", { class: "botoes-tabela" },
        el("button", { class: "btn btn-pequeno", type: "button", onclick: () => { tab.linhas.push(Array(largura).fill("")); marcarAlterado(); desenhar(); } }, icone("mais"), "Linha"),
        el("button", { class: "btn btn-pequeno", type: "button", onclick: () => {
          if (largura >= 40) return toast("Máximo de 40 colunas.", "erro");
          tab.linhas.forEach((l, i) => l.push(i === 0 ? `Coluna ${largura + 1}` : "")); marcarAlterado(); desenhar();
        } }, icone("mais"), "Coluna"),
      ),
    );
  }

  salvar.addEventListener("click", async () => {
    const ok = await confirmar("Salvar particularidades", `Salvar as particularidades de ${municipio.nome}? Elas valem para todas as faturas deste município.`, { textoOk: "Salvar" });
    if (!ok) return;
    salvar.disabled = true; salvar.textContent = "Salvando...";
    try {
      dados = await put(`/api/particularidades/${municipio.id}`, { conteudo, versao: dados.versao });
      conteudo = JSON.parse(JSON.stringify(dados.conteudo));
      alterado = false; info.classList.remove("pendente");
      info.textContent = `Salvo por ${dados.atualizado_por} em ${dataHora(dados.atualizado_em)}`;
      toast("Particularidades salvas.", "sucesso");
      desenhar();
    } catch (e) {
      salvar.disabled = false;
      if (e.status === 409) {
        salvar.textContent = "Salvar";
        const recarregar = await confirmar("Particularidades alteradas por outro acesso", [
          el("p", { text: mensagemErro(e) }),
          el("p", { text: "Recarregar agora mostra a versão atual e descarta as suas alterações não salvas. Se preferir, copie seus textos antes e clique em Cancelar." }),
        ], { textoOk: "Recarregar versão atual" });
        if (recarregar) await carregar();
      } else toast(mensagemErro(e), "erro", 9000);
    } finally { salvar.textContent = "Salvar"; }
  });

  await carregar();
}
