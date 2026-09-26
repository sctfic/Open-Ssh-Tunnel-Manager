// Petits utilitaires DOM sans framework. `html` ne reçoit que des chaînes écrites
// par le projet ; toutes les données venant de l'API passent par `escapeHtml`.
export const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
export const appRoot = () => qs('#app');

export function toast(message, kind = 'info') {
  const node = document.createElement('div'); node.className = `toast toast--${kind}`; node.textContent = message;
  qs('#toast-region').append(node); setTimeout(() => node.remove(), 4500);
}
export function openDialog(title, content, { wide = false, closeOnly = false } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = `dialog ${wide ? 'dialog--wide' : ''}`;
  dialog.innerHTML = `<div class="dialog__head"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-close aria-label="Fermer">×</button></div><div class="dialog__body"></div>`;
  dialog.querySelector('.dialog__body').append(content); document.body.append(dialog);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (!closeOnly && event.target === dialog) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (closeOnly) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal(); return dialog;
}
export function formData(form) { return Object.fromEntries(new FormData(form)); }
export const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
