/**
 * app.js
 * LinkedIn OAuth2 com OpenID Connect + SQLite storage + dashboard
 *
 * Dependências:
 *   npm install express axios express-session sqlite3 jsonwebtoken jwks-rsa
 *
 * Rodar:
 *   node app.js
 *
 * Observações:
 * - Usa OpenID Connect ao invés da API v2 legacy
 * - Processa id_token e usa endpoint /v2/userinfo
 * - Posts não são acessíveis com Sign In with LinkedIn using OpenID Connect
 */

const express = require('express');
const axios = require('axios');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===========================
   CONFIGURAÇÃO (EDITE AQUI)
   =========================== */
// ⚠️ Em produção, use process.env
const CLIENT_ID = '78jbo1yvmlx7oi';
const CLIENT_SECRET = 'WPL_AP1.HGH1QkXop1S1h7Jq.Z0Sk6Q==';
const REDIRECT_URI = 'https://psychic-halibut-v676wp9r5v45394g-3000.app.github.dev/callback';

// Scopes para OpenID Connect
const SCOPES = 'openid profile email';

// Endpoints OpenID Connect do LinkedIn
const LINKEDIN = {
  AUTH_URL: 'https://www.linkedin.com/oauth/v2/authorization',
  TOKEN_URL: 'https://www.linkedin.com/oauth/v2/accessToken',
  USERINFO_URL: 'https://api.linkedin.com/v2/userinfo',
  JWKS_URI: 'https://www.linkedin.com/oauth/openid/jwks'
};

// Cliente JWKS para verificar tokens do LinkedIn
const jwks = jwksClient({
  jwksUri: LINKEDIN.JWKS_URI,
  cache: true,
  rateLimit: true
});

/* ===========================
   SQLite (arquivo local)
   =========================== */
const DB_FILE = path.join(__dirname, 'linkedin_data.db');
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linkedin_sub TEXT UNIQUE,
    name TEXT,
    given_name TEXT,
    family_name TEXT,
    picture TEXT,
    email TEXT,
    email_verified BOOLEAN,
    locale TEXT,
    access_token TEXT,
    id_token TEXT,
    token_expires_at INTEGER,
    raw_userinfo JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de posts mantida para compatibilidade, mas não será usada com OpenID Connect
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    owner_linkedin_sub TEXT,
    text TEXT,
    created_time TEXT,
    raw_post JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_linkedin_sub) REFERENCES users(linkedin_sub)
  )`);
});

/* ===========================
   Middlewares
   =========================== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'linkedintest-secret-key-' + Math.random(),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

/* ===========================
   Helpers
   =========================== */
function nowSecondsPlus(expires_in_seconds) {
  return Math.floor(Date.now() / 1000) + (expires_in_seconds || 0);
}

// Função para obter a chave de assinatura
function getKey(header, callback) {
  jwks.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Verificar e decodificar id_token
async function verifyIdToken(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, getKey, {
      algorithms: ['RS256'],
      issuer: 'https://www.linkedin.com',
      audience: CLIENT_ID
    }, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

/* ===========================
   Routes - Frontend
   =========================== */

// Home / Dashboard (UI refinada)
app.get('/', (req, res) => {
  const isAuth = !!req.session.accessToken;
  const username = req.session.userName || null;
  const email = req.session.userEmail || null;
  const picture = req.session.userPicture || null;
  
  const html = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>LinkedIn OpenID Connect - CMSP</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <style>
      :root{--bg:#0f1724;--card:#0b1220;--accent:#0a66c2;--muted:#9aa4b2;--glass:rgba(255,255,255,0.03);--success:#10b981;--error:#ef4444}
      *{box-sizing:border-box}
      body{margin:0;font-family:'Segoe UI',Inter,system-ui,Arial;background:linear-gradient(135deg,#071029 0%,#0e1724 100%);color:#e6eef6;min-height:100vh}
      .wrap{max-width:1200px;margin:0 auto;padding:30px 20px}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:30px}
      h1{margin:0;font-weight:600;font-size:28px}
      .sub{color:var(--muted);font-size:14px;margin-top:4px}
      .user-info{display:flex;align-items:center;gap:12px;background:var(--glass);padding:8px 12px;border-radius:12px}
      .user-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)}
      .user-details{text-align:right}
      .user-name{font-weight:600;font-size:14px}
      .user-email{font-size:12px;color:var(--muted)}
      .card{background:var(--card);padding:24px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.4);margin-bottom:20px;border:1px solid rgba(255,255,255,0.05)}
      .card-header{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.05)}
      .card-title{font-size:18px;font-weight:600;margin:0}
      .card-desc{color:var(--muted);font-size:13px;margin-top:4px}
      .btn{display:inline-block;padding:10px 20px;border-radius:10px;background:var(--accent);color:white;text-decoration:none;font-weight:500;border:none;cursor:pointer;transition:all 0.2s;font-size:14px}
      .btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(10,102,194,0.3)}
      .btn.ghost{background:transparent;border:1px solid rgba(255,255,255,0.1)}
      .btn.ghost:hover{background:rgba(255,255,255,0.05)}
      .btn-group{display:flex;gap:8px;flex-wrap:wrap}
      .result{background:var(--glass);padding:16px;border-radius:12px;color:#d9eefb;max-height:500px;overflow:auto;font-family:'Consolas','Monaco',monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;border:1px solid rgba(255,255,255,0.05)}
      .result::-webkit-scrollbar{width:8px}
      .result::-webkit-scrollbar-track{background:rgba(255,255,255,0.02)}
      .result::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
      .status{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500}
      .status.connected{background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.2)}
      .status.disconnected{background:rgba(239,68,68,0.1);color:var(--error);border:1px solid rgba(239,68,68,0.2)}
      .info-box{background:rgba(10,102,194,0.1);border:1px solid rgba(10,102,194,0.2);padding:12px;border-radius:8px;margin-top:16px;font-size:13px;color:#93c5fd}
      .info-box code{background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;font-size:12px}
      footer{text-align:center;color:var(--muted);font-size:12px;margin-top:40px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.05)}
      .loading{animation:pulse 1.5s infinite}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div>
          <h1>LinkedIn OpenID Connect — CMSP</h1>
          <div class="sub">Rafael Teixeira — Ferramenta de teste com OpenID Connect</div>
        </div>
        <div>
          ${isAuth ? `
            <div class="user-info">
              ${picture ? `<img src="${picture}" alt="Avatar" class="user-avatar"/>` : ''}
              <div class="user-details">
                <div class="user-name">${username || 'Usuário'}</div>
                ${email ? `<div class="user-email">${email}</div>` : ''}
              </div>
              <a href="/logout" class="btn ghost">Sair</a>
            </div>
          ` : `
            <a href="/login" class="btn">
              <svg width="16" height="16" fill="currentColor" style="margin-right:6px;vertical-align:-2px">
                <path d="M13.5 2h-11A1.5 1.5 0 001 3.5v9A1.5 1.5 0 002.5 14h11a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0013.5 2zM8 10.5L3.5 8v-1L8 9.5 12.5 7v1L8 10.5z"/>
              </svg>
              Entrar com LinkedIn
            </a>
          `}
        </div>
      </header>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">🔧 Ações Disponíveis</h2>
          <div class="card-desc">Use os botões abaixo para testar a integração com LinkedIn OpenID Connect</div>
        </div>
        
        <div class="btn-group">
          <button class="btn" onclick="fetchJson('/test/config')">📋 Ver Configuração</button>
          ${isAuth ? `
            <button class="btn" onclick="fetchJson('/userinfo')">👤 Dados do Usuário</button>
            <button class="btn" onclick="fetchJson('/id-token')">🔐 Ver ID Token</button>
            <button class="btn" onclick="fetchJson('/db/users')">💾 Usuários no BD</button>
          ` : `
            <button class="btn" disabled style="opacity:0.5;cursor:not-allowed">👤 Dados do Usuário (faça login)</button>
          `}
        </div>

        <div class="info-box">
          <strong>ℹ️ Nota:</strong> Com o produto "Sign In with LinkedIn using OpenID Connect", você tem acesso apenas aos dados básicos do perfil (nome, email, foto). 
          Para acessar posts e outras funcionalidades, você precisaria de produtos adicionais como "Share on LinkedIn" ou "Marketing Developer Platform".
        </div>

        <div style="margin-top:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <span style="font-size:14px;font-weight:500">Resultado:</span>
            <span class="status ${isAuth ? 'connected' : 'disconnected'}">
              ${isAuth ? '● Conectado' : '○ Desconectado'}
            </span>
          </div>
          <div id="result" class="result">
            Selecione uma ação para ver o resultado aqui...
          </div>
        </div>
      </div>

      <footer>
        <p>Redirect URI configurado: <code>${REDIRECT_URI}</code></p>
        <p>Certifique-se de que está cadastrado corretamente no LinkedIn Developer Portal</p>
      </footer>
    </div>

    <script>
      async function fetchJson(path) {
        const resDiv = document.getElementById('result');
        resDiv.innerHTML = '<span class="loading">Carregando...</span>';
        try {
          const r = await fetch(path);
          const contentType = r.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await r.json();
            resDiv.textContent = JSON.stringify(json, null, 2);
          } else {
            const text = await r.text();
            resDiv.textContent = text;
          }
        } catch (err) {
          resDiv.textContent = '❌ Erro: ' + err.message;
        }
      }
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

/* ===========================
   OAuth2 Login / Callback
   =========================== */

// Inicia fluxo OAuth (redireciona para LinkedIn)
app.get('/login', (req, res) => {
  const state = Math.random().toString(36).substring(2, 15);
  req.session.oauthState = state;

  const authUrl = LINKEDIN.AUTH_URL + '?' + querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: state
  });

  console.log('Iniciando fluxo OAuth, redirecionando para:', authUrl);
  res.redirect(authUrl);
});

// Callback do LinkedIn
app.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('Erro no callback:', error, error_description);
      return res.send(`
        <h3>Erro durante autorização</h3>
        <pre>${error}: ${error_description || ''}</pre>
        <a href="/">Voltar</a>
      `);
    }

    if (!code) {
      return res.send('<h3>Erro: código de autorização não recebido!</h3><a href="/">Voltar</a>');
    }

    if (!state || state !== req.session.oauthState) {
      console.warn('State mismatch', { received: state, expected: req.session.oauthState });
      return res.status(400).send('<h3>State inválido - possível ataque CSRF</h3><a href="/">Voltar</a>');
    }

    // Trocar code por tokens
    console.log('Trocando código por tokens...');
    const tokenRes = await axios.post(LINKEDIN.TOKEN_URL, querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const tokenData = tokenRes.data;
    console.log('Tokens recebidos:', {
      has_access_token: !!tokenData.access_token,
      has_id_token: !!tokenData.id_token,
      expires_in: tokenData.expires_in
    });

    // Salvar tokens na sessão
    req.session.accessToken = tokenData.access_token;
    req.session.idToken = tokenData.id_token;
    req.session.tokenExpiresAt = nowSecondsPlus(tokenData.expires_in);

    // Verificar e decodificar ID Token
    let idTokenClaims = null;
    if (tokenData.id_token) {
      try {
        idTokenClaims = await verifyIdToken(tokenData.id_token);
        console.log('ID Token verificado:', idTokenClaims);
      } catch (verifyErr) {
        console.error('Erro ao verificar ID Token:', verifyErr);
        // Continuar mesmo se a verificação falhar (para desenvolvimento)
        idTokenClaims = jwt.decode(tokenData.id_token);
      }
    }

    // Buscar informações do usuário via /userinfo
    console.log('Buscando informações do usuário...');
    const userinfoRes = await axios.get(LINKEDIN.USERINFO_URL, {
      headers: { 
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/json'
      }
    });

    const userinfo = userinfoRes.data;
    console.log('Userinfo recebido:', userinfo);

    // Extrair dados do usuário
    const linkedinSub = userinfo.sub || idTokenClaims?.sub || null;
    const name = userinfo.name || '';
    const givenName = userinfo.given_name || '';
    const familyName = userinfo.family_name || '';
    const picture = userinfo.picture || null;
    const email = userinfo.email || null;
    const emailVerified = userinfo.email_verified || false;
    const locale = userinfo.locale || null;

    // Salvar no banco de dados
    const stmt = db.prepare(`
      INSERT INTO users (
        linkedin_sub, name, given_name, family_name, picture, email, 
        email_verified, locale, access_token, id_token, token_expires_at, 
        raw_userinfo, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(linkedin_sub) DO UPDATE SET
        name = excluded.name,
        given_name = excluded.given_name,
        family_name = excluded.family_name,
        picture = excluded.picture,
        email = excluded.email,
        email_verified = excluded.email_verified,
        locale = excluded.locale,
        access_token = excluded.access_token,
        id_token = excluded.id_token,
        token_expires_at = excluded.token_expires_at,
        raw_userinfo = excluded.raw_userinfo,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      linkedinSub,
      name,
      givenName,
      familyName,
      picture,
      email,
      emailVerified ? 1 : 0,
      locale,
      tokenData.access_token,
      tokenData.id_token,
      nowSecondsPlus(tokenData.expires_in),
      JSON.stringify(userinfo),
      (err) => {
        if (err) console.error('Erro ao salvar usuário no DB:', err);
        else console.log('Usuário salvo no banco de dados');
      }
    );

    stmt.finalize();

    // Salvar informações na sessão para exibição
    req.session.linkedInSub = linkedinSub;
    req.session.userName = name;
    req.session.userEmail = email;
    req.session.userPicture = picture;

    // Redirecionar para dashboard
    res.redirect('/');

  } catch (err) {
    console.error('Erro no callback:', err.response?.data || err.message);
    const errorDetails = err.response?.data || { message: err.message };
    res.status(500).send(`
      <h3>Erro no callback</h3>
      <pre>${JSON.stringify(errorDetails, null, 2)}</pre>
      <a href="/">Voltar</a>
    `);
  }
});

/* ===========================
   API Endpoints
   =========================== */

// Configuração atual
app.get('/test/config', (req, res) => {
  res.json({
    status: 'OK',
    product: 'Sign In with LinkedIn using OpenID Connect',
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID.substring(0, 8) + '...',
    scopes: SCOPES,
    endpoints: {
      authorization: LINKEDIN.AUTH_URL,
      token: LINKEDIN.TOKEN_URL,
      userinfo: LINKEDIN.USERINFO_URL,
      jwks: LINKEDIN.JWKS_URI
    },
    authenticated: !!req.session.accessToken,
    session: {
      has_access_token: !!req.session.accessToken,
      has_id_token: !!req.session.idToken,
      user_sub: req.session.linkedInSub || null,
      expires_at: req.session.tokenExpiresAt || null
    }
  });
});

// Obter informações do usuário
app.get('/userinfo', async (req, res) => {
  try {
    if (!req.session.accessToken) {
      return res.status(401).json({ 
        error: 'Não autenticado', 
        message: 'Faça login primeiro para acessar as informações do usuário' 
      });
    }

    const userinfoRes = await axios.get(LINKEDIN.USERINFO_URL, {
      headers: { 
        'Authorization': `Bearer ${req.session.accessToken}`,
        'Accept': 'application/json'
      }
    });

    res.json({
      source: 'LinkedIn OpenID Connect /userinfo endpoint',
      data: userinfoRes.data,
      session_info: {
        user_sub: req.session.linkedInSub,
        token_expires_at: req.session.tokenExpiresAt,
        token_valid_for: req.session.tokenExpiresAt 
          ? `${Math.max(0, req.session.tokenExpiresAt - Math.floor(Date.now() / 1000))} segundos`
          : 'desconhecido'
      }
    });

  } catch (err) {
    console.error('Erro ao buscar userinfo:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ 
      error: 'Erro ao buscar informações do usuário',
      details: err.response?.data || err.message 
    });
  }
});

// Ver ID Token decodificado
app.get('/id-token', (req, res) => {
  if (!req.session.idToken) {
    return res.status(401).json({ 
      error: 'ID Token não encontrado',
      message: 'Faça login primeiro' 
    });
  }

  try {
    const decoded = jwt.decode(req.session.idToken, { complete: true });
    res.json({
      header: decoded.header,
      payload: decoded.payload,
      note: 'Este é o ID Token JWT decodificado. Ele contém as claims do usuário autenticado.'
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Erro ao decodificar ID Token',
      message: err.message 
    });
  }
});

// Listar usuários do banco de dados
app.get('/db/users', (req, res) => {
  db.all(`
    SELECT 
      linkedin_sub, name, given_name, family_name, 
      email, email_verified, locale, picture,
      created_at, updated_at
    FROM users 
    ORDER BY updated_at DESC
    LIMIT 50
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ 
      count: rows.length, 
      users: rows,
      note: 'Usuários armazenados no banco de dados local SQLite'
    });
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Erro ao destruir sessão:', err);
    res.redirect('/');
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor', 
    details: err.message 
  });
});

/* ===========================
   Iniciar servidor
   =========================== */
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 LinkedIn OpenID Connect Test App');
  console.log('='.repeat(60));
  console.log(`📍 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🔄 Redirect URI: ${REDIRECT_URI}`);
  console.log(`📦 Produto: Sign In with LinkedIn using OpenID Connect`);
  console.log(`🔑 Client ID: ${CLIENT_ID.substring(0, 8)}...`);
  console.log('='.repeat(60));
  console.log('📝 Certifique-se de que o Redirect URI está cadastrado');
  console.log('   corretamente no LinkedIn Developer Portal');
  console.log('='.repeat(60));
});