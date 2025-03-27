function logTrace(...args) {
    if (process.env.NODE_ENV !== 'development') return;
    const stack = new Error().stack.split('\n');
    const callerLine = stack[2] || ''; // Ligne 3 de la stack = appelant
    console.log(callerLine,'\n', ...args);
    // const lineNumber = callerLine.match(/:(\d+):\d+\)?$/)?.[1] || 'inconnu';
    // console.log(`[Ligne ${lineNumber}]`, ...args);
}
function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
      currentDate = Date.now();
    } while (currentDate - date < milliseconds);
}
// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }
module.exports = logTrace, sleep;
