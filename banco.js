const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { gerarHash } = require("./senhas");

// guarda a conexão pra reaproveitar
let conexao = null;

function conectar() {
  if (!conexao) {
    conexao = abrirConexao().catch((erro) => {
      conexao = null;
      throw erro;
    });
  }
  return conexao;
}

async function abrirConexao() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      throw new Error("Configure a variável de ambiente MONGODB_URI com o endereço do MongoDB Atlas.");
    }
    // sem MONGODB_URI sobe um mongo temporário só pra testar
    const pacote = "mongodb-memory-server-core";
    const { MongoMemoryServer } = require(pacote);
    const servidor = await MongoMemoryServer.create();
    uri = servidor.getUri();
    console.log("Sem MONGODB_URI: usando um banco temporário (os dados somem ao desligar).");
  }

  const cliente = new MongoClient(uri);
  await cliente.connect();
  const db = cliente.db(process.env.MONGODB_BANCO || "imprimifacil");
  await prepararBanco(db);
  return db;
}

// se o banco tiver vazio coloca os dados iniciais e cria o admin
async function prepararBanco(db) {
  await db.collection("produtos").createIndex({ id: 1 }, { unique: true });
  await db.collection("categorias").createIndex({ id: 1 }, { unique: true });
  await db.collection("usuarios").createIndex({ usuario: 1 }, { unique: true });

  try {
    if ((await db.collection("configuracoes").countDocuments()) === 0) {
      const arquivo = path.join(__dirname, "data", "dados-iniciais.json");
      const inicial = JSON.parse(fs.readFileSync(arquivo, "utf-8"));
      await db.collection("configuracoes").insertOne({ _id: "site", empresa: inicial.empresa, tema: inicial.tema });
      await db.collection("categorias").insertMany(inicial.categorias.map((c, i) => ({ ...c, ordem: i })));
      await db.collection("produtos").insertMany(inicial.produtos);
      console.log("Banco preenchido com os dados iniciais.");
    }

    if ((await db.collection("usuarios").countDocuments()) === 0) {
      const senha = process.env.ADMIN_SENHA || "admin123";
      await db.collection("usuarios").insertOne({ id: 1, nome: "Administrador", usuario: "admin", ...gerarHash(senha) });
      console.log('Usuário "admin" criado. Troque a senha no painel.');
    }
  } catch (erro) {
    // 11000 = duplicado, outra cópia do servidor já preencheu
    if (erro.code !== 11000) throw erro;
  }
}

module.exports = { conectar };
