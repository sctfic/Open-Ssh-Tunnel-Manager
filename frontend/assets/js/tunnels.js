import { escapeHtml as esc, qs, formData, openDialog, toast } from './ui.js';

// SVG locaux : aucun téléchargement externe ni police d'icônes nécessaire.
const paths = {
  start: '<path d="m8 5 11 7-11 7Z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  restart: '<path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 7l-3 3"/>',
  add: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  settings: '<path d="m9 3-.5 3-2 1-2.5-1-2 3 2 2v2l-2 2 2 3 2.5-1 2 1 .5 3h6l.5-3 2-1 2.5 1 2-3-2-2v-2l2-2-2-3-2.5 1-2-1L15 3Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const button = (name, label, attr, disabled = false) => `<button class="icon-button" title="${label}" aria-label="${label}" ${attr} ${disabled ? 'disabled' : ''}>${icon(name)}</button>`;
const rate = value => value ? `${value.toLocaleString('fr-FR')} Ko/s` : 'Illimité';
const labels = { stopped: 'Arrêté', running: 'Actif', starting: 'Démarrage', stopping: 'Arrêt', reconnecting: 'Reconnexion', error: 'Erreur' };

// Partager le filtre garantit que les commandes groupées visent exactement les
// mêmes tunnels que la liste, y compris lorsqu'un nom de channel correspond.
export function filterTunnels(tunnels, query) {
  const term = query.trim().toLocaleLowerCase('fr');
  return tunnels.filter(t => [t.id, `${t.config.user}@${t.config.ip}:${t.config.ssh_port}`,
    ...Object.values(t.config.tunnels).flatMap(group => Object.values(group).map(c => c.name))
  ].some(value => String(value).toLocaleLowerCase('fr').includes(term)));
}

export function cardHtml(tunnel, open, checks = {}) {
  const c = tunnel.config;
  return `<article class="tunnel-card" data-id="${esc(tunnel.id)}">
    <div class="tunnel-heading">
      <button class="tunnel-expand" aria-expanded="${open}" aria-label="${open ? 'Replier' : 'Déplier'} ${esc(tunnel.id)}" data-expand>
        <span class="status status--${esc(tunnel.status)}"><span></span>${esc(labels[tunnel.status] || tunnel.status)}</span>
        <span class="tunnel-title"><strong>${esc(tunnel.id)} <small class="limits">↙ ${rate(c.bandwidth.down)} · ↗ ${rate(c.bandwidth.up)}</small></strong></span>
      </button>
      <div class="compact-actions">
        ${tunnel.level >= 2 ? button('start', 'Démarrer', 'data-action="start"', tunnel.desired === 'running') + button('stop', 'Arrêter', 'data-action="stop"', tunnel.desired === 'stopped') + button('restart', 'Redémarrer', 'data-action="restart"') : ''}
        ${tunnel.level >= 3 ? button('add', 'Ajouter un channel', 'data-add-channel') : ''}
        ${tunnel.level >= 3 ? `<div class="tunnel-menu">${button('menu', 'Menu du tunnel', 'data-menu aria-expanded="false"')}<div class="menu-items" hidden><button data-bandwidth>Débit</button>${tunnel.level >= 4 ? '<button data-rights>Déléguer</button><button data-delete>Supprimer</button>' : ''}</div></div>` : ''}
      </div>
    </div>
    <div class="tunnel-body" ${open ? '' : 'hidden'}>
      ${tunnel.error ? `<p class="error-box">${esc(tunnel.error)}</p>` : ''}
      <div class="channels">${channelsHtml(c.tunnels, checks)}</div>
      <footer class="tunnel-footer"><code>${esc(c.user)}@${esc(c.ip)}:${c.ssh_port}</code><span class="live-rates">↙ <b data-down>${Number(tunnel.metrics?.downKoPerSecond || 0).toFixed(1)}</b> · ↗ <b data-up>${Number(tunnel.metrics?.upKoPerSecond || 0).toFixed(1)}</b> Ko/s</span></footer>
    </div>
  </article>`;
}

export function channelsHtml(groups, checks = {}) {
  return Object.entries(groups).flatMap(([type, group]) => Object.entries(group).map(([port, c]) => {
    const check = checks[`${type}:${port}`] || {};
    const address = (host, number) => `${host || '*'}:${number}`;
    // Pour -R, le port d'écoute est distant et la destination est locale.
    const local = type === '-R' ? address(c.endpoint_host, c.endpoint_port) : address(c.listen_host, c.listen_port);
    const remote = type === '-R' ? address(c.listen_host, c.listen_port) : type === '-D' ? 'Destination SOCKS dynamique' : address(c.endpoint_host, c.endpoint_port);
    const badge = (kind, label) => {
      const latency = check[kind], ok = typeof latency === 'number' && Number.isFinite(latency);
      const status = ok ? 'réussi' : check[`${kind}Error`] ? 'échoué' : 'non disponible';
      const timing = ok ? ` · ${latency} ms` : '';
      const timeout = check[`${kind}Error`] === 'timeout' ? ' · délai dépassé (600 ms)' : '';
      const unavailable = kind === 'icmp' && check.icmpError === 'ping-unavailable' ? ' · outil ping indisponible' : '';
      const description = esc(`${label} : ${status}${timing}${timeout}${unavailable}`);
      return `<span class="probe probe--${kind} ${ok ? 'probe--ok' : ''}" title="${description}" aria-label="${description}">${icon('check')}</span>`;
    };
    const arrow = type === '-R' ? '←' : type === '-D' ? '⇢' : '→';
    const endpoint = type === '-D' ? null : address(c.endpoint_host, c.endpoint_port);
    return `<div class="channel-flow" data-channel-type="${type}" data-channel-port="${port}" data-channel-name="${esc(c.name)}"><strong>${esc(c.name)}</strong><span class="channel-route"><code class="channel-local">${esc(local)}</code><span class="flow-arrow" title="${type}" aria-label="Redirection ${type}">${arrow}</span><code class="channel-remote">${esc(remote)}</code></span><span class="probe-pair">${badge('tcp', endpoint ? `TCP vers le port final ${endpoint}` : 'TCP sans destination fixe')}${badge('icmp', 'ICMP direct depuis le backend')}</span></div>`;
  })).join('') || '<p class="muted">Aucun channel. Utilisez + pour en ajouter un.</p>';
}

// 0..1000 représente quatre décades ; le cran 1001 signifie illimité.
export const sliderRate = value => Number(value) === 1001 ? 0 : Math.round(10 ** (Number(value) / 250));
export const rateSlider = value => value === 0 ? 1001 : Math.log10(Math.max(1, Math.min(10000, value))) * 250;

export function bandwidthDialog(tunnel, save) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<form class="stack"><p class="muted">De 1 Ko/s à 10 000 Ko/s (10 Mo/s), puis un dernier cran Illimité.</p>${['down', 'up'].map(dir => `<label>${dir === 'down' ? '↙ Download' : '↗ Upload'} <output data-output="${dir}"></output><input name="${dir}" type="range" min="0" max="1001" step="1" value="${rateSlider(tunnel.config.bandwidth[dir])}"></label>`).join('')}<button class="button button--primary" type="submit">Enregistrer</button><p class="form-error" role="alert"></p></form>`;
  const dialog = openDialog(`Débit · ${tunnel.id}`, wrap);
  const form = qs('form', wrap);
  const update = () => ['up', 'down'].forEach(dir => {
    const value = sliderRate(form.elements[dir].value);
    qs(`[data-output="${dir}"]`, form).textContent = value === 0 ? 'Illimité' : `${value} Ko/s`;
  });
  form.addEventListener('input', update); update();
  submit(form, async () => {
    await save(Object.fromEntries(['up', 'down'].map(dir => [dir, sliderRate(form.elements[dir].value)])));
    dialog.close();
  });
}

export function channelDialog(tunnel, save) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<form class="stack"><label>Type de redirection<select name="type"><option value="-L">Local (-L) : local → distant</option><option value="-R">Remote (-R) : distant → local</option><option value="-D">SOCKS (-D) : destination dynamique</option></select></label>
    <label>Nom<input name="name" maxlength="100" required></label>
    <div class="form-grid"><label data-host-label="localHost">IP locale<input name="localHost" value="127.0.0.1" required></label><label>Port local<input name="localPort" type="number" min="1" max="65535" required></label></div>
    <div class="form-grid" data-remote><label data-host-label="remoteHost">IP distante<input name="remoteHost" value="127.0.0.1" required></label><label>Port distant<input name="remotePort" type="number" min="1" max="65535" required></label></div>
    <p class="muted">* écoute sur toutes les interfaces. Double-cliquez sur ce champ pour imposer 0.0.0.0.</p>
    <p class="muted">${tunnel.desired === 'running' ? 'Le tunnel sera redémarré automatiquement après l’ajout.' : 'Le channel sera activé au prochain démarrage du tunnel.'}</p><button class="button button--primary" type="submit">Ajouter</button><p class="form-error" role="alert"></p></form>`;
  const dialog = openDialog(`Ajouter un channel · ${tunnel.id}`, wrap); const form = qs('form', wrap);
  const setWildcard = (input, enabled) => {
    if (enabled) {
      if (input.value !== '*') input.dataset.explicitAddress = input.value;
      input.value = '*'; input.disabled = true;
    } else {
      input.disabled = false;
      if (input.value === '*') input.value = input.dataset.explicitAddress || '127.0.0.1';
    }
  };
  const updateType = () => {
    const type = form.elements.type.value, socks = type === '-D';
    qs('[data-remote]', form).hidden = socks;
    setWildcard(form.elements.localHost, type !== '-R');
    setWildcard(form.elements.remoteHost, type === '-R');
    // Les champs de destination distante n'existent pas pour SOCKS.
    if (socks) { form.elements.remoteHost.disabled = true; form.elements.remotePort.disabled = true; }
    else form.elements.remotePort.disabled = false;
  };
  for (const input of [form.elements.localHost, form.elements.remoteHost]) {
    input.addEventListener('input', () => { input.dataset.explicitAddress = input.value; });
    qs(`[data-host-label="${input.name}"]`, form).addEventListener('dblclick', event => {
      // Un input HTML disabled ne reçoit pas lui-même le double-clic : le label
      // sert de zone active tout en conservant la vraie sémantique disabled.
      if (!input.disabled || (input.name === 'remoteHost' && form.elements.type.value === '-D')) return;
      event.preventDefault(); input.disabled = false; input.value = '0.0.0.0'; input.dataset.explicitAddress = input.value; input.focus(); input.select();
    });
  }
  form.elements.type.addEventListener('change', updateType); updateType();
  submit(form, async () => {
    const v = formData(form), reverse = v.type === '-R';
    const listenInput = reverse ? form.elements.remoteHost : form.elements.localHost;
    const endpointInput = reverse ? form.elements.localHost : form.elements.remoteHost;
    const body = { type: v.type, name: v.name, listen_host: listenInput.value === '*' ? '' : listenInput.value, listen_port: Number(reverse ? v.remotePort : v.localPort) };
    if (v.type !== '-D') Object.assign(body, { endpoint_host: endpointInput.value, endpoint_port: Number(reverse ? v.localPort : v.remotePort) });
    await save(body); dialog.close();
  });
}

export function channelContextMenu(event, tunnel, row, actions) {
  event.preventDefault(); document.querySelector('.channel-context')?.remove();
  document.querySelector('.channel-flow--context')?.classList.remove('channel-flow--context');
  row.classList.add('channel-flow--context');
  const menu = document.createElement('div'); menu.className = 'channel-context';
  menu.innerHTML = '<button data-rename>Renommer</button><button data-remove>Supprimer</button>';
  menu.style.left = `${Math.min(event.clientX, innerWidth - 160)}px`;
  menu.style.top = `${Math.min(event.clientY, innerHeight - 100)}px`;
  document.body.append(menu);
  const dismiss = () => { menu.remove(); row.classList.remove('channel-flow--context'); document.removeEventListener('pointerdown', close); };
  const close = pointer => { if (!menu.contains(pointer.target)) dismiss(); };
  setTimeout(() => document.addEventListener('pointerdown', close));
  qs('[data-rename]', menu).addEventListener('click', () => {
    dismiss();
    const wrap = document.createElement('div');
    wrap.innerHTML = `<form class="stack"><label>Nouveau nom<input name="name" maxlength="100" value="${esc(row.dataset.channelName)}" required autofocus></label><button class="button button--primary" type="submit">Renommer</button><p class="form-error" role="alert"></p></form>`;
    const dialog = openDialog(`Renommer · ${tunnel.id}`, wrap); const form = qs('form', wrap);
    submit(form, async () => { await actions.rename(row.dataset.channelType, row.dataset.channelPort, formData(form).name); dialog.close(); });
  });
  qs('[data-remove]', menu).addEventListener('click', async () => {
    dismiss();
    if (confirm(`Supprimer le channel « ${row.dataset.channelName} » ?`)) {
      try { await actions.remove(row.dataset.channelType, row.dataset.channelPort); }
      catch (error) { toast(error.message, 'error'); }
    }
  });
}

function submit(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = qs('[type="submit"]', form), error = qs('.form-error', form);
    button.disabled = true; error.textContent = '';
    try { await action(); } catch (e) { error.textContent = e.message; } finally { button.disabled = false; }
  });
}
