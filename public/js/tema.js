// aplica as 4 cores que vêm do painel

function aplicarTema(tema, elemento = document.body) {
  const estilo = elemento.style;
  estilo.setProperty("--roxo", tema.corPrimaria);
  estilo.setProperty("--verde", tema.corDestaque);
  estilo.setProperty("--papel", tema.corFundo);
  estilo.setProperty("--tinta", tema.corTexto);
}

async function carregarTema() {
  try {
    const resposta = await fetch("/api/tema");
    aplicarTema(await resposta.json());
  } catch (erro) {
    // se a api falhar fica com as cores padrão mesmo
  }
}
