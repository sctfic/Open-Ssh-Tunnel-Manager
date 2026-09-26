# Déploiement du backend

## Linux de production

Prérequis : Node.js >= 22, npm, PM2, Nginx, sudo, iproute2 (`ip`, `tc`), iptables
avec suivi de connexion, noyau avec netns/veth, TBF et fq_codel. Le moteur réseau
utilise IPv4 ; les channels peuvent cibler IPv6 si le serveur SSH le permet.

Réserver `10.203.0.0/16` au gestionnaire sans chevauchement LAN, VPN ou Docker.
Capacité : 254 tunnels. Le serveur SSH doit être joignable par une IPv4 non
loopback. Pour joindre un SSH de la même machine, utiliser son adresse LAN.

Le backend tourne sous un compte système dédié `ostm`, sans accès root. Installer
le code et ses dépendances dans `/opt/ostm`, appartenant à root et non modifiables
par `ostm`. Tous les fichiers importés par le helper, notamment `src/`,
`node_modules/` et `package.json`, doivent aussi être protégés. Les données sont
dans `/var/lib/ostm`, propriétaire `ostm`, mode 0700. Ne jamais les servir via Nginx.

```sh
cd /opt/ostm
npm ci --omit=dev
```

Activer le routage IPv4 dans la configuration sysctl du système :

```text
net.ipv4.ip_forward = 1
```

Le helper ajoute des règles NAT/FORWARD propres à chaque tunnel et les retire à
l'arrêt. Elles sont ajoutées en tête de chaîne pour permettre le transport ;
vérifier leur coexistence avec la politique de pare-feu du serveur.

Installer via `visudo` une règle sudoers limitée au compte `ostm` :

```sudoers
Defaults:ostm env_reset
Defaults:ostm env_delete += "NODE_OPTIONS NODE_PATH"
ostm ALL=(root) NOPASSWD: NOSETENV: /usr/bin/node /opt/ostm/src/network/helper.js *
```

Le helper valide actions, identifiants, IP, ports et limites, et exécute des
programmes fixes sans shell. Son relais privilégié transporte seulement le flux
TCP SSH ; aucune commande distante n'est exécutée avec les privilèges locaux de
root. Adapter le chemin Node dans sudoers et `OSTM_HELPER_NODE` si nécessaire.

Variables du processus PM2 :

```text
NODE_ENV=production
OSTM_DATA_DIR=/var/lib/ostm
OSTM_NETWORK_MODE=linux
OSTM_NETWORK_HELPER=/opt/ostm/src/network/helper.js
OSTM_HELPER_NODE=/usr/bin/node
OSTM_HOST=127.0.0.1
PORT=4000
```

Sous le compte `ostm`, créer root une fois avant de lancer le serveur :

```sh
export OSTM_DATA_DIR=/var/lib/ostm
read -rs -p 'Mot de passe root : ' OSTM_ROOT_PASSWORD
export OSTM_ROOT_PASSWORD
npm run bootstrap
unset OSTM_ROOT_PASSWORD
pm2 start ecosystem.config.cjs
pm2 save
```

Le mot de passe doit faire au moins 12 caractères. Le bootstrap refuse d'écraser
un root existant. Configurer le démarrage système de PM2 sous ce même compte.
Le fichier PM2 impose une instance : les connexions SSH, sessions et verrous
appartiennent à un processus. Ne pas utiliser le mode cluster ni deux backends
sur les mêmes données.

## HTTPS et exploitation

Adapter [le modèle Nginx](../deploy/nginx.conf) avec domaine et certificats. Le
backend reste accessible uniquement depuis le proxy local. `/api/v2/` passe sans
buffering pour SSE. Identifiants, tokens et clés privées doivent transiter en
HTTPS en production.

Sauvegarder `/var/lib/ostm` : comptes, droits, configurations, clés et états
souhaités. Configurer la rotation de `audit.jsonl` et des logs PM2.

`/run/ostm-network` contient les états temporaires du helper. Après un crash, les
tunnels souhaités actifs recréent leurs ressources. Root peut nettoyer le reste
via l'API des orphelins. Si un helper est tué pendant une mutation, `.lock` peut
subsister : vérifier qu'aucun helper ne travaille avant de supprimer uniquement
ce verrou. Ne pas effacer les états tant que leurs interfaces/règles existent.

Down est limité localement après traversée du WAN, sans plafond strict des octets
déjà reçus sur le lien physique. Aucun agent ni privilège administrateur n'est
requis à distance ; le compte SSH doit avoir les permissions de forwarding.

## Validation réseau

Sur un hôte Linux de test configuré comme ci-dessus :

```sh
sudo env OSTM_LINUX_INTEGRATION=1 node --test tests/network-linux.test.js
```

Le test vérifie la mesure réseau, les plafonds Up/Down indépendants et leur
modification à chaud. Il n'est pas exécuté sous Windows.
