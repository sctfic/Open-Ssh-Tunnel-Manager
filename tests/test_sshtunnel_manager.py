# check_dependencies : Teste les cas où toutes les dépendances sont présentes (pas d'erreur) et où une dépendance manque (leve SystemExit).
# check_root : Vérifie le comportement pour un utilisateur root (UID 0) et non-root (UID 1000).
# check_dirs : Utilise un répertoire temporaire pour confirmer la création des dossiers avec les permissions 750.
# validate_config : Teste une configuration valide, une configuration incomplète, et un tunnel mal configuré.
# start_tunnel : Mocke subprocess.Popen pour vérifier la génération des commandes avec et sans limitation de bande passante.
# stop_tunnel : Simule l'arrêt d'un tunnel existant (avec PID) et le cas où aucun tunnel n'est trouvé.
# add_tunnel : Ajoute un tunnel à un fichier JSON temporaire et teste les erreurs de paramètres.
# remove_tunnel : Supprime un tunnel existant et vérifie le cas où le tunnel n'existe pas.
# pairing : Mocke les appels système pour vérifier la génération de clés SSH et la création de la configuration.
# check_status : Teste le mode global (tous les serveurs) et spécifique (une config) avec des mocks pour subprocess.run.
# reload_config : Simule le rechargement en vérifiant les appels à stop_tunnel et start_tunnel.

import os
import json
import tempfile
from unittest.mock import patch, Mock, mock_open
import pytest
import sys

# Ajouter le répertoire parent au chemin d'importation
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sshtunnel_manager import (
    check_dependencies, check_root, check_dirs, validate_config,
    start_tunnel, stop_tunnel, add_tunnel, remove_tunnel, pairing,
    check_status, reload_config, CONFIG_DIR, LOG_DIR, PID_DIR
)

# ### 1. Tests pour `check_dependencies`
@patch('shutil.which')
def test_check_dependencies_all_present(mock_which):
    """Vérifie que la fonction passe si toutes les dépendances sont présentes."""
    mock_which.side_effect = lambda cmd: cmd
    check_dependencies()  # Ne doit pas lever d'erreur

@patch('shutil.which')
def test_check_dependencies_missing(mock_which):
    """Vérifie que la fonction échoue si une dépendance manque."""
    mock_which.side_effect = lambda cmd: None if cmd == 'ssh' else cmd
    with pytest.raises(SystemExit):
        check_dependencies()

# ### 2. Tests pour `check_root`
@patch('os.getuid')
def test_check_root_as_root(mock_getuid):
    """Vérifie que la fonction passe si exécutée en tant que root."""
    mock_getuid.return_value = 0
    check_root()  # Ne doit pas lever d'erreur

@patch('os.getuid')
def test_check_root_not_root(mock_getuid):
    """Vérifie que la fonction échoue si non-root."""
    mock_getuid.return_value = 1000
    with pytest.raises(SystemExit):
        check_root()

# ### 3. Tests pour `check_dirs`
def test_check_dirs_creation(tmp_path):
    """Vérifie que les répertoires sont créés avec les permissions 750."""
    config_dir = tmp_path / "config"
    log_dir = tmp_path / "log"
    pid_dir = tmp_path / "pid"
    
    check_dirs(str(config_dir), str(log_dir), str(pid_dir))
    
    assert config_dir.exists()
    assert log_dir.exists()
    assert pid_dir.exists()
    assert oct(os.stat(config_dir).st_mode)[-3:] == '750'

# ### 4. Tests pour `validate_config`
def test_validate_config_valid():
    """Vérifie qu'une configuration valide est acceptée."""
    config = {
        "user": "test",
        "ip": "127.0.0.1",
        "ssh_port": 22,
        "tunnels": [{"type": "-L", "name": "test", "listen_port": 8080, "endpoint_host": "localhost", "endpoint_port": 80}]
    }
    assert validate_config(config) is True

def test_validate_config_missing_field():
    """Vérifie qu'une configuration incomplète lève une erreur."""
    config = {"user": "test", "ip": "127.0.0.1"}  # Manque ssh_port et tunnels
    with pytest.raises(ValueError):
        validate_config(config)

def test_validate_config_invalid_tunnel():
    """Vérifie qu'un tunnel mal configuré lève une erreur."""
    config = {
        "user": "test",
        "ip": "127.0.0.1",
        "ssh_port": 22,
        "tunnels": [{"type": "-L", "name": "test"}]  # Manque listen_port, etc.
    }
    with pytest.raises(ValueError):
        validate_config(config)

# ### 5. Tests pour `start_tunnel`
@patch('subprocess.Popen')
@patch('builtins.open', new_callable=mock_open, read_data=json.dumps({
    "user": "test",
    "ip": "127.0.0.1",
    "ssh_port": 22,
    "ssh_key": "/path/to/key",
    "tunnels": [{"type": "-L", "name": "test", "listen_port": 8080, "endpoint_host": "localhost", "endpoint_port": 80}]
}))
def test_start_tunnel_basic(mock_open, mock_popen):
    """Vérifie que start_tunnel démarre un tunnel avec une config valide."""
    config_name = "test_config"
    mock_process = Mock()
    mock_process.pid = 1234
    mock_popen.return_value = mock_process
    
    start_tunnel(config_name)
    
    mock_popen.assert_called_once()
    cmd = mock_popen.call_args[0][0]
    assert "autossh" in cmd
    assert "-L 8080:localhost:80" in cmd

@patch('subprocess.Popen')
@patch('builtins.open', new_callable=mock_open, read_data=json.dumps({
    "user": "test",
    "ip": "127.0.0.1",
    "ssh_port": 22,
    "ssh_key": "/path/to/key",
    "bandwidth": {"up": 234, "down": 637},
    "tunnels": [{"type": "-L", "name": "test", "listen_port": 8080, "endpoint_host": "localhost", "endpoint_port": 80}]
}))
def test_start_tunnel_with_bandwidth(mock_open, mock_popen):
    """Vérifie l'application de trickle pour limiter la bande passante."""
    config_name = "test_config"
    mock_process = Mock()
    mock_process.pid = 1234
    mock_popen.return_value = mock_process
    
    start_tunnel(config_name)
    
    cmd = mock_popen.call_args[0][0]
    assert "trickle" in cmd[0]
    u_index = cmd.index("-u")
    assert cmd[u_index + 1] == "234"
    d_index = cmd.index("-d")
    assert cmd[d_index + 1] == "637"

# ### 6. Tests pour `stop_tunnel`
@patch('os.path.exists', return_value=True)
@patch('os.kill')
@patch('os.remove')
@patch('os.listdir', return_value=["test_config_test.pid"])
@patch('builtins.open', new_callable=mock_open, read_data="1234")
def test_stop_tunnel_existing(mock_open, mock_listdir, mock_remove, mock_kill, mock_exists):
    """Vérifie l'arrêt d'un tunnel existant."""
    config_name = "test_config"
    stop_tunnel(config_name)
    mock_kill.assert_called_with(1234, 15)
    mock_remove.assert_called_with(os.path.join(PID_DIR, "test_config_test.pid"))

@patch('os.path.exists', return_value=False)
@patch('os.listdir', return_value=[])
def test_stop_tunnel_non_existing(mock_listdir, mock_exists):
    """Vérifie que rien ne se passe si aucun tunnel n'existe."""
    config_name = "test_config"
    with patch('os.kill') as mock_kill, patch('os.remove') as mock_remove:
        stop_tunnel(config_name)
        mock_kill.assert_not_called()
        mock_remove.assert_not_called()

# ### 7. Tests pour `add_tunnel`
def test_add_tunnel_valid(tmp_path):
    """Vérifie l'ajout d'un tunnel valide."""
    config_file = tmp_path / "test.json"
    config = {"tunnels": []}
    with open(config_file, "w") as f:
        json.dump(config, f)
    
    add_tunnel(str(config_file), "new_tunnel", "-L", ["8080", "localhost", "80"])
    with open(config_file, "r") as f:
        updated_config = json.load(f)
    assert len(updated_config["tunnels"]) == 1
    assert updated_config["tunnels"][0]["name"] == "new_tunnel"

def test_add_tunnel_invalid_params(tmp_path):
    """Vérifie qu'une erreur est levée avec des paramètres incorrects."""
    config_file = tmp_path / "test.json"
    config = {"tunnels": []}
    with open(config_file, "w") as f:
        json.dump(config, f)
    
    with pytest.raises(ValueError):
        add_tunnel(str(config_file), "invalid", "-L", ["8080"])  # Paramètres insuffisants

# ### 8. Tests pour `remove_tunnel`
def test_remove_tunnel_existing(tmp_path):
    """Vérifie la suppression d'un tunnel existant."""
    config_file = tmp_path / "test.json"
    config = {"tunnels": [{"name": "to_remove"}]}
    with open(config_file, "w") as f:
        json.dump(config, f)
    
    remove_tunnel(str(config_file), "to_remove")
    with open(config_file, "r") as f:
        updated_config = json.load(f)
    assert len(updated_config["tunnels"]) == 0

def test_remove_tunnel_non_existing(tmp_path):
    """Vérifie que rien ne change si le tunnel n'existe pas."""
    config_file = tmp_path / "test.json"
    config = {"tunnels": [{"name": "other"}]}
    with open(config_file, "w") as f:
        json.dump(config, f)
    
    remove_tunnel(str(config_file), "to_remove")
    with open(config_file, "r") as f:
        updated_config = json.load(f)
    assert len(updated_config["tunnels"]) == 1

# ### 9. Tests pour `pairing`
@patch('subprocess.run')
@patch('os.chmod')
def test_pairing_basic(mock_chmod, mock_run):
    """Vérifie la configuration d'un nouveau site."""
    with patch('builtins.open', mock_open()):
        pairing("192.168.1.1", "admin", "password", "new_site", "100/200")
        mock_run.assert_called()
        mock_chmod.assert_called_with("/root/.ssh/new_site_key", 0o600)

# ### 10. Tests pour `check_status`
@patch('subprocess.run')
def test_check_status_global(mock_run):
    """Vérifie le check global de tous les serveurs."""
    mock_run.return_value = Mock(returncode=0, stdout="time=10ms")
    with patch('os.listdir', return_value=["test.json"]):
        with patch('builtins.open', mock_open(read_data=json.dumps({"ip": "127.0.0.1", "ssh_port": 22}))):
            status = check_status()
            result = json.loads(status)
            assert "servers" in result
            assert len(result["servers"]) == 1

@patch('subprocess.run')
def test_check_status_specific(mock_run):
    """Vérifie le check d'une configuration spécifique."""
    mock_run.return_value = Mock(returncode=0, stdout="time=10ms")
    with patch('builtins.open', mock_open(read_data=json.dumps({"ip": "127.0.0.1", "ssh_port": 22, "tunnels": []}))):
        status = check_status("test")
        result = json.loads(status)
        assert "servers" in result
        assert "tunnels" in result

# ### 11. Tests pour `reload_config`
@patch('sshtunnel_manager.stop_tunnel')
@patch('sshtunnel_manager.start_tunnel')
def test_reload_config(mock_start, mock_stop):
    """Vérifie le rechargement des configurations."""
    with patch('os.listdir', return_value=["test.json"]):
        with patch('builtins.open', mock_open(read_data=json.dumps({"tunnels": []}))):
            reload_config()
            mock_stop.assert_called_with("test")
            mock_start.assert_called()