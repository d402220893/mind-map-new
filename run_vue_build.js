'use strict';
// vue build 的可靠超时包装：替代 msys 的 `timeout`，后者对 Windows 下 node 子进程树
// （webpack fork 的 worker）无法真正终止，会随管道 EOF 永久挂起 → 整链卡死在 [1/5]。
// 这里用 taskkill /T /F 杀整个进程树，超时即 exit(2) 触发 VUE BUILD FAILED。
const { spawn, execSync } = require('child_process');

const NODE = 'C:/Users/d36847/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const CLI = 'E:/03_学习文件/mind-map-main/web/node_modules/@vue/cli-service/bin/vue-cli-service.js';
const WEB = 'E:/03_学习文件/mind-map-main/web';

// BUILD_LOW_MEM=0 可关闭低内存模式（低内存下该模式反而易触发 worker 死锁时改用）
const USE_LOW = process.env.BUILD_LOW_MEM !== '0';
const env = Object.assign({}, process.env, {
  NODE_OPTIONS: '--openssl-legacy-provider --max-old-space-size=4096',
});
if (USE_LOW) env.BUILD_LOW_MEM = '1';

const LIMIT = (process.env.VUE_BUILD_TIMEOUT ? parseInt(process.env.VUE_BUILD_TIMEOUT, 10) : 600) * 1000;

const child = spawn(NODE, [CLI, 'build'], {
  cwd: WEB,
  env,
  detached: true,
  windowsHide: true,
  stdio: ['ignore', 'inherit', 'inherit'],
});

console.error('[run_vue_build] started pid=' + child.pid + ' low_mem=' + USE_LOW + ' limit=' + (LIMIT / 1000) + 's');

const timer = setTimeout(() => {
  console.error('[run_vue_build] TIMEOUT after ' + (LIMIT / 1000) + 's, killing tree pid=' + child.pid);
  try {
    execSync('C:/Windows/System32/taskkill.exe /PID ' + child.pid + ' /T /F', { stdio: 'ignore' });
  } catch (e) { /* 已死 */ }
  process.exit(2);
}, LIMIT);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.error('[run_vue_build] exited code=' + code + ' signal=' + signal);
  process.exit(code === null ? 1 : code);
});

child.on('error', (err) => {
  clearTimeout(timer);
  console.error('[run_vue_build] spawn error: ' + err.message);
  process.exit(3);
});
