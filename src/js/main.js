/* =============================================================
   main.js — 入口
   ============================================================= */

import Lenis from 'lenis';
import { initStateControls, initSettingsPanel } from './earth-controls.js';
import { initEarthLink } from './earth-link.js';
import { initHome, activeChapterIndex } from './home.js';
import { initImmersive } from './immersive.js';

/* 平滑滚动。Lenis 走的是真实滚动（不是 transform 伪造），
   所以 scrollY 照常更新 → 地球状态同步不受影响。 */
const lenis = new Lenis({
  duration: 1.1,
  smoothWheel: true,
  wheelMultiplier: 1,
  touchMultiplier: 1.6
});
window.__lenis = lenis;

const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
requestAnimationFrame(raf);

/* 地球联动（章节 → 氛围 / hover 卡片 → 配色 / 滚动速度 → 转速） */
const earthLink = initEarthLink();

/* 状态控制条 + 设置面板 */
const stateControls = initStateControls();
initSettingsPanel();

/* 内容层动效。章节切换是唯一时钟：
   进哪章 → 同步控制条 + 切换地球氛围，不再各自监听 scroll。 */
initHome({
  onJump: (index) => stateControls.goTo(index),
  onChapter: (index) => {
    stateControls.sync(index);
    earthLink.applyMood(index);
  }
});

/* 首章氛围：onStateChange 只在「变化」时触发，首帧要手动给一次 */
earthLink.applyMood(0);

/* 沉浸播放：自动逐章往下播，隐藏常驻 UI，任何主动滚动即退出 */
const chapters = [...document.querySelectorAll('.home-content .chapter')];
const immersive = initImmersive({
  chapters,
  activeIndex: () => activeChapterIndex(chapters),
  stopAutoplay: () => stateControls.stop(),
  /* Lenis 在播放期间被 stop()，scrollTo 必须带 force:true 才生效 */
  scrollTo: (index, durationMs) => {
    const top = chapters[index]?.offsetTop ?? 0;
    if (durationMs > 0) lenis.scrollTo(top, { duration: durationMs / 1000, force: true });
    else lenis.scrollTo(top, { immediate: true, force: true });
  }
});

/* 如果这次加载是「沉浸播放」触发的刷新（head 里已给出 is-immersive-boot），
   等地表场景就绪后自动开播并揭开黑幕。 */
immersive.resumeBoot();
