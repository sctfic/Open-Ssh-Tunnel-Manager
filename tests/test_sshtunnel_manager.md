Voici la structure de test pour chacune des fonctions du fichier `sshtunnel-manager.py`. Chaque fonction est testée avec des scénarios couvrant les cas normaux, les erreurs et les conditions limites, afin de garantir leur bon fonctionnement dans des situations variées.

---

### 1. `check_dependencies()`
- **Objectif** : Vérifie que toutes les dépendances nécessaires sont installées.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Toutes les dépendances (ex. `ssh`, `ping`) sont installées.
    - Action : Appeler la fonction.
    - Résultat attendu : Aucune erreur n’est générée, la fonction termine silencieusement.
  - **Cas d’erreur** :
    - Précondition : Simuler l’absence d’une dépendance (ex. renommer temporairement une commande comme `ssh`).
    - Action : Appeler la fonction.
    - Résultat attendu : Un message d’erreur est affiché listant les dépendances manquantes, et le script quitte avec un code d’erreur (ex. 1).

---

### 2. `check_root()`
- **Objectif** : Vérifie que le script est exécuté avec des privilèges root.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Exécuter le script en tant que root (ex. avec `sudo`).
    - Action : Appeler la fonction.
    - Résultat attendu : Aucune erreur n’est générée.
  - **Cas d’erreur** :
    - Précondition : Exécuter le script en tant qu’utilisateur non-root.
    - Action : Appeler la fonction.
    - Résultat attendu : Un message d’erreur est affiché (ex. "Root privileges required"), et le script quitte avec un code d’erreur.

---

### 3. `check_dirs()`
- **Objectif** : Vérifie ou crée les répertoires nécessaires avec les bonnes permissions.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Les répertoires existent déjà avec les permissions correctes (ex. 750).
    - Action : Appeler la fonction.
    - Résultat attendu : Aucune modification n’est effectuée, la fonction termine sans erreur.
  - **Cas de création** :
    - Précondition : Supprimer un répertoire requis.
    - Action : Appeler la fonction.
    - Résultat attendu : Le répertoire est recréé avec les permissions correctes (ex. 750).
  - **Cas d’erreur** :
    - Précondition : Rendre un répertoire parent non inscriptible (ex. `chmod 555`).
    - Action : Appeler la fonction.
    - Résultat attendu : Une erreur est signalée, mais le script ne plante pas.

---

### 4. `validate_config(config)`
- **Objectif** : Valide un fichier de configuration JSON.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Fournir un fichier JSON valide avec tous les champs obligatoires (ex. `user`, `host`).
    - Action : Appeler la fonction.
    - Résultat attendu : Retourne `True`, aucun message d’erreur.
  - **Cas d’erreur** :
    - Précondition : Fournir un chemin vers un fichier inexistant.
    - Action : Appeler la fonction.
    - Résultat attendu : Retourne `False`, un message d’erreur est affiché (ex. "Config file not found").
    - Précondition : Fournir un fichier JSON mal formaté (ex. syntaxe incorrecte).
    - Action : Appeler la fonction.
    - Résultat attendu : Retourne `False`, une erreur de syntaxe est signalée.
    - Précondition : Fournir un JSON valide mais manquant un champ obligatoire (ex. `user`).
    - Action : Appeler la fonction.
    - Résultat attendu : Retourne `False`, le champ manquant est indiqué.

---

### 5. `start_tunnel(config)`
- **Objectif** : Démarre un tunnel SSH basé sur une configuration.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Configuration valide, serveur SSH accessible.
    - Action : Appeler la fonction.
    - Résultat attendu : Le tunnel démarre, un fichier PID est créé, et le log indique le démarrage.
  - **Cas d’erreur** :
    - Précondition : Configuration invalide (ex. champ `host` manquant).
    - Action : Appeler la fonction.
    - Résultat attendu : Échec sans démarrer le tunnel, erreur signalée.
    - Précondition : Serveur SSH inaccessible (ex. mauvaise IP).
    - Action : Appeler la fonction.
    - Résultat attendu : Échec, erreur enregistrée dans le log.
    - Précondition : Tunnel déjà en cours (PID existant).
    - Action : Appeler la fonction.
    - Résultat attendu : Aucun nouveau tunnel n’est créé, message informatif affiché.

---

### 6. `stop_tunnel(config)`
- **Objectif** : Arrête un tunnel SSH actif.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Tunnel en cours avec un PID valide.
    - Action : Appeler la fonction.
    - Résultat attendu : Le processus est arrêté, le fichier PID est supprimé.
  - **Cas d’erreur** :
    - Précondition : Aucun tunnel actif (pas de PID).
    - Action : Appeler la fonction.
    - Résultat attendu : Message informatif (ex. "No tunnel running"), pas d’erreur.
    - Précondition : PID existant mais processus mort.
    - Action : Appeler la fonction.
    - Résultat attendu : Fichier PID obsolète supprimé, pas d’erreur.

---

### 7. `add_tunnel(config, tunnel_type, tunnel_name, *params)`
- **Objectif** : Ajoute un nouveau tunnel à une configuration existante.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Configuration valide, paramètres corrects (ex. `-L`, ports valides).
    - Action : Appeler la fonction.
    - Résultat attendu : Le fichier JSON est mis à jour avec le nouveau tunnel.
  - **Cas d’erreur** :
    - Précondition : Configuration inexistante.
    - Action : Appeler la fonction.
    - Résultat attendu : Échec, fichier JSON inchangé, erreur affichée.
    - Précondition : Paramètres incorrects (ex. mauvais nombre de ports).
    - Action : Appeler la fonction.
    - Résultat attendu : Échec, erreur d’utilisation affichée.

---

### 8. `remove_tunnel(config, tunnel_name)`
- **Objectif** : Supprime un tunnel spécifique d’une configuration.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Configuration valide avec un tunnel nommé existant.
    - Action : Appeler la fonction.
    - Résultat attendu : Le tunnel est retiré, le fichier JSON est mis à jour.
  - **Cas d’erreur** :
    - Précondition : Nom de tunnel inexistant.
    - Action : Appeler la fonction.
    - Résultat attendu : Message d’erreur, configuration inchangée.
    - Précondition : Configuration invalide.
    - Action : Appeler la fonction.
    - Résultat attendu : Échec, fichier JSON inchangé.

---

### 9. `pairing(ip, user, password, config_name, bandwidth)`
- **Objectif** : Configure un nouveau site distant pour les tunnels.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Serveur accessible, credentials corrects.
    - Action : Appeler la fonction.
    - Résultat attendu : Clé SSH générée, configuration JSON créée.
  - **Cas d’erreur** :
    - Précondition : Serveur inaccessible (ex. port SSH fermé).
    - Action : Appeler la fonction.
    - Résultat attendu : Échec, message d’erreur affiché.
    - Précondition : Mauvais mot de passe.
    - Action : Appeler la fonction.
    - Résultat attendu : Échec lors de la connexion SSH.
    - Précondition : Bande passante mal formatée (ex. "abc").
    - Action : Appeler la fonction.
    - Résultat attendu : Erreur gérée ou valeur par défaut utilisée.

---

### 10. `check_status(config_name=None)`
- **Objectif** : Affiche l’état des tunnels.
- **Structure de test** :
  - **Cas global** :
    - Précondition : Plusieurs configurations existantes.
    - Action : Appeler la fonction sans argument.
    - Résultat attendu : Liste toutes les configurations avec leur statut (ex. ping, port SSH).
  - **Cas détaillé** :
    - Précondition : Configuration nommée existante.
    - Action : Appeler la fonction avec `config_name`.
    - Résultat attendu : Détails des tunnels affichés (ports, endpoints).
  - **Cas d’erreur** :
    - Précondition : Nom de configuration inexistant.
    - Action : Appeler la fonction.
    - Résultat attendu : Message d’erreur affiché.

---

### 11. `reload_config()`
- **Objectif** : Recharge dynamiquement les tunnels après modification.
- **Structure de test** :
  - **Cas normal** :
    - Précondition : Modifier un fichier JSON existant.
    - Action : Appeler la fonction.
    - Résultat attendu : Tunnel arrêté et redémarré avec la nouvelle configuration.
  - **Cas de suppression** :
    - Précondition : Supprimer un fichier JSON.
    - Action : Appeler la fonction.
    - Résultat attendu : Tunnel associé arrêté.
  - **Cas d’ajout** :
    - Précondition : Ajouter un nouveau fichier JSON.
    - Action : Appeler la fonction.
    - Résultat attendu : Nouveau tunnel démarré.

---

Cette structure de test garantit une couverture complète des fonctionnalités de `sshtunnel-manager.py`, en vérifiant les cas normaux et les scénarios d’erreur. Elle peut être implémentée avec des outils comme `pytest` pour automatiser les vérifications.