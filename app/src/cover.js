// Vice Coast Cover Maker — cover rendering engine.
// Draws GTA-style multi-panel cover art on a 2D canvas: a painted Vice City
// sky (gradient, striped retro sun, skyline and palm silhouettes, all original
// vector art), photo panels in four layouts, five colour grades, bold Anton
// title lettering with outline and offset shadow, a Pacifico script subtitle,
// a badge ribbon, film grain and a vignette. No Rockstar artwork, logo or
// font is used anywhere; every drawn shape here is original.
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- grades
  // Each grade is a full colour story: sky gradient, sun, title ink, accent
  // used for the shadow and ribbon, and a translucent tint washed over the
  // finished cover so the photo panels share the grade.
  var GRADES = {
    sunset: {
      label: 'Vice Sunset', sky: ['#2b1055', '#7597de', '#ff7e5f', '#feb47b'],
      sun: ['#ffd76e', '#ff5e62'], ink: '#ffffff', accent: '#ff2e88',
      shadow: '#1c0b2e', tint: '#ff7e5f', tintAlpha: 0.10, stroke: '#fff3e0',
    },
    neon: {
      label: 'Neon Nights', sky: ['#050514', '#1b1040', '#7b2ff7', '#ff2e88'],
      sun: ['#ff9de2', '#00e5ff'], ink: '#ffffff', accent: '#00e5ff',
      shadow: '#0a0618', tint: '#b967ff', tintAlpha: 0.12, stroke: '#e6f9ff',
    },
    golden: {
      label: 'Golden Hour', sky: ['#7a3b06', '#c96f1e', '#f2a541', '#ffe3a3'],
      sun: ['#fff3b0', '#ff8c1a'], ink: '#fff8ec', accent: '#c2410c',
      shadow: '#2b1503', tint: '#f2a541', tintAlpha: 0.10, stroke: '#fff8ec',
    },
    noir: {
      label: 'Teal Noir', sky: ['#03181d', '#0b3d46', '#177e89', '#8fd6c9'],
      sun: ['#d8fff4', '#5ec8b8'], ink: '#f2fffc', accent: '#5ec8b8',
      shadow: '#01161a', tint: '#177e89', tintAlpha: 0.10, stroke: '#eafffa',
    },
    candy: {
      label: 'Cotton Candy', sky: ['#6d28a8', '#c084fc', '#f9a8d4', '#fde68a'],
      sun: ['#fff1f2', '#fb7185'], ink: '#ffffff', accent: '#ec4899',
      shadow: '#2e1065', tint: '#f9a8d4', tintAlpha: 0.10, stroke: '#fff7ed',
    },
  };

  var GRADE_ORDER = ['sunset', 'neon', 'golden', 'noir', 'candy'];

  // ---------------------------------------------------------------- sizes
  var SIZES = {
    square: { label: 'Square 1080 x 1080', w: 1080, h: 1080 },
    portrait: { label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
    wide: { label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
  };
  var SIZE_ORDER = ['square', 'portrait', 'wide'];

  // --------------------------------------------------------------- layouts
  // Panel rectangles in unit coordinates (0..1 of the canvas). The title band
  // lives below y = 0.70 in every layout except snapshots, where the cards
  // float over the painted sky and the title sits in the lower band too.
  var LAYOUTS = {
    poster: {
      label: 'Poster',
      hint: 'One hero panel plus three side panels, the classic poster look.',
      panels: function () {
        return [
          { x: 0.03, y: 0.03, w: 0.62, h: 0.64, r: 0 },
          { x: 0.68, y: 0.03, w: 0.29, h: 0.20, r: 0 },
          { x: 0.68, y: 0.26, w: 0.29, h: 0.20, r: 0 },
          { x: 0.68, y: 0.49, w: 0.29, h: 0.18, r: 0 },
        ];
      },
    },
    grid: {
      label: 'Grid 9',
      hint: 'Nine equal panels, a comic-strip wall of moments.',
      panels: function () {
        var out = [];
        var xs = [0.03, 0.35, 0.67];
        var ys = [0.03, 0.25, 0.47];
        for (var r = 0; r < 3; r++) {
          for (var c = 0; c < 3; c++) {
            out.push({ x: xs[c], y: ys[r], w: 0.30, h: 0.20, r: 0 });
          }
        }
        return out;
      },
    },
    hero: {
      label: 'Hero',
      hint: 'One photo, full bleed, title over the sunset band.',
      panels: function () {
        return [{ x: 0, y: 0, w: 1, h: 0.70, r: 0 }];
      },
    },
    snapshots: {
      label: 'Snapshots',
      hint: 'Tilted photo cards scattered over the painted sunset.',
      sun: { x: 0.16, y: 0.30, r: 0.17 },
      panels: function () {
        return [
          { x: 0.06, y: 0.05, w: 0.40, h: 0.50, r: -0.10 },
          { x: 0.34, y: 0.10, w: 0.40, h: 0.52, r: 0.05 },
          { x: 0.60, y: 0.04, w: 0.36, h: 0.48, r: 0.12 },
        ];
      },
    },
  };
  var LAYOUT_ORDER = ['poster', 'grid', 'hero', 'snapshots'];

  // ------------------------------------------------------------- utilities
  // Deterministic pseudo-random numbers, so the skyline, stars and grain
  // look the same on every render of the same cover.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function fitFont(ctx, text, maxWidth, startPx, family, weight) {
    var px = startPx;
    ctx.font = weight + ' ' + px + 'px ' + family;
    while (px > 24 && ctx.measureText(text).width > maxWidth) {
      px -= 4;
      ctx.font = weight + ' ' + px + 'px ' + family;
    }
    return px;
  }

  // Wrap a title into at most two balanced lines.
  function wrapTitle(text, maxChars) {
    var words = String(text || 'VICE COAST').toUpperCase().split(/\s+/);
    if (words.join(' ').length <= maxChars) return [words.join(' ')];
    var first = '';
    var rest = [];
    for (var i = 0; i < words.length; i++) {
      if ((first + ' ' + words[i]).trim().length <= maxChars && rest.length === 0) {
        first = (first + ' ' + words[i]).trim();
      } else {
        rest.push(words[i]);
      }
    }
    return [first, rest.join(' ')];
  }

  // ----------------------------------------------------------------- sky
  function drawSky(ctx, w, h, grade) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, grade.sky[0]);
    g.addColorStop(0.45, grade.sky[1]);
    g.addColorStop(0.72, grade.sky[2]);
    g.addColorStop(1, grade.sky[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawStars(ctx, w, h, seed) {
    var rnd = mulberry32(seed);
    ctx.save();
    for (var i = 0; i < 90; i++) {
      var x = rnd() * w;
      var y = rnd() * h * 0.38;
      var r = 0.6 + rnd() * 1.6;
      ctx.globalAlpha = 0.25 + rnd() * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The striped retro sun: a disc clipped, then horizontal sky-coloured
  // slits cut across its lower half, widening toward the bottom.
  function drawStripedSun(ctx, w, h, grade, cx, cy, r) {
    ctx.save();
    var g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    g.addColorStop(0, grade.sun[0]);
    g.addColorStop(1, grade.sun[1]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = grade.sky[1];
    var y = cy + r * 0.05;
    var gap = r * 0.035;
    while (y < cy + r) {
      ctx.fillRect(cx - r, y, r * 2, gap);
      y += gap + r * 0.10;
      gap *= 1.45;
    }
    ctx.restore();
    // Soft glow behind the disc.
    ctx.save();
    ctx.globalAlpha = 0.35;
    var glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.1);
    glow.addColorStop(0, grade.sun[1]);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Original skyline silhouette: seeded building blocks with a few lit
  // windows, drawn dark against the sunset.
  function drawSkyline(ctx, w, horizonY, color, seed) {
    var rnd = mulberry32(seed);
    ctx.save();
    ctx.fillStyle = color;
    var x = -10;
    while (x < w + 10) {
      var bw = w * (0.03 + rnd() * 0.05);
      var bh = horizonY * (0.10 + rnd() * 0.30);
      ctx.fillRect(x, horizonY - bh, bw, bh);
      if (rnd() > 0.55) { // rooftop antenna
        ctx.fillRect(x + bw * 0.45, horizonY - bh - 14, 3, 14);
      }
      // A few lit windows, warm against the dark block.
      var wins = Math.floor(rnd() * 6);
      for (var i = 0; i < wins; i++) {
        ctx.fillStyle = 'rgba(255, 214, 110, 0.85)';
        ctx.fillRect(
          x + 4 + rnd() * (bw - 10),
          horizonY - bh + 6 + rnd() * (bh - 14),
          4, 6
        );
        ctx.fillStyle = color;
      }
      x += bw + rnd() * w * 0.02;
    }
    ctx.restore();
  }

  // Original palm silhouette: a curved trunk and seven arched fronds.
  function drawPalm(ctx, x, y, s, color, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.rotate(lean || 0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    // Trunk, gently curved.
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(6, -52, 14, -96);
    ctx.stroke();
    // Fronds fanning from the crown.
    ctx.lineWidth = 5;
    var crownX = 14;
    var crownY = -96;
    for (var i = 0; i < 7; i++) {
      var a = (-150 + i * 30) * Math.PI / 180;
      var tipX = crownX + Math.cos(a) * 52;
      var tipY = crownY + Math.sin(a) * 34 + 16;
      var midX = crownX + Math.cos(a) * 30;
      var midY = crownY + Math.sin(a) * 12 - 14;
      ctx.beginPath();
      ctx.moveTo(crownX, crownY);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();
    }
    // Coconuts.
    ctx.beginPath(); ctx.arc(crownX - 4, crownY + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(crownX + 5, crownY + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPaintedBackdrop(ctx, w, h, grade, seed, sunPos) {
    drawSky(ctx, w, h, grade);
    if (grade === GRADES.neon || grade === GRADES.noir) drawStars(ctx, w, h, seed);
    var sunR = Math.min(w, h) * (sunPos.r || 0.21);
    var sunX = w * (sunPos.x || 0.68);
    var sunY = h * (sunPos.y || 0.42);
    drawStripedSun(ctx, w, h, grade, sunX, sunY, sunR);
    var horizonY = h * 0.70;
    drawSkyline(ctx, w, horizonY, grade.shadow, seed + 7);
    // Sea shimmer below the horizon: thin light bands.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = grade.sun[0];
    for (var i = 0; i < 7; i++) {
      var yy = horizonY + 8 + i * ((h - horizonY) / 7);
      ctx.fillRect(w * 0.55, yy, w * 0.30, 2);
    }
    ctx.restore();
    // Palms framing the corners, in front of the skyline.
    var ps = Math.min(w, h) / 620;
    drawPalm(ctx, w * 0.045, h * 0.70, ps * 1.15, grade.shadow, -0.06);
    drawPalm(ctx, w * 0.955, h * 0.70, ps * 0.95, grade.shadow, 0.10);
  }

  // -------------------------------------------------------------- panels
  function drawPhotoInto(ctx, img, x, y, w, h, photo) {
    if (!img || !img.naturalWidth) return false;
    var iw = img.naturalWidth;
    var ih = img.naturalHeight;
    var zoom = photo && photo.zoom ? photo.zoom : 1;
    var scale = Math.max(w / iw, h / ih) * zoom;
    var dw = iw * scale;
    var dh = ih * scale;
    var ox = photo && photo.ox ? photo.ox : 0;
    var oy = photo && photo.oy ? photo.oy : 0;
    // Never let a shift open a gap: the photo must always cover the panel.
    ox = clamp(ox, -Math.max(0, (dw - w) / 2 / w), Math.max(0, (dw - w) / 2 / w));
    oy = clamp(oy, -Math.max(0, (dh - h) / 2 / h), Math.max(0, (dh - h) / 2 / h));
    var cx = x + w / 2 + ox * w;
    var cy = y + h / 2 + oy * h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
    return true;
  }

  function drawPanel(ctx, w, h, rect, img, photo, grade) {
    var x = rect.x * w;
    var y = rect.y * h;
    var pw = rect.w * w;
    var ph = rect.h * h;
    ctx.save();
    if (rect.r) {
      ctx.translate(x + pw / 2, y + ph / 2);
      ctx.rotate(rect.r);
      ctx.translate(-pw / 2, -ph / 2);
      x = 0; y = 0;
    }
    // Card backing so tilted snapshots read as physical cards.
    ctx.fillStyle = '#fdf6ec';
    ctx.fillRect(x - 5, y - 5, pw + 10, ph + 10);
    var ok = drawPhotoInto(ctx, img, x, y, pw, ph, photo);
    if (!ok) { // empty slot: painted placeholder, never a broken image
      ctx.fillStyle = grade.sky[1];
      ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 ' + Math.round(ph * 0.09) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ADD A PHOTO', x + pw / 2, y + ph / 2);
    }
    ctx.lineWidth = Math.max(3, w * 0.004);
    ctx.strokeStyle = grade.stroke;
    ctx.strokeRect(x, y, pw, ph);
    ctx.restore();
  }

  // -------------------------------------------------------------- effects
  var noiseCanvas = null;
  function grainPattern(ctx) {
    if (noiseCanvas) return noiseCanvas;
    noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 160;
    noiseCanvas.height = 160;
    var nctx = noiseCanvas.getContext('2d');
    var rnd = mulberry32(20261119);
    var img = nctx.createImageData(160, 160);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.floor(rnd() * 255);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    return noiseCanvas;
  }

  function drawGrain(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.055;
    var pat = ctx.createPattern(grainPattern(ctx), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawVignette(ctx, w, h) {
    var g = ctx.createRadialGradient(
      w / 2, h * 0.46, Math.min(w, h) * 0.42,
      w / 2, h * 0.5, Math.max(w, h) * 0.78
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // -------------------------------------------------------------- lettering
  function drawBadge(ctx, w, h, grade, text) {
    if (!text) return;
    var label = String(text).toUpperCase().slice(0, 24);
    ctx.save();
    var bw = w * 0.28;
    var bh = Math.min(h * 0.052, 56);
    ctx.translate(w - bw * 0.60, bh * 1.1);
    ctx.rotate(0.06);
    ctx.fillStyle = grade.accent;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, -bh / 2);
    ctx.lineTo(bw / 2, -bh / 2);
    ctx.lineTo(bw / 2 + bh * 0.45, 0);
    ctx.lineTo(bw / 2, bh / 2);
    ctx.lineTo(-bw / 2, bh / 2);
    ctx.lineTo(-bw / 2 - bh * 0.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 ' + Math.round(bh * 0.52) + 'px Anton, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  function drawTitleBlock(ctx, w, h, grade, state) {
    var bandTop = h * 0.70;
    // Dark legibility wash over the lower band.
    var wash = ctx.createLinearGradient(0, bandTop - h * 0.06, 0, h);
    wash.addColorStop(0, 'rgba(0,0,0,0)');
    wash.addColorStop(0.35, 'rgba(0,0,0,0.38)');
    wash.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, bandTop - h * 0.06, w, h - bandTop + h * 0.06);

    var margin = w * 0.045;
    var maxW = w - margin * 2;
    var lines = wrapTitle(state.title, 14);
    // Bottom-anchored: the subtitle baseline sits at 96.5% height and the
    // title stacks above it, so nothing is ever clipped at the canvas edge.
    var subPx = Math.min(w * 0.044, 56);
    var subBaseline = h * 0.965;
    var firstPx = fitFont(ctx, lines[0], maxW, Math.min(w * 0.115, 148), 'Anton, sans-serif', '400');
    var lineH = firstPx * 0.98;
    var firstBaseline = subBaseline - subPx * 1.7 - (lines.length - 1) * lineH;
    ctx.save();
    ctx.translate(margin, firstBaseline);
    ctx.rotate(-0.022);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    lines.forEach(function (line, i) {
      var px = fitFont(ctx, line, maxW, Math.min(w * 0.115, 148), 'Anton, sans-serif', '400');
      var y = i * lineH;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      // Offset accent shadow, then thick dark outline, then the ink fill.
      ctx.fillStyle = grade.accent;
      ctx.fillText(line, px * 0.055, y + px * 0.055);
      ctx.lineWidth = px * 0.10;
      ctx.strokeStyle = grade.shadow;
      ctx.strokeText(line, 0, y);
      ctx.fillStyle = grade.ink;
      ctx.fillText(line, 0, y);
    });
    var subY = (lines.length - 1) * lineH + subPx * 1.7;
    ctx.font = '400 ' + subPx + 'px Pacifico, cursive';
    ctx.fillStyle = grade.sun[0];
    ctx.fillText(state.subtitle || '', 4, subY);
    ctx.restore();
  }

  // ---------------------------------------------------------------- render
  // state: { layout, grade, size, title, subtitle, badge,
  //          photos: [{img, zoom, ox, oy}], photoMap: [photoIndex per panel] }
  function renderCover(canvas, state) {
    var size = SIZES[state.size] || SIZES.square;
    var grade = GRADES[state.grade] || GRADES.sunset;
    var layout = LAYOUTS[state.layout] || LAYOUTS.poster;
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    var w = size.w;
    var h = size.h;
    var seed = 11;
    for (var i = 0; i < state.title.length; i++) seed = (seed * 31 + state.title.charCodeAt(i)) >>> 0;

    drawPaintedBackdrop(ctx, w, h, grade, seed, layout.sun || {});
    var rects = layout.panels();
    // When one photo fills several panels, vary each repeat's framing so
    // the panels read as different moments, not the same crop nine times.
    var seen = {};
    var frameShift = [
      { ox: 0, oy: 0, zoom: 1 },
      { ox: 0.16, oy: -0.05, zoom: 1.10 },
      { ox: -0.16, oy: 0.07, zoom: 1.06 },
      { ox: 0.08, oy: 0.10, zoom: 1.16 },
      { ox: -0.08, oy: -0.10, zoom: 1.12 },
      { ox: 0.20, oy: 0.04, zoom: 1.08 },
      { ox: -0.20, oy: -0.02, zoom: 1.14 },
      { ox: 0.05, oy: -0.12, zoom: 1.05 },
      { ox: -0.05, oy: 0.12, zoom: 1.18 },
    ];
    rects.forEach(function (rect, i) {
      var photoIdx = state.photoMap && state.photoMap[i] != null ? state.photoMap[i] : 0;
      var photo = state.photos[photoIdx] || state.photos[0];
      var framed = photo;
      if (photo) {
        var nth = seen[photoIdx] || 0;
        seen[photoIdx] = nth + 1;
        if (nth > 0) {
          var shift = frameShift[nth % frameShift.length];
          framed = {
            img: photo.img,
            zoom: (photo.zoom || 1) * shift.zoom,
            ox: (photo.ox || 0) + shift.ox,
            oy: (photo.oy || 0) + shift.oy,
          };
        }
      }
      drawPanel(ctx, w, h, rect, framed ? framed.img : null, framed, grade);
    });
    // Wash the grade tint over everything so panels and paint share it.
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = grade.tintAlpha;
    } catch (e) {
      ctx.globalAlpha = grade.tintAlpha * 0.5;
    }
    ctx.fillStyle = grade.tint;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    drawGrain(ctx, w, h);
    drawVignette(ctx, w, h);
    drawTitleBlock(ctx, w, h, grade, state);
    drawBadge(ctx, w, h, grade, state.badge);
    return canvas;
  }

  function layoutPanelCount(layoutName) {
    return (LAYOUTS[layoutName] || LAYOUTS.poster).panels().length;
  }

  global.ViceCover = {
    GRADES: GRADES,
    GRADE_ORDER: GRADE_ORDER,
    SIZES: SIZES,
    SIZE_ORDER: SIZE_ORDER,
    LAYOUTS: LAYOUTS,
    LAYOUT_ORDER: LAYOUT_ORDER,
    renderCover: renderCover,
    layoutPanelCount: layoutPanelCount,
  };
})(window);
