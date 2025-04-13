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
// const refreshBtn = document.getElementById('refreshBtn');
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

// Logarithmic scale for sliders
function linearToLog(value, min, max) {
    // const minLog = Math.log(1); // Start at 1 to avoid log(0)
    // const maxLog = Math.log(max);
    // const scale = (maxLog - minLog) / (max - min);
    // return Math.exp(minLog + scale * (value - min));
    
    // Calculer la valeur logarithmique comme avant
    const minLog = Math.log(1);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / (max - min);
    const result = Math.exp(minLog + scale * (value - min));
    
    // Convertir en chaîne de caractères pour manipuler les chiffres
    const resultStr = result.toString();
    
    // Séparer la partie entière et décimale
    const parts = resultStr.split('.');
    let integerPart = parts[0];
    let decimalPart = parts.length > 1 ? parts[1] : '';
    
    // Calculer combien de chiffres doivent être remplacés dans la partie entière
    const intLength = integerPart.length;
    const intZerosCount = Math.floor(intLength / 2);
    
    // Remplacer la moitié droite de la partie entière par des zéros
    if (intZerosCount > 0) {
        integerPart = integerPart.substring(0, intLength - intZerosCount) + '0'.repeat(intZerosCount);
    }
    
    // Remplacer tous les chiffres de la partie décimale par des zéros si elle existe
    if (decimalPart) {
        decimalPart = '0'.repeat(decimalPart.length);
    }
    
    // Reconstruire le nombre
    const modifiedResult = parseFloat(integerPart + (decimalPart ? '.' + decimalPart : ''));
    
    return modifiedResult;
}

function logToLinear(value, min, max) {
    const minLog = Math.log(1);
    const maxLog = Math.log(max);
    const scale = (maxLog - minLog) / (max - min);
    return min + (Math.log(value) - minLog) / scale;
}

// Fonctions API
async function fetchData(endpoint) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        const data = await response.json();
        // console.log(data);
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
    // console.log('checkTunnel', data);
    if (data) {
        const tunnelItem = document.querySelector(`[data-tunnel-id="${tunnelId}"]`);
        if (tunnelItem) {
            const channelsContainer = tunnelItem.querySelector('.channels-list');
            renderChannels(data.channels, channelsContainer, tunnelId);
            // console.log(data.channels, channelsContainer, tunnelId);
            
            const upBandwidth = tunnelItem.querySelector('.up-bandwidth');
            const downBandwidth = tunnelItem.querySelector('.down-bandwidth');
            const upValue = tunnelItem.querySelector('.up-value');
            const downValue = tunnelItem.querySelector('.down-value');
            
            if (data.bandwidth) {
                upBandwidth.value = logToLinear(data.bandwidth.up, 0, 10000);
                downBandwidth.value = logToLinear(data.bandwidth.down, 0, 10000);
                upValue.textContent = `${Math.round(data.bandwidth.up)} Ko/s`;
                downValue.textContent = `${Math.round(data.bandwidth.down)} Ko/s`;
            }
        }
        
        showNotification("Informations du tunnel mises à jour", 'info');
    }
}

async function updateBandwidth(tunnelId, up, down) {
    // Trouver l'état actuel du tunnel AVANT l'appel API
    const tunnel = tunnelsData.find(t => t.id === tunnelId);
    const wasRunning = tunnel && tunnel.status === 'running';

    const logUp = Math.round(linearToLog(up, 0, 10000));
    const logDown = Math.round(linearToLog(down, 0, 10000));
    const data = await postData(`/tunnels/bandwidth/${tunnelId}`, { up: logUp, down: logDown });

    if (data) {
        showNotification(`Bande passante mise à jour pour ${tunnelId}`, 'success');
        // Redémarrer si le tunnel tournait ***
        if (wasRunning) {
            showNotification(`Redémarrage du tunnel ${tunnelId} pour appliquer les changements...`, 'info');
            // On utilise setTimeout pour laisser la première notification s'afficher brièvement
            setTimeout(() => restartTunnel(tunnelId), 500);
        } else {
            // Si le tunnel était arrêté, on rafraîchit juste les données sans redémarrer
            fetchTunnels(); // Pour s'assurer que l'affichage est cohérent
        }
    }
}

async function addPortForward(tunnelId, portData) {
    // Trouver l'état actuel du tunnel AVANT l'appel API
    const tunnel = tunnelsData.find(t => t.id === tunnelId);
    const wasRunning = tunnel && tunnel.status === 'running';

    const data = await postData(`/channel/add/${tunnelId}`, portData);
    if (data) {
        showNotification(data.message, 'success');
        // Redémarrer si le tunnel tournait ***
        if (wasRunning) {
             showNotification(`Redémarrage du tunnel ${tunnelId} pour activer le nouveau channel...`, 'info');
             // Utiliser restartTunnel qui rafraîchira tout, y compris le compte de channels
             setTimeout(() => restartTunnel(tunnelId), 500);
        } else {
            // Si le tunnel était arrêté, on met juste à jour les infos locales du channel sans redémarrer
            checkTunnel(tunnelId); // Met à jour la liste des channels dans l'UI
            // Il faut aussi mettre à jour le compteur dans le header de l'item manuellement
            // car fetchTunnels n'est pas appelé.
            const tunnelItem = document.querySelector(`.tunnel-item[data-tunnel-id="${tunnelId}"]`);
            if(tunnelItem) {
                const currentCountElement = tunnelItem.querySelector('.channels-count .count');
                if(currentCountElement) {
                    const currentCount = parseInt(currentCountElement.textContent || '0', 10);
                    currentCountElement.textContent = currentCount + 1;
                }
            }
            updateDashboardStats(); // Met à jour le total des channels global
        }
    }
}

async function removePortForward(tunnelId, type, port) {
    const data = await deleteData(`/channel/rm/${tunnelId}/${type}/${port}`);
    if (data) {
        showNotification(data.message, 'success');
                // console.log('checkTunnel called');
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
        // console.log(data)
        showNotification(data.message, 'success');
        await fetchTunnels();
    }
}

// Fonctions de rendu
function updateDashboardStats() {
    const totalTunnels = tunnelsData.length;
    const activeTunnels = tunnelsData.filter(t => t.status === 'running').length;
    const inactiveTunnels = tunnelsData.filter(t => t.status === 'stopped').length;
    const orphanTunnelsCount = tunnelsData.filter(t => t.status === 'orphan').length;
    const orphanTunnelsCard = document.getElementById('orphanTunnelsCard');

    document.getElementById('totalTunnels').textContent = totalTunnels;
    document.getElementById('activeTunnels').textContent = activeTunnels;
    document.getElementById('inactiveTunnels').textContent = inactiveTunnels;

    if (orphanTunnelsCount > 0) {
        document.getElementById('orphanTunnels').textContent = orphanTunnelsCount;
        orphanTunnelsCard.style.display = 'flex'; // Affiche la carte
    } else {
        orphanTunnelsCard.style.display = 'none'; // Masque la carte
    }

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
        const clone = document.importNode(template, true);
        const item = clone.querySelector('.tunnel-item');
        item.setAttribute('data-tunnel-id', tunnel.id);
        item.setAttribute('data-status', tunnel.status || 'orphan');
        
        const statusClass = tunnel.status === 'running' ? 'status-running' :
                          tunnel.status === 'stopped' ? 'status-stopped' :
                          'status-orphan';
        
        item.querySelector('.status-indicator').className = `status-indicator ${statusClass}`;
        item.querySelector('.tunnel-name').textContent = tunnel.id || 'Process Orphelin';
        item.querySelector('.tunnel-ip').textContent = `${tunnel.ip || 'PID'} : ${tunnel.ssh_port || tunnel.pid}`;
        item.querySelector('.tunnel-name-value').textContent = tunnel.id || '?';
        item.querySelector('.tunnel-ip-value').textContent = `${tunnel.ip} : ${tunnel.ssh_port}`;
        item.querySelector('.tunnel-status-value').textContent = tunnel.status || 'N/A';
        item.querySelector('.tunnel-pid-value').textContent = tunnel.pid || 'N/A';
        item.querySelector('.tunnel-cmd-value').textContent = tunnel.cmd || 'Aucune commande';
        
        const channelsCount = tunnel.channels ?
            Object.values(tunnel.channels).reduce((sum, ch) => sum + Object.keys(ch).length, 0) : 0;
        item.querySelector('.channels-count .count').textContent = channelsCount;
        
        const upSpeed = tunnel.bandwidth?.up || 0;
        const downSpeed = tunnel.bandwidth?.down || 0;
        item.querySelector('.up-speed').textContent = Math.round(upSpeed);
        item.querySelector('.down-speed').textContent = Math.round(downSpeed);
        
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
        
        setupTunnelEvents(item, tunnel.id, tunnel);
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
        const channelItem = clone.querySelector('.channel-item');
        const statusClass = channel.success ? 'status-running' : 'status-stopped';

        // *** MODIFICATION ICI pour channel-type ***
        const channelTypeSpan = clone.querySelector('.channel-type');
        channelTypeSpan.textContent = ''; // Vider le contenu
        // Réinitialiser les classes (important)
        channelTypeSpan.className = 'channel-type'; // Garde seulement la classe de base

        if (type === '-L') {
            iconClass = 'fa-right-long';
            typeTitle = 'Local Forward (-L)';
            // typeModifierClass = 'channel-type-L';
            forwardFrom = channel.listen_port;
            forwardTo = channel.endpoint_host +':'+ channel.endpoint_port;
            forwardTitle = 'Transmet vers (mode Local -L)'
            titleFrom = 'ecoute sur ...';
            titleTo = 'transmet vers ...';

        } else if (type === '-R') {
            iconClass = 'fa-left-long';
            typeTitle = 'Remote Forward (-R)';
            // typeModifierClass = 'channel-type-R';
            forwardFrom = channel.endpoint_host +':'+ channel.endpoint_port;
            forwardTo = channel.listen_host +':'+ channel.listen_port;
            forwardTitle = 'Recupere depuis (mode Remote -R)'
            titleFrom = 'transmet vers ...';
            titleTo = 'ecoute depuis ...';

        } else if (type === '-D') {
            iconClass = 'fa-arrows-left-right';
            typeTitle = 'Dynamic Forward (-D)';
            // typeModifierClass = 'channel-type-D';
            forwardFrom = channel.listen_port;
            forwardTo = '*:*';
            forwardTitle = 'tunnel SOCKS (mode Dynamique -D)'
            titleFrom = 'ecoute le Socks5 sur ...';
            titleTo = 'sortie globale';

        }

        // Ajouter les classes Font Awesome et la classe de rotation/type
        // if (iconClass) {
        //     channelTypeSpan.classList.add('fa', iconClass, typeModifierClass);
        // }
        // channelTypeSpan.title = typeTitle; // Définir le tooltip
        clone.querySelector('.status-indicator').className = `status-indicator ${statusClass}`;
        clone.querySelector('.channel-name').textContent = channel.name || 'Sans nom';
        
        let details = `<span title='${titleFrom}'>${forwardFrom}</span>
        <i class='fa ${iconClass}' title='${forwardTitle}'></i>
        <span title='${titleTo}'>${forwardTo}</span>`;
        
        clone.querySelector('.channel-details').innerHTML = details;
        
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
function setupTunnelEvents(item, tunnelId, tunnel) {
    const tunnelHeader = item.querySelector('.tunnel-header');
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
    const bandwidthInfo = item.querySelector('.bandwidth-info');
    
    const showTab = (tabName) => {
        tabs.forEach(t => t.classList.remove('active'));
        item.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        
        const activeTab = item.querySelector(`[data-tab="${tabName}"]`);
        const activeContent = item.querySelector(`#${tabName}-tab`);
        
        if (activeTab && activeContent) {
            activeTab.classList.add('active');
            activeContent.classList.remove('hidden');
            
            if (tabName === 'channels' && !item.hasAttribute('data-channels-loaded')) {
                // console.log('checkTunnel called');
                checkTunnel(tunnelId);
                // item.setAttribute('data-channels-loaded', 'true');
            } else if (tabName === 'settings') {
                const upBandwidth = item.querySelector('.up-bandwidth');
                const downBandwidth = item.querySelector('.down-bandwidth');
                const upValue = item.querySelector('.up-value');
                const downValue = item.querySelector('.down-value');
                
                // const up = tunnel.bandwidth?.up || 1000;
                // const down = tunnel.bandwidth?.down || 5000;
                // upBandwidth.value = logToLinear(up, 0, 10000);
                // downBandwidth.value = logToLinear(down, 0, 10000);
                // Gestion de la molette pour ajuster les valeurs
                
                function handleWheel(e) {
                    e.preventDefault();
                    const step = 100; // Ajustez ce pas selon les besoins
                    let value = parseInt(this.value);
                    
                    if (e.deltaY < 0) { // Molette vers le haut (augmentation)
                        value += step;
                    } else { // Molette vers le bas (diminution)
                        value -= step;
                    }
                    
                    value = Math.max(0, Math.min(10000, value));
                    this.value = value;
                    this.dispatchEvent(new Event('input')); // Déclenche la mise à jour de l'affichage
                }

                upBandwidth.addEventListener('wheel', handleWheel, { passive: false });
                downBandwidth.addEventListener('wheel', handleWheel, { passive: false });


                upValue.textContent = `${Math.round(up)} Ko/s`;
                downValue.textContent = `${Math.round(down)} Ko/s`;
            }
        }
    };
    
    tunnelHeader.addEventListener('click', (e) => {
        if (e.target.closest('button, .action-dropdown, .bandwidth-info')) {
            return; // Ne fait rien si le clic vient d'un bouton, dropdown ou bandwidthInfo
        }
        // console.log('Tunnel header clicked');
        if (currentView === 'compact') return;
        item.classList.toggle('active');
        if (item.classList.contains('active')) {
            showTab('channels'); // Affiche l'onglet channels par défaut
            // if (!item.hasAttribute('data-loaded')) { // Charge les données si nécessaire
            //     console.log('checkTunnel called');
            //    checkTunnel(tunnelId);
            //    item.setAttribute('data-loaded', 'true');
            // }
       }
    });
    
    bandwidthInfo.addEventListener('click', () => {
        // 1. Déplier le tunnel s'il ne l'est pas déjà
        if (!item.classList.contains('active')) {
             item.classList.add('active');
             // Charger les données si nécessaire (peut être redondant si checkTunnel est appelé dans showTab)
             if (!item.hasAttribute('data-loaded')) {
                // console.log('checkTunnel called');
                checkTunnel(tunnelId);
                item.setAttribute('data-loaded', 'true');
             }
        }
        // 2. Afficher l'onglet 'settings'
        showTab('settings');
        // console.log('Bandwidth info clicked, showing settings tab');
    });
    
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
        const logValue = linearToLog(upBandwidth.value, 0, 10000);
        upValue.textContent = `${Math.round(logValue)} Ko/s`;
    });
    
    downBandwidth.addEventListener('input', () => {
        const logValue = linearToLog(downBandwidth.value, 0, 10000);
        downValue.textContent = `${Math.round(logValue)} Ko/s`;
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

    item.addEventListener('click', (e) => {
        // Vérifier si le clic (ou un de ses parents proches) est un bouton de suppression de channel
        const removeButton = e.target.closest('.remove-channel-btn');
    
        if (removeButton) {
            // Empêcher le clic de déclencher d'autres handlers (ex: déplier/replier le tunnel)
            e.stopPropagation();
    
            const type = removeButton.dataset.type;
            const port = removeButton.dataset.port;
    
            if (type && port) {
                // --- Confirmation avant suppression ---
                const confirmModal = document.getElementById('confirmModal');
                const confirmMessage = document.getElementById('confirmMessage');
                const acceptConfirm = document.getElementById('acceptConfirm');
                const cancelBtn = document.getElementById('cancelConfirm'); // Obtenir le bouton Annuler
    
                confirmMessage.textContent = `Voulez-vous vraiment supprimer le channel ${type} ${port} du tunnel ${tunnelId} ?`;
    
                // Définir une fonction de handler temporaire pour éviter les liaisons multiples
                const confirmHandler = () => {
                    // console.log(`Confirmed removal for tunnel ${tunnelId}, type ${type}, port ${port}`);
                    removePortForward(tunnelId, type, port);
                    confirmModal.style.display = 'none';
                    acceptConfirm.removeEventListener('click', confirmHandler); // Nettoyer l'écouteur
                };
    
                 // Nettoyer tout écouteur précédent sur Accepter avant d'en ajouter un nouveau
                acceptConfirm.replaceWith(acceptConfirm.cloneNode(true));
                document.getElementById('acceptConfirm').addEventListener('click', confirmHandler);
    
    
                 // Gérer le bouton Annuler (nettoyer aussi l'écouteur de confirmation)
                 // Utiliser replaceWith pour être sûr de supprimer les anciens listeners sur Annuler aussi
                cancelBtn.replaceWith(cancelBtn.cloneNode(true));
                document.getElementById('cancelConfirm').addEventListener('click', () => {
                    confirmModal.style.display = 'none';
                    // Pas besoin de removeEventListener ici car on remplace le bouton Accepter
                });
    
    
                confirmModal.style.display = 'flex'; // Afficher la modale
                // --- Fin Confirmation ---
    
            } else {
                console.error("Attributs data-type ou data-port manquants sur le bouton de suppression.", removeButton);
                showNotification("Erreur: Impossible d'identifier le channel à supprimer.", 'error');
            }
        }
    
        // Vous pouvez ajouter d'autres vérifications pour d'autres boutons dynamiques ici si besoin
        // else if (e.target.closest('.autre-bouton-dynamique')) { ... }
    });
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showTab(tab.dataset.tab);
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
    // refreshBtn.addEventListener('click', () => {
    //     showNotification('Mise à jour des tunnels...', 'info');
    //     fetchTunnels();
    // });
    
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