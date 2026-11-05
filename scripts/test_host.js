const { spawn } = require('child_process');
const path = require('path');

const hostProcess = spawn('node', [path.join(__dirname, '..', 'host', 'host.js')]);

function sendMsg(msg) {
  const jsonStr = JSON.stringify(msg);
  const buffer = Buffer.from(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);
  hostProcess.stdin.write(header);
  hostProcess.stdin.write(buffer);
}

let outputBuffer = Buffer.alloc(0);

hostProcess.stdout.on('data', (chunk) => {
  outputBuffer = Buffer.concat([outputBuffer, chunk]);

  while (outputBuffer.length >= 4) {
    const len = outputBuffer.readUInt32LE(0);
    if (outputBuffer.length < 4 + len) break;

    const msg = outputBuffer.subarray(4, 4 + len).toString('utf8');
    outputBuffer = outputBuffer.subarray(4 + len);
    console.log('SCAN_RESULT:', msg);
  }
});

console.log('Sending scan...');
sendMsg({ action: 'scan' });

setTimeout(() => {
  console.log('Finished.');
  hostProcess.stdin.end();
}, 2500);
