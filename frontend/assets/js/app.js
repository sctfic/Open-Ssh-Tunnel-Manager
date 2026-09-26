import { Api } from './api.js';
import { appRoot, escapeHtml, formData, openDialog, plural, qs, qsa, toast } from './ui.js';

// L'état reste volontairement petit et sérialisable. Les vues lisent ce même objet,
// ce qui rend le chemin des données facile à suivre pour un nouveau développeur.
const state = { me: null, tunnels: [], filter: '', stream: null, page: 'tunnels', openTunnels: new Set() };
const levels = ['Aucun', 'Lecture', 'Exécution', 'Écriture', 'Gestion'];
const api = new Api(() => showLogin('Votre session a expiré.'));

const channelCount = tunnel => Object.values(tunnel.config.tunnels).reduce((sum, group) => sum + Object.keys(group).length, 0);
const statusLabel = status => ({ stopped: 'Arrêté', starting: 'Démarrage', running: 'Actif', stopping: 'Arrêt', reconnecting: 'Reconnexion', error: 'Erreur' })[status] || status;
const defaultConfig = () => ({ ip: '', ssh_port: 22, user: '', ssh_key: '', hostFingerprint: '', options: { compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 }, bandwidth: { up: 0, down: 0 }, tunnels: { '-L': {}, '-R': {}, '-D': {} } });

async function boot() {
  try {
    const setup = await api.request('/setup/status');
    if (setup.required) return showSetup();
    if (!api.token) return showLogin();
    state.me = await api.request('/auth/me'); await showDashboard();
  } catch (error) { showFatal(error); }
}

function authShell(title, lead, form) {
  appRoot().innerHTML = `<main class="auth-shell"><section class="auth-card"><div class="brand"><span class="brand__mark">⇄</span><span>Open SSH Tunnel Manager</span></div><div><p class="eyebrow">Administration sécurisée</p><h1>${title}</h1><p class="muted">${lead}</p></div>${form}</section></main>`;
}

function showSetup() {
  stopStream();
  authShell('Créer le compte root', 'Ce mot de passe protège toute l’administration. Cette étape ne sera proposée qu’une seule fois.', `<form id="setup-form" class="stack"><label>Mot de passe root<input name="password" type="password" minlength="12" autocomplete="new-password" required></label><label>Confirmation<input name="confirm" type="password" minlength="12" autocomplete="new-password" required></label><button class="button button--primary" type="submit">Initialiser OSTM</button><p class="form-error" role="alert"></p></form>`);
  qs('#setup-form').addEventListener('submit', async event => {
    event.preventDefault(); const values = formData(event.currentTarget); const error = qs('.form-error', event.currentTarget);
    if (values.password !== values.confirm) { error.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    await withSubmit(event.currentTarget, async () => { await api.request('/setup', { method: 'POST', body: { password: values.password } }); toast('Compte root créé.', 'success'); showLogin(); }, error);
  });
}

function showLogin(message = '') {
  stopStream(); state.me = null;
  authShell('Connexion', 'Connectez-vous pour consulter et piloter les tunnels autorisés.', `<form id="login-form" class="stack"><label>Utilisateur<input name="username" autocomplete="username" value="root" required></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button class="button button--primary" type="submit">Se connecter</button><p class="form-error" role="alert">${escapeHtml(message)}</p></form>`);
  qs('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const values = formData(event.currentTarget);
    await withSubmit(event.currentTarget, async () => { const session = await api.request('/auth/login', { method: 'POST', body: values }); api.setToken(session.token); state.me = await api.request('/auth/me'); await showDashboard(); }, qs('.form-error', event.currentTarget));
  });
}

async function showDashboard() {
  appRoot().innerHTML = `<div class="shell"><header class="topbar"><button class="brand brand--button" data-home><span class="brand__mark">⇄</span><span>OSTM</span></button><div class="topbar__actions"><span class="user-chip">${escapeHtml(state.me.username)}${state.me.root ? ' · root' : ''}</span><button class="button button--ghost" data-settings>Paramètres</button><button class="button" data-logout>Déconnexion</button></div></header><main id="content" class="content"></main></div>`;
  qs('[data-home]').addEventListener('click', () => { state.page = 'tunnels'; renderTunnelPage(); });
  qs('[data-settings]').addEventListener('click', () => { state.page = 'settings'; renderSettings(); });
  qs('[data-logout]').addEventListener('click', async () => { try { await api.request('/auth/logout', { method: 'POST' }); } finally { api.setToken(''); showLogin(); } });
  await refreshTunnels(); startStream(); renderTunnelPage();
}

function renderTunnelPage() {
  const visible = state.tunnels.filter(t => JSON.stringify(t).toLocaleLowerCase('fr').includes(state.filter.toLocaleLowerCase('fr')));
  qs('#content').innerHTML = `<section class="page-head"><div><p class="eyebrow">Vue d’ensemble</p><h1>Tunnels</h1><p class="muted">${plural(state.tunnels.length, 'tunnel')} accessible${state.tunnels.length > 1 ? 's' : ''}</p></div>${state.me.root || state.tunnels.some(t => t.level >= 4) ? '<button class="button button--primary" data-create-tunnel>+ Nouveau tunnel</button>' : ''}</section><div class="toolbar"><label class="search"><span>⌕</span><input id="filter" type="search" placeholder="Filtrer par nom, hôte ou état…" value="${escapeHtml(state.filter)}"><kbd>/</kbd></label></div><section id="tunnel-list" class="tunnel-list">${visible.length ? visible.map(tunnelCard).join('') : '<div class="empty"><strong>Aucun tunnel trouvé</strong><span>Modifiez le filtre ou créez votre premier tunnel.</span></div>'}</section>`;
  bindTunnelPage();
}

function tunnelCard(tunnel) {
  const config = tunnel.config; const running = tunnel.status === 'running';
  return `<details class="tunnel-card" data-id="${escapeHtml(tunnel.id)}" ${state.openTunnels.has(tunnel.id) ? 'open' : ''}><summary><div class="status status--${escapeHtml(tunnel.status)}"><span></span>${escapeHtml(statusLabel(tunnel.status))}</div><div class="tunnel-title"><strong>${escapeHtml(tunnel.id)}</strong><span>${escapeHtml(config.user)}@${escapeHtml(config.ip)}:${config.ssh_port}</span></div><div class="metric"><span>↑</span><strong>${Number(tunnel.upKoPerSecond || 0).toFixed(1)}</strong><small>Ko/s</small></div><div class="metric"><span>↓</span><strong>${Number(tunnel.downKoPerSecond || 0).toFixed(1)}</strong><small>Ko/s</small></div><span class="badge">${escapeHtml(levels[tunnel.level])}</span><span class="chevron">⌄</span></summary><div class="tunnel-body"><div class="tunnel-grid"><div><span class="label">Channels</span><strong>${channelCount(tunnel)}</strong></div><div><span class="label">Limite Up</span><strong>${config.bandwidth.up || '∞'} ${config.bandwidth.up ? 'Ko/s' : ''}</strong></div><div><span class="label">Limite Down</span><strong>${config.bandwidth.down || '∞'} ${config.bandwidth.down ? 'Ko/s' : ''}</strong></div><div><span class="label">Compression</span><strong>${config.options.compression === 'yes' ? 'Activée' : 'Désactivée'}</strong></div></div>${tunnel.error ? `<p class="error-box">${escapeHtml(tunnel.error)}</p>` : ''}<div class="channels">${channelsHtml(config.tunnels)}</div><div class="card-actions">${tunnel.level >= 2 ? `<button class="button button--success" data-action="start" ${running ? 'disabled' : ''}>Démarrer</button><button class="button" data-action="stop" ${!running ? 'disabled' : ''}>Arrêter</button><button class="button" data-action="restart">Redémarrer</button>` : ''}<span class="spacer"></span>${tunnel.level >= 3 ? '<button class="button button--ghost" data-bandwidth>Débit</button><button class="button button--ghost" data-edit>Configuration</button>' : ''}${tunnel.level >= 4 ? '<button class="button button--ghost" data-rights>Déléguer</button><button class="button button--danger" data-delete>Supprimer</button>' : ''}</div></div></details>`;
}

function channelsHtml(groups) {
  const rows = Object.entries(groups).flatMap(([type, channels]) => Object.values(channels).map(c => `<div class="channel"><span class="badge badge--plain">${type}</span><strong>${escapeHtml(c.name)}</strong><code>${escapeHtml(c.listen_host)}:${c.listen_port}</code><span>→</span><code>${type === '-D' ? 'SOCKS' : `${escapeHtml(c.endpoint_host)}:${c.endpoint_port}`}</code></div>`));
  return rows.join('') || '<span class="muted">Aucun channel configuré.</span>';
}

function bindTunnelPage() {
  qs('#filter').addEventListener('input', event => { state.filter = event.target.value; renderTunnelPage(); qs('#filter').focus(); });
  qs('[data-create-tunnel]')?.addEventListener('click', () => showConfigDialog());
  qsa('.tunnel-card').forEach(card => {
    const tunnel = state.tunnels.find(item => item.id === card.dataset.id);
    // Un événement SSE reconstruit la liste chaque seconde ; mémoriser ce choix
    // évite de refermer la fiche que l'utilisateur est en train de consulter.
    card.addEventListener('toggle', () => card.open ? state.openTunnels.add(card.dataset.id) : state.openTunnels.delete(card.dataset.id));
    qsa('[data-action]', card).forEach(button => button.addEventListener('click', () => runAction(tunnel, button.dataset.action)));
    qs('[data-rights]', card)?.addEventListener('click', () => showRights(tunnel));
    qs('[data-bandwidth]', card)?.addEventListener('click', () => showBandwidth(tunnel));
    qs('[data-edit]', card)?.addEventListener('click', () => showConfigDialog(tunnel));
    qs('[data-delete]', card)?.addEventListener('click', () => deleteTunnel(tunnel));
  });
}

async function runAction(tunnel, action) { try { await api.request(`/tunnels/${encodeURIComponent(tunnel.id)}/${action}`, { method: 'POST' }); toast(`${tunnel.id} : commande envoyée.`, 'success'); await refreshTunnels(); renderTunnelPage(); } catch (e) { toast(e.message, 'error'); } }

function showBandwidth(tunnel) {
  const wrap = document.createElement('div'); wrap.innerHTML = `<form class="stack"><p class="muted">Les limites portent sur le flux SSH après compression et chiffrement. 0 signifie illimité.</p><div class="form-grid"><label>Débit montant (Ko/s)<input name="up" type="number" min="0" step="1" value="${tunnel.config.bandwidth.up}"></label><label>Débit descendant (Ko/s)<input name="down" type="number" min="0" step="1" value="${tunnel.config.bandwidth.down}"></label></div><button class="button button--primary" type="submit">Enregistrer</button><p class="form-error"></p></form>`;
  const dialog = openDialog(`Débit · ${tunnel.id}`, wrap); const form = qs('form', wrap);
  form.addEventListener('submit', async event => { event.preventDefault(); const v = formData(form); await withSubmit(form, async () => { await api.request(`/tunnels/${encodeURIComponent(tunnel.id)}/bandwidth`, { method: 'PUT', body: { up: Number(v.up), down: Number(v.down) } }); dialog.close(); toast('Limites mises à jour.', 'success'); await refreshTunnels(); renderTunnelPage(); }, qs('.form-error', form)); });
}

async function showRights(tunnel) {
  try {
    const rights = await api.request(`/tunnels/${encodeURIComponent(tunnel.id)}/rights`); const wrap = document.createElement('div');
    wrap.innerHTML = `<p class="muted">Le niveau choisi inclut automatiquement tous les droits précédents.</p><div class="rights-list">${rights.map(r => `<div class="right-row" data-user="${escapeHtml(r.username)}"><div><strong>${escapeHtml(r.username)}</strong>${r.immutable ? '<small>Compte système immuable</small>' : ''}</div><input type="range" min="0" max="4" step="1" value="${r.level}" ${r.immutable ? 'disabled' : ''} aria-label="Droit de ${escapeHtml(r.username)}"><output>${escapeHtml(levels[r.level])}</output></div>`).join('')}</div>`;
    openDialog(`Délégation · ${tunnel.id}`, wrap, { wide: true });
    qsa('.right-row', wrap).forEach(row => { const input = qs('input', row); if (input.disabled) return; input.addEventListener('input', () => { qs('output', row).textContent = levels[input.value]; }); input.addEventListener('change', async () => { try { await api.request(`/tunnels/${encodeURIComponent(tunnel.id)}/rights/${encodeURIComponent(row.dataset.user)}`, { method: 'PUT', body: { level: Number(input.value) } }); toast(`Droit de ${row.dataset.user} mis à jour.`, 'success'); } catch (e) { toast(e.message, 'error'); } }); });
  } catch (e) { toast(e.message, 'error'); }
}

function showConfigDialog(tunnel = null) {
  const wrap = document.createElement('div'); const config = tunnel?.config || defaultConfig();
  wrap.innerHTML = `<form class="stack"><p class="muted">La configuration suit le format JSON documenté. Les propriétés inconnues sont refusées.</p>${tunnel ? '' : '<label>Identifiant<input name="id" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}" required></label>'}<label>Configuration JSON<textarea name="config" rows="18" spellcheck="false">${escapeHtml(JSON.stringify(config, null, 2))}</textarea></label><button class="button button--primary" type="submit">${tunnel ? 'Enregistrer' : 'Créer le tunnel'}</button><p class="form-error"></p></form>`;
  const dialog = openDialog(tunnel ? `Configuration · ${tunnel.id}` : 'Nouveau tunnel', wrap, { wide: true }); const form = qs('form', wrap);
  form.addEventListener('submit', async event => { event.preventDefault(); const v = formData(form); await withSubmit(form, async () => { const parsed = JSON.parse(v.config); await api.request(tunnel ? `/tunnels/${encodeURIComponent(tunnel.id)}` : '/tunnels', { method: tunnel ? 'PUT' : 'POST', body: tunnel ? parsed : { id: v.id, config: parsed } }); dialog.close(); toast(tunnel ? 'Configuration enregistrée.' : 'Tunnel créé.', 'success'); await refreshTunnels(); renderTunnelPage(); }, qs('.form-error', form)); });
}

async function deleteTunnel(tunnel) {
  if (!confirm(`Supprimer définitivement le tunnel « ${tunnel.id} » ?`)) return;
  try { await api.request(`/tunnels/${encodeURIComponent(tunnel.id)}`, { method: 'DELETE' }); toast('Tunnel supprimé.', 'success'); await refreshTunnels(); renderTunnelPage(); } catch (e) { toast(e.message, 'error'); }
}

async function renderSettings() {
  stopStream(); qs('#content').innerHTML = `<section class="page-head"><div><p class="eyebrow">Administration</p><h1>Paramètres</h1><p class="muted">Compte, utilisateurs et droits.</p></div><button class="button" data-back>← Retour aux tunnels</button></section><section class="settings-grid"><article class="panel"><h2>Mon compte</h2><p class="muted">Connecté en tant que <strong>${escapeHtml(state.me.username)}</strong>.</p><button class="button" data-password>Changer mon mot de passe</button></article><article class="panel panel--wide"><div class="panel__head"><div><h2>Utilisateurs</h2><p class="muted">La délégation se règle depuis chaque tunnel.</p></div>${state.me.root ? '<button class="button button--primary" data-create-user>+ Utilisateur</button>' : ''}</div><div id="users"><span class="muted">Chargement…</span></div></article></section>`;
  qs('[data-back]').addEventListener('click', () => { state.page = 'tunnels'; renderTunnelPage(); startStream(); }); qs('[data-password]').addEventListener('click', showPasswordDialog); qs('[data-create-user]')?.addEventListener('click', showUserDialog); await loadUsers();
}

async function loadUsers() {
  try { const users = await api.request('/users'); qs('#users').innerHTML = `<div class="user-list">${users.map(u => `<div class="user-row"><div><strong>${escapeHtml(u.username)}</strong><span>${u.root ? 'Root · droits immuables' : u.disabled ? 'Désactivé' : 'Actif'}</span></div>${state.me.root && !u.root ? `<button class="button button--ghost" data-toggle="${escapeHtml(u.username)}" data-disabled="${u.disabled}">${u.disabled ? 'Activer' : 'Désactiver'}</button><button class="button button--danger" data-remove-user="${escapeHtml(u.username)}">Supprimer</button>` : ''}</div>`).join('')}</div>`; qsa('[data-toggle]').forEach(b => b.addEventListener('click', () => toggleUser(b))); qsa('[data-remove-user]').forEach(b => b.addEventListener('click', () => removeUser(b.dataset.removeUser))); } catch (e) { qs('#users').innerHTML = `<p class="error-box">${escapeHtml(e.message)}</p>`; }
}

function showUserDialog() { const wrap = document.createElement('div'); wrap.innerHTML = `<form class="stack"><label>Nom d’utilisateur<input name="username" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}" required></label><label>Mot de passe temporaire<input name="password" type="password" minlength="12" required></label><button class="button button--primary">Créer</button><p class="form-error"></p></form>`; const dialog = openDialog('Nouvel utilisateur', wrap); const form = qs('form', wrap); form.addEventListener('submit', async e => { e.preventDefault(); await withSubmit(form, async () => { await api.request('/users', { method: 'POST', body: formData(form) }); dialog.close(); toast('Utilisateur créé.', 'success'); await loadUsers(); }, qs('.form-error', form)); }); }
async function toggleUser(button) { try { await api.request(`/users/${encodeURIComponent(button.dataset.toggle)}`, { method: 'PATCH', body: { disabled: button.dataset.disabled !== 'true' } }); await loadUsers(); } catch (e) { toast(e.message, 'error'); } }
async function removeUser(name) { if (!confirm(`Supprimer le compte « ${name} » ?`)) return; try { await api.request(`/users/${encodeURIComponent(name)}`, { method: 'DELETE' }); toast('Utilisateur supprimé.', 'success'); await loadUsers(); } catch (e) { toast(e.message, 'error'); } }

function showPasswordDialog() { const wrap = document.createElement('div'); wrap.innerHTML = `<form class="stack"><label>Mot de passe actuel<input name="currentPassword" type="password" required></label><label>Nouveau mot de passe<input name="password" type="password" minlength="12" required></label><button class="button button--primary">Modifier</button><p class="form-error"></p></form>`; const dialog = openDialog('Changer le mot de passe', wrap); const form = qs('form', wrap); form.addEventListener('submit', async e => { e.preventDefault(); await withSubmit(form, async () => { await api.request('/auth/password', { method: 'PUT', body: formData(form) }); dialog.close(); api.setToken(''); showLogin('Mot de passe modifié. Reconnectez-vous.'); }, qs('.form-error', form)); }); }

async function refreshTunnels() { state.tunnels = await api.request('/tunnels'); }
function startStream() { stopStream(); const controller = new AbortController(); state.stream = controller; const connect = async () => { try { await api.streamTunnels(data => { state.tunnels = data; if (state.page === 'tunnels') renderTunnelPage(); }, controller.signal); if (!controller.signal.aborted) setTimeout(connect, 1500); } catch (e) { if (!controller.signal.aborted) setTimeout(connect, 2500); } }; connect(); }
function stopStream() { state.stream?.abort(); state.stream = null; }
async function withSubmit(form, task, errorNode) { const button = qs('[type="submit"]', form); errorNode.textContent = ''; button.disabled = true; try { await task(); } catch (e) { errorNode.textContent = e instanceof SyntaxError ? 'Le JSON est invalide.' : e.message; } finally { button.disabled = false; } }
function showFatal(error) { appRoot().innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>Service indisponible</h1><p class="error-box">${escapeHtml(error.message)}</p><button class="button" onclick="location.reload()">Réessayer</button></section></main>`; }

document.addEventListener('keydown', event => { if (event.key === '/' && state.page === 'tunnels' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); qs('#filter')?.focus(); } });
boot();
