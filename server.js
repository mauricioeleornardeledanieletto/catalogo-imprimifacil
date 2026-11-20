// lê o arquivo .env no computador (na Vercel as variáveis vêm do painel dela)
try { process.loadEnvFile(); } catch {}

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { conectar } = require("./banco");
const { gerarHash, senhaConfere, validarSenha } = require("./senhas");

const app = express();
const PORTA = process.env.PORT || 3000;
const EM_PRODUCAO = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");

// endereço do painel: em produção vem da variável ADMIN_CAMINHO, pra não ficar no código público
const CAMINHO_ADMIN = "/" + (process.env.ADMIN_CAMINHO || "gestao-imprimifacil-7k2p").replace(/^\/+/, "");
const PAGINA_ADMIN = path.join(__dirname, "privado", "admin.html");

const DURACAO_SESSAO = 8 * 60 * 60 * 1000;

const TEMA_PADRAO = {
  corPrimaria: "#4e488e",
  corDestaque: "#9bc21b",
  corFundo: "#fbfaf8",
  corTexto: "#241f3d"
};
const CAMPOS_COR = Object.keys(TEMA_PADRAO);

// na hospedagem todo mundo chega pelo proxy, isso faz o req.ip ser o IP real do visitante
app.set("trust proxy", true);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ----- token de login -----
// o token leva o id do usuário e a validade, assinados com uma chave secreta.
// assim qualquer cópia do servidor consegue conferir o login sem guardar sessão na memória.
function segredo() {
  if (process.env.SESSAO_SEGREDO) return process.env.SESSAO_SEGREDO;
  if (EM_PRODUCAO) throw new Error("Configure a variável de ambiente SESSAO_SEGREDO.");
  return "segredo-so-para-testes-locais";
}

function assinar(texto) {
  return crypto.createHmac("sha256", segredo()).update(texto).digest("base64url");
}

function criarToken(usuarioId) {
  const dados = Buffer.from(JSON.stringify({ id: usuarioId, expira: Date.now() + DURACAO_SESSAO })).toString("base64url");
  return `${dados}.${assinar(dados)}`;
}

function lerToken(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const [dados, assinatura] = token.split(".");
  if (!dados || assinatura !== assinar(dados)) return null;
  const sessao = JSON.parse(Buffer.from(dados, "base64url").toString());
  return sessao.expira > Date.now() ? sessao : null;
}

async function exigirLogin(req, res, next) {
  const sessao = lerToken(req);
  const db = await conectar();
  const usuario = sessao && (await db.collection("usuarios").findOne({ id: sessao.id }));
  if (!usuario) return res.status(401).json({ erro: "Faça login novamente" });
  req.usuario = usuario;
  next();
}

// ----- funções auxiliares -----
const SEM_ID_DO_MONGO = { projection: { _id: 0 } };

function usuarioPublico(u) {
  return { id: u.id, nome: u.nome, usuario: u.usuario };
}

async function lerConfiguracoes(db) {
  const config = (await db.collection("configuracoes").findOne({ _id: "site" })) || {};
  return { empresa: config.empresa || {}, tema: { ...TEMA_PADRAO, ...(config.tema || {}) } };
}

async function proximoId(colecao) {
  const ultimo = await colecao.find().sort({ id: -1 }).limit(1).next();
  return ultimo ? ultimo.id + 1 : 1;
}

// "Comunicação Visual" -> "comunicacao-visual"
function gerarSlug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function texto(valor, maximo) {
  return String(valor ?? "").trim().slice(0, maximo);
}

async function validarProduto(body, db) {
  const nome = texto(body.nome, 80);
  const descricao = texto(body.descricao, 400);
  const categoria = String(body.categoria || "");
  const mensagem = texto(body.mensagem, 200);

  if (!nome) return { erro: "Informe o nome do produto" };
  if (!descricao) return { erro: "Informe a descrição do produto" };
  if (!(await db.collection("categorias").findOne({ id: categoria }))) return { erro: "Categoria inválida" };

  if (body.specs !== undefined && !Array.isArray(body.specs)) {
    return { erro: "Ficha técnica inválida" };
  }
  const specs = (body.specs || [])
    .map((s) => ({ rotulo: texto(s && s.rotulo, 40), valor: texto(s && s.valor, 200) }))
    .filter((s) => s.rotulo || s.valor);
  if (specs.length > 12) return { erro: "A ficha técnica aceita no máximo 12 linhas" };
  if (specs.some((s) => !s.rotulo || !s.valor)) {
    return { erro: "Preencha o rótulo e o valor de cada linha da ficha técnica" };
  }

  return { produto: { nome, categoria, descricao, specs, mensagem } };
}

function validarDadosUsuario(body) {
  const nome = texto(body.nome, 60);
  const usuario = String(body.usuario || "").trim().toLowerCase();
  if (!nome) return { erro: "Informe o nome" };
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    return { erro: "Usuário deve ter de 3 a 30 caracteres (letras, números, . _ -)" };
  }
  return { nome, usuario };
}

// ----- painel -----
// painel fica fora da public, só abre por esse endereço
app.get(CAMINHO_ADMIN, (req, res) => res.sendFile(PAGINA_ADMIN));

// ----- rotas públicas -----
app.get("/api/empresa", async (req, res) => {
  res.json((await lerConfiguracoes(await conectar())).empresa);
});

app.get("/api/tema", async (req, res) => {
  res.json((await lerConfiguracoes(await conectar())).tema);
});

app.get("/api/categorias", async (req, res) => {
  const db = await conectar();
  const categorias = await db.collection("categorias")
    .find({}, { projection: { _id: 0, ordem: 0 } }).sort({ ordem: 1 }).toArray();
  res.json(categorias);
});

app.get("/api/produtos", async (req, res) => {
  const db = await conectar();
  const filtro = req.query.categoria ? { categoria: String(req.query.categoria) } : {};
  let produtos = await db.collection("produtos").find(filtro, SEM_ID_DO_MONGO).sort({ id: 1 }).toArray();

  if (req.query.busca) {
    // tira acento e maiúscula pra "grafica" achar "Gráfica"
    const normalizar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const termo = normalizar(req.query.busca);
    const categorias = await db.collection("categorias").find().toArray();
    const nomeCategoria = (id) => (categorias.find((c) => c.id === id) || {}).nome;
    produtos = produtos.filter((p) =>
      [p.nome, p.descricao, nomeCategoria(p.categoria), ...(p.specs || []).map((s) => s.valor)]
        .some((campo) => normalizar(campo).includes(termo))
    );
  }
  res.json(produtos);
});

app.get("/api/produtos/:id", async (req, res) => {
  const db = await conectar();
  const produto = await db.collection("produtos").findOne({ id: Number(req.params.id) }, SEM_ID_DO_MONGO);
  if (!produto) return res.status(404).json({ erro: "Produto não encontrado" });
  res.json(produto);
});

// ----- login -----
// errou 5 vezes = bloqueia o IP por 15 min (guardado no banco pra valer em todas as cópias do servidor)
const MAX_TENTATIVAS = 5;
const TEMPO_BLOQUEIO = 15 * 60 * 1000;

app.post("/api/login", async (req, res) => {
  const db = await conectar();
  const tentativas = db.collection("tentativas");
  const registro = (await tentativas.findOne({ _id: req.ip })) || { erros: 0, bloqueadoAte: 0 };

  if (registro.bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((registro.bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${minutos} min.` });
  }

  const nomeUsuario = String(req.body.usuario || "").trim().toLowerCase();
  const usuario = await db.collection("usuarios").findOne({ usuario: nomeUsuario });

  if (!usuario || !senhaConfere(String(req.body.senha || ""), usuario)) {
    const erros = registro.erros + 1;
    const bloquear = erros >= MAX_TENTATIVAS;
    await tentativas.updateOne(
      { _id: req.ip },
      { $set: { erros: bloquear ? 0 : erros, bloqueadoAte: bloquear ? Date.now() + TEMPO_BLOQUEIO : 0 } },
      { upsert: true }
    );
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }

  await tentativas.deleteOne({ _id: req.ip });
  res.json({ token: criarToken(usuario.id), usuario: usuarioPublico(usuario) });
});

// o token fica só no navegador, então sair é só ele apagar o token
app.post("/api/logout", (req, res) => res.json({ ok: true }));

// ----- textos, contato e cores -----
app.put("/api/empresa", exigirLogin, async (req, res) => {
  const db = await conectar();
  const { empresa } = await lerConfiguracoes(db);
  const campos = {
    nome: 60, titulo: 120, destaque: 60, slogan: 300,
    sobre: 300, whatsapp: 20, endereco: 120, horario: 80
  };
  for (const [campo, maximo] of Object.entries(campos)) {
    if (typeof req.body[campo] === "string") {
      empresa[campo] = texto(req.body[campo], maximo);
    }
  }
  empresa.whatsapp = String(empresa.whatsapp || "").replace(/\D/g, "");
  if (!empresa.nome) return res.status(400).json({ erro: "Informe o nome da empresa" });
  if (empresa.whatsapp.length < 10) {
    return res.status(400).json({ erro: "WhatsApp inválido (use DDI + DDD + número)" });
  }
  await db.collection("configuracoes").updateOne({ _id: "site" }, { $set: { empresa } }, { upsert: true });
  res.json(empresa);
});

app.put("/api/tema", exigirLogin, async (req, res) => {
  const db = await conectar();
  const { tema } = await lerConfiguracoes(db);
  for (const campo of CAMPOS_COR) {
    if (req.body[campo] !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(req.body[campo])) {
        return res.status(400).json({ erro: "Cor inválida (use o formato #RRGGBB)" });
      }
      tema[campo] = req.body[campo].toLowerCase();
    }
  }
  await db.collection("configuracoes").updateOne({ _id: "site" }, { $set: { tema } }, { upsert: true });
  res.json(tema);
});

app.post("/api/tema/restaurar", exigirLogin, async (req, res) => {
  const db = await conectar();
  await db.collection("configuracoes").updateOne({ _id: "site" }, { $set: { tema: TEMA_PADRAO } }, { upsert: true });
  res.json(TEMA_PADRAO);
});

// ----- produtos -----
app.post("/api/produtos", exigirLogin, async (req, res) => {
  const db = await conectar();
  const { produto, erro } = await validarProduto(req.body, db);
  if (erro) return res.status(400).json({ erro });

  const novo = { id: await proximoId(db.collection("produtos")), ...produto };
  await db.collection("produtos").insertOne({ ...novo });
  res.status(201).json(novo);
});

app.put("/api/produtos/:id", exigirLogin, async (req, res) => {
  const db = await conectar();
  const id = Number(req.params.id);
  const { produto, erro } = await validarProduto(req.body, db);
  if (erro) return res.status(400).json({ erro });

  const resultado = await db.collection("produtos").updateOne({ id }, { $set: produto });
  if (resultado.matchedCount === 0) return res.status(404).json({ erro: "Produto não encontrado" });
  res.json({ id, ...produto });
});

app.delete("/api/produtos/:id", exigirLogin, async (req, res) => {
  const db = await conectar();
  const resultado = await db.collection("produtos").deleteOne({ id: Number(req.params.id) });
  if (resultado.deletedCount === 0) return res.status(404).json({ erro: "Produto não encontrado" });
  res.json({ ok: true });
});

// ----- categorias -----
app.post("/api/categorias", exigirLogin, async (req, res) => {
  const db = await conectar();
  const nome = texto(req.body.nome, 60);
  const id = gerarSlug(nome);
  if (!id) return res.status(400).json({ erro: "Informe o nome da categoria" });
  if (await db.collection("categorias").findOne({ id })) {
    return res.status(400).json({ erro: "Já existe uma categoria com esse nome" });
  }
  const ultima = await db.collection("categorias").find().sort({ ordem: -1 }).limit(1).next();
  const nova = { id, nome, descricao: texto(req.body.descricao, 160) };
  await db.collection("categorias").insertOne({ ...nova, ordem: ultima ? ultima.ordem + 1 : 0 });
  res.status(201).json(nova);
});

app.put("/api/categorias/:id", exigirLogin, async (req, res) => {
  const db = await conectar();
  const nome = texto(req.body.nome, 60);
  if (!nome) return res.status(400).json({ erro: "Informe o nome da categoria" });
  const mudancas = { nome };
  if (req.body.descricao !== undefined) mudancas.descricao = texto(req.body.descricao, 160);

  const categoria = await db.collection("categorias").findOneAndUpdate(
    { id: req.params.id },
    { $set: mudancas },
    { returnDocument: "after", projection: { _id: 0, ordem: 0 } }
  );
  if (!categoria) return res.status(404).json({ erro: "Categoria não encontrada" });
  res.json(categoria);
});

// -1 sobe, 1 desce (troca a ordem com a categoria vizinha)
app.put("/api/categorias/:id/posicao", exigirLogin, async (req, res) => {
  const db = await conectar();
  const colecao = db.collection("categorias");
  const lista = await colecao.find().sort({ ordem: 1 }).toArray();
  const i = lista.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ erro: "Categoria não encontrada" });

  const vizinha = lista[i + (req.body.direcao === -1 ? -1 : 1)];
  if (vizinha) {
    await colecao.updateOne({ id: lista[i].id }, { $set: { ordem: vizinha.ordem } });
    await colecao.updateOne({ id: vizinha.id }, { $set: { ordem: lista[i].ordem } });
  }
  res.json(await colecao.find({}, { projection: { _id: 0, ordem: 0 } }).sort({ ordem: 1 }).toArray());
});

app.delete("/api/categorias/:id", exigirLogin, async (req, res) => {
  const db = await conectar();
  if (await db.collection("produtos").findOne({ categoria: req.params.id })) {
    return res.status(400).json({ erro: "Mova ou exclua os produtos desta categoria antes" });
  }
  const resultado = await db.collection("categorias").deleteOne({ id: req.params.id });
  if (resultado.deletedCount === 0) return res.status(404).json({ erro: "Categoria não encontrada" });
  res.json({ ok: true });
});

// ----- minha conta -----
app.get("/api/eu", exigirLogin, (req, res) => res.json(usuarioPublico(req.usuario)));

app.put("/api/eu/senha", exigirLogin, async (req, res) => {
  if (!senhaConfere(String(req.body.senhaAtual || ""), req.usuario)) {
    return res.status(400).json({ erro: "Senha atual incorreta" });
  }
  const erro = validarSenha(req.body.novaSenha);
  if (erro) return res.status(400).json({ erro });

  const db = await conectar();
  await db.collection("usuarios").updateOne({ id: req.usuario.id }, { $set: gerarHash(req.body.novaSenha) });
  res.json({ ok: true });
});

// ----- usuários -----
app.get("/api/usuarios", exigirLogin, async (req, res) => {
  const db = await conectar();
  const usuarios = await db.collection("usuarios").find().sort({ id: 1 }).toArray();
  res.json(usuarios.map(usuarioPublico));
});

app.post("/api/usuarios", exigirLogin, async (req, res) => {
  const db = await conectar();
  const { nome, usuario, erro } = validarDadosUsuario(req.body);
  if (erro) return res.status(400).json({ erro });
  if (await db.collection("usuarios").findOne({ usuario })) {
    return res.status(400).json({ erro: "Esse nome de usuário já existe" });
  }
  const erroSenha = validarSenha(req.body.senha);
  if (erroSenha) return res.status(400).json({ erro: erroSenha });

  const novo = { id: await proximoId(db.collection("usuarios")), nome, usuario, ...gerarHash(req.body.senha) };
  await db.collection("usuarios").insertOne(novo);
  res.status(201).json(usuarioPublico(novo));
});

app.put("/api/usuarios/:id", exigirLogin, async (req, res) => {
  const db = await conectar();
  const id = Number(req.params.id);
  const { nome, usuario, erro } = validarDadosUsuario(req.body);
  if (erro) return res.status(400).json({ erro });
  if (await db.collection("usuarios").findOne({ usuario, id: { $ne: id } })) {
    return res.status(400).json({ erro: "Esse nome de usuário já existe" });
  }

  const resultado = await db.collection("usuarios").updateOne({ id }, { $set: { nome, usuario } });
  if (resultado.matchedCount === 0) return res.status(404).json({ erro: "Usuário não encontrado" });
  res.json({ id, nome, usuario });
});

app.delete("/api/usuarios/:id", exigirLogin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) {
    return res.status(400).json({ erro: "Você não pode excluir o próprio usuário" });
  }
  const db = await conectar();
  const resultado = await db.collection("usuarios").deleteOne({ id });
  if (resultado.deletedCount === 0) return res.status(404).json({ erro: "Usuário não encontrado" });
  res.json({ ok: true });
});

// ----- erros -----
app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ erro: "Dados enviados em formato inválido" });
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno no servidor" });
});

// no computador sobe o servidor; na Vercel ela mesma usa o app exportado
if (require.main === module) {
  app.listen(PORTA, () => {
    console.log(`Catálogo Imprimifácil rodando em http://localhost:${PORTA}`);
    console.log(`Painel administrativo em http://localhost:${PORTA}${CAMINHO_ADMIN}`);
  });
}

module.exports = app;
