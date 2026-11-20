# Catálogo Imprimifácil

Catálogo digital da Imprimifácil (comunicação visual e gráfica rápida, Nova Venécia-ES):
cada produto tem descrição, ficha técnica e botão de orçamento pelo WhatsApp. Um painel
administrativo permite editar produtos, categorias, textos, contato e as cores do site.

## Tecnologias

- **HTML5**, **CSS3** com **Bootstrap 5** e Bootstrap Icons
- **JavaScript** (front-end, consumindo a API com `fetch`)
- **Node.js + Express** (servidor e API REST)
- **MongoDB** (banco de dados não estruturado / NoSQL), hospedado no MongoDB Atlas
- Publicado na **Vercel**

## Identidade visual

- Cores: roxo `#4E488E`, verde `#9BC21B`, papel `#FBFAF8`, tinta `#241F3D`
- Fontes: Bebas Neue (títulos) e Manrope (textos)
- As cores podem ser alteradas no painel (aba Design), com pré-visualização

## Banco de dados

O MongoDB guarda os dados em **coleções** de documentos:

| Coleção | O que guarda |
|---|---|
| `produtos` | nome, categoria, descrição, ficha técnica e mensagem do WhatsApp |
| `categorias` | nome, descrição e ordem de exibição |
| `configuracoes` | textos e contato da empresa e cores do site |
| `usuarios` | usuários do painel (senha guardada só como hash) |
| `tentativas` | controle de tentativas de login erradas |

Na primeira vez que o site sobe com o banco vazio, ele é preenchido com
`data/dados-iniciais.json` e é criado o usuário `admin`.

## Rodar no computador

Requisito: [Node.js](https://nodejs.org) 20.12 ou superior.

```bash
npm install
npm start
```

- Site: http://localhost:3000
- Painel: o endereço aparece no terminal
- Acesso inicial: usuário `admin`, senha `admin123` (ou a definida em `ADMIN_SENHA`)

Sem o arquivo `.env`, o projeto sobe um **MongoDB temporário** só para testes
(os dados somem ao desligar). Na primeira vez ele baixa o MongoDB (~800 MB).
Para usar o banco de verdade, copie `.env.example` para `.env` e preencha o `MONGODB_URI`.

## Publicar (MongoDB Atlas + Vercel, plano gratuito)

### 1. Banco de dados no MongoDB Atlas

1. Crie uma conta em [mongodb.com/atlas](https://www.mongodb.com/atlas) e um cluster **M0 (Free)**.
2. Em **Database Access**, crie um usuário do banco com senha.
3. Em **Network Access**, adicione o IP `0.0.0.0/0` (a Vercel não tem IP fixo).
4. Em **Database > Connect > Drivers**, copie o endereço de conexão
   (`mongodb+srv://usuario:senha@...`) e troque `<password>` pela senha do passo 2.

### 2. Site na Vercel

1. Crie uma conta em [vercel.com](https://vercel.com) entrando com o GitHub.
2. Clique em **Add New > Project** e importe este repositório.
3. Em **Environment Variables**, cadastre:

| Variável | Valor |
|---|---|
| `MONGODB_URI` | endereço copiado do Atlas |
| `SESSAO_SEGREDO` | um texto longo e aleatório (é a chave que assina o login) |
| `ADMIN_CAMINHO` | endereço secreto do painel, sem barra (ex.: `painel-imprimifacil-x7k2`) |
| `ADMIN_SENHA` | senha inicial do usuário `admin` |

4. Clique em **Deploy**. O site fica em `https://nome-do-projeto.vercel.app`.
5. Acesse `https://nome-do-projeto.vercel.app/<ADMIN_CAMINHO>`, entre com `admin`
   e a `ADMIN_SENHA`, e troque a senha em **Minha conta**.

Depois disso, cada `git push` para o GitHub publica a nova versão automaticamente.

### Esqueceu a senha?

Com o `MONGODB_URI` do Atlas no arquivo `.env`:

```bash
npm run redefinir-senha -- admin novaSenha
```

## Estrutura

```
server.js              Servidor Express e API REST
banco.js               Conexão com o MongoDB e dados iniciais
senhas.js              Hash de senhas (scrypt + salt)
redefinir-senha.js     Recuperação de acesso pelo terminal
data/dados-iniciais.json  Conteúdo usado para preencher o banco vazio
public/                Arquivos do site (HTML, CSS, JS, imagens)
privado/admin.html     Página do painel (só é entregue no endereço configurado)
.env.example           Modelo das variáveis de ambiente
```

## API REST

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/produtos?categoria=&busca=` | público | Lista produtos (com filtros) |
| GET | `/api/produtos/:id` | público | Um produto |
| GET | `/api/categorias` | público | Lista categorias |
| GET | `/api/empresa` | público | Dados da empresa |
| GET | `/api/tema` | público | Cores do site |
| POST | `/api/login` | público | Entrar no painel |
| POST/PUT/DELETE | `/api/produtos` | painel | Criar, editar, excluir produtos |
| POST/PUT/DELETE | `/api/categorias` | painel | Criar, editar, excluir categorias |
| PUT | `/api/categorias/:id/posicao` | painel | Mudar a ordem das categorias |
| PUT | `/api/empresa` | painel | Editar dados da empresa |
| PUT | `/api/tema` | painel | Editar as cores do site |
| GET/POST/PUT/DELETE | `/api/usuarios` | painel | Cadastrar, editar e excluir usuários |
| PUT | `/api/eu/senha` | painel | Trocar a própria senha |

## Segurança

- Senhas armazenadas com hash **scrypt** e salt aleatório (nunca em texto puro)
- Login com token assinado (HMAC-SHA256) e validade de 8 horas
- Rotas de edição exigem login
- Bloqueio de 15 minutos após 5 tentativas de login erradas
- Textos exibidos na página são escapados (proteção contra XSS)
- Endereço do banco, chave do login e endereço do painel ficam em variáveis de ambiente, fora do código
