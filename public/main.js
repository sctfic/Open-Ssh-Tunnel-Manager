// main.js
// Variables globales
const API_BASE_URL = "http://ostm.lpz.ovh/api/v1";
let tunnelsData = [];
let currentView = 'list';
let searchTimeout = null;

// Éléments DOM
const tunnelList = document.getElementById('tunnelList');
const startAllBtn = document.getElementById('startAllBtn');
const stopAllBtn = document.getElementById('stopAllBtn');
const refreshBtn = document.getElementById('refreshBtn');
const addTunnelBtn = document.getElementById('addTunnelBtn');
const addTunnelModal = document.getElementById('addTunnelModal');
const pairingForm = document.getElementById('pairingForm');
const closeModalBtn = addTunnelModal.querySelector('.close');
const cancelModalBtn = addTunnelModal.querySelector('.cancel-modal');
const loadingOverlay = document.getElementById('loadingOverlay');
const notification = document.getElementById('notification');
const notificationIcon = notification.querySelector('.notification-icon');
const notificationMessage = notification.querySelector('.notification-message');
const viewButtons = document.querySelectorAll('.view-btn');

// Fonctions d'utilitaires
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showNotification(message, type = 'success') {
    notificationMessage.textContent = message;
    notification.className = `notification notification-${type}`;
    notificationIcon.className = `fas notification-icon ${
        type === 'success' ? 'fa-check-circle' :
        type === 'error' ? 'fa-exclamation-circle' :
        'fa-info-circle'
    }`;
    notification.classList.add('show-notification');
    
    setTimeout(() => {
        notification.classList.remove('show-notification');
    }, 3000);
}

// Fonctions API (unchanged from previous, included for completeness)
async function fetchData(endpoint) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        const data = await response.json();
        console.log(data);
        hideLoading();

        if (!data.success) {
            throw new Error(data.message || 'Une erreur est survenue');
        }
        
        return data;
    } catch (error) {
        hideLoading();
        showNotification(error.message, 'error');
        console.error('API Error:', error);
        return null;
    }
}

async function postData(endpoint, body) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        hideLoading();
        
        if (!data.success) {
            throw new Error(data.message || 'Une erreur est survenue');
        }
        
        return data;
    } catch (error) {
        hideLoading();
        showNotification(error.message, 'error');
        console.error('API Error:', error);
        return null;
    }
}

async function deleteData(endpoint) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        hideLoading();
        
        if (!data.success) {
            throw new Error(data.message || 'Une erreur est survenue');
        }
        
        return data;
    } catch (error) {
        hideLoading();
        showNotification(error.message, 'error');
        console.error('API Error:', error);
        return null;
    }
}

// Fonctions de gestion de tunnels
async function fetchTunnels() {
    const data = await fetchData('/tunnels/status');
    if (data) {
        tunnelsData = data.tunnels;
        renderTunnels(tunnelsData);
        updateDashboardStats();
        showNotification(data.message, 'info');
    }
}

async function startTunnel(tunnelId) {
    const endpoint = tunnelId ? `/tunnels/start/${tunnelId}` : '/tunnels/start';
    const data = await fetchData(endpoint);
    if (data) {
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

async function stopTunnel(tunnelId) {
    const endpoint = tunnelId ? `/tunnels/stop/${tunnelId}` : '/tunnels/stop';
    const data = await fetchData(endpoint);
    if (data) {
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

async function restartTunnel(tunnelId) {
    const endpoint = tunnelId ? `/tunnels/restart/${tunnelId}` : '/tunnels/restart';
    const data = await fetchData(endpoint);
    if (data) {
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

async function checkTunnel(tunnelId) {
    const data = await fetchData(`/channel/check/${tunnelId}`);
    if (data) {
        console.log(`Tunnel ${tunnelId} checked:`, data);
        const tunnelItem = document.querySelector(`[data-tunnel-id="${tunnelId}"]`);
        if (tunnelItem) {
            const channelsContainer = tunnelItem.querySelector('.channels-list');
            renderChannels(data.channels, channelsContainer, tunnelId);
            console.log(data.channels, channelsContainer, tunnelId);
            
            const upBandwidth = tunnelItem.querySelector('.up-bandwidth');
            const downBandwidth = tunnelItem.querySelector('.down-bandwidth');
            const upValue = tunnelItem.querySelector('.up-value');
            const downValue = tunnelItem.querySelector('.down-value');
            
            if (data.bandwidth) {
                upBandwidth.value = data.bandwidth.up;
                downBandwidth.value = data.bandwidth.down;
                upValue.textContent = `${data.bandwidth.up} Kbps`;
                downValue.textContent = `${data.bandwidth.down} Kbps`;
            }
        }
        
        showNotification("Informations du tunnel mises à jour", 'info');
    }
}

async function updateBandwidth(tunnelId, up, down) {
    const data = await postData(`/tunnels/bandwidth/${tunnelId}`, { up, down });
    if (data) {
        showNotification(`Bande passante mise à jour pour ${tunnelId}`, 'success');
    }
}

async function addPortForward(tunnelId, portData) {
    const data = await postData(`/channel/add/${tunnelId}`, portData);
    if (data) {
        showNotification(data.message, 'success');
        await checkTunnel(tunnelId);
    }
}

async function removePortForward(tunnelId, type, port) {
    const data = await deleteData(`/channel/rm/${tunnelId}/${type}/${port}`);
    if (data) {
        showNotification(data.message, 'success');
        await checkTunnel(tunnelId);
    }
}

async function addTunnel(tunnelData) {
    const data = await postData('/pairing/plug', tunnelData);
    if (data) {
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

async function removeTunnel(tunnelId) {
    const data = await deleteData(`/pairing/unplug/${tunnelId}`);
    if (data) {
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

// Fonctions de rendu
function updateDashboardStats() {
    const totalTunnels = tunnelsData.length;
    const activeTunnels = tunnelsData.filter(t => t.status === 'running').length;
    const inactiveTunnels = tunnelsData.filter(t => t.status === 'stopped').length;
    const orphanTunnels = tunnelsData.filter(t => t.status === 'orphan').length;

    document.getElementById('totalTunnels').textContent = totalTunnels;
    document.getElementById('activeTunnels').textContent = activeTunnels;
    document.getElementById('inactiveTunnels').textContent = inactiveTunnels;
    document.getElementById('totalChannels').textContent = tunnelsData.reduce((sum, t) => {
        return sum + (t.channels ?
            Object.values(t.channels).reduce((s, ch) => s + Object.keys(ch).length, 0) : 0);
    }, 0);
}

function renderTunnels(tunnels) {
    tunnelList.innerHTML = '';
    
    if (tunnels.length === 0) {
        tunnelList.innerHTML = `
            <li class="tunnel-empty">
                <i class="fas fa-info-circle"></i> Aucun tunnel trouvé. Cliquez sur "Nouveau tunnel" pour commencer.
            </li>
        `;
        return;
    }

    const template = document.getElementById('tunnelItemTemplate').content;
    
    tunnels.forEach(tunnel => {
        if (!tunnel.id) return;
        
        const clone = document.importNode(template, true);
        const item = clone.querySelector('.tunnel-item');
        item.setAttribute('data-tunnel-id', tunnel.id);
        item.setAttribute('data-status', tunnel.status || 'orphan');
        
        const statusClass = tunnel.status === 'running' ? 'status-running' :
                          tunnel.status === 'stopped' ? 'status-stopped' :
                          'status-orphan';
        
        item.querySelector('.status-indicator').className = `status-indicator ${statusClass}`;
        item.querySelector('.tunnel-name').textContent = tunnel.configName || tunnel.id;
        item.querySelector('.tunnel-ip').textContent = `${tunnel.ip || 'N/A'}:${tunnel.ssh_port || 22}`;
        item.querySelector('.tunnel-name-value').textContent = tunnel.configName || tunnel.id;
        item.querySelector('.tunnel-ip-value').textContent = `${tunnel.ip || 'N/A'}:${tunnel.ssh_port || 22}`;
        item.querySelector('.tunnel-status-value').textContent = tunnel.status || 'N/A';
        item.querySelector('.tunnel-pid-value').textContent = tunnel.pid || 'N/A';
        item.querySelector('.tunnel-cmd-value').setAttribute('title', tunnel.cmd || 'Aucune commande');
        
        const channelsCount = tunnel.channels ?
            Object.values(tunnel.channels).reduce((sum, ch) => sum + Object.keys(ch).length, 0) : 0;
        item.querySelector('.channels-count .count').textContent = channelsCount;
        
        const upSpeed = tunnel.bandwidth?.up || 0;
        const downSpeed = tunnel.bandwidth?.down || 0;
        item.querySelector('.up-speed').textContent = upSpeed;
        item.querySelector('.down-speed').textContent = downSpeed;
        
        const startBtn = item.querySelector('.start-btn');
        const stopBtn = item.querySelector('.stop-btn');
        if (tunnel.status === 'running') {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
        
        tunnelList.appendChild(clone);
        
        setupTunnelEvents(item, tunnel.id);
    });
}

function renderChannels(channels, container, tunnelId) {
    if (!channels || Object.keys(channels).length === 0) {
        container.innerHTML = '<li class="channel-empty">Aucun channel configuré.</li>';
        return;
    }
    
    container.innerHTML = '';
    const template = document.getElementById('channelItemTemplate').content;
    
    const addChannel = (type, port, channel) => {
        const clone = document.importNode(template, true);
        const statusClass = channel.success ? 'status-running' : 'status-stopped';
        
        clone.querySelector('.channel-type').textContent = type;
        clone.querySelector('.status-indicator').className = `status-indicator ${statusClass}`;
        clone.querySelector('.channel-name').textContent = channel.name || 'Sans nom';
        
        let details = `Port: ${port}`;
        if (type === '-L' || type === '-R') {
            details += ` - Destination: ${channel.endpoint_host}:${channel.endpoint_port}`;
        }
        if (type === '-R' && channel.listen_host) {
            details += ` - Hôte: ${channel.listen_host}`;
        }
        clone.querySelector('.channel-details').textContent = details;
        
        clone.querySelector('.remove-channel-btn').setAttribute('data-type', type);
        clone.querySelector('.remove-channel-btn').setAttribute('data-port', port);
        
        container.appendChild(clone);
    };
    
    ['-L', '-R', '-D'].forEach(type => {
        if (channels[type]) {
            Object.entries(channels[type]).forEach(([port, channel]) => addChannel(type, port, channel));
        }
    });
}

// Fonctions d'événements
function setupTunnelEvents(item, tunnelId) {
    const tunnelHeader = item.querySelector('.tunnel-header');
    const toggleBtn = item.querySelector('.toggle-btn');
    const checkBtn = item.querySelector('.check-btn');
    const startBtn = item.querySelector('.start-btn');
    const stopBtn = item.querySelector('.stop-btn');
    const restartBtn = item.querySelector('.restart-btn');
    const removeBtn = item.querySelector('.remove-btn');
    const updateBandwidthBtn = item.querySelector('.update-bandwidth-btn');
    const portForwardForm = item.querySelector('.port-forward-form');
    const portTypeSelect = item.querySelector('.port-type');
    const listenHostRow = item.querySelector('.listen-host-row');
    const endpointRow = item.querySelector('.endpoint-row');
    const addChannelToggle = item.querySelector('.add-channel-toggle');
    const addChannelForm = item.querySelector('.add-channel-form');
    const cancelAddChannel = item.querySelector('.cancel-add-channel');
    const tabs = item.querySelectorAll('.tab-btn');
    
    const showTab = (tabName) => {
        tabs.forEach(t => t.classList.remove('active'));
        item.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        
        const activeTab = item.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = item.querySelector(`#${tabName}-tab`);
        
        if (activeTab && activeContent) {
            activeTab.classList.add('active');
            activeContent.classList.remove('hidden');
            
            if (tabName === 'channels' && !item.hasAttribute('data-channels-loaded')) {
                checkTunnel(tunnelId);
                item.setAttribute('data-channels-loaded', 'true');
            }
        }
    };
    
    tunnelHeader.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || currentView === 'compact') return;
        item.classList.toggle('active');
        showTab('channels');
        toggleBtn.querySelector('i').className = item.classList.contains('active') ?
            'fas fa-chevron-up' : 'fas fa-chevron-down';
        if (item.classList.contains('active') && !item.hasAttribute('data-loaded')) {
            checkTunnel(tunnelId);
            item.setAttribute('data-loaded', 'true');
        }
    });
    
    toggleBtn.addEventListener('click', () => {
        item.classList.toggle('active');
        showTab('channels');
        toggleBtn.querySelector('i').className = item.classList.contains('active') ?
            'fas fa-chevron-up' : 'fas fa-chevron-down';
        if (item.classList.contains('active') && !item.hasAttribute('data-loaded')) {
            checkTunnel(tunnelId);
            item.setAttribute('data-loaded', 'true');
        }
    });
    
    checkBtn.addEventListener('click', () => checkTunnel(tunnelId));
    startBtn.addEventListener('click', () => startTunnel(tunnelId));
    stopBtn.addEventListener('click', () => stopTunnel(tunnelId));
    restartBtn.addEventListener('click', () => restartTunnel(tunnelId));
    
    removeBtn.addEventListener('click', () => {
        const confirmModal = document.getElementById('confirmModal');
        const confirmMessage = document.getElementById('confirmMessage');
        const acceptConfirm = document.getElementById('acceptConfirm');
        
        confirmMessage.textContent = `Voulez-vous vraiment supprimer le tunnel ${tunnelId} ?`;
        confirmModal.style.display = 'flex';
        
        const confirmHandler = () => {
            removeTunnel(tunnelId);
            confirmModal.style.display = 'none';
            acceptConfirm.removeEventListener('click', confirmHandler);
        };
        
        acceptConfirm.addEventListener('click', confirmHandler);
    });
    
    updateBandwidthBtn.addEventListener('click', () => {
        const up = parseInt(item.querySelector('.up-bandwidth').value);
        const down = parseInt(item.querySelector('.down-bandwidth').value);
        updateBandwidth(tunnelId, up, down);
    });
    
    const upBandwidth = item.querySelector('.up-bandwidth');
    const downBandwidth = item.querySelector('.down-bandwidth');
    const upValue = item.querySelector('.up-value');
    const downValue = item.querySelector('.down-value');
    
    upBandwidth.addEventListener('input', () => {
        upValue.textContent = `${upBandwidth.value} Kbps`;
    });
    
    downBandwidth.addEventListener('input', () => {
        downValue.textContent = `${downBandwidth.value} Kbps`;
    });
    
    portTypeSelect.addEventListener('change', () => {
        const type = portTypeSelect.value;
        listenHostRow.style.display = type === '-R' ? 'flex' : 'none';
        endpointRow.style.display = type === '-D' ? 'none' : 'flex';
    });
    
    addChannelToggle.addEventListener('click', () => {
        addChannelForm.style.display = addChannelForm.style.display === 'none' ? 'block' : 'none';
    });
    
    cancelAddChannel.addEventListener('click', () => {
        addChannelForm.style.display = 'none';
        portForwardForm.reset();
    });
    
    portForwardForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const type = portTypeSelect.value;
        const name = item.querySelector('.port-name').value.trim();
        const listenPort = parseInt(item.querySelector('.listen-port').value);
        
        if (!name) {
            showNotification('Le nom du channel est requis', 'error');
            return;
        }
        
        if (!listenPort || listenPort < 1 || listenPort > 65535) {
            showNotification('Le port d\'écoute doit être entre 1 et 65535', 'error');
            return;
        }
        
        const portData = { type, name, listen_port: listenPort };
        
        if (type === '-R') {
            const listenHost = item.querySelector('.listen-host').value.trim();
            if (listenHost) portData.listen_host = listenHost;
        }
        
        if (type === '-L' || type === '-R') {
            const endpointHost = item.querySelector('.endpoint-host').value.trim();
            const endpointPort = parseInt(item.querySelector('.endpoint-port').value);
            
            if (!endpointHost) {
                showNotification('L\'hôte de destination est requis', 'error');
                return;
            }
            
            if (!endpointPort || endpointPort < 1 || endpointPort > 65535) {
                showNotification('Le port de destination doit être entre 1 et 65535', 'error');
                return;
            }
            
            portData.endpoint_host = endpointHost;
            portData.endpoint_port = endpointPort;
        }
        
        addPortForward(tunnelId, portData);
        addChannelForm.style.display = 'none';
        portForwardForm.reset();
    });
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab);
        });
    });
    
    item.querySelectorAll('.remove-channel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const port = btn.dataset.port;
            removePortForward(tunnelId, type, port);
        });
    });
}

// Gestion des vues
function setupViewToggle() {
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentView = btn.dataset.view;
            tunnelList.className = `tunnel-list ${currentView}-view`;
            renderTunnels(tunnelsData);
        });
    });
}

// Événements globaux
function setupGlobalEvents() {
    startAllBtn.addEventListener('click', () => startTunnel());
    stopAllBtn.addEventListener('click', () => stopTunnel());
    refreshBtn.addEventListener('click', () => {
        showNotification('Mise à jour des tunnels...', 'info');
        fetchTunnels();
    });
    
    addTunnelBtn.addEventListener('click', () => {
        addTunnelModal.style.display = 'flex';
    });
    
    closeModalBtn.addEventListener('click', () => {
        addTunnelModal.style.display = 'none';
        pairingForm.reset();
    });
    
    cancelModalBtn.addEventListener('click', () => {
        addTunnelModal.style.display = 'none';
        pairingForm.reset();
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === addTunnelModal) {
            addTunnelModal.style.display = 'none';
            pairingForm.reset();
        }
    });
    
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('close') || e.target.id === 'cancelConfirm') {
            document.getElementById('confirmModal').style.display = 'none';
        }
    });
    
    pairingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const configName = document.getElementById('configName').value.trim();
        const ip = document.getElementById('ip').value.trim();
        const adminUser = document.getElementById('adminUser').value.trim();
        const adminPass = document.getElementById('adminPass').value;
        
        if (!configName.match(/^[a-zA-Z0-9-]+$/)) {
            showNotification('Le nom de configuration doit contenir uniquement lettres, chiffres et tirets', 'error');
            return;
        }
        
        if (!ip.match(/^((\d{1,3}\.){3}\d{1,3}|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})$/)) {
            showNotification('Adresse IP ou domaine invalide', 'error');
            return;
        }
        
        if (!adminUser) {
            showNotification('Le nom d\'utilisateur est requis', 'error');
            return;
        }
        
        if (!adminPass) {
            showNotification('Le mot de passe ou la clé est requis', 'error');
            return;
        }
        
        const tunnelData = { configName, ip, adminUser, adminPass };
        addTunnel(tunnelData);
        addTunnelModal.style.display = 'none';
        pairingForm.reset();
    });
    
    const togglePassword = document.querySelector('.toggle-password');
    const adminPass = document.getElementById('adminPass');
    
    togglePassword.addEventListener('click', () => {
        const type = adminPass.type === 'password' ? 'text' : 'password';
        adminPass.type = type;
        togglePassword.querySelector('i').className = `fas fa-eye${type === 'password' ? '' : '-slash'}`;
    });
    
    document.getElementById('searchTunnel').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const search = e.target.value.toLowerCase().trim();
            const status = document.getElementById('statusFilter').value;
            let filtered = tunnelsData;
            if (search) {
                filtered = filtered.filter(tunnel =>
                    (tunnel.id && tunnel.id.toLowerCase().includes(search)) ||
                    (tunnel.ip && tunnel.ip.toLowerCase().includes(search))
                );
            }
            
            if (status !== 'all') {
                filtered = filtered.filter(tunnel => tunnel.status === status);
            }
            
            renderTunnels(filtered);
        }, 300);
    });
    
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        const status = e.target.value;
        const search = document.getElementById('searchTunnel').value.toLowerCase().trim();
        
        let filtered = tunnelsData;
        if (status !== 'all') {
            filtered = filtered.filter(tunnel => tunnel.status === status);
        }
        
        if (search) {
            filtered = filtered.filter(tunnel =>
                (tunnel.configName || tunnel.id).toLowerCase().includes(search) ||
                tunnel.ip.toLowerCase().includes(search)
            );
        }
        
        renderTunnels(filtered);
    });
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalEvents();
    setupViewToggle();
    fetchTunnels();
});