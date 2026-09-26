// Ce module est l'unique porte d'entrée HTTP. Centraliser le token et le traitement
// des erreurs garde les vues simples et garantit un comportement cohérent sur 401.
const API_ROOT = '/api/v2';

export class ApiError extends Error {
  constructor(message, status, details = []) { super(message); this.status = status; this.details = details; }
}

export class Api {
  constructor(onUnauthorized) { this.token = sessionStorage.getItem('ostm-token') || ''; this.onUnauthorized = onUnauthorized; }
  setToken(token) {
    this.token = token || '';
    if (this.token) sessionStorage.setItem('ostm-token', this.token); else sessionStorage.removeItem('ostm-token');
  }
  async request(path, { method = 'GET', body, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(`${API_ROOT}${path}`, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && this.token) { this.setToken(''); this.onUnauthorized?.(); }
      throw new ApiError(data.error || `Erreur HTTP ${response.status}`, response.status, data.details);
    }
    return data;
  }
  // EventSource ne sait pas envoyer Authorization. On lit donc le flux SSE avec
  // fetch et on découpe les événements sur la ligne vide du protocole.
  async streamTunnels(onData, signal) {
    const response = await fetch(`${API_ROOT}/events`, { headers: { Authorization: `Bearer ${this.token}`, Accept: 'text/event-stream' }, signal });
    if (!response.ok) {
      if (response.status === 401) { this.setToken(''); this.onUnauthorized?.(); }
      throw new ApiError('Flux temps réel indisponible', response.status);
    }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (data) onData(JSON.parse(data));
      }
    }
  }
}
