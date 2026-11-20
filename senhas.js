// senha nunca fica salva em texto, só o hash (scrypt + salt)
const crypto = require("crypto");

function gerarHash(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return { salt, hash };
}

function senhaConfere(senha, usuario) {
  const hash = crypto.scryptSync(senha, usuario.salt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(usuario.hash, "hex"));
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 6) {
    return "A senha deve ter pelo menos 6 caracteres";
  }
  return null;
}

module.exports = { gerarHash, senhaConfere, validarSenha };
