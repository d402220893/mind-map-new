const p = require.resolve('electron')
console.log('RESOLVE', p)
const e = require('electron')
console.log('TYPE', typeof e, 'LEN', (e && e.length) || 'n/a')
try { console.log('SLICE', JSON.stringify(e).slice(0,300)) } catch(err){ console.log('stringify err', err.message) }
