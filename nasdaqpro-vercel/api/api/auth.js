import crypto from 'crypto';

// Base de datos de usuarios en memoria
// En producción usar una base de datos real (Vercel KV, PlanetScale, etc.)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'nasdaqpro2026';

// Usuarios permitidos (en producción usar DB)
let users = [
  { id: '1', username: 'admin', password: hashPass('nasdaqpro2026'), role: 'admin', active: true, name: 'Administrador' },
  { id: '2', username: 'demo', password: hashPass('demo123'), role: 'user', active: true, name: 'Usuario Demo' },
];

// Sesiones activas
let sessions = {};

function hashPass(pass) {
  return crypto.createHash('sha256').update(pass + 'nasdaqpro_salt').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         'unknown';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── LOGIN ──────────────────────────────────────────────────────
  if (action === 'login' && req.method === 'POST') {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === hashPass(password));
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    const token = generateToken();
    const ip = getClientIP(req);
    const now = new Date();
    
    sessions[token] = {
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      ip,
      loginAt: now.toISOString(),
      lastSeen: now.toISOString()
    };

    // Guardar último login en el usuario
    const idx = users.findIndex(u => u.id === user.id);
    users[idx].lastLogin = now.toISOString();
    users[idx].lastIP = ip;
    users[idx].loginCount = (users[idx].loginCount || 0) + 1;

    return res.status(200).json({
      token,
      user: { id: user.id, username: user.username, role: user.role, name: user.name }
    });
  }

  // ── VERIFY TOKEN ───────────────────────────────────────────────
  if (action === 'verify') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token]) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }
    sessions[token].lastSeen = new Date().toISOString();
    return res.status(200).json({ valid: true, user: sessions[token] });
  }

  // ── LOGOUT ─────────────────────────────────────────────────────
  if (action === 'logout' && req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && sessions[token]) delete sessions[token];
    return res.status(200).json({ ok: true });
  }

  // ── ADMIN: GET USERS ───────────────────────────────────────────
  if (action === 'users' && req.method === 'GET') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token] || sessions[token].role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const safeUsers = users.map(u => ({
      id: u.id, username: u.username, name: u.name,
      role: u.role, active: u.active,
      lastLogin: u.lastLogin || null,
      lastIP: u.lastIP || null,
      loginCount: u.loginCount || 0
    }));
    const activeSessions = Object.values(sessions).map(s => ({
      username: s.username, ip: s.ip,
      loginAt: s.loginAt, lastSeen: s.lastSeen
    }));
    return res.status(200).json({ users: safeUsers, sessions: activeSessions });
  }

  // ── ADMIN: ADD USER ────────────────────────────────────────────
  if (action === 'adduser' && req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token] || sessions[token].role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'username, password y name son requeridos' });
    }
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }
    const newUser = {
      id: Date.now().toString(),
      username, name,
      password: hashPass(password),
      role: 'user',
      active: true,
      loginCount: 0
    };
    users.push(newUser);
    return res.status(200).json({ ok: true, user: { id: newUser.id, username, name } });
  }

  // ── ADMIN: TOGGLE USER ─────────────────────────────────────────
  if (action === 'toggleuser' && req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token] || sessions[token].role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const { userId } = req.body;
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (users[idx].role === 'admin') return res.status(400).json({ error: 'No puedes desactivar al admin' });
    users[idx].active = !users[idx].active;
    // Cerrar sesiones del usuario si se desactiva
    if (!users[idx].active) {
      Object.keys(sessions).forEach(t => {
        if (sessions[t].userId === userId) delete sessions[t];
      });
    }
    return res.status(200).json({ ok: true, active: users[idx].active });
  }

  // ── ADMIN: DELETE USER ─────────────────────────────────────────
  if (action === 'deleteuser' && req.method === 'POST') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || !sessions[token] || sessions[token].role !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const { userId } = req.body;
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (users[idx].role === 'admin') return res.status(400).json({ error: 'No puedes eliminar al admin' });
    users.splice(idx, 1);
    Object.keys(sessions).forEach(t => {
      if (sessions[t].userId === userId) delete sessions[t];
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Acción no encontrada' });
}
