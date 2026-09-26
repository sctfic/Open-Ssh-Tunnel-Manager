# Frontend Vanilla JS

Le frontend se trouve dans `frontend/`. Il utilise uniquement HTML, CSS et les
modules JavaScript natifs du navigateur. Il n'existe donc ni étape de build, ni
dépendance npm côté client. Fastify sert ces fichiers en développement ; Nginx
les sert directement en production.

## Organisation

- `index.html` fournit le point de montage et les régions accessibles de notification.
- `assets/js/api.js` contient tous les appels REST et le lecteur SSE authentifié.
- `assets/js/ui.js` contient les primitives DOM, modales et notifications.
- `assets/js/app.js` contient l'état, les vues et les interactions métier.
- `assets/css/app.css` définit les tokens du thème sombre et les composants responsives.

L'état applicatif est volontairement centralisé dans l'objet `state` de
`app.js`. Une vue reconstruit son DOM depuis cet état après une mutation ou un
événement SSE. L'ensemble des valeurs issues de l'API est échappé avec
`escapeHtml` avant insertion dans un gabarit HTML.

## Parcours de démarrage

Le navigateur appelle d'abord `GET /api/v2/setup/status`. Si aucun compte root
n'existe, il présente le formulaire de définition du mot de passe puis appelle
une seule fois `POST /api/v2/setup`. Il affiche ensuite la connexion normale.
Le token de session est gardé dans `sessionStorage`, donc fermé avec l'onglet, et
envoyé dans l'en-tête `Authorization` de chaque requête.

## Développement

```powershell
$env:OSTM_NETWORK_MODE = 'direct'
npm start
```

Ouvrir ensuite `http://127.0.0.1:4000`. Modifier les fichiers du dossier
`frontend/`, puis recharger la page ; aucune compilation n'est nécessaire.
