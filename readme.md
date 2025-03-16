# Gestionnaire de Tunnels SSH Avancé

**Version :** 1.0  
**Date :** Mars 2025  
**Auteur :** Alban Lopez  

Ce projet fournit une solution robuste pour la gestion automatisée de tunnels SSH persistants avec contrôle de bande passante, conçue pour les administrateurs système et les équipes DevOps. Il est déployé sous forme de service système via `systemd` et utilise des fichiers de configuration JSON pour une approche "Infrastructure as Code".

## Objectifs Principaux
- Maintenir des tunnels SSH persistants et résilients grâce à `autossh`.
- Limiter la bande passante par tunnel avec `trickle`.
- Simplifier le déploiement via une configuration centralisée.
- Garantir une haute disponibilité des connexions.

## Prérequis
- **Systèmes d'exploitation supportés** : Ubuntu 22.04 LTS, Debian 12 (et dérivés).
- **Dépendances** :
  - `jq` (traitement JSON)
  - `trickle` (limitation de bande passante)
  - `inotify-tools` (surveillance des fichiers)
  - `autossh` (persistance SSH)
  - `sshpass` (automatisation SSH)
  - `netcat-openbsd` (tests de connectivité TCP)
  - `curl` (tests HTTP via tunnels)
  - `ping` (installé par défaut)

## Architecture
- **Fichiers de configuration** : `/etc/sshtunnel/conf.d/*.json`
- **Logs** : `/var/log/sshtunnel/`
- **PID** : `/var/run/sshtunnel/`

## Installation
1. **Téléchargez le package** (exemple) :
   ```bash
   wget https://example.com/sshtunnel-v2.tar.gz
   tar xzvf sshtunnel-v2.tar.gz
   cd sshtunnel-v2
   ```
2. **Exécutez le script d’installation** :
   ```bash
   sudo chmod +x INSTALL.sh
   sudo ./INSTALL.sh
   ```
   Cela installe les dépendances, configure les répertoires, copie les fichiers, et active le service `systemd`.

3. **Démarrez le service** :
   ```bash
   sudo systemctl start sshtunnel-manager.service
   ```

## Désinstallation
Pour supprimer complètement le gestionnaire :
```bash
sudo chmod +x UNINSTALL.sh
sudo ./UNINSTALL.sh
```
**Note** : Les clés SSH dans `/root/.ssh/` ne sont pas supprimées pour éviter une perte accidentelle de données.

## Configuration
Les fichiers de configuration sont au format JSON et doivent être placés dans `/etc/sshtunnel/conf.d/`. Chaque fichier est nommé selon le site géographique (ex. `serveur1.json`).

### Exemple de configuration
```json
{
    "user": "tunnel_user",
    "ip": "142.16.102.35",
    "ssh_port": 22,
    "ssh_key": "/root/.ssh/sshtunnel_serveur1_ed25519",
    "options": {"keepalive_interval": 10},
    "bandwidth": {"up": 1000, "down": 5000},
    "tunnels": [
        {"type": "-L", "name": "printer1", "listen_port": 9101, "endpoint_host": "JectDirect", "endpoint_port": 9100},
        {"type": "-R", "name": "cam1", "listen_host": "cam", "listen_port": 5003, "endpoint_host": "127.0.0.1", "endpoint_port": 5000},
        {"type": "-D", "name": "remote_lan1", "listen_port": 4443}
    ]
}
```

## Utilisation (CLI)
Le script `sshtunnel-manager` fournit une interface en ligne de commande :

| Commande                        | Description                                      |
|---------------------------------|--------------------------------------------------|
| `sshtunnel-manager start [config]` | Démarre tous les tunnels ou un tunnel spécifique |
| `sshtunnel-manager stop [config]`  | Arrête tous les tunnels ou un tunnel spécifique  |
| `sshtunnel-manager restart [config]` | Redémarre tous les tunnels ou un spécifique    |
| `sshtunnel-manager status [config]` | Affiche l’état des tunnels (JSON ou texte)     |
| `sshtunnel-manager pairing ip user password config_name [bandwidth]` | Ajoute un nouveau site (pairing) |

### Exemples
- **Démarrer tous les tunnels** :
  ```bash
  sudo sshtunnel-manager start
  ```
- **Ajouter un site (pairing)** :
  ```bash
  sudo sshtunnel-manager pairing 192.168.1.100 admin MonPassComplexe mon_serveur 500/2000
  ```
- **Vérifier l’état d’un tunnel (JSON)** :
  ```bash
  sudo sshtunnel-manager status mon_serveur
  ```

## Gestion via systemd
- **Démarrer le service** :
  ```bash
  sudo systemctl start sshtunnel-manager.service
  ```
- **Arrêter le service** :
  ```bash
  sudo systemctl stop sshtunnel-manager.service
  ```
- **Redémarrer le service** :
  ```bash
  sudo systemctl restart sshtunnel-manager.service
  ```
- **Vérifier l’état** :
  ```bash
  sudo systemctl status sshtunnel-manager.service
  ```

## Monitoring
La commande `status` fournit une vue en temps réel :
- **Tous les sites (simplifié)** :
  ```bash
  sudo sshtunnel-manager status
  ```
- **Détails d’un site** :
  ```bash
  sudo sshtunnel-manager status mon_serveur
  ```

### Sortie JSON
- Simplifiée :
  ```json
  {"servers": [{"name": "mon_serveur", "ip": "192.168.1.100", "ping_ms": 23, "port": {"status": true, "latency_ms": 25}}]}
  ```
- Complète : voir le cahier des charges pour un exemple détaillé.

## Sécurité
- Clés SSH sans passphrase stockées dans `/root/.ssh/` (permissions `600`).
- Utilisateur distant dédié avec shell `/bin/false`.
- Configurations avec permissions `640 root:root`.
- Chiffrement recommandé : `aes256-gcm@openssh.com`.

## Dévelopment et Contribution
- **Fichiers principaux** :
  - `sshtunnel-manager` : Script Bash principal.
  - `sshtunnel-manager.service` : Service systemd.
  - `INSTALL.sh` / `UNINSTALL.sh` : Scripts d’installation/désinstallation.
  - `sshtunnel.completions` : Complétion Bash.
- **Améliorations possibles** :
  - Ajout d’une interface web (section 7 du cahier des charges).
  - Parallélisation des tests dans `status`.

## Licence
Ce projet est distribué sous la licence [MIT](LICENSE) (à adapter selon vos besoins).

## Contact
Pour toute question ou contribution, contactez **Alban Lopez** à [email@example.com](mailto:email@example.com).
```

---

### Explications
- **Structure** : Le fichier suit une structure classique pour un `README.md` : présentation, prérequis, installation, utilisation, etc.
- **Conformité** : Il reflète les informations du cahier des charges (objectifs, dépendances, architecture, sécurité, etc.) et intègre les scripts fournis (`INSTALL.sh`, `UNINSTALL.sh`, etc.).
- **Clarté** : Les exemples de commandes et la configuration JSON sont tirés directement des spécifications pour aider les utilisateurs.
- **Flexibilité** : Les sections "Développement" et "Licence" sont incluses pour un projet open-source potentiel (ajustez la licence selon vos besoins).

### Instructions
1. Créez un fichier nommé `README.md` dans le répertoire racine de votre projet.
2. Copiez-collez le contenu ci-dessus.
3. Adaptez les liens (ex. `https://example.com/sshtunnel-v2.tar.gz`, email) et la licence si nécessaire.
4. Ajoutez-le à votre archive ou dépôt (ex. `tar czvf sshtunnel-v2.tar.gz sshtunnel-manager sshtunnel-manager.service sshtunnel.completions INSTALL.sh UNINSTALL.sh README.md conf.d/`).

Si vous voulez des modifications (ex. ajout d’une section FAQ, personnalisation du style), faites-le-moi savoir !