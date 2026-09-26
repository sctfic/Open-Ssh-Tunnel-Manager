# Installation de test — rpi3.lan

Installation effectuée le 26 septembre 2026 sur le Raspberry Pi ARM64 Debian 12.

| Élément | Valeur |
| --- | --- |
| API HTTPS | `https://rpi3.lan:8443/api/v2/` |
| Sonde | `https://rpi3.lan:8443/health` |
| Compte applicatif | `root` |
| Mot de passe initial | fichier privé `/home/alban/.config/ostm-test/root-password` sur le Pi |
| Code | `/opt/ostm`, propriétaire root |
| Données | `/var/lib/ostm`, propriétaire ostm, mode 0700 |
| Runtime dédié | `/opt/ostm-runtime/node-v24.21.0-linux-arm64` |
| Service système | `pm2-ostm.service`, activé au démarrage |
| Application PM2 | `ostm-test`, sous le compte système `ostm` |
| PM2_HOME | `/var/lib/ostm/.pm2` |
| Backend interne | `127.0.0.1:4000` |
| Site Nginx | `/etc/nginx/sites-available/ostm-test.conf` |

Le runtime Node 18 et les applications PM2 existantes du compte `alban` sont
conservés. Nginx conserve les sites OpenMediaVault et Probe2 sur leurs ports.

## Accès

Le certificat TLS est autosigné pour le test, avec les SAN `rpi3.lan` et
`10.0.0.253`. Sa partie publique est dans
`/etc/ssl/certs/ostm-rpi3-test.crt` ; l'ajouter au magasin de confiance du client
ou la fournir explicitement à curl avec `--cacert`. La clé privée reste sur le Pi.

Récupérer le mot de passe root initial depuis une session SSH privée :

```sh
ssh alban@rpi3.lan 'cat ~/.config/ostm-test/root-password'
```

Le mot de passe SSH fourni pour l'installation n'est enregistré dans aucun
fichier du projet ou de déploiement. Le mot de passe root applicatif est généré
aléatoirement, distinct du mot de passe SSH. Après changement via l'API, le
fichier initial ne reflétera plus le nouveau mot de passe.

## Exploitation

Pour réinitialiser root sans exposer le nouveau mot de passe dans une commande
ou l'historique du shell, arrêter brièvement le service puis lancer l'assistant
interactif. Il accepte aussi un mot de passe vide : presser simplement Entrée aux
deux invites.

```sh
sudo systemctl stop pm2-ostm
sudo -u ostm env OSTM_DATA_DIR=/var/lib/ostm \
  /opt/ostm-runtime/node-v24.21.0-linux-arm64/bin/node \
  /opt/ostm/scripts/reset-root-password.mjs
sudo systemctl start pm2-ostm
```

```sh
sudo systemctl status pm2-ostm
sudo systemctl restart pm2-ostm
sudo journalctl -u pm2-ostm
sudo tail -n 50 /var/lib/ostm/.pm2/logs/ostm-test-error-0.log
```

Le routage IPv4 est activé par `/etc/sysctl.d/90-ostm-forward.conf`. Les
privilèges réseau sont limités au helper root via `/etc/sudoers.d/ostm-test`.
Les configurations d'activation sont conservées dans `deploy/` pour reproduction.

## Validation

La suite de tests API/SSH s'exécute sous le compte `ostm`. Le test réseau Linux
privilégié a validé les compteurs, les plafonds Up/Down et leur modification à chaud.

Le test `deploy/smoke-rpi3.mjs` a vérifié l'authentification HTTPS, la création
d'un tunnel par l'API, l'import de clé, la redirection locale SSH, le trafic
compressé/chiffré dans le namespace, la modification des débits et le redémarrage.
Pour des données aléatoires non compressibles :

- 240 000 octets aller-retour avec Up 200 / Down 100 Ko/s : environ 2,8 s.
- 120 000 octets aller-retour avec Up 50 / Down 200 Ko/s : environ 2,7 s.
- Compteurs observés : 392 084 octets Up et 402 726 octets Down, surcharge incluse.

Le SSH principal du Pi interdit `AllowTcpForwarding` et la compression. Sa
configuration n'a pas été modifiée. Le test utilise une instance OpenSSH séparée
et temporaire, avec authentification par une clé éphémère uniquement, puis
supprime cette instance, la clé, le tunnel et ses ressources réseau. Pour créer
un vrai tunnel, choisir un serveur SSH autorisant les redirections nécessaires.

Rejouer le test complet de déploiement :

```sh
cd /opt/ostm
sudo /opt/ostm-runtime/node-v24.21.0-linux-arm64/bin/node deploy/smoke-rpi3.mjs
```

Ce test lit le fichier de mot de passe root initial. S'il a été changé, adapter
le mécanisme d'authentification de test avant de le relancer.
