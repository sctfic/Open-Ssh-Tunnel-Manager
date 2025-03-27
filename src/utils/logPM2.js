function logTrace(...args) {
    if (process.env.NODE_ENV !== 'development') return;
    const stack = new Error().stack.split('\n');
    const callerLine = stack[2] || ''; // Ligne 3 de la stack = appelant
    console.log(callerLine,'\n', ...args);
    // const lineNumber = callerLine.match(/:(\d+):\d+\)?$/)?.[1] || 'inconnu';
    // console.log(`[Ligne ${lineNumber}]`, ...args);
}
module.exports = logTrace;
