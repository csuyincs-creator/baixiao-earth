/* =============================================================
   articles.js — 文章列表页
   入场动效已全部交给 CSS scroll-driven（animation-timeline: view()），
   本文件只做两件 CSS 做不了的事：
   1) Hero 标题逐字拆分（首屏元素，与时间线动画配合）
   2) 把是否支持 view() 写到 html 上，供 CSS 与调试使用
   ============================================================= */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 逐字拆分 */
function splitTitle(el, start = 200, step = 52) {
  if (!el) return;
  const text = el.textContent.trim();
  el.textContent = '';
  [...text].forEach((char, i) => {
    const span = document.createElement('span');
    span.className = 'split-char';
    span.textContent = char === ' ' ? '\u00A0' : char;
    span.style.setProperty('--cd', `${start + i * step}ms`);
    el.appendChild(span);
  });
}

/* 特性检测：不支持 scroll-driven 时标记，CSS 会让元素保持静态可见 */
const supportsViewTimeline = CSS.supports('animation-timeline', 'view()');
document.documentElement.classList.toggle('no-view-timeline', !supportsViewTimeline);
document.documentElement.classList.toggle('has-view-timeline', supportsViewTimeline);

if (reduceMotion) {
  // 降级：不拆字，直接用原文本
  const h1 = document.querySelector('[data-split]');
  if (h1) h1.dataset.splitDone = '1';
} else {
  splitTitle(document.querySelector('[data-split]'));
}
