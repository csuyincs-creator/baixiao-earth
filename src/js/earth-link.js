/* =============================================================
   earth-link.js — L4 独家差异化：让地球「回应」读者
   全部通过 window.__BAIXIAO_EARTH_SETTINGS__ 实现，不改一行 WebGL。

   1) 章节 → 地球氛围（尺寸/亮度/光点/轨道随章节平滑过渡）
   2) hover 作品卡 → 切换地球配色（与卡片同频）
   3) 转速基线（与滚动解耦 —— 原先「滚动越快转越快」已移除）
   4) 纵向滚动 / 拖动 → 不改地球朝向（完全补偿 _decayRotation）
   ============================================================= */

import { gsap } from 'gsap';

const settings = window.__BAIXIAO_EARTH_SETTINGS__;

// 每章对应的地球氛围
const CHAPTER_MOODS = [
  { scale: 1.00, brightness: 1.00, pointScale: 1.00, orbitIntensity: 0.60 }, // ① 裸地球
  { scale: 1.02, brightness: 1.06, pointScale: 1.15, orbitIntensity: 0.85 }, // ② 云层
  { scale: 1.00, brightness: 1.16, pointScale: 1.45, orbitIntensity: 1.05 }, // ③ 城市光点
  { scale: 0.98, brightness: 1.04, pointScale: 1.05, orbitIntensity: 1.50 }, // ④ 轨道环绕
  { scale: 1.06, brightness: 1.24, pointScale: 1.20, orbitIntensity: 1.15 }, // ⑤ 大气辉光
  { scale: 1.10, brightness: 1.30, pointScale: 1.30, orbitIntensity: 1.35 }  // ⑥ 全景
];

// 与设置面板里的 4 套预设保持一致
const PRESETS = {
  neon:   { points: ['#19e9df', '#ff35d1', '#ffffff'], orbits: ['#14efe0', '#ff23c8', '#9a6cff'] },
  ice:    { points: ['#7ee7ff', '#4c8dff', '#e7fbff'], orbits: ['#b5f7ff', '#4e9dff', '#a5c8ff'] },
  sunset: { points: ['#ffb347', '#ff4f81', '#ffe4b5'], orbits: ['#ffca70', '#ff477e', '#ff7e42'] },
  aurora: { points: ['#62ffd1', '#8c7bff', '#e9ff8f'], orbits: ['#4fffd1', '#69a7ff', '#d073ff'] }
};

/* 自转基线。bundle 里 y = _initialRotation.y + 2e-5 * et * autoRotateMultiplier，
   即 mult=1 只有 ~1.2°/s，看着像静止。抬到 5.5（≈6.3°/s，一圈 ~57s）：
   一眼就能看出在转，又不至于晃眼。滑块初值同步改成 5.5。 */
const BASE_ROTATE = 5.5;

export function initEarthLink() {
  const apply = () => window.__BAIXIAO_EARTH_APPLY__?.();

  const proxy = { ...settings };
  let currentMood = -1;

  const applyMood = (index) => {
    if (index === currentMood) return;
    currentMood = index;
    const mood = CHAPTER_MOODS[index] ?? CHAPTER_MOODS[0];
    gsap.killTweensOf(proxy);
    gsap.to(proxy, {
      ...mood,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        settings.scale = proxy.scale;
        settings.brightness = proxy.brightness;
        settings.pointScale = proxy.pointScale;
        settings.orbitIntensity = proxy.orbitIntensity;
        apply();
      }
    });
  };

  /* 2) hover 作品容器 → 地球换色
     v2 作品区改成「Hero Artifact + Project Index」后，可 hover 的容器是
     .hero-artifact 与 .index-row。离开时回到「当前主图那件作品」的预设，
     而不是写死 neon —— 否则 hover 04 之后回落的颜色会和主图对不上。 */
  const setPreset = (name) => {
    const preset = PRESETS[name];
    if (!preset) return;
    ['A', 'B', 'C'].forEach((_, i) => {
      settings[`point${'ABC'[i]}`] = preset.points[i];
      settings[`orbit${'ABC'[i]}`] = preset.orbits[i];
    });
    apply();
  };

  const heroArtifact = document.querySelector('.hero-artifact');
  const restPreset = () => heroArtifact?.dataset.preset || 'neon';

  document.querySelectorAll('.hero-artifact[data-preset], .index-row[data-preset]').forEach((el) => {
    el.addEventListener('pointerenter', () => setPreset(el.dataset.preset));
    el.addEventListener('pointerleave', () => setPreset(restPreset()));
  });

  /* 3) 转速基线（不再随滚动加速）
     ------------------------------------------------------------
     原「滚动速度 → 转速（滚得越猛转越快）」本质是「滚动 → 改变地球旋转」的耦合：
     纵向翻页时转速被拉高，同样属于「纵向滚动改变地球旋转状态」。本轮一并解耦 ——
     转速只由基线 BASE_ROTATE（或用户拖动滑块）决定，与滚动无关。
     滑块的接管要保留：否则 ticker 每帧把值拉回基线，用户拖了等于没拖；
     一动滑块就以他的实时值为新基线。 */
  let manualBase = null;
  document.querySelector('[data-setting="autoRotateMultiplier"]')
    ?.addEventListener('input', (e) => { manualBase = Number(e.target.value); });

  gsap.ticker.add(() => {
    const target = manualBase ?? BASE_ROTATE;
    settings.autoRotateMultiplier += (target - settings.autoRotateMultiplier) * 0.12;
  });

  /* 4) 纵向滚动 / 翻页 → 不得改变地球朝向（完全解耦）
     ------------------------------------------------------------
     bundle 每章自带 GSAP 时间轴，会补间 `_decayRotation`（硬编码
     +90° / -90° / -180° / +45°，duration 0.15~0.5s），它进了旋转合成式：

       rotation = _initialRotation + _decayRotation + _decayRotation2
                + 自转(et * autoRotateMultiplier) + 鼠标视差 + 拖拽

     所以每次滚过一章，`_decayRotation` 就把地球「自己反向转一下」——
     这正是纵向翻页时那记突兀回转的来源。旧实现只把 Y 轴压到 38%，
     X/Z 与 `_decayRotation2` 完全没管，压制不彻底，仍然看得到。

     这里做**完全补偿**：每帧令 `_initialRotation.axis = base.axis - _decayRotation.axis`，
     使 `_decayRotation` 三轴贡献恒为 0，而 base（首次 tick 读到的原始朝向）不动。
     结果：纵向滚动 / 拖动彻底不改朝向；自转、鼠标视差、横向拖拽全部照旧。
     （`_decayRotation2` 只作用于入场 6s（-90°→0），与滚动无关，保留不动。）

     为什么动 `_initialRotation` 而不是 `_decayRotation`：
     - `_decayRotation` 是 GSAP 补间目标，直接改会被下一帧覆盖；
     - 也不能用 getter/setter 缩放它（GSAP 读到的起始值会跳变）；
     - `_initialRotation` 只被合成式读取、从不被补间改写，是最干净的控制点。 */
  const rotBase = new WeakMap();
  gsap.ticker.add(() => {
    for (const section of (window.__BAIXIAO_WEBGL_SECTIONS__ || [])) {
      const init = section._initialRotation;
      const decay = section._decayRotation;
      if (!init || !decay) continue;
      let base = rotBase.get(section);
      if (!base) { base = { x: init.x, y: init.y, z: init.z }; rotBase.set(section, base); }
      init.x = base.x - decay.x;
      init.y = base.y - decay.y;
      init.z = base.z - decay.z;
    }
  });

  return { applyMood, setPreset, CHAPTER_MOODS };
}
