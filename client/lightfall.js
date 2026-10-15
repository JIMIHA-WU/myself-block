/* ============================================================
   lightfall.js —— React Bits「Lightfall」原生移植
   ============================================================
   来源：reactbits.dev 组件 Lightfall（JavaScript + CSS 变体，
        registry: https://reactbits.dev/r/Lightfall-JS-CSS）。
        2026-10-14 Jack 指定：首页换成此样式的"全效果前端"。

   移植说明（与 Cloud Shader / ElectricLogo 同一路线）：
     官方源码本身是零依赖 OpenGL ES 3.0（WebGL2）实现，React 只负责
     "挂载 + 生命周期"。本文件把 React 层换成原生 DOM/事件，五段着色器
     （VERTEX / STREAKS / DOWNSAMPLE / BLUR / COMPOSITE）逐行保留，
     参数、行为、帧循环判定（intro 冲入 / 悬停透镜 / 长按曲速 / 离屏暂停 /
     reduced-motion 静止帧 / 上下文丢失恢复）全部对齐原组件。

   挂载：页面上有 id="lightfall" 的容器 → 自动挂载。
   参数在下方 PROPS（= Jack 给的用法代码）。
   ============================================================ */
(function (global) {
  'use strict';

  var PROPS = {
    /* —— Jack 2026-10-14 指定的参数（逐项对齐）—— */
    colors: ['#ffffff'],
    backgroundColor: '#000000',  /* 2026-10-14 晚 Jack：整体换全黑（原 #94a3b8）*/
    speed: 0.3,
    streakCount: 2,
    streakWidth: 0.8,
    twinkle: 0.3,
    backgroundGlow: 0.1,
    headGlow: 0.6,
    bloom: 0.35,
    mouseInteraction: false,  /* 2026-10-15 Jack：鼠标移动不得改变画面（悬停增亮/透镜关闭）；
                                 点击（holdToWarp 曲速）不受此项影响，照常保留 */
    holdToWarp: true,
    intro: true,
    /* —— 未指定的用组件默认值 —— */
    streakLength: 1,
    glow: 1,
    density: 0.6,
    zoom: 3,
    depth: 0.5,
    opacity: 1,
    mouseStrength: 0.4,
    mouseRadius: 0.45,
    mouseDampening: 0.15,
    lens: 0.5,
    fade: 0,
    lightMode: false,
    paused: false,
    dpr: undefined
  };

  var MAX_COLORS = 8;
  var BLOOM_LEVELS = 4;
  var INTRO_SECONDS = 2.6;
  var WARP_SPEED = 9;
  var TAU = Math.PI * 2;

  /* ---------------- 着色器（与原组件逐行一致） ---------------- */
  var VERTEX = '#version 300 es\n' +
    'in vec2 aPosition;\n' +
    'void main() {\n' +
    '  gl_Position = vec4(aPosition, 0.0, 1.0);\n' +
    '}';

  var STREAKS = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform vec2 uView;\n' +
    'uniform float uZoom;\n' +
    'uniform float uPhase;\n' +
    'uniform float uTwinkleClock;\n' +
    'uniform float uRings;\n' +
    'uniform vec3 uColors[8];\n' +
    'uniform int uColorCount;\n' +
    'uniform int uStreakCount;\n' +
    'uniform int uColumns;\n' +
    'uniform float uWidth;\n' +
    'uniform float uTail;\n' +
    'uniform float uTwinkle;\n' +
    'uniform float uHead;\n' +
    'uniform float uDepth;\n' +
    'uniform vec4 uMouse;\n' +
    'uniform vec3 uLens;\n' +
    'uniform float uLightMode;\n' +
    'uniform float uEncode;\n' +
    'out vec4 outColor;\n' +
    '\n' +
    'const vec3 CAMERA = vec3(0.0, -0.8888889, -0.2222222);\n' +
    'const float TAU = 6.28318530718;\n' +
    'const float SPACING = 0.005;\n' +
    'const float REACH = 0.32;\n' +
    '\n' +
    'uint scramble(uint x) {\n' +
    '  x ^= x >> 16;\n' +
    '  x *= 0x7feb352du;\n' +
    '  x ^= x >> 15;\n' +
    '  x *= 0x846ca68bu;\n' +
    '  x ^= x >> 16;\n' +
    '  return x;\n' +
    '}\n' +
    '\n' +
    'float unit(uint x) {\n' +
    '  return float(x & 0xffffu) / 65535.0;\n' +
    '}\n' +
    '\n' +
    'float stroke(float d, float w) {\n' +
    '  float s = max(0.75 * w, 0.55);\n' +
    '  return 0.75 * w / s * exp(-0.5 * d * d / (s * s));\n' +
    '}\n' +
    '\n' +
    'float orb(float d, float r) {\n' +
    '  float s = max(0.6 * r, 0.7);\n' +
    '  float e = 0.6 * r / s;\n' +
    '  return e * e * exp(-0.5 * d * d / (s * s));\n' +
    '}\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 frag = gl_FragCoord.xy;\n' +
    '  vec2 screen = (2.0 * frag - uView) / uView.x;\n' +
    '  vec2 p = screen;\n' +
    '  mat2 warp = mat2(1.0);\n' +
    '  if (uLens.z > 0.0) {\n' +
    '    vec2 o = p - uLens.xy;\n' +
    '    float e = uLens.z * exp(-dot(o, o) / (REACH * REACH));\n' +
    '    p -= o * e;\n' +
    '    warp = mat2(1.0 - e) + outerProduct(o, o) * (2.0 * e / (REACH * REACH));\n' +
    '  }\n' +
    '\n' +
    '  vec3 dir = vec3(p, uZoom);\n' +
    '  vec3 exits = (1.0 - CAMERA * sign(dir)) / max(abs(dir), vec3(1e-6));\n' +
    '  float u = min(exits.x, min(exits.y, exits.z));\n' +
    '  for (int i = 0; i < 5; i++) {\n' +
    '    vec3 h = CAMERA + u * dir;\n' +
    '    vec3 h2 = h * h;\n' +
    '    u -= (dot(h2, h2) - 1.0) / (4.0 * dot(dir, h2 * h));\n' +
    '  }\n' +
    '  vec3 hit = CAMERA + u * dir;\n' +
    '  vec3 normal = hit * hit * hit;\n' +
    '  float facing = dot(normal, dir);\n' +
    '  vec3 stepX = u * (vec3(1.0, 0.0, 0.0) - dir * (normal.x / facing));\n' +
    '  vec3 stepY = u * (vec3(0.0, 1.0, 0.0) - dir * (normal.y / facing));\n' +
    '  float ring = hit.y * hit.y + hit.z * hit.z;\n' +
    '  float theta = atan(hit.z, hit.y);\n' +
    '  mat2 jacobian = mat2(\n' +
    '    stepX.x,\n' +
    '    (hit.y * stepX.z - hit.z * stepX.y) / ring,\n' +
    '    stepY.x,\n' +
    '    (hit.y * stepY.z - hit.z * stepY.y) / ring\n' +
    '  ) * warp * (2.0 / uView.x);\n' +
    '\n' +
    '  vec2 gradX = vec2(jacobian[0][0], jacobian[1][0]);\n' +
    '  vec2 gradTheta = vec2(jacobian[0][1], jacobian[1][1]);\n' +
    '  float scale = max(length(gradX), 1e-8);\n' +
    '  float det = max(abs(gradX.x * gradTheta.y - gradX.y * gradTheta.x), 1e-12);\n' +
    '  float along = scale / det;\n' +
    '  float skew = dot(gradX, gradTheta) / det;\n' +
    '  float spacing = SPACING / scale;\n' +
    '  float detail = smoothstep(1.6, 3.2, spacing);\n' +
    '  if (detail <= 0.0) {\n' +
    '    outColor = vec4(0.0, 0.0, 0.0, 1.0);\n' +
    '    return;\n' +
    '  }\n' +
    '  float halfWidth = min(uWidth / scale, 0.2 * spacing);\n' +
    '  float headRadius = min(2.0 * uWidth / scale, 0.35 * spacing);\n' +
    '  float headReach = 4.0 * max(0.6 * headRadius, 0.7);\n' +
    '  float edge = uColumns > 1 ? 1.0 : 0.5;\n' +
    '  float period = TAU / uRings;\n' +
    '  float fog = exp(-max(u * length(dir) - 0.6, 0.0) * 1.6 * uDepth);\n' +
    '\n' +
    '  float boost = 1.0;\n' +
    '  if (uMouse.z > 0.0) {\n' +
    '    vec2 m = screen - uMouse.xy;\n' +
    '    boost += 2.0 * uMouse.z * exp(-dot(m, m) / max(uMouse.w * uMouse.w, 1e-4));\n' +
    '  }\n' +
    '\n' +
    '  int count = max(uColorCount, 1);\n' +
    '  vec3 total = vec3(0.0);\n' +
    '  for (int layer = 0; layer < 16; layer++) {\n' +
    '    if (layer >= uStreakCount) break;\n' +
    '    float x = hit.x + float(layer) * SPACING / 8.0;\n' +
    '    float nearest = floor(x / SPACING + 0.5);\n' +
    '    float side = x >= nearest * SPACING ? 1.0 : -1.0;\n' +
    '    for (int k = 0; k < 2; k++) {\n' +
    '      if (k >= uColumns) break;\n' +
    '      float column = nearest + side * float(k);\n' +
    '      float across = (x - column * SPACING) / scale;\n' +
    '      uint seed = scramble(uint(int(column) + 65536) + uint(layer) * 0x9e3779b9u);\n' +
    '      uint next = scramble(seed);\n' +
    '      float hue = unit(seed >> 16);\n' +
    '      float delta = theta - uPhase * (1.0 + floor(unit(seed) * 16.0) / 16.0) - unit(next) * period;\n' +
    '      delta -= period * floor(delta / period + 0.5);\n' +
    '      float ahead = delta * along - across * skew;\n' +
    '      if (abs(ahead) > headReach && (delta > 0.0 || -delta * uTail > 3.2)) continue;\n' +
    '      float behind = max(-delta, 0.0);\n' +
    '      float fall = exp(-uTail * behind) * (1.0 - smoothstep(0.5, 0.95, behind / (0.5 * period)));\n' +
    '      fall *= 1.0 - smoothstep(1.2, 3.2, uTail * behind);\n' +
    '      float reach = length(vec2(across, ahead));\n' +
    '      float trail = stroke(ahead > 0.0 ? reach : abs(across), halfWidth * mix(0.4, 1.0, fall)) * fall;\n' +
    '      float glint = orb(reach, headRadius) * mix(3.0, 1.8, uLightMode);\n' +
    '      float weight = mix(1.5, 1.0 + sin(uTwinkleClock + 7.0 * hue + 4.0), uTwinkle);\n' +
    '      weight *= 1.0 - smoothstep(0.72 * edge, edge, abs(across) / spacing);\n' +
    '      vec3 color = uColors[min(int(hue * float(count)), count - 1)];\n' +
    '      vec3 hot = mix(color, vec3(1.0), uHead * (1.0 - uLightMode));\n' +
    '      total += (trail * color + glint * hot) * weight;\n' +
    '    }\n' +
    '  }\n' +
    '\n' +
    '  outColor = vec4(total * fog * boost * detail * uEncode, 1.0);\n' +
    '}';

  var DOWNSAMPLE = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform sampler2D uSource;\n' +
    'uniform vec2 uTarget;\n' +
    'uniform vec2 uTexel;\n' +
    'uniform float uLimit;\n' +
    'out vec4 outColor;\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 uv = gl_FragCoord.xy / uTarget;\n' +
    '  vec3 color = texture(uSource, uv - uTexel).rgb;\n' +
    '  color += texture(uSource, uv + uTexel).rgb;\n' +
    '  color += texture(uSource, uv + vec2(uTexel.x, -uTexel.y)).rgb;\n' +
    '  color += texture(uSource, uv + vec2(-uTexel.x, uTexel.y)).rgb;\n' +
    '  outColor = vec4(min(color * 0.25, vec3(uLimit)), 1.0);\n' +
    '}';

  var BLUR = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform sampler2D uSource;\n' +
    'uniform vec2 uTarget;\n' +
    'uniform vec2 uStep;\n' +
    'out vec4 outColor;\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 uv = gl_FragCoord.xy / uTarget;\n' +
    '  vec3 color = texture(uSource, uv).rgb * 0.181862;\n' +
    '  color += (texture(uSource, uv + uStep * 1.423135).rgb + texture(uSource, uv - uStep * 1.423135).rgb) * 0.284316;\n' +
    '  color += (texture(uSource, uv + uStep * 3.326702).rgb + texture(uSource, uv - uStep * 3.326702).rgb) * 0.106598;\n' +
    '  color += (texture(uSource, uv + uStep * 5.242989).rgb + texture(uSource, uv - uStep * 5.242989).rgb) * 0.018156;\n' +
    '  outColor = vec4(color, 1.0);\n' +
    '}';

  var COMPOSITE = '#version 300 es\n' +
    'precision highp float;\n' +
    'uniform sampler2D uScene;\n' +
    'uniform sampler2D uBloom0;\n' +
    'uniform sampler2D uBloom1;\n' +
    'uniform sampler2D uBloom2;\n' +
    'uniform sampler2D uBloom3;\n' +
    'uniform vec2 uView;\n' +
    'uniform float uDecode;\n' +
    'uniform float uGlow;\n' +
    'uniform float uBloom;\n' +
    'uniform float uPresence;\n' +
    'uniform float uOpacity;\n' +
    'uniform float uFade;\n' +
    'uniform float uLightMode;\n' +
    'uniform vec3 uTopColor;\n' +
    'uniform float uTopGlow;\n' +
    'out vec4 outColor;\n' +
    '\n' +
    'float smootherstep01(float t) {\n' +
    '  t = clamp(t, 0.0, 1.0);\n' +
    '  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);\n' +
    '}\n' +
    '\n' +
    'void main() {\n' +
    '  vec2 uv = gl_FragCoord.xy / uView;\n' +
    '  vec3 light = texelFetch(uScene, ivec2(gl_FragCoord.xy), 0).rgb;\n' +
    '  if (uBloom > 0.0) {\n' +
    '    vec3 halo = texture(uBloom0, uv).rgb * 0.42;\n' +
    '    halo += texture(uBloom1, uv).rgb * 0.3;\n' +
    '    halo += texture(uBloom2, uv).rgb * 0.18;\n' +
    '    halo += texture(uBloom3, uv).rgb * 0.1;\n' +
    '    light += halo * uBloom * (uLightMode > 0.5 ? 0.2 : 1.0);\n' +
    '  }\n' +
    '  light *= uDecode * uGlow * uPresence;\n' +
    '\n' +
    '  if (uLightMode < 0.5 && uTopGlow > 0.0) {\n' +
    '    float aspect = uView.x / uView.y;\n' +
    '    vec2 q = vec2((uv.x - 0.5) * aspect, 1.04 - uv.y);\n' +
    '    float spread = 0.34 * max(aspect, 0.75);\n' +
    '    float core = exp(-q.x * q.x / (spread * spread) - q.y * q.y / 0.06);\n' +
    '    float halo = exp(-q.x * q.x / (3.6 * spread * spread) - q.y * q.y / 0.18);\n' +
    '    light += uTopColor * uTopGlow * (core * 0.85 + halo * 0.3) * uPresence;\n' +
    '  }\n' +
    '\n' +
    '  vec3 lit = max(light, 0.0);\n' +
    '  vec3 mapped = sqrt(1.0 - exp(-1.3 * lit * lit / (lit + 0.025)));\n' +
    '  float peak = max(mapped.r, max(mapped.g, mapped.b));\n' +
    '\n' +
    '  float mask = uOpacity;\n' +
    '  float edge = uFade * 0.5;\n' +
    '  if (edge > 0.0) {\n' +
    '    mask *= smootherstep01(uv.x / edge) * smootherstep01((1.0 - uv.x) / edge);\n' +
    '    mask *= smootherstep01(uv.y / edge) * smootherstep01((1.0 - uv.y) / edge);\n' +
    '  }\n' +
    '  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;\n' +
    '\n' +
    '  if (uLightMode > 0.5) {\n' +
    '    float coverage = clamp(smoothstep(0.0, 0.5, peak) * mask * 0.94 + grain, 0.0, 1.0);\n' +
    '    vec3 chroma = sqrt(clamp(lit / max(max(lit.r, max(lit.g, lit.b)), 1e-6), 0.0, 1.0));\n' +
    '    chroma = pow(chroma, vec3(1.35));\n' +
    '    chroma /= max(max(chroma.r, max(chroma.g, chroma.b)), 1e-4);\n' +
    '    float saturation = 1.0 - min(chroma.r, min(chroma.g, chroma.b));\n' +
    '    chroma = mix(vec3(0.3), chroma, smoothstep(0.08, 0.35, saturation));\n' +
    '    outColor = vec4(chroma * coverage, coverage);\n' +
    '  } else {\n' +
    '    vec3 color = clamp(mapped + grain, 0.0, 1.0) * mask;\n' +
    '    outColor = vec4(color, max(color.r, max(color.g, color.b)));\n' +
    '  }\n' +
    '}';

  var clamp = function (value, min, max) { return Math.min(max, Math.max(min, value)); };

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  function link(gl, fragmentSource) {
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
    }
    return { program: program, uniforms: uniforms };
  }

  function mount(container, overrides) {
    var s = Object.assign({}, PROPS, overrides || {});
    /* 参数清洗（与原组件一致） */
    s = Object.assign({}, s, {
      colors: (Array.isArray(s.colors) && s.colors.length ? s.colors : ['#ffffff']).slice(0, MAX_COLORS).map(String),
      backgroundColor: String(s.backgroundColor),
      streakCount: Math.round(clamp(s.streakCount, 1, 16)),
      streakWidth: Math.max(0.05, s.streakWidth),
      streakLength: Math.max(0.05, s.streakLength),
      glow: Math.max(0, s.glow),
      twinkle: clamp(s.twinkle, 0, 1),
      zoom: Math.max(0.1, s.zoom),
      backgroundGlow: Math.max(0, s.backgroundGlow),
      headGlow: clamp(s.headGlow, 0, 1),
      depth: Math.max(0, s.depth),
      bloom: Math.max(0, s.bloom),
      opacity: clamp(s.opacity, 0, 1),
      mouseStrength: Math.max(0, s.mouseStrength),
      mouseRadius: Math.max(0.01, s.mouseRadius),
      mouseDampening: Math.max(0, s.mouseDampening),
      lens: clamp(s.lens, 0, 1),
      fade: clamp(s.fade, 0, 1)
    });

    container.style.backgroundColor = s.backgroundColor;   /* 背景色由容器承担（原组件靠页面底色） */

    var canvas = document.createElement('canvas');
    canvas.className = 'lightfall-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    var gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) { container.style.backgroundColor = s.backgroundColor; return null; }

    var teardown = null;

    function boot() {
      var floatTargets = !!gl.getExtension('EXT_color_buffer_float');
      var streakProgram = link(gl, STREAKS);
      var downProgram = link(gl, DOWNSAMPLE);
      var blurProgram = link(gl, BLUR);
      var compositeProgram = link(gl, COMPOSITE);
      if (!streakProgram || !downProgram || !blurProgram || !compositeProgram) return null;

      var onContextLost = function (event) { event.preventDefault(); };
      var onContextRestored = function () {
        if (teardown) teardown();
        var next = boot();
        if (next) teardown = next;
      };
      canvas.addEventListener('webglcontextlost', onContextLost);
      canvas.addEventListener('webglcontextrestored', onContextRestored);

      var buffer = gl.createBuffer();
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND);

      var format = floatTargets ? gl.RGBA16F : gl.RGBA8;
      var encode = floatTargets ? 1 : 0.25;
      var createTarget = function () { return { texture: null, framebuffer: gl.createFramebuffer(), width: 0, height: 0 }; };
      var scene = createTarget();
      var levels = [];
      for (var li = 0; li < BLOOM_LEVELS; li++) levels.push([createTarget(), createTarget()]);

      var allocate = function (target, width, height) {
        if (target.texture && target.width === width && target.height === height) return;
        if (target.texture) gl.deleteTexture(target.texture);
        target.texture = gl.createTexture();
        target.width = width;
        target.height = height;
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
      };

      var pass = function (target, program) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
        gl.viewport(0, 0, target ? target.width : canvas.width, target ? target.height : canvas.height);
        gl.useProgram(program.program);
        return program.uniforms;
      };

      var bind = function (unit, texture) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      };

      var probeCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      var colorCache = {};
      var toRgb = function (value) {
        if (colorCache[value]) return colorCache[value];
        var rgb = [1, 1, 1];
        if (probeCtx) {
          probeCtx.clearRect(0, 0, 1, 1);
          probeCtx.fillStyle = '#ffffff';
          probeCtx.fillStyle = value;
          probeCtx.fillRect(0, 0, 1, 1);
          var d = probeCtx.getImageData(0, 0, 1, 1).data;
          rgb = [d[0] / 255, d[1] / 255, d[2] / 255];
        }
        colorCache[value] = rgb;
        return rgb;
      };
      var toLinear = function (value) {
        return toRgb(value).map(function (channel) { return channel * channel; });
      };

      var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      var palette = new Float32Array(MAX_COLORS * 3);
      var pointer = { x: 0, y: 0, inside: false, held: false };
      var state = {
        travel: 0,
        intro: (s.intro && !reduce) ? 0 : 1,
        mouseX: 0,
        mouseY: 0,
        lensX: 0,
        lensY: 0,
        touch: 0,
        warp: 0
      };
      var raf = 0;
      var last = 0;
      var visible = true;

      var render = function () {
        var width = canvas.width;
        var height = canvas.height;
        var cssWidth = Math.max(1, container.clientWidth);
        var cssHeight = Math.max(1, container.clientHeight);
        gl.bindVertexArray(vao);
        allocate(scene, width, height);
        levels.forEach(function (pair, index) {
          var levelWidth = Math.max(1, Math.round(cssWidth / Math.pow(2, index + 1)));
          var levelHeight = Math.max(1, Math.round(cssHeight / Math.pow(2, index + 1)));
          allocate(pair[0], levelWidth, levelHeight);
          allocate(pair[1], levelWidth, levelHeight);
        });

        var intro = state.intro;
        var presence = Math.min(1, intro * 2.2);
        var stretch = 1 + 5 * Math.pow(1 - intro, 2) + 2.5 * state.warp;
        var rings = Math.max(1, Math.floor(TAU * Math.max(s.density, 0.05) + 0.5));
        var period = TAU / rings;
        var clock = 9 + state.travel;

        var list = s.colors.map(toLinear);
        palette.fill(0);
        for (var i = 0; i < MAX_COLORS; i++) {
          var c = list[Math.min(i, list.length - 1)];
          palette[i * 3] = c[0];
          palette[i * 3 + 1] = c[1];
          palette[i * 3 + 2] = c[2];
        }

        var toScreenX = function (value) { return (2 * value - width) / width; };
        var toScreenY = function (value) { return (2 * value - height) / width; };

        var r = pass(scene, streakProgram);
        gl.uniform2f(r.uView, width, height);
        gl.uniform1f(r.uZoom, s.zoom);
        gl.uniform1f(r.uPhase, clock % (16 * period));
        gl.uniform1f(r.uTwinkleClock, clock % TAU);
        gl.uniform1f(r.uRings, rings);
        gl.uniform3fv(r.uColors, palette);
        gl.uniform1i(r.uColorCount, list.length);
        gl.uniform1i(r.uStreakCount, s.streakCount);
        gl.uniform1i(r.uColumns, s.streakWidth > 1 ? 2 : 1);
        gl.uniform1f(r.uWidth, 5e-4 * s.streakWidth);
        gl.uniform1f(r.uTail, 19 / (s.streakLength * stretch));
        gl.uniform1f(r.uTwinkle, s.twinkle);
        gl.uniform1f(r.uHead, s.headGlow);
        gl.uniform1f(r.uDepth, s.depth);
        gl.uniform4f(
          r.uMouse,
          toScreenX(state.mouseX),
          toScreenY(state.mouseY),
          s.mouseInteraction ? s.mouseStrength * state.touch : 0,
          s.mouseRadius
        );
        gl.uniform3f(
          r.uLens,
          toScreenX(state.lensX),
          toScreenY(state.lensY),
          s.mouseInteraction ? 0.5 * s.lens * state.touch : 0
        );
        gl.uniform1f(r.uLightMode, s.lightMode ? 1 : 0);
        gl.uniform1f(r.uEncode, encode);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (s.bloom > 0) {
          var source = scene;
          levels.forEach(function (pair) {
            var front = pair[0];
            var back = pair[1];
            var d = pass(front, downProgram);
            bind(0, source.texture);
            gl.uniform1i(d.uSource, 0);
            gl.uniform2f(d.uTarget, front.width, front.height);
            gl.uniform2f(d.uTexel, 1 / source.width, 1 / source.height);
            gl.uniform1f(d.uLimit, 4 * encode);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            var b = pass(back, blurProgram);
            bind(0, front.texture);
            gl.uniform1i(b.uSource, 0);
            gl.uniform2f(b.uTarget, back.width, back.height);
            gl.uniform2f(b.uStep, 1 / front.width, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            b = pass(front, blurProgram);
            bind(0, back.texture);
            gl.uniform1i(b.uSource, 0);
            gl.uniform2f(b.uTarget, front.width, front.height);
            gl.uniform2f(b.uStep, 0, 1 / back.height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            source = front;
          });
        }

        var c2 = pass(null, compositeProgram);
        bind(0, scene.texture);
        gl.uniform1i(c2.uScene, 0);
        levels.forEach(function (pair, index) {
          bind(index + 1, pair[0].texture);
          gl.uniform1i(c2['uBloom' + index], index + 1);
        });
        gl.uniform2f(c2.uView, width, height);
        gl.uniform1f(c2.uDecode, 1 / encode);
        gl.uniform1f(c2.uGlow, s.glow);
        gl.uniform1f(c2.uBloom, s.bloom);
        gl.uniform1f(c2.uPresence, presence);
        gl.uniform1f(c2.uOpacity, s.opacity);
        gl.uniform1f(c2.uFade, s.fade);
        gl.uniform1f(c2.uLightMode, s.lightMode ? 1 : 0);
        var top = toLinear(s.backgroundColor);
        gl.uniform3f(c2.uTopColor, top[0], top[1], top[2]);
        gl.uniform1f(c2.uTopGlow, s.backgroundGlow);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        for (var unit = BLOOM_LEVELS; unit >= 0; unit--) bind(unit, null);
      };

      var frame = function (now) {
        raf = 0;
        if (!visible || document.hidden) return;
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
        last = now;
        if (!s.intro || reduce) state.intro = 1;
        else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);

        var holding = s.holdToWarp && pointer.held && pointer.inside && !reduce;
        state.warp += ((holding ? 1 : 0) - state.warp) * (1 - Math.exp(-dt * (holding ? 2.2 : 1.6)));
        var rush = WARP_SPEED * Math.pow(1 - state.intro, 2) + 6 * state.warp;
        var running = !s.paused && !reduce;
        if (running) state.travel += dt * 0.1 * s.speed * (1 + rush);

        var ratio = canvas.width / Math.max(1, container.clientWidth);
        var targetX = pointer.x * ratio;
        var targetY = (container.clientHeight - pointer.y) * ratio;
        var engaged = s.mouseInteraction && pointer.inside && !reduce;
        if (engaged && state.touch < 0.01) {
          state.mouseX = targetX;
          state.mouseY = targetY;
          state.lensX = targetX;
          state.lensY = targetY;
        }
        var follow = s.mouseDampening > 0 ? 1 - Math.exp(-dt / s.mouseDampening) : 1;
        state.mouseX += (targetX - state.mouseX) * follow;
        state.mouseY += (targetY - state.mouseY) * follow;
        var lensFollow = 1 - Math.exp(-dt * 6);
        state.lensX += (targetX - state.lensX) * lensFollow;
        state.lensY += (targetY - state.lensY) * lensFollow;
        state.touch += ((engaged ? 1 : 0) - state.touch) * (1 - Math.exp(-dt * (engaged ? 4 : 2)));

        render();

        var settling = state.intro < 1 || state.warp > 0.001 ||
          Math.abs((engaged ? 1 : 0) - state.touch) > 0.002;
        if ((running && s.speed !== 0) || settling) raf = requestAnimationFrame(frame);
        else last = 0;
      };

      var wake = function () {
        if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
      };

      var resize = function () {
        var width = Math.max(1, container.clientWidth);
        var height = Math.max(1, container.clientHeight);
        var ratio = Math.min(s.dpr || global.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        if (!raf) render();
        wake();
      };

      var locate = function (event) {
        var rect = container.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        return { x: x, y: y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
      };

      var onPointerMove = function (event) {
        var point = locate(event);
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.inside = point.inside;
        wake();
      };
      var onPointerDown = function (event) {
        var point = locate(event);
        if (!point.inside) return;
        pointer.x = point.x;
        pointer.y = point.y;
        pointer.inside = true;
        pointer.held = true;
        wake();
      };
      var onPointerUp = function () { pointer.held = false; wake(); };
      var onPointerLeave = function () { pointer.inside = false; pointer.held = false; wake(); };
      var onVisibility = function () { last = 0; wake(); };

      var resizeObserver = global.ResizeObserver ? new ResizeObserver(resize) : null;
      if (resizeObserver) resizeObserver.observe(container);
      else global.addEventListener('resize', resize, false);

      var intersection = global.IntersectionObserver ? new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) { return entry.isIntersecting; });
        if (visible) { last = 0; wake(); }
      }) : null;
      if (intersection) intersection.observe(container);

      global.addEventListener('pointermove', onPointerMove, { passive: true });
      global.addEventListener('pointerdown', onPointerDown, { passive: true });
      global.addEventListener('pointerup', onPointerUp, { passive: true });
      global.addEventListener('pointercancel', onPointerUp, { passive: true });
      document.documentElement.addEventListener('pointerleave', onPointerLeave);
      document.addEventListener('visibilitychange', onVisibility);
      resize();

      return function () {
        live = false;
        cancelAnimationFrame(raf);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);
        if (resizeObserver) resizeObserver.disconnect();
        else global.removeEventListener('resize', resize);
        if (intersection) intersection.disconnect();
        global.removeEventListener('pointermove', onPointerMove);
        global.removeEventListener('pointerdown', onPointerDown);
        global.removeEventListener('pointerup', onPointerUp);
        global.removeEventListener('pointercancel', onPointerUp);
        document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        var targets = [scene];
        levels.forEach(function (pair) { targets.push(pair[0], pair[1]); });
        targets.forEach(function (target) {
          if (target.texture) gl.deleteTexture(target.texture);
          gl.deleteFramebuffer(target.framebuffer);
        });
        [streakProgram, downProgram, blurProgram, compositeProgram].forEach(function (item) {
          gl.deleteProgram(item.program);
        });
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        if (!gl.isContextLost() && gl.getExtension) {
          var lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
      };
    }

    teardown = boot();
    if (!teardown) { canvas.remove(); return null; }
    return teardown;
  }

  /* ---------------- 自动挂载 ---------------- */
  function init() {
    var box = document.getElementById('lightfall');
    if (!box) return;
    try {
      mount(box, {});
    } catch (err) {
      box.style.backgroundColor = PROPS.backgroundColor;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.RoverLightfall = { mount: mount, PROPS: PROPS };
})(window);
