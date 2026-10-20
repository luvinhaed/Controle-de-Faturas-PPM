// Diálogo "Exportar carteira": gera um .xlsx com uma aba por município.
import { exportarCarteira } from "../api.js";
import { abrirModal, el, toast } from "../ui.js";
import { ehAdmin, seletorCarteira } from "./comum.js";

export function abrirExportacao(estado) {
  const admin = ehAdmin(estado);
  const carteira = admin ? seletorCarteira(estado, null, { permitirTodas: false, valor: estado.carteiraSel || String(estado.carteiras[0].id) }) : null;
  const todo = el("input", { type: "radio", name: "periodo", value: "todo", checked: true });
  const intervalo = el("input", { type: "radio", name: "periodo", value: "intervalo" });
  const de = el("input", { type: "month", "aria-label": "Mês inicial", placeholder: "aaaa-mm", disabled: true });
  const ate = el("input", { type: "month", "aria-label": "Mês final", placeholder: "aaaa-mm", disabled: true });
  const pagas = el("input", { type: "checkbox", checked: true });
  const erro = el("p", { class: "erro", role: "alert" });
  const alternar = () => { de.disabled = ate.disabled = !intervalo.checked; if (intervalo.checked) de.focus(); };
  todo.addEventListener("change", alternar); intervalo.addEventListener("change", alternar);

  const gerar = el("button", { class: "btn btn-primario", type: "button" }, "Gerar Excel");
  const cancelar = el("button", { class: "btn", type: "button" }, "Cancelar");
  const conteudo = el("div", { class: "form-exportar" },
    el("p", { text: "Gera um único arquivo Excel com uma aba por município de toda a carteira (contas sem município ficam na aba \"Não identificado\"). Faturas arquivadas não entram." }),
    admin ? el("label", { class: "campo" }, el("span", { class: "campo-rotulo", text: "Carteira" }), carteira) : el("p", {}, "Carteira: ", el("strong", { text: estado.usuario.carteira_nome })),
    el("fieldset", { class: "campo" },
      el("legend", { class: "campo-rotulo", text: "Período por vencimento" }),
      el("label", { class: "opcao" }, todo, " Todo o histórico"),
      el("label", { class: "opcao" }, intervalo, " Intervalo de meses: de ", de, " até ", ate),
    ),
    el("label", { class: "opcao" }, pagas, " Incluir pagas"),
    erro,
  );
  const m = abrirModal({ titulo: "Exportar carteira", conteudo, botoes: [cancelar, gerar], largura: "media" });
  cancelar.addEventListener("click", m.fechar);

  gerar.addEventListener("click", async () => {
    erro.textContent = "";
    const valido = (v) => /^\d{4}-\d{2}$/.test(v);
    if (intervalo.checked) {
      if ((de.value && !valido(de.value)) || (ate.value && !valido(ate.value))) { erro.textContent = "Informe os meses no formato aaaa-mm."; return; }
      if (!de.value && !ate.value) { erro.textContent = "Informe ao menos um dos meses ou escolha Todo o histórico."; return; }
      if (de.value && ate.value && de.value > ate.value) { erro.textContent = "O mês inicial é posterior ao mês final."; return; }
    }
    gerar.disabled = true; gerar.textContent = "Gerando...";
    try {
      const nome = await exportarCarteira({
        carteira: admin ? carteira.value : "",
        de: intervalo.checked ? de.value : "", ate: intervalo.checked ? ate.value : "",
        incluirPagas: pagas.checked,
      });
      toast(`Arquivo ${nome} gerado.`, "sucesso");
      m.fechar();
    } catch (e) {
      erro.textContent = e.message || "Não foi possível gerar o arquivo.";
    } finally { gerar.disabled = false; gerar.textContent = "Gerar Excel"; }
  });
}
