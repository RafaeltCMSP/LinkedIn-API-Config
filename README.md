# LinkedIn OpenID Connect Test App

Um aplicativo Node.js para **testar a integração do LinkedIn usando OpenID Connect**. Ele utiliza **OAuth2** para autenticação, armazena informações do usuário em **SQLite**, e fornece um **dashboard simples** para visualizar dados do perfil autenticado.

> ⚠️ Observação: Este projeto **não permite acessar posts** do LinkedIn, apenas dados básicos do perfil via OpenID Connect. Para posts ou marketing APIs, é necessário produtos adicionais do LinkedIn.

---

## Índice

* [Funcionalidades](#funcionalidades)
* [Pré-requisitos](#pré-requisitos)
* [Instalação](#instalação)
* [Configuração](#configuração)
* [Execução](#execução)
* [Estrutura do Projeto](#estrutura-do-projeto)
* [Endpoints da API](#endpoints-da-api)
* [Dashboard](#dashboard)
* [Banco de Dados SQLite](#banco-de-dados-sqlite)
* [Segurança e Considerações](#segurança-e-considerações)
* [Limitações](#limitações)
* [Licença](#licença)

---

## Funcionalidades

* Login via **LinkedIn OpenID Connect**.
* Armazenamento de tokens e dados do usuário em **SQLite**.
* Dashboard web simples para exibir:

  * Status de autenticação
  * Informações básicas do usuário (nome, e-mail, foto)
  * ID Token decodificado
  * Usuários armazenados no banco de dados
* Endpoints REST para testes e integração.
* Health check do servidor.

---

## Pré-requisitos

* Node.js **>=18**
* NPM ou Yarn
* Conta de desenvolvedor LinkedIn para registrar **App** e obter `CLIENT_ID` e `CLIENT_SECRET`.

---

## Instalação

1. Clone o repositório:

```bash
git clone <repo-url>
cd linkedin-openid-test-app
```

2. Instale dependências:

```bash
npm install express axios express-session sqlite3 jsonwebtoken jwks-rsa
```

3. Crie um arquivo `.env` (opcional, recomendado para produção):

```env
PORT=3000
CLIENT_ID=<seu_client_id>
CLIENT_SECRET=<seu_client_secret>
REDIRECT_URI=<sua_redirect_uri>
```

> ⚠️ Em produção, **nunca** comite seu `CLIENT_SECRET` no repositório.

---

## Configuração

No código (`app.js`) você encontrará a seção **CONFIGURAÇÃO**:

```js
const CLIENT_ID = '78jbo1yvmlx7oi';
const CLIENT_SECRET = 'WPL_AP1.HGH1QkXop1S1h7Jq.Z0Sk6Q==';
const REDIRECT_URI = 'https://seu-dominio.com/callback';
```

* `SCOPES`: Os escopos usados para OpenID Connect (`openid profile email`).
* `LINKEDIN`: Endpoints oficiais do LinkedIn para OAuth2/OpenID Connect.
* `REDIRECT_URI`: Deve ser exatamente igual ao cadastrado no LinkedIn Developer Portal.

---

## Execução

Para rodar localmente:

```bash
node app.js
```

O servidor ficará disponível em `http://localhost:3000`.

---

## Estrutura do Projeto

```
linkedin-openid-test-app/
├─ app.js              # Código principal do servidor
├─ linkedin_data.db    # Banco SQLite (criado automaticamente)
├─ public/             # Arquivos estáticos (CSS, JS, imagens)
├─ package.json
└─ README.md
```

---

## Endpoints da API

| Endpoint       | Método | Descrição                                                     |
| -------------- | ------ | ------------------------------------------------------------- |
| `/login`       | GET    | Inicia fluxo OAuth2 e redireciona para LinkedIn               |
| `/callback`    | GET    | Callback do LinkedIn após login                               |
| `/logout`      | GET    | Encerra sessão do usuário                                     |
| `/userinfo`    | GET    | Retorna informações do usuário autenticado via `/v2/userinfo` |
| `/id-token`    | GET    | Retorna ID Token decodificado (JWT)                           |
| `/db/users`    | GET    | Lista usuários armazenados no SQLite (limit 50)               |
| `/test/config` | GET    | Retorna informações de configuração e sessão                  |
| `/health`      | GET    | Verifica status do servidor                                   |

---

## Dashboard

O dashboard principal (`/`) exibe:

* **Status de autenticação**
* **Dados do usuário** (nome, e-mail, foto)
* Botões para:

  * Ver configuração atual (`/test/config`)
  * Consultar `/userinfo`
  * Visualizar ID Token (`/id-token`)
  * Listar usuários do banco (`/db/users`)
* Mensagens de aviso sobre limitações do OpenID Connect:

  * Apenas dados básicos do perfil estão disponíveis.
  * Para posts ou Marketing APIs, é necessário produtos adicionais.

---

## Banco de Dados SQLite

O projeto usa SQLite local (`linkedin_data.db`) com duas tabelas principais:

1. **users**

```sql
id | linkedin_sub | name | given_name | family_name | picture | email | email_verified | locale | access_token | id_token | token_expires_at | raw_userinfo | created_at | updated_at
```

2. **posts** (mantida apenas para compatibilidade; não é populada via OpenID Connect)

```sql
id | owner_linkedin_sub | text | created_time | raw_post | created_at
```

---

## Segurança e Considerações

* `CLIENT_SECRET` nunca deve ser exposto em repositórios públicos.
* O fluxo OAuth2 usa **state** para prevenção de CSRF.
* Tokens são armazenados na **sessão do usuário** (não recomendado para produção sem HTTPS).
* ID Token é verificado via **JWKS do LinkedIn** (`jwks-rsa`).

---

## Limitações

* Apenas dados básicos do perfil estão disponíveis via OpenID Connect.
* Não é possível acessar posts, conexões ou dados de marketing sem produtos adicionais do LinkedIn.
* Dashboard e API são apenas para testes e demonstração.

---

## Licença

Este projeto é de código aberto para fins educativos e de teste.
Use por sua própria conta e risco.

