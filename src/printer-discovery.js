/**
 * 서브넷 9100 포트 스캔으로 Zebra 프린터 자동 탐색
 * 로컬 네트워크 (x.x.x.1 ~ x.x.x.254) 대상
 */
const net = require('net');
const os = require('os');

const SCAN_PORT = 9100;
const SCAN_TIMEOUT = 1000;
const CONCURRENCY = 30;

/**
 * 로컬 네트워크 IPv4 서브넷 주소 추출
 * @returns {string[]} ['192.168.1'] 형태의 서브넷 prefix 배열
 */
function getLocalSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        subnets.push(parts.slice(0, 3).join('.'));
      }
    }
  }

  return [...new Set(subnets)];
}

/**
 * 특정 IP:port TCP 연결 테스트
 * @returns {Promise<boolean>}
 */
function probePort(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * 서브넷 내 9100 포트가 열린 호스트 탐색
 * @param {Function} [onProgress] - (scanned, total, found) 진행 콜백
 * @returns {Promise<string[]>} 발견된 IP 배열
 */
async function discoverPrinters(onProgress) {
  const subnets = getLocalSubnets();
  if (subnets.length === 0) return [];

  const found = [];
  const targets = [];

  for (const subnet of subnets) {
    for (let i = 1; i <= 254; i++) {
      targets.push(`${subnet}.${i}`);
    }
  }

  let scanned = 0;

  // 동시 CONCURRENCY개씩 스캔
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((ip) => probePort(ip, SCAN_PORT, SCAN_TIMEOUT).then((ok) => ({ ip, ok }))),
    );

    for (const r of results) {
      if (r.ok) found.push(r.ip);
    }

    scanned += batch.length;
    if (onProgress) onProgress(scanned, targets.length, found.length);
  }

  return found;
}

module.exports = { discoverPrinters, getLocalSubnets };
