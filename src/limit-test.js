import { randomBytes } from 'node:crypto';

/** Un transfert de diagnostic emprunte le client SSH déjà limité par tc.
 * Les commandes sont fixes : aucune saisie utilisateur n'est exécutée à distance.
 * timeout borne aussi le processus distant si le navigateur ou SSH disparaît.
 */
export async function testLimit(session, transport, direction, signal, durationMs = 6000, limitKo = 0) {
  // Les anciennes versions BusyBox (OpenWrt) demandent « timeout -t N ».
  // La sonde sans données choisit la syntaxe sans toucher aux channels métier.
  const task = direction === 'up' ? '15 wc -c' : '12 cat /dev/urandom';
  const command = `if timeout 1 true 2>/dev/null; then exec timeout ${task}; else exec timeout -t ${task}; fi`;
  let stream, finishTimer, warmTimer, deadline, immediate, pacingTimer;
  let sent = 0, received = 0, output = '', stopped = false, baseline, started, endSample, endTime;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stopped = true; clearTimeout(finishTimer); clearTimeout(warmTimer); clearTimeout(deadline); clearImmediate(immediate); clearTimeout(pacingTimer);
      signal?.removeEventListener('abort', abort);
      // La fermeture ne touche que le channel temporaire, jamais le tunnel.
      if (stream && !stream.destroyed) { stream.signal('TERM'); stream.close(); }
    };
    // Les erreurs attendues doivent être lisibles dans la modale, pas masquées
    // par le gestionnaire générique des erreurs internes HTTP 500.
    const fail = error => { cleanup(); error.statusCode ||= 422; reject(error); };
    const abort = () => fail(new Error('Test annulé.'));
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    deadline = setTimeout(() => fail(new Error('Test expiré : serveur SSH trop lent ou commande indisponible.')), 20000);
    session.client.exec(command, (error, channel) => {
      if (stopped) { channel?.close(); return; }
      if (error) return fail(new Error('Le serveur SSH refuse le test : exécution de commandes non autorisée.'));
      stream = channel;
      let stderr = '';
      stream.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-500); });
      stream.on('error', fail);
      stream.on('data', chunk => {
        if (direction === 'down') received += chunk.length;
        else output = (output + chunk).slice(-100);
      });
      stream.on('close', code => {
        if (stopped) return;
        if (direction === 'up' && code === 0 && /^\s*\d+\s*$/.test(output) && Number(output) === sent) {
          finish().catch(fail);
        } else fail(new Error(`Test impossible : commandes timeout, ${direction === 'up' ? 'wc' : 'cat et /dev/urandom'} requises sur le serveur SSH${stderr ? ' (commande refusée ou interrompue)' : ''}.`));
      });
      // La seconde de chauffe absorbe le démarrage TCP et le burst du limiteur.
      warmTimer = setTimeout(async () => {
        try { baseline = await transport.stats(); started = performance.now(); }
        catch (e) { fail(e); }
      }, 1000);
      const finish = async () => {
        if (stopped) return;
        const end = endSample || await transport.stats();
        if (stopped) return;
        if (!baseline) throw new Error('Mesure réseau indisponible.');
        const seconds = ((endTime || performance.now()) - started) / 1000;
        const bytes = Math.max(0, end[`${direction}Bytes`] - baseline[`${direction}Bytes`]);
        cleanup();
        resolve({ direction, networkKoPerSecond: bytes / seconds / 1000, seconds,
          receivedBytes: direction === 'up' ? Number(output) : received, source: end.source });
      };
      finishTimer = setTimeout(async () => {
        if (direction === 'up') {
          clearImmediate(immediate); clearTimeout(pacingTimer); stream.removeListener('drain', schedule);
          // Mesurer pendant la charge ; attendre ensuite le reçu sans inclure
          // la vidange des tampons et le retour de wc dans le débit moyen.
          try { endSample = await transport.stats(); endTime = performance.now(); if (!stopped) stream.end(); }
          catch (e) { fail(e); }
        }
        else finish().catch(fail);
      }, durationMs);
      // Offrir 30 % de plus que le plafond sature tc sans remplir plusieurs Mo
      // de fenêtre SSH lorsque la limite est seulement de 1 Ko/s.
      const size = limitKo ? Math.min(131072, Math.max(128, Math.ceil(limitKo * 130))) : 16384;
      const schedule = () => {
        if (limitKo) pacingTimer = setTimeout(pump, size / (limitKo * 1300) * 1000);
        else immediate = setImmediate(pump);
      };
      const pump = () => {
        if (stopped || stream.writableEnded) return;
        const block = randomBytes(size); sent += block.length;
        if (stream.write(block)) schedule();
        else stream.once('drain', schedule);
      };
      if (direction === 'up') pump();
    });
  });
}
