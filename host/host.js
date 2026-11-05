/**
 * Windows Native Messaging Host for Port Killer Chrome Extension
 * 
 * Protocol:
 * - Stdin/Stdout binary stream
 * - 4-byte uint32 little-endian length prefix followed by UTF-8 JSON message
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const LOG_FILE = path.join(__dirname, 'host.log');

function log(data) {
  try {
    const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`);
  } catch (err) {
    // Ignore logging failures
  }
}

log('Native Messaging Host started');

/**
 * Send JSON message to Chrome Extension via stdout with 4-byte length prefix
 */
function sendNativeMessage(msg) {
  try {
    const jsonStr = JSON.stringify(msg);
    const msgBuffer = Buffer.from(jsonStr, 'utf8');
    const headerBuffer = Buffer.alloc(4);
    headerBuffer.writeUInt32LE(msgBuffer.length, 0);

    process.stdout.write(headerBuffer);
    process.stdout.write(msgBuffer);
    log({ outgoing: msg });
  } catch (err) {
    log(`Failed to send native message: ${err.message}`);
  }
}

/**
 * Execute a Windows command and return stdout/stderr via Promise
 */
function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: stdout ? stdout.toString() : '',
        stderr: stderr ? stderr.toString() : ''
      });
    });
  });
}

/**
 * Get process name for a given PID using tasklist
 */
async function getProcessName(pid) {
  if (pid === 4) return 'System';
  try {
    const { stdout } = await runCommand(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
    const lines = stdout.trim().split(/\r?\n/);
    if (lines.length > 0 && lines[0].includes(',')) {
      const name = lines[0].split(',')[0].replace(/^"|"$/g, '');
      if (name && !name.toLowerCase().includes('no tasks')) {
        return name;
      }
    }
  } catch (err) {
    log(`Could not get process name for PID ${pid}: ${err.message}`);
  }
  return 'Process #' + pid;
}

/**
 * Scan all active LISTENING ports on Windows with fast parallel lookup
 */
async function scanActivePorts() {
  log('Starting netstat scan...');
  const { stdout } = await runCommand('netstat -ano -p tcp');
  const lines = stdout.split(/\r?\n/);
  const portMap = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.includes('LISTENING')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const localAddr = parts[1];
    const match = localAddr.match(/:(\d+)$/);
    if (!match) continue;

    const port = parseInt(match[1], 10);
    const pid = parseInt(parts[parts.length - 1], 10);
    if (!pid || isNaN(pid) || pid === 0) continue;

    if (!portMap.has(port)) {
      portMap.set(port, {
        port,
        pid,
        localAddr
      });
    }
  }

  // Look up process names in parallel with timeout
  const uniquePids = Array.from(new Set(Array.from(portMap.values()).map(p => p.pid))).filter(p => p !== 4);
  const procNames = new Map();
  procNames.set(4, 'System');

  await Promise.all(uniquePids.slice(0, 25).map(async (pid) => {
    try {
      const name = await Promise.race([
        getProcessName(pid),
        new Promise(r => setTimeout(() => r('Process #' + pid), 1000))
      ]);
      procNames.set(pid, name);
    } catch (e) {
      procNames.set(pid, 'Process #' + pid);
    }
  }));

  const DEV_REGEX = /node|vite|python|java|postgres|mysqld|mariadb|mongo|redis|memcached|deno|bun|code|ruby|php|nginx|apache|httpd|docker|go|cargo|dotnet|w3wp|ngrok|cloudflared|uvicorn|gunicorn|flask|electron/i;

  const list = [];
  for (const item of portMap.values()) {
    const name = procNames.get(item.pid) || ('Process #' + item.pid);
    const isDev = DEV_REGEX.test(name);
    list.push({
      port: item.port,
      pid: item.pid,
      name,
      localAddr: item.localAddr,
      isDev
    });
  }

  // Sort dev processes first, then by port ascending
  list.sort((a, b) => {
    if (a.isDev && !b.isDev) return -1;
    if (!a.isDev && b.isDev) return 1;
    return a.port - b.port;
  });

  log(`Scan finished: ${list.length} listening ports found`);
  return list;
}

/**
 * Find processes listening on the specified port
 */
async function findProcessesOnPort(port) {
  const targetPort = parseInt(port, 10);
  if (isNaN(targetPort) || targetPort <= 0 || targetPort > 65535) {
    throw new Error(`Invalid port number: ${port}`);
  }

  const cmd = `netstat -ano | findstr :${targetPort}`;
  log(`Executing: ${cmd}`);
  const { stdout } = await runCommand(cmd);

  const lines = stdout.split(/\r?\n/);
  const pidMap = new Map();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    const proto = parts[0];
    const localAddr = parts[1];
    
    // Strict match: local address must end with ":<port>"
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch || parseInt(portMatch[1], 10) !== targetPort) {
      continue;
    }

    const pid = parseInt(parts[parts.length - 1], 10);
    if (!pid || isNaN(pid) || pid === 0) continue;

    const state = parts.length >= 5 ? parts[3] : 'UNKNOWN';

    if (!pidMap.has(pid)) {
      pidMap.set(pid, {
        pid,
        proto,
        localAddr,
        state
      });
    }
  }

  const results = [];
  for (const [pid, info] of pidMap.entries()) {
    const processName = await getProcessName(pid);
    results.push({
      pid,
      name: processName,
      proto: info.proto,
      localAddr: info.localAddr,
      state: info.state
    });
  }

  return results;
}

const PROTECTED_PIDS = new Set([0, 4]);
const PROTECTED_NAMES_REGEX = /^(system|registry|smss\.exe|csrss\.exe|wininit\.exe|services\.exe|lsass\.exe|svchost\.exe|explorer\.exe|dwm\.exe|spoolsv\.exe|winlogon\.exe|taskhostw\.exe)$/i;

/**
 * Kill process by PID using Windows taskkill /PID <PID> /F /T
 */
async function killProcess(pid, knownName = '') {
  if (PROTECTED_PIDS.has(pid) || pid === process.pid || pid === process.ppid) {
    return {
      success: false,
      pid,
      error: 'Cannot terminate protected system process.'
    };
  }

  if (knownName && PROTECTED_NAMES_REGEX.test(knownName)) {
    return {
      success: false,
      pid,
      error: `Cannot terminate protected system process: ${knownName}`
    };
  }

  const cmd = `taskkill /PID ${pid} /F /T`;
  log(`Executing: ${cmd}`);
  const { error, stdout, stderr } = await runCommand(cmd);
  if (error) {
    log(`Kill error for PID ${pid}: ${stderr || error.message}`);
    return {
      success: false,
      pid,
      error: (stderr || error.message).trim()
    };
  }
  return {
    success: true,
    pid,
    output: stdout.trim()
  };
}

/**
 * Handle incoming messages from Chrome Extension
 */
async function handleMessage(msg) {
  log({ incoming: msg });

  if (!msg || typeof msg !== 'object') {
    sendNativeMessage({
      success: false,
      error: 'Payload must be a valid JSON object'
    });
    return;
  }

  const action = msg.action || 'kill';

  // 1. Ping test
  if (action === 'ping') {
    sendNativeMessage({
      success: true,
      action: 'ping',
      message: 'Native Messaging Host is active and ready on Windows.',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    });
    return;
  }

  // 2. Scan active ports on system
  if (action === 'scan') {
    try {
      const ports = await scanActivePorts();
      sendNativeMessage({
        success: true,
        action: 'scan',
        ports,
        total: ports.length,
        devCount: ports.filter(p => p.isDev).length
      });
    } catch (err) {
      log(`Scan error: ${err.message}`);
      sendNativeMessage({
        success: false,
        action: 'scan',
        error: `Could not scan ports: ${err.message}`
      });
    }
    return;
  }

  // 3. Kill all (Game Mode / Clean All Dev Ports)
  if (action === 'kill_all') {
    const devOnly = msg.devOnly !== false;
    log(`Kill all requested. devOnly: ${devOnly}`);

    try {
      const portsList = await scanActivePorts();
      const targets = devOnly ? portsList.filter(p => p.isDev) : portsList;

      const killable = targets.filter(item => {
        if (PROTECTED_PIDS.has(item.pid) || item.pid === process.pid || item.pid === process.ppid) return false;
        if (PROTECTED_NAMES_REGEX.test(item.name)) return false;
        return true;
      });

      if (killable.length === 0) {
        sendNativeMessage({
          success: true,
          action: 'kill_all',
          killed: [],
          killedCount: 0,
          freedPortsCount: 0,
          message: devOnly
            ? 'Không có tiến trình dev nào đang chạy.'
            : 'Không có tiến trình nào có thể dừng.'
        });
        return;
      }

      // Group by PID to avoid terminating the same process multiple times
      const pidMap = new Map();
      for (const item of killable) {
        if (!pidMap.has(item.pid)) {
          pidMap.set(item.pid, {
            pid: item.pid,
            name: item.name,
            ports: []
          });
        }
        pidMap.get(item.pid).ports.push(item.port);
      }

      const killedResults = [];
      for (const [pid, info] of pidMap.entries()) {
        const killRes = await killProcess(pid, info.name);
        killedResults.push({
          pid,
          name: info.name,
          ports: info.ports,
          success: killRes.success,
          error: killRes.error
        });
      }

      const successList = killedResults.filter(k => k.success);
      const freedPorts = Array.from(new Set(successList.flatMap(k => k.ports)));

      sendNativeMessage({
        success: successList.length > 0 || killedResults.length === 0,
        action: 'kill_all',
        killed: killedResults,
        killedCount: successList.length,
        freedPortsCount: freedPorts.length,
        freedPorts,
        message: `Đã đóng ${successList.length} tiến trình, giải phóng ${freedPorts.length} cổng mạng.`
      });
    } catch (err) {
      log(`Kill all error: ${err.message}`);
      sendNativeMessage({
        success: false,
        action: 'kill_all',
        error: `Lỗi khi dọn dẹp: ${err.message}`
      });
    }
    return;
  }

  const port = parseInt(msg.port, 10);

  // Validate port for check and kill
  if (isNaN(port) || port < 1 || port > 65535) {
    sendNativeMessage({
      success: false,
      action,
      port,
      error: 'Invalid port number. Port must be between 1 and 65535.'
    });
    return;
  }

  try {
    // 3. Check action
    if (action === 'check') {
      const processes = await findProcessesOnPort(port);
      sendNativeMessage({
        success: true,
        action: 'check',
        port,
        occupied: processes.length > 0,
        processes,
        message: processes.length > 0
          ? `Port ${port} is currently in use by ${processes.length} process(es).`
          : `Port ${port} is currently free.`
      });
      return;
    }

    // 4. Kill action
    if (action === 'kill') {
      const processes = await findProcessesOnPort(port);

      if (processes.length === 0) {
        sendNativeMessage({
          success: true,
          action: 'kill',
          port,
          killed: [],
          message: `Port ${port} is already free. No active process found.`
        });
        return;
      }

      const killResults = [];
      for (const proc of processes) {
        const killRes = await killProcess(proc.pid, proc.name);
        killResults.push({
          pid: proc.pid,
          name: proc.name,
          success: killRes.success,
          error: killRes.error
        });
      }

      const allSuccess = killResults.every(r => r.success);
      const killedCount = killResults.filter(r => r.success).length;

      sendNativeMessage({
        success: allSuccess,
        action: 'kill',
        port,
        killed: killResults,
        killedCount,
        message: allSuccess
          ? `Successfully released Port ${port}. Terminated ${killedCount} process(es) (${killResults.map(p => `${p.name} [PID: ${p.pid}]`).join(', ')}).`
          : `Partial failure releasing Port ${port}. Killed ${killedCount}/${killResults.length} processes.`
      });
      return;
    }

    sendNativeMessage({
      success: false,
      error: `Unknown action: "${action}". Supported actions: "kill", "kill_all", "check", "scan", "ping".`
    });
  } catch (err) {
    log(`Handler error: ${err.message}`);
    sendNativeMessage({
      success: false,
      action,
      port,
      error: err.message || 'Internal host execution error'
    });
  }
}

/**
 * Handle incoming byte stream on process.stdin
 */
let inputBuffer = Buffer.alloc(0);

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    processBuffer();
  }
});

process.stdin.on('end', () => {
  log('Stdin closed by Chrome. Host exiting.');
  process.exit(0);
});

function processBuffer() {
  while (true) {
    if (inputBuffer.length < 4) {
      return;
    }

    const msgLength = inputBuffer.readUInt32LE(0);

    if (inputBuffer.length < 4 + msgLength) {
      return;
    }

    const msgContent = inputBuffer.subarray(4, 4 + msgLength).toString('utf8');
    inputBuffer = inputBuffer.subarray(4 + msgLength);

    try {
      const parsed = JSON.parse(msgContent);
      handleMessage(parsed);
    } catch (err) {
      log(`JSON parse error: ${err.message}. Content: ${msgContent}`);
      sendNativeMessage({
        success: false,
        error: `Invalid JSON received by host: ${err.message}`
      });
    }
  }
}
