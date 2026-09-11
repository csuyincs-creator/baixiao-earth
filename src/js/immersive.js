/* =============================================================
   immersive.js — 沉浸播放模式
   -------------------------------------------------------------
   进入后由 JS 驱动逐章自动往下播放，用户不需要滚轮。
   每章停留时长按内容量分配（数字章要等 count-up，作品章卡片最多），
   并且**可以在设置面板「沉浸播放 · 每章停留」里逐章改写**（见 dwellMs）。

   沉浸态 = 零 UI：不显示胶囊、章节号、退出按钮，鼠标指针也藏起来，
   只剩屏幕顶端一条 2px 进度线。

   进入方式：点「沉浸播放」→ 黑幕落下 → **真刷新页面（F5 级别）** → 黑幕揭开 + 自动开播。
   为什么要真刷新：地球 bundle 带着自己的入场时间轴和 WebGL 上下文，重开一次比
   在旧状态上打补丁干净得多，观感也像「电影重新开头」。刷新前用 sessionStorage 打标记，
   head 里的内联脚本在**首帧之前**就把 is-immersive 套上，所以常驻 UI 不会闪一下。

   退出触发：ESC / 滚轮 / 触摸滑动 / 方向键·空格·PageDown / 双击 / 播完。
   退出后一切交还给用户，不做任何残留清理（没有劫持过滚动，所以无需恢复）。
   ============================================================= */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BOOT_KEY = 'immersive:autostart';
const setBootFlag = (on) => {
  try { on ? sessionStorage.setItem(BOOT_KEY, '1') : sessionStorage.removeItem(BOOT_KEY); } catch (_) { /* 隐私模式 */ }
};

const settings = window.__BAIXIAO_EARTH_SETTINGS__;

/* 每章停留时长（秒）。顺序：开场 / 数字 / 作品 / 关于 / 开源 / 关注。
   下面只是兜底默认值 —— 真正取的是设置面板「沉浸播放 · 每章停留」里的值，
   改过之后随其它设置一起落盘，每次开播都读最新的，不用重载页面。 */
const DWELL_FALLBACK = [4.6, 5.4, 7.8, 6.8, 8.6, 6.4];
const dwellMs = (i) => {
  const seconds = Number(settings?.[`dwell${i}`]);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : (DWELL_FALLBACK[i] ?? 5.2)) * 1000;
};

/* 章间滚动时长（ms）。降级时直接跳，不做补间 */
const TRAVEL = reduceMotion ? 0 : 1500;

export function initImmersive({ chapters, scrollTo, activeIndex, stopAutoplay } = {}) {
  const progress = document.querySelector('.immersive-progress');
  const bar = progress?.querySelector('i');
  const triggers = [...document.querySelectorAll('[data-immersive]')];

  const root = document.documentElement;
  let running = false;
  let leaving = false;  // 已请求重开（黑幕落下 → 刷新）
  let bailAfter = 0;    // 刚开播的一小段内忽略「滚动即退出」，免得刷新残留的手势把人踢出来
  let token = 0;        // 每次进入 +1，旧的时间链靠它自我终止
  let rafId = 0;
  let timer = 0;
  let hideTimer = 0;

  const clear = () => {
    window.clearTimeout(timer);
    window.clearTimeout(hideTimer);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const paintHud = () => { if (bar) bar.style.width = '0%'; };

  const runPhase = (i, my) => {
    if (my !== token) return;
    paintHud();
    scrollTo?.(i, TRAVEL);

    const total = dwellMs(i);
    const t0 = performance.now();
    if (reduceMotion && bar) bar.style.width = '100%';

    const step = (now) => {
      if (my !== token) return;
      const p = Math.min(1, (now - t0) / total);
      if (bar) bar.style.width = `${(p * 100).toFixed(2)}%`;
      if (p < 1) { rafId = requestAnimationFrame(step); return; }
      if (i + 1 < chapters.length) runPhase(i + 1, my);
      else exit();
    };

    if (reduceMotion) timer = window.setTimeout(() => { if (my === token) (i + 1 < chapters.length ? runPhase(i + 1, my) : exit()); }, total);
    else rafId = requestAnimationFrame(step);
  };

  function enter() {
    if (running) return;
    running = true;
    leaving = false;
    bailAfter = performance.now() + 900;
    token += 1;
    const my = token;

    stopAutoplay?.();                       // 停掉原控制条自己的轮播，两套播放会打架
    if (window.__lenis) window.__lenis.stop();  // 播放期间禁掉用户滚轮，滚轮改为「退出」信号
    /* 设置面板若开着，一并收起来 —— 沉浸态下它的开关按钮是隐藏的，否则会卡在打开态 */
    document.querySelector('.earth-settings-panel')?.classList.remove('is-open');
    document.querySelector('.earth-settings-toggle')?.setAttribute('aria-expanded', 'false');

    window.clearTimeout(hideTimer);
    if (progress) progress.hidden = false;
    root.classList.add('is-immersive');

    const start = Math.max(0, Math.min(chapters.length - 1, activeIndex?.() ?? 0));
    /* 先滚回该章顶部（不等），再开播；避免从半屏位置开始导致节奏错位 */
    scrollTo?.(start, 0);
    requestAnimationFrame(() => runPhase(start, my));
  }

  /* 点「沉浸播放」：黑幕落下 → 刷新页面重开。
     不直接 enter()，因为用户要的是「整个界面重新载入一遍」。 */
  function requestRestart() {
    if (running || leaving) return;
    leaving = true;
    setBootFlag(true);
    root.classList.add('is-leaving');
    window.setTimeout(() => window.location.reload(), reduceMotion ? 80 : 470);
  }

  /* 刷新回来后的自动续播。返回 true 表示这次加载是为沉浸播放而来的。
     刷新时地球 bundle 还在建 WebGL 场景，等它把 section 挂出来再开播，
     否则第一章的氛围值会在场景就绪后被覆盖掉。 */
  function resumeBoot() {
    if (!root.classList.contains('is-immersive-boot')) return false;
    const sceneReady = () => (window.__BAIXIAO_WEBGL_SECTIONS__ || []).some((s) => s?.earth?.material);
    const t0 = performance.now();
    const waitScene = () => {
      if (sceneReady() || performance.now() - t0 > 6000) {
        enter();
        /* 先让第一帧播起来，再揭幕，避免露出半初始化的画面 */
        window.setTimeout(() => root.classList.remove('is-immersive-boot'), 140);
      } else requestAnimationFrame(waitScene);
    };
    window.requestAnimationFrame(waitScene);
    return true;
  }

  function exit() {
    if (!running) return;
    running = false;
    token += 1;
    clear();
    root.classList.remove('is-immersive', 'is-immersive-boot');  // 黑幕期间按 ESC 也要能掀开
    window.__lenis?.start();
    if (progress) hideTimer = window.setTimeout(() => { progress.hidden = true; if (bar) bar.style.width = '0%'; }, 520);
  }

  triggers.forEach((el) => el.addEventListener('click', requestRestart));

  /* 用户一有主动滚动/翻页意图就退出——沉浸模式不该拦人 */
  const bail = () => { if (running && performance.now() >= bailAfter) exit(); };
  window.addEventListener('wheel', bail, { passive: true });
  window.addEventListener('touchmove', bail, { passive: true });
  window.addEventListener('dblclick', bail);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return bail();
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End'].includes(e.key)) bail();
  });

  return { enter, exit, requestRestart, resumeBoot, isActive: () => running };
}
