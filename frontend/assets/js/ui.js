// Petits utilitaires DOM sans framework. `html` ne reçoit que des chaînes écrites
// par le projet ; toutes les données venant de l'API passent par `escapeHtml`.
export const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
export const appRoot = () => qs('#app');
// Le mode `v` utilisé par les navigateurs récents impose d'échapper le tiret
// dans une classe. Une alternative hors classe reste valide sur les navigateurs
// plus anciens et accepte exactement les identifiants permis par le backend.
export const identifierPattern = '[a-zA-Z0-9](?:[a-zA-Z0-9_]|-){0,47}';

export function toast(message, kind = 'info') {
  const node = document.createElement('div'); node.className = `toast toast--${kind}`; node.textContent = message;
  qs('#toast-region').append(node); setTimeout(() => node.remove(), 4500);
}
export function openDialog(title, content, { wide = false, closeOnly = false, beforeClose } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = `dialog ${wide ? 'dialog--wide' : ''}`;
  dialog.innerHTML = `<div class="dialog__head"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-close aria-label="Fermer">×</button></div><div class="dialog__body"></div>`;
  dialog.querySelector('.dialog__body').append(content); document.body.append(dialog);
  // Une modale peut enregistrer ses données avant la fermeture. Le motif
  // distingue Échap (annulation) de la croix ou du clic extérieur (validation).
  let closing = false;
  const requestClose = async reason => {
    if (closing) return;
    closing = true;
    try { if (!beforeClose || await beforeClose(reason) !== false) dialog.close(); }
    finally { closing = false; }
  };
  dialog.querySelector('[data-close]').addEventListener('click', () => requestClose('close'));
  // Un glissement commencé dans le contenu puis relâché sur l'arrière-plan ne
  // doit pas fermer la modale. La fermeture exige un clic complet sur le backdrop.
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', event => { pressedOnBackdrop = event.target === dialog; });
  dialog.addEventListener('pointerup', event => {
    if (!closeOnly && pressedOnBackdrop && event.target === dialog) requestClose('outside');
    pressedOnBackdrop = false;
  });
  dialog.addEventListener('pointercancel', () => { pressedOnBackdrop = false; });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!closeOnly) requestClose('escape'); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal(); return dialog;
}
export function formData(form) { return Object.fromEntries(new FormData(form)); }
export const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
