/* =============================================================
   home.js — 内容层动效引擎
   规格：视觉语言规格 v2 · Editorial Data — 11 动效规范
   -------------------------------------------------------------
   调度模型：章节（页面）是唯一时钟。
     章节激活 → ① 播放该页专属转场（镜头层 .wrap）
                ② 按类型分发 Reveal（内容层 [data-anim]）
                ③ Count（数字，先稳定 200ms）
                ④ 抛 chapter:enter —— 章节内的局部系统自己接管
                   （作品区 Index 联动 / Terminal 逐字）
   这样错峰节奏由一处控制，而不是靠各自的 IntersectionObserver 碰运气。
   ============================================================= */

import { gsap } from 'gsap';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 章节实际可能高于一屏（移动端），所以按「视口中心落在哪一章」判定，
   不用 Math.round(scrollY / innerHeight) —— 后者在章节不等高时会抖动。 */
export function activeChapterIndex(chapters) {
  const probe = window.scrollY + window.innerHeight * 0.5;
  let idx = 0;
  chapters.forEach((chapter, i) => { if (chapter.offsetTop <= probe) idx = i; });
  return idx;
}

/* ---------- 读回 CSS 算好的延迟，JS 不重复维护一份参数 ---------- */
function delayMs(el) {
  const raw = getComputedStyle(el).getPropertyValue('--d').trim();
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}

/* ---------- Hero 逐字（主页唯一合法 blur，L3 专属） ---------- */
function splitTitle(el, startDelay = 240, step = 48) {
  const text = el.textContent.trim();
  el.textContent = '';
  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.className = 'split-char';
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.setProperty('--cd', `${startDelay + i * step}ms`);
    el.appendChild(span);
  });
  return [...el.querySelectorAll('.split-char')];
}

/* ---------- Count · 数字滚格 ----------
   时长读 [data-count-dur]（规格 03：1100 / 850 / 700 / 500ms），
   起点延迟读回 [data-anim] 的 --d —— JS 不重复维护一份参数。 */
function countUp(el, delay = 0) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target)) return;
  const durMs = Number(el.dataset.countDur) || 1400;
  if (reduceMotion) { el.textContent = target.toLocaleString('en-US'); return; }
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target,
    duration: durMs / 1000,
    delay: delay / 1000,
    ease: 'power2.out',
    onUpdate() { el.textContent = Math.round(obj.v).toLocaleString('en-US'); }
  });
}

/* ---------- 复制按钮 ---------- */
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    const label = btn.querySelector('.copy-btn__text');
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = btn.dataset.copy;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.classList.add('is-copied');
      if (label) label.textContent = '已复制';
      setTimeout(() => {
        btn.classList.remove('is-copied');
        if (label) label.textContent = '复制';
      }, 1800);
    });
  });
}

/* =============================================================
   屏 03 · 作品区 —— 一张主作品 + 一个 Project Index（规格 04 / 12）
   Hover / Active → 信息变化（不是 CSS 动画）：
     · Index 行标题提亮、出 description、出箭头
     · 左侧 Hero Artifact 用 Switch（crossfade）换成对应封面
   无人操作时自动演示一遍（对应规格里「视频没鼠标也能演示」），
   一旦用户碰过就永久停下 —— 不做会自己跳舞的背景。
   ============================================================= */
function initWorks() {
  const root = document.querySelector('[data-works]');
  if (!root) return;
  const hero = root.querySelector('[data-works-hero]');
  const imgs = [root.querySelector('[data-works-img]'), root.querySelector('[data-works-img2]')];
  const rankEl = root.querySelector('[data-works-rank]');
  const titleEl = root.querySelector('[data-works-title]');
  const subEl = root.querySelector('[data-works-sub]');
  const statsEl = root.querySelector('[data-works-stats]');
  const rows = [...root.querySelectorAll('[data-works-row]')];
  if (!hero || !imgs[0] || !imgs[1] || rows.length === 0) return;

  /* 01 的文案直接从 hero 自身读，避免再维护一份重复数据 */
  const items = [
    {
      href: hero.getAttribute('href'),
      img: imgs[0].getAttribute('src'),
      preset: hero.dataset.preset || 'neon',
      rank: rankEl.textContent,
      title: titleEl.textContent,
      sub: subEl.textContent,
      stats: statsEl.innerHTML
    },
    ...rows.map((row) => ({
      href: row.getAttribute('href'),
      img: row.dataset.img,
      preset: row.dataset.preset || 'neon',
      rank: `${row.querySelector('.index-row__no').textContent} / ${row.dataset.kind || 'project'}`,
      title: row.querySelector('.index-row__title').textContent,
      sub: row.querySelector('.index-row__desc').textContent,
      stats: row.querySelector('.index-row__stats').innerHTML
    }))
  ];

  let cur = 0;      // 当前展示的 item
  let front = 0;    // 当前可见的 img 层

  const apply = (i) => {
    if (i === cur || !items[i]) return;
    cur = i;
    const it = items[i];

    hero.setAttribute('href', it.href);
    hero.dataset.preset = it.preset;     // earth-link 的回落色跟着主图走
    rankEl.textContent = it.rank;
    titleEl.textContent = it.title;
    subEl.textContent = it.sub;
    statsEl.innerHTML = it.stats;
    rows.forEach((r, k) => r.classList.toggle('is-active', k + 1 === i));

    const back = 1 - front;
    if (imgs[back].getAttribute('src') !== it.img) imgs[back].setAttribute('src', it.img);
    imgs[back].classList.add('is-on');
    imgs[front].classList.remove('is-on');
    front = back;
  };

  let timer = null;
  let touched = false;
  const stopDemo = () => { if (timer) { window.clearInterval(timer); timer = null; } };
  const startDemo = () => {
    if (reduceMotion || touched) return;
    stopDemo();
    timer = window.setInterval(() => apply((cur + 1) % items.length), 4500);
  };

  rows.forEach((row, k) => {
    const i = k + 1;
    const on = () => { touched = true; stopDemo(); apply(i); };
    row.addEventListener('pointerenter', on);
    row.addEventListener('focus', on);
    row.addEventListener('pointerdown', on);
  });

  const chapter = root.closest('.chapter');
  if (chapter) {
    chapter.addEventListener('chapter:enter', startDemo);
    chapter.addEventListener('chapter:leave', stopDemo);
  }
}

/* =============================================================
   屏 05 · Terminal 逐字（规格 08：每行 180–320ms）
   ============================================================= */
function initTerminal() {
  const box = document.querySelector('[data-terminal]');
  if (!box) return;
  const lines = [...box.querySelectorAll('[data-line]')];
  if (!lines.length) return;

  const full = lines.map((l) => l.textContent);
  let running = false;
  let timers = [];

  const clearTimers = () => { timers.forEach(window.clearTimeout); timers = []; };

  const run = () => {
    if (running) return;
    clearTimers();
    if (reduceMotion) {
      lines.forEach((l, i) => { l.textContent = full[i]; });
      return;
    }
    running = true;
    lines.forEach((l) => { l.textContent = ''; });

    let li = 0;
    const nextLine = () => {
      if (li >= lines.length) { running = false; return; }
      const el = lines[li];
      const text = full[li];
      li += 1;
      const perChar = 260 / Math.max(text.length, 1);   // 每行总时长 ≈ 260ms
      let ci = 0;
      const tick = () => {
        if (ci >= text.length) { timers.push(window.setTimeout(nextLine, 140)); return; }
        ci += 1;
        el.textContent = text.slice(0, ci);
        timers.push(window.setTimeout(tick, perChar));
      };
      tick();
    };
    timers.push(window.setTimeout(nextLine, 240));
  };

  const chapter = box.closest('.chapter');
  chapter?.addEventListener('chapter:enter', run);
}

/* ---------- 章节进度轨 ---------- */
function initRail(chapters, onJump) {
  const rail = document.querySelector('.chapter-rail');
  const fill = document.getElementById('rail-fill');
  if (!rail || !fill) return null;

  const buttons = [...rail.querySelectorAll('[data-rail]')];
  buttons.forEach((btn) => btn.addEventListener('click', () => onJump?.(Number(btn.dataset.rail))));

  const update = (idx) => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    fill.style.height = `${Math.min(100, (window.scrollY / max) * 100).toFixed(2)}%`;
    buttons.forEach((b, i) => b.classList.toggle('is-active', i === idx));
  };

  return update;
}

/* =============================================================
   核心：章节转场调度
   ============================================================= */
function initChapterTransitions({ onChapter, onJump } = {}) {
  const chapters = [...document.querySelectorAll('.home-content .chapter')];
  if (!chapters.length) return;

  const updateRail = initRail(chapters, onJump);
  const LEAVE_MS = 420;
  const leaveTimers = new WeakMap();
  let active = -1;

  /* 播放某一章：转场（镜头） + Reveal（内容） + Count（数字） */
  const enter = (chapter) => {
    chapter.classList.remove('is-leaving');
    if (chapter.classList.contains('is-entered')) {
      chapter.dispatchEvent(new CustomEvent('chapter:enter'));
      return;
    }
    chapter.classList.add('is-entered');

    chapter.querySelectorAll('[data-anim]').forEach((el) => {
      if (el.classList.contains('is-in')) return;
      void el.offsetWidth;              // 强制一帧，确保初始态已生效
      el.classList.add('is-in');
    });

    /* Count：先稳定 200ms（规格 03），再按 --d 错峰起跑 */
    chapter.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.counted === '1') return;
      el.dataset.counted = '1';
      const host = el.closest('[data-anim]') || el;
      countUp(el, delayMs(host) + 200);
    });

    chapter.dispatchEvent(new CustomEvent('chapter:enter'));
  };

  const setActive = (idx) => {
    if (idx === active) return;
    const prev = chapters[active];
    if (prev) {
      prev.classList.add('is-leaving');
      prev.dispatchEvent(new CustomEvent('chapter:leave'));
      window.clearTimeout(leaveTimers.get(prev));
      leaveTimers.set(prev, window.setTimeout(() => prev.classList.remove('is-leaving'), LEAVE_MS));
    }
    active = idx;
    enter(chapters[idx]);
    updateRail?.(idx);
    onChapter?.(idx);
  };

  /* 滚动时判定当前章节。用 rAF 节流，避免和地球 rAF 抢主线程。 */
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      setActive(activeChapterIndex(chapters));
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  if (reduceMotion) {
    chapters.forEach((c) => {
      c.classList.add('is-entered', 'is-in');
      c.querySelectorAll('[data-anim]').forEach((el) => el.classList.add('is-in'));
      c.querySelectorAll('[data-count]').forEach((el) => countUp(el, 0));
    });
  }

  setActive(activeChapterIndex(chapters));
}

export function initHome({ onJump, onChapter } = {}) {
  const heroTitle = document.querySelector('[data-split]');
  const heroChars = heroTitle ? splitTitle(heroTitle) : [];

  initChapterTransitions({ onChapter, onJump });
  initWorks();
  initTerminal();
  initCopy();

  if (heroChars.length) {
    requestAnimationFrame(() => heroChars.forEach((el) => el.classList.add('is-in')));
  }
}
