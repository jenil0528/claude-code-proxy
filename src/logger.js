// ============================================================================
// BlitzProxy — Logger
// Colored console output with request/response logging
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = 'info';
let requestLog = [];
const MAX_LOG_ENTRIES = 200;

// Event listeners for live dashboard feed
const listeners = new Set();

export function setLogLevel(level) {
  currentLevel = level;
}

export function addLogListener(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(entry) {
  requestLog.push(entry);
  if (requestLog.length > MAX_LOG_ENTRIES) requestLog.shift();
  for (const fn of listeners) {
    try { fn(entry); } catch {}
  }
}

export function getRequestLog() {
  return [...requestLog];
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export function isDebug() {
  return currentLevel === 'debug';
}

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export function debug(...args) {
  if (!shouldLog('debug')) return;
  console.log(`${COLORS.dim}[${timestamp()}] [DEBUG]${COLORS.reset}`, ...args);
}

export function info(...args) {
  if (!shouldLog('info')) return;
  console.log(`${COLORS.cyan}[${timestamp()}]${COLORS.reset} ${COLORS.green}[INFO]${COLORS.reset}`, ...args);
}

export function warn(...args) {
  if (!shouldLog('warn')) return;
  console.warn(`${COLORS.yellow}[${timestamp()}] [WARN]${COLORS.reset}`, ...args);
}

export function error(...args) {
  if (!shouldLog('error')) return;
  console.error(`${COLORS.red}[${timestamp()}] [ERROR]${COLORS.reset}`, ...args);
}

export function proxy(direction, summary) {
  if (!shouldLog('info')) return;
  const arrow = direction === 'in'
    ? `${COLORS.magenta}⟹${COLORS.reset}`
    : `${COLORS.blue}⟸${COLORS.reset}`;
  const label = direction === 'in' ? 'REQUEST' : 'RESPONSE';
  console.log(`${COLORS.cyan}[${timestamp()}]${COLORS.reset} ${arrow} ${COLORS.bright}[${label}]${COLORS.reset} ${summary}`);

  emit({
    time: timestamp(),
    direction,
    summary,
    ts: Date.now(),
  });
}

export function success(msg) {
  console.log(`${COLORS.green}${COLORS.bright}✓${COLORS.reset} ${msg}`);
}

export function banner(lines) {
  console.log('');
  console.log(`${COLORS.cyan}${COLORS.bright}${'═'.repeat(60)}${COLORS.reset}`);
  for (const line of lines) {
    console.log(`${COLORS.cyan}║${COLORS.reset} ${line}`);
  }
  console.log(`${COLORS.cyan}${COLORS.bright}${'═'.repeat(60)}${COLORS.reset}`);
  console.log('');
}
