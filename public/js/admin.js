let token = sessionStorage.getItem("token");
let categorias = [];
let produtos = [];
let usuarios = [];
let eu = null;

const modalProduto = new bootstrap.Modal(document.getElementById("modal-produto"));
const modalCategoria = new bootstrap.Modal(document.getElementById("modal-categoria"));
const modalUsuario = new bootstrap.Modal(document.getElementById("modal-usuario"));
const modalSenha = new bootstrap.Modal(document.getElementById("modal-senha"));
const modalConfirmar = new bootstrap.Modal(document.getElementById("modal-confirmar"));
const aviso = new bootstrap.Toast(document.getElementById("aviso"), { delay: 3000 });

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

function mostrarAviso(texto, tipo = "success") {
  const el = document.getElementById("aviso");
  el.className = `toast align-items-center border-0 text-white bg-${tipo}`;
  document.getElementById("aviso-texto").textContent = texto;
  aviso.show();
}

// modal do bootstrap no lugar do confirm() porque tem navegador que bloqueia
let resolverConfirmacao = null;
function confirmar(texto, { titulo = "Confirmar", botao = "Confirmar", perigo = false } = {}) {
  document.getElementById("titulo-confirmar").textContent = titulo;
  document.getElementById("texto-confirmar").textContent = texto;
  const btn = document.getElementById("btn-confirmar");
  btn.textContent = botao;
  btn.className = `btn ${perigo ? "btn-danger" : "btn-primary"}`;
  return new Promise((resolver) => {
    resolverConfirmacao = resolver;
    modalConfirmar.show();
  });
}
document.getElementById("form-confirmar").addEventListener("submit", (e) => {
  e.preventDefault();
  const resolver = resolverConfirmacao;
  resolverConfirmacao = null;
  modalConfirmar.hide();
  if (resolver) resolver(true);
});
document.getElementById("modal-confirmar").addEventListener("hidden.bs.modal", () => {
  if (resolverConfirmacao) resolverConfirmacao(false);
  resolverConfirmacao = null;
});

async function api(url, metodo = "GET", corpo) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && url !== "/api/login") {
    sair();
    throw new Error("Sessão expirada. Entre novamente.");
  }
  if (!resposta.ok) throw new Error(dados.erro || "Erro inesperado");
  return dados;
}

function nomeCategoria(id) {
  const c = categorias.find((cat) => cat.id === id);
  return c ? c.nome : "—";
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const erro = document.getElementById("erro-login");
  try {
    const dados = await api("/api/login", "POST", {
      usuario: document.getElementById("login-usuario").value,
      senha: document.getElementById("senha").value
    });
    token = dados.token;
    sessionStorage.setItem("token", token);
    erro.classList.add("d-none");
    await abrirPainel();
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.remove("d-none");
  }
});

function sair() {
  if (token) fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  token = null;
  sessionStorage.removeItem("token");
  document.getElementById("painel").classList.add("d-none");
  document.getElementById("tela-login").classList.remove("d-none");
  document.getElementById("senha").value = "";
}
document.getElementById("btn-sair").addEventListener("click", sair);

async function abrirPainel() {
  document.getElementById("tela-login").classList.add("d-none");
  document.getElementById("painel").classList.remove("d-none");
  eu = await api("/api/eu");
  document.getElementById("nome-logado").textContent = eu.nome;
  await Promise.all([carregarCategorias(), carregarEmpresa(), carregarUsuarios()]);
  await Promise.all([carregarProdutos(), carregarDesign()]);
}

const filtroCategoria = document.getElementById("filtro-categoria");

async function carregarProdutos() {
  produtos = await api("/api/produtos");
  exibirProdutos();
  exibirCategorias(); // atualiza a qtd de produtos de cada categoria
}

function exibirProdutos() {
  const filtro = filtroCategoria.value;
  const lista = filtro ? produtos.filter((p) => p.categoria === filtro) : produtos;
  document.getElementById("total-produtos").textContent = lista.length;

  const el = document.getElementById("lista-produtos");
  if (lista.length === 0) {
    el.innerHTML = '<p class="vazio-admin">Nenhum produto encontrado.</p>';
    return;
  }
  el.innerHTML = lista
    .map((p) => {
      const specs = p.specs || [];
      const ficha = specs.slice(0, 3)
        .map((s) => `<div><dt>${escaparHTML(s.rotulo)}</dt><dd>${escaparHTML(s.valor)}</dd></div>`)
        .join("");
      const extra = specs.length > 3 ? `<span class="meta">+ ${specs.length - 3} característica(s)</span>` : "";
      return `
      <div class="col-12 col-md-6 col-xl-4">
        <article class="cartao">
          <span class="etiqueta">${escaparHTML(nomeCategoria(p.categoria))}</span>
          <h3>${escaparHTML(p.nome)}</h3>
          <p class="desc">${escaparHTML(p.descricao)}</p>
          ${ficha ? `<dl class="mini-ficha">${ficha}</dl>` : ""}
          ${extra}
          <div class="acoes">
            <button class="btn btn-claro btn-sm" data-editar="${p.id}"><i class="bi bi-pencil me-1"></i>Editar</button>
            <button class="btn btn-perigo btn-sm" data-excluir="${p.id}"><i class="bi bi-trash me-1"></i>Excluir</button>
          </div>
        </article>
      </div>`;
    })
    .join("");
}
filtroCategoria.addEventListener("change", exibirProdutos);

// ficha técnica (rótulo + valor)
const editorSpecs = document.getElementById("editor-specs");

function adicionarLinhaSpec(rotulo = "", valor = "") {
  const linha = document.createElement("div");
  linha.className = "linha-spec";
  linha.innerHTML = `
    <input type="text" class="form-control form-control-sm spec-rotulo" maxlength="40" placeholder="Rótulo (ex.: Material)" aria-label="Rótulo">
    <input type="text" class="form-control form-control-sm spec-valor" maxlength="200" placeholder="Valor (ex.: Vinil brilho)" aria-label="Valor">
    <button type="button" class="btn btn-perigo btn-icone" aria-label="Remover característica"><i class="bi bi-x-lg"></i></button>`;
  linha.querySelector(".spec-rotulo").value = rotulo;
  linha.querySelector(".spec-valor").value = valor;
  linha.querySelector("button").addEventListener("click", () => linha.remove());
  editorSpecs.appendChild(linha);
}

function lerSpecs() {
  return [...editorSpecs.querySelectorAll(".linha-spec")]
    .map((l) => ({ rotulo: l.querySelector(".spec-rotulo").value.trim(), valor: l.querySelector(".spec-valor").value.trim() }))
    .filter((s) => s.rotulo || s.valor);
}

document.getElementById("btn-add-spec").addEventListener("click", () => {
  adicionarLinhaSpec();
  editorSpecs.lastElementChild.querySelector("input").focus();
});

function abrirModalProduto(produto) {
  document.getElementById("titulo-modal").textContent = produto ? "Editar produto" : "Novo produto";
  document.getElementById("prod-id").value = produto ? produto.id : "";
  document.getElementById("prod-nome").value = produto ? produto.nome : "";
  document.getElementById("prod-descricao").value = produto ? produto.descricao : "";
  document.getElementById("prod-mensagem").value = produto ? produto.mensagem || "" : "";
  document.getElementById("prod-categoria").value =
    produto ? produto.categoria : filtroCategoria.value || categorias[0]?.id || "";
  editorSpecs.innerHTML = "";
  const specs = produto && produto.specs && produto.specs.length ? produto.specs : [{ rotulo: "", valor: "" }];
  specs.forEach((s) => adicionarLinhaSpec(s.rotulo, s.valor));
  modalProduto.show();
}

document.getElementById("btn-novo-produto").addEventListener("click", () => {
  if (categorias.length === 0) {
    mostrarAviso("Cadastre uma categoria antes de adicionar produtos.", "danger");
    return;
  }
  abrirModalProduto(null);
});

document.getElementById("lista-produtos").addEventListener("click", async (e) => {
  const editar = e.target.closest("[data-editar]");
  const excluir = e.target.closest("[data-excluir]");
  if (editar) abrirModalProduto(produtos.find((p) => p.id === Number(editar.dataset.editar)));
  if (excluir) {
    const produto = produtos.find((p) => p.id === Number(excluir.dataset.excluir));
    const ok = await confirmar(`Excluir "${produto.nome}"? Essa ação não pode ser desfeita.`, {
      titulo: "Excluir produto", botao: "Excluir", perigo: true
    });
    if (!ok) return;
    try {
      await api(`/api/produtos/${produto.id}`, "DELETE");
      mostrarAviso("Produto excluído.");
      carregarProdutos();
    } catch (err) {
      mostrarAviso(err.message, "danger");
    }
  }
});

document.getElementById("form-produto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("prod-id").value;
  const corpo = {
    nome: document.getElementById("prod-nome").value,
    categoria: document.getElementById("prod-categoria").value,
    descricao: document.getElementById("prod-descricao").value,
    specs: lerSpecs(),
    mensagem: document.getElementById("prod-mensagem").value
  };
  try {
    if (id) {
      await api(`/api/produtos/${id}`, "PUT", corpo);
      mostrarAviso("Produto atualizado.");
    } else {
      await api("/api/produtos", "POST", corpo);
      mostrarAviso("Produto criado.");
    }
    modalProduto.hide();
    carregarProdutos();
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

async function carregarCategorias() {
  categorias = await api("/api/categorias");
  const opcoes = categorias.map((c) => `<option value="${escaparHTML(c.id)}">${escaparHTML(c.nome)}</option>`).join("");
  document.getElementById("prod-categoria").innerHTML = opcoes;
  const filtroAtual = filtroCategoria.value;
  filtroCategoria.innerHTML = '<option value="">Todas as categorias</option>' + opcoes;
  if (categorias.some((c) => c.id === filtroAtual)) filtroCategoria.value = filtroAtual;
  exibirCategorias();
}

function exibirCategorias() {
  const el = document.getElementById("lista-categorias");
  if (categorias.length === 0) {
    el.innerHTML = '<p class="vazio-admin">Nenhuma categoria cadastrada ainda.</p>';
    return;
  }
  el.innerHTML = categorias
    .map((c, i) => {
      const qtd = produtos.filter((p) => p.categoria === c.id).length;
      const id = escaparHTML(c.id);
      return `
      <div class="col-12 col-md-6 col-xl-4">
        <article class="cartao">
          <span class="etiqueta verde">${String(i + 1).padStart(2, "0")} · ${escaparHTML(c.nome)}</span>
          <h3>${escaparHTML(c.nome)}</h3>
          <p class="desc">${escaparHTML(c.descricao || "Sem descrição")}</p>
          <span class="meta">${qtd} produto${qtd === 1 ? "" : "s"}</span>
          <div class="acoes">
            <button class="btn btn-claro btn-sm btn-icone" data-subir="${id}" aria-label="Mover ${escaparHTML(c.nome)} para cima" ${i === 0 ? "disabled" : ""}><i class="bi bi-arrow-up"></i></button>
            <button class="btn btn-claro btn-sm btn-icone" data-descer="${id}" aria-label="Mover ${escaparHTML(c.nome)} para baixo" ${i === categorias.length - 1 ? "disabled" : ""}><i class="bi bi-arrow-down"></i></button>
            <button class="btn btn-claro btn-sm" data-editar-cat="${id}"><i class="bi bi-pencil me-1"></i>Editar</button>
            <button class="btn btn-perigo btn-sm" data-excluir-cat="${id}"><i class="bi bi-trash me-1"></i>Excluir</button>
          </div>
        </article>
      </div>`;
    })
    .join("");
}

function abrirModalCategoria(categoria) {
  document.getElementById("titulo-modal-categoria").textContent = categoria ? "Editar categoria" : "Nova categoria";
  document.getElementById("cat-id").value = categoria ? categoria.id : "";
  document.getElementById("cat-nome").value = categoria ? categoria.nome : "";
  document.getElementById("cat-descricao").value = categoria ? categoria.descricao || "" : "";
  modalCategoria.show();
}
document.getElementById("btn-nova-categoria").addEventListener("click", () => abrirModalCategoria(null));

document.getElementById("form-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cat-id").value;
  const corpo = {
    nome: document.getElementById("cat-nome").value,
    descricao: document.getElementById("cat-descricao").value
  };
  try {
    if (id) {
      await api(`/api/categorias/${id}`, "PUT", corpo);
      mostrarAviso("Categoria atualizada.");
    } else {
      await api("/api/categorias", "POST", corpo);
      mostrarAviso("Categoria criada.");
    }
    modalCategoria.hide();
    await carregarCategorias();
    exibirProdutos();
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

document.getElementById("lista-categorias").addEventListener("click", async (e) => {
  const subir = e.target.closest("[data-subir]");
  const descer = e.target.closest("[data-descer]");
  const editar = e.target.closest("[data-editar-cat]");
  const excluir = e.target.closest("[data-excluir-cat]");
  try {
    if (subir || descer) {
      const id = subir ? subir.dataset.subir : descer.dataset.descer;
      await api(`/api/categorias/${id}/posicao`, "PUT", { direcao: subir ? -1 : 1 });
      await carregarCategorias();
    }
    if (editar) abrirModalCategoria(categorias.find((c) => c.id === editar.dataset.editarCat));
    if (excluir) {
      const ok = await confirmar(`Excluir a categoria "${nomeCategoria(excluir.dataset.excluirCat)}"?`, {
        titulo: "Excluir categoria", botao: "Excluir", perigo: true
      });
      if (!ok) return;
      await api(`/api/categorias/${excluir.dataset.excluirCat}`, "DELETE");
      mostrarAviso("Categoria excluída.");
      carregarCategorias();
    }
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

const CAMPOS_EMPRESA = ["nome", "titulo", "destaque", "slogan", "sobre", "whatsapp", "endereco", "horario"];

async function carregarEmpresa() {
  const empresa = await api("/api/empresa");
  CAMPOS_EMPRESA.forEach((campo) => (document.getElementById(`emp-${campo}`).value = empresa[campo] || ""));
  atualizarTextosPrevia();
}

document.getElementById("form-empresa").addEventListener("input", atualizarTextosPrevia);

document.getElementById("form-empresa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const corpo = {};
  CAMPOS_EMPRESA.forEach((campo) => (corpo[campo] = document.getElementById(`emp-${campo}`).value));
  try {
    await api("/api/empresa", "PUT", corpo);
    mostrarAviso("Textos e contato salvos.");
    carregarEmpresa();
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

const CAMPOS_TEMA = ["corPrimaria", "corDestaque", "corFundo", "corTexto"];
const previa = document.getElementById("previa");

function atualizarTextosPrevia() {
  const valor = (campo) => document.getElementById(`emp-${campo}`).value;
  document.getElementById("previa-titulo").textContent = valor("titulo") || valor("nome");
  document.getElementById("previa-destaque").textContent = valor("destaque");
}

function lerFormularioTema() {
  const tema = {};
  CAMPOS_TEMA.forEach((campo) => (tema[campo] = document.getElementById(`tema-${campo}`).value));
  return tema;
}

function preencherFormularioTema(tema) {
  CAMPOS_TEMA.forEach((campo) => (document.getElementById(`tema-${campo}`).value = tema[campo]));
  aplicarTema(lerFormularioTema(), previa);
}

async function carregarDesign() {
  preencherFormularioTema(await api("/api/tema"));
}

document.getElementById("form-design").addEventListener("input", () => aplicarTema(lerFormularioTema(), previa));

document.getElementById("form-design").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/tema", "PUT", lerFormularioTema());
    mostrarAviso("Design salvo. Atualize o site para ver.");
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

document.getElementById("btn-restaurar-tema").addEventListener("click", async () => {
  const ok = await confirmar("Voltar às cores originais da Imprimifácil? As cores atuais serão substituídas.", {
    titulo: "Restaurar identidade original", botao: "Restaurar"
  });
  if (!ok) return;
  try {
    preencherFormularioTema(await api("/api/tema/restaurar", "POST"));
    mostrarAviso("Identidade original restaurada.");
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

async function carregarUsuarios() {
  usuarios = await api("/api/usuarios");
  document.getElementById("tabela-usuarios").innerHTML = usuarios
    .map((u) => {
      const souEu = u.id === eu.id;
      return `
      <tr>
        <td class="fw-semibold">${escaparHTML(u.nome)}${souEu ? ' <span class="contador">você</span>' : ""}</td>
        <td>${escaparHTML(u.usuario)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-claro btn-sm btn-icone" data-editar-usr="${u.id}" aria-label="Editar ${escaparHTML(u.nome)}" title="Editar"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-perigo btn-sm btn-icone" data-excluir-usr="${u.id}" aria-label="Excluir ${escaparHTML(u.nome)}" title="Excluir" ${souEu ? "disabled" : ""}><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");
}

function abrirModalUsuario(usuario) {
  document.getElementById("titulo-modal-usuario").textContent = usuario ? "Editar usuário" : "Novo usuário";
  document.getElementById("usr-id").value = usuario ? usuario.id : "";
  document.getElementById("usr-nome").value = usuario ? usuario.nome : "";
  document.getElementById("usr-usuario").value = usuario ? usuario.usuario : "";
  document.getElementById("usr-senha").value = "";
  // senha só aparece ao criar, depois cada um troca a sua em "Minha conta"
  document.getElementById("grupo-usr-senha").classList.toggle("d-none", !!usuario);
  document.getElementById("usr-senha").required = !usuario;
  modalUsuario.show();
}

function abrirModalSenha() {
  ["senha-atual", "senha-nova", "senha-confirmar"].forEach((id) => (document.getElementById(id).value = ""));
  modalSenha.show();
}

document.getElementById("btn-novo-usuario").addEventListener("click", () => abrirModalUsuario(null));
document.getElementById("btn-minha-conta").addEventListener("click", abrirModalSenha);

document.getElementById("tabela-usuarios").addEventListener("click", async (e) => {
  const editar = e.target.closest("[data-editar-usr]");
  const excluir = e.target.closest("[data-excluir-usr]");
  const acharUsuario = (id) => usuarios.find((u) => u.id === Number(id));

  if (editar) abrirModalUsuario(acharUsuario(editar.dataset.editarUsr));
  if (excluir) {
    const usuario = acharUsuario(excluir.dataset.excluirUsr);
    const ok = await confirmar(`Excluir o usuário "${usuario.nome}"? A pessoa perderá o acesso ao painel.`, {
      titulo: "Excluir usuário", botao: "Excluir", perigo: true
    });
    if (!ok) return;
    try {
      await api(`/api/usuarios/${usuario.id}`, "DELETE");
      mostrarAviso("Usuário excluído.");
      carregarUsuarios();
    } catch (err) {
      mostrarAviso(err.message, "danger");
    }
  }
});

document.getElementById("form-usuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("usr-id").value;
  const corpo = {
    nome: document.getElementById("usr-nome").value,
    usuario: document.getElementById("usr-usuario").value
  };
  try {
    if (id) {
      await api(`/api/usuarios/${id}`, "PUT", corpo);
      mostrarAviso("Usuário atualizado.");
    } else {
      corpo.senha = document.getElementById("usr-senha").value;
      await api("/api/usuarios", "POST", corpo);
      mostrarAviso("Usuário criado.");
    }
    modalUsuario.hide();
    eu = await api("/api/eu");
    document.getElementById("nome-logado").textContent = eu.nome;
    carregarUsuarios();
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

document.getElementById("form-senha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const novaSenha = document.getElementById("senha-nova").value;
  if (novaSenha !== document.getElementById("senha-confirmar").value) {
    mostrarAviso("As senhas não conferem.", "danger");
    return;
  }
  try {
    await api("/api/eu/senha", "PUT", { senhaAtual: document.getElementById("senha-atual").value, novaSenha });
    mostrarAviso("Sua senha foi alterada.");
    modalSenha.hide();
  } catch (err) {
    mostrarAviso(err.message, "danger");
  }
});

if (token) {
  abrirPainel().catch(() => sair());
}
