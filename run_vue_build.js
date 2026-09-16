'use strict';
// vue build 的可靠超时包装（v2）：替代 msys 的 `timeout`。
// 历史教训：
//  1) msys timeout 对 webpack fork 的 Windows worker 树发 SIGTERM 后 worker 不传播、
//     仍持 stdout 管道，随 EOF 永久挂起 → 整链僵在 [1/5]。
//  2) v1 用 execSync('taskkill ...') 同步阻塞事件循环：一旦 taskkill 卡在杀不掉的
//     worker 上，进程永远到不了 process.exit(2)，同样僵死（2026-09-15 踩过，僵 14 分钟）。
//  3) 日志用 console.error 时，若被重定向到文件仍可能因缓冲看不到启动标志，无法判断卡点。
//     → v2 统一用 fs.writeSync(2, ...) 强制立即落盘，并每 30s 打一条心跳。
const { spawn, exec } = require('child_process');
const fs = require('fs');

const NODE = 'C:/Users/d36847/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const CLI = 'E:/03_学习文件/mind-map-main/web/node_modules/@vue/cli-service/bin/vue-cli-service.js';
const WEB = 'E:/03_学习文件/mind-map-main/web';

// BUILD_LOW_MEM=0 可关闭低内存模式（低内存模式下 webpack worker 反而易死锁时改用）。
const USE_LOW = process.env.BUILD_LOW_MEM !== '0';
const env = Object.assign({}, process.env, {
  NODE_OPTIONS: '--openssl-legacy-provider --max-old-space-size=4096',
});
if (USE_LOW) env.BUILD_LOW_MEM = '1';

const LIMIT = (process.env.VUE_BUILD_TIMEOUT ? parseInt(process.env.VUE_BUILD_TIMEOUT, 10) : 600) * 1000;

// 直接写 fd 2：重定向到文件时保证「立刻落盘」，不会因缓冲导致日志里看不到启动标志。
function log(msg) {
  try { fs.writeSync(2, msg + '\n'); } catch (e) { /* ignore */ }
}

const started = Date.now();
const child = spawn(NODE, [CLI, 'build'], {
  cwd: WEB,
  env,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', 'inherit', 'inherit'],
});
const pid = child.pid;

log('[run_vue_build] started pid=' + pid + ' low_mem=' + USE_LOW + ' limit=' + (LIMIT / 1000) + 's');

// 心跳：每 30s 打一条，日志里能区分「还在编译」与「已僵死」。
const heartbeat = setInterval(() => {
  log('[run_vue_build] still building... ' + Math.round((Date.now() - started) / 1000) + 's');
}, 30000);

let done = false;
function finish(code) {
  if (done) return;
  done = true;
  clearInterval(heartbeat);
  clearTimeout(timer);
  process.exit(code);
}

function killTree() {
  // 必须异步 exec：execSync 会同步阻塞事件循环，taskkill 一旦卡住就永远到不了 exit。
  try {
    exec('C:/Windows/System32/taskkill.exe /PID ' + pid + ' /T /F', () => finish(2));
  } catch (e) { finish(2); }
  // 硬兜底：即使 exec 回调永不触发，也在 5s 后强制退出，绝不让整条链挂死。
  setTimeout(() => finish(2), 5000);
}

const timer = setTimeout(() => {
  log('[run_vue_build] TIMEOUT after ' + (LIMIT / 1000) + 's, killing tree pid=' + pid);
  killTree();
}, LIMIT);

child.on('exit', (code, signal) => {
  log('[run_vue_build] exited code=' + code + ' signal=' + signal);
  finish(code === null ? 1 : code);
});

child.on('error', (err) => {
  log('[run_vue_build] spawn error: ' + err.message);
  finish(3);
});
