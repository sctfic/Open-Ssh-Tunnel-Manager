import os
import json
import tempfile
from unittest.mock import patch, Mock
import pytest
from sshtunnel_manager import (
    check_dependencies, check_root, check_dirs, validate_config,
    start_tunnel, stop_tunnel, add_tunnel, remove_tunnel, pairing, check_status, reload_config
)

# Explications des Tests
# check_dependencies : Simule une dépendance manquante (ex. ssh) avec shutil.which mocké et vérifie que le script s'arrête.
# check_root : Simule un utilisateur non-root avec os.getuid et vérifie l'arrêt du script.
# check_dirs : Crée des répertoires temporaires et valide leur existence ainsi que leurs permissions (750).
# validate_config : Teste des fichiers JSON valides et invalides pour vérifier la logique de validation.
# start_tunnel : Mocke subprocess.Popen pour simuler un tunnel et vérifie la création du fichier PID.
# stop_tunnel : Simule un fichier PID et vérifie que os.kill est appelé pour arrêter le processus.
# add_tunnel : Ajoute un tunnel à un fichier JSON temporaire et valide la mise à jour.
# remove_tunnel : Supprime un tunnel d'un fichier JSON et vérifie qu'il n'existe plus.
# pairing : Mocke les appels SSH pour simuler la configuration d'un site distant.
# check_status : Simule une vérification d'état avec subprocess.run.
# reload_config : Simule une modification de fichier et vérifie le redémarrage des tunnels.

# Test pour check_dependencies
@patch('shutil.which')
def test_check_dependencies_missing(mock_which):
    """Vérifie que check_dependencies échoue si une dépendance manque."""
    mock_which.side_effect = lambda cmd: None if cmd == 'ssh' else cmd
    with pytest.raises(SystemExit):
        check_dependencies()

# Test pour check_root
@patch('os.getuid')
def test_check_root_not_root(mock_getuid):
    """Vérifie que check_root échoue si l'utilisateur n'est pas root."""
    mock_getuid.return_value = 1000  # ID d'un utilisateur non-root
    with pytest.raises(SystemExit):
        check_root()

# Test pour check_dirs
def test_check_dirs_creation():
    """Vérifie que check_dirs crée les répertoires avec les bonnes permissions."""
    with tempfile.TemporaryDirectory() as tmpdir:
        config_dir = os.path.join(tmpdir, 'config')
        log_dir = os.path.join(tmpdir, 'log')
        pid_dir = os.path.join(tmpdir, 'pid')
        check_dirs(config_dir, log_dir, pid_dir)
        assert os.path.exists(config_dir)
        assert os.path.exists(log_dir)
        assert os.path.exists(pid_dir)
        assert oct(os.stat(config_dir).st_mode)[-3:] == '750'  # Permissions 750

# Test pour validate_config
def test_validate_config_valid():
    """Vérifie que validate_config accepte une configuration valide."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as tmpfile:
        json.dump({'user': 'test', 'host': 'localhost'}, tmpfile)
        tmpfile.flush()
        assert validate_config(tmpfile.name) is True

def test_validate_config_missing_field():
    """Vérifie que validate_config rejette une configuration incomplète."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as tmpfile:
        json.dump({'host': 'localhost'}, tmpfile)  # Champ 'user' manquant
        tmpfile.flush()
        assert validate_config(tmpfile.name) is False

# Test pour start_tunnel
@patch('subprocess.Popen')
@patch('builtins.open', create=True)
def test_start_tunnel(mock_open, mock_popen):
    """Vérifie que start_tunnel démarre un tunnel et crée un fichier PID."""
    mock_popen.return_value.pid = 1234
    start_tunnel('valid_config.json')
    mock_popen.assert_called_once()
    mock_open.assert_called()

# Test pour stop_tunnel
@patch('os.path.exists', return_value=True)
@patch('builtins.open', create=True)
@patch('os.kill')
def test_stop_tunnel(mock_kill, mock_open, mock_exists):
    """Vérifie que stop_tunnel arrête un tunnel existant."""
    mock_open.return_value.__enter__.return_value.read.return_value = '1234'
    stop_tunnel('config_name')
    mock_kill.assert_called_with(1234, 15)  # SIGTERM

# Test pour add_tunnel
def test_add_tunnel():
    """Vérifie que add_tunnel ajoute un tunnel à la configuration."""
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as tmpfile:
        json.dump({'tunnels': []}, tmpfile)
        tmpfile.flush()
        add_tunnel(tmpfile.name, '-L', 'new_tunnel', '8080', 'localhost', '80')
        tmpfile.seek(0)
        config = json.load(tmpfile)
        assert len(config['tunnels']) == 1
        assert config['tunnels'][0]['name'] == 'new_tunnel'

# Test pour remove_tunnel
def test_remove_tunnel():
    """Vérifie que remove_tunnel supprime un tunnel de la configuration."""
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as tmpfile:
        json.dump({'tunnels': [{'name': 'to_remove'}]}, tmpfile)
        tmpfile.flush()
        remove_tunnel(tmpfile.name, 'to_remove')
        tmpfile.seek(0)
        config = json.load(tmpfile)
        assert len(config['tunnels']) == 0

# Test pour pairing
@patch('subprocess.run')
@patch('os.path.exists', return_value=False)
def test_pairing(mock_exists, mock_run):
    """Vérifie que pairing configure un nouveau site."""
    pairing('192.168.1.1', 'admin', 'password', 'new_site', '100/200')
    mock_run.assert_called()  # Vérifie les appels SSH

# Test pour check_status
@patch('subprocess.run', return_value=Mock(stdout='PING ok'))
def test_check_status_global(mock_run):
    """Vérifie que check_status affiche l'état des tunnels."""
    check_status()
    mock_run.assert_called()

# Test pour reload_config
@patch('os.path.getmtime', side_effect=[1, 2])  # Simule une modification
@patch('sshtunnel_manager.stop_tunnel')
@patch('sshtunnel_manager.start_tunnel')
def test_reload_config(mock_start, mock_stop, mock_mtime):
    """Vérifie que reload_config redémarre les tunnels après modification."""
    reload_config()
    mock_stop.assert_called()
    mock_start.assert_called()