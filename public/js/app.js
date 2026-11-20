let empresa = {};
let categorias = [];

const catalogo = document.getElementById("catalogo");
const campoBusca = document.getElementById("busca");

// escapa o texto pra ninguém injetar html (xss)
function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

function linkWhatsApp(texto) {
  return `https://wa.me/${empresa.whatsapp}?text=${encodeURIComponent(texto)}`;
}

function numeroCategoria(i) {
  return String(i + 1).padStart(2, "0");
}

async function carregarEmpresa() {
  empresa = await (await fetch("/api/empresa")).json();

  document.title = `${empresa.nome} — Catálogo Digital`;
  document.querySelectorAll(".nome-empresa").forEach((el) => (el.textContent = empresa.nome));
  document.querySelectorAll(".logo img, .rodape-marca img").forEach((img) => (img.alt = empresa.nome));
  document.getElementById("titulo").textContent = empresa.titulo || empresa.nome;
  document.getElementById("destaque").textContent = empresa.destaque || "";
  document.getElementById("slogan").textContent = empresa.slogan || "";
  document.getElementById("sobre").textContent = empresa.sobre || "";
  document.getElementById("endereco").textContent = empresa.endereco || "";
  document.getElementById("horario").textContent = empresa.horario || "";

  const msgGeral = "Olá! Vi o catálogo e quero fazer um orçamento.";
  document.querySelectorAll(".link-whatsapp").forEach((a) => (a.href = linkWhatsApp(msgGeral)));
}

async function carregarCategorias() {
  categorias = await (await fetch("/api/categorias")).json();

  const links = categorias
    .map((c) => `<a href="#cat-${escaparHTML(c.id)}">${escaparHTML(c.nome)}</a>`)
    .join("");
  const menu = document.getElementById("menu-categorias");
  menu.querySelectorAll("a:not(.menu-whatsapp)").forEach((a) => a.remove());
  menu.insertAdjacentHTML("afterbegin", links);
  document.getElementById("rodape-categorias").innerHTML = links;
}

async function carregarProdutos() {
  const termo = campoBusca.value.trim();
  const parametros = new URLSearchParams();
  if (termo) parametros.set("busca", termo);

  try {
    const resposta = await fetch(`/api/produtos?${parametros}`);
    const produtos = await resposta.json();
    exibirCatalogo(produtos, termo);
  } catch (erro) {
    catalogo.innerHTML = '<p class="vazio">Não foi possível carregar o catálogo. Tente novamente mais tarde.</p>';
  }
}

function cardProduto(p) {
  const ficha = (p.specs || [])
    .map((s) => `<div class="linha"><dt>${escaparHTML(s.rotulo)}</dt><dd>${escaparHTML(s.valor)}</dd></div>`)
    .join("");
  const mensagem = p.mensagem || `Quero orçar ${p.nome}`;
  return `
    <div class="col-12 col-md-6 col-lg-4">
      <article class="produto">
        <h3>${escaparHTML(p.nome)}</h3>
        <p class="desc">${escaparHTML(p.descricao)}</p>
        ${ficha ? `<dl class="ficha">${ficha}</dl>` : ""}
        <a class="produto-cta" href="${linkWhatsApp(mensagem)}" target="_blank" rel="noopener"
           aria-label="Pedir orçamento de ${escaparHTML(p.nome)} pelo WhatsApp">
          <i class="bi bi-whatsapp" aria-hidden="true"></i>Pedir orçamento
        </a>
      </article>
    </div>`;
}

function exibirCatalogo(produtos, termo) {
  const secoes = categorias
    .map((c, i) => {
      const daCategoria = produtos.filter((p) => p.categoria === c.id);
      if (termo && daCategoria.length === 0) return "";
      return `
      <section class="categoria container" id="cat-${escaparHTML(c.id)}" aria-labelledby="titulo-${escaparHTML(c.id)}">
        <div class="categoria-head">
          <span class="categoria-tag">${numeroCategoria(i)} · ${escaparHTML(c.nome)}</span>
          <h2 id="titulo-${escaparHTML(c.id)}">${escaparHTML(c.nome)}</h2>
          ${c.descricao ? `<p class="categoria-desc">${escaparHTML(c.descricao)}</p>` : ""}
        </div>
        <div class="row g-4">
          ${daCategoria.map(cardProduto).join("") || '<p class="text-muted">Nenhum produto cadastrado nessa categoria ainda.</p>'}
        </div>
      </section>`;
    })
    .join("");

  catalogo.innerHTML = termo && !produtos.length
    ? '<p class="vazio">Nenhum produto encontrado. Tente outra palavra ou fale com a gente no WhatsApp.</p>'
    : secoes;
}

// espera parar de digitar pra não chamar a api a cada letra
let temporizador;
campoBusca.addEventListener("input", () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(carregarProdutos, 300);
});

document.getElementById("form-busca").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearTimeout(temporizador);
  await carregarProdutos();
  catalogo.scrollIntoView({ behavior: "smooth" });
});

// menu do celular
(() => {
  const topo = document.getElementById("topo");
  const botao = topo.querySelector(".menu-toggle");
  const menu = document.getElementById("menu-categorias");

  const fechar = () => {
    botao.setAttribute("aria-expanded", "false");
    botao.classList.remove("ativo");
    topo.classList.remove("menu-aberto");
  };

  botao.addEventListener("click", () => {
    const aberto = botao.getAttribute("aria-expanded") === "true";
    botao.setAttribute("aria-expanded", String(!aberto));
    botao.classList.toggle("ativo", !aberto);
    topo.classList.toggle("menu-aberto", !aberto);
  });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) fechar(); });
  document.addEventListener("click", (e) => { if (!topo.contains(e.target)) fechar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  window.addEventListener("resize", () => { if (window.innerWidth >= 992) fechar(); });
})();

document.getElementById("ano").textContent = new Date().getFullYear();

async function iniciar() {
  carregarTema();
  try {
    await Promise.all([carregarEmpresa(), carregarCategorias()]);
    await carregarProdutos();
  } catch (erro) {
    catalogo.innerHTML = '<p class="vazio">Erro ao conectar com o servidor.</p>';
  }
}

iniciar();
