// pra usar: npm run redefinir-senha -- <usuario> <nova-senha>
// precisa do MONGODB_URI no .env
try { process.loadEnvFile(); } catch {}

const { conectar } = require("./banco");
const { gerarHash, validarSenha } = require("./senhas");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Configure o MONGODB_URI no arquivo .env antes (veja o .env.example).");
    process.exit(1);
  }

  const db = await conectar();
  const usuarios = db.collection("usuarios");
  const [nomeUsuario, novaSenha] = process.argv.slice(2);

  if (!nomeUsuario || !novaSenha) {
    console.log("Uso: npm run redefinir-senha -- <usuario> <nova-senha>\n");
    console.log("Usuários cadastrados:");
    for (const u of await usuarios.find().sort({ id: 1 }).toArray()) {
      console.log(`  - ${u.usuario} (${u.nome})`);
    }
    process.exit(nomeUsuario ? 1 : 0);
  }

  const erro = validarSenha(novaSenha);
  if (erro) {
    console.error(erro + ".");
    process.exit(1);
  }

  const resultado = await usuarios.updateOne(
    { usuario: nomeUsuario.trim().toLowerCase() },
    { $set: gerarHash(novaSenha) }
  );
  if (resultado.matchedCount === 0) {
    console.error(`Usuário "${nomeUsuario}" não encontrado.`);
    process.exit(1);
  }
  console.log(`Senha de "${nomeUsuario}" redefinida com sucesso.`);
  process.exit(0);
}

main().catch((erro) => {
  console.error("Erro:", erro.message);
  process.exit(1);
});
