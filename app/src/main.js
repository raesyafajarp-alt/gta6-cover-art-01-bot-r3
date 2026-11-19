// Vice Coast Cover Maker — editor wiring.
// Owns the app state, the controls, photo uploads (files stay on the user's
// machine, never uploaded anywhere), live preview rendering and PNG export.
// A `?shot=` URL mode drives the app headlessly for screenshots: it applies
// the query (photo, layout, grade, size, caption, subtitle), renders, and
// sets window.__shotReady when the cover is painted.
(function () {
  'use strict';

  var VC = window.ViceCover;
  var SAMPLES = [
    { name: 'sunset-rider', label: 'Sunset Rider', src: 'samples/sunset-rider.jpg' },
    { name: 'neon-pier', label: 'Neon Pier', src: 'samples/neon-pier.jpg' },
  ];

  var state = {
    layout: 'poster',
    grade: 'sunset',
    size: 'square',
    title: 'VICE COAST',
    subtitle: 'Sunset Heist',
    badge: 'VICE COAST',
    photos: [],
    photoMap: [0, 1, 0, 1],
    selectedPanel: 0,
    useOnePhoto: true,
  };

  var canvas = null;
  var statusEl = null;
  var renderQueued = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      renderNow();
    });
  }

  function renderNow() {
    if (!canvas || !state.photos.length) return;
    try {
      VC.renderCover(canvas, state);
    } catch (err) {
      setStatus('Render failed: ' + err.message);
      return;
    }
    updatePanelStrip();
    setStatus('Cover ready — ' + VC.SIZES[state.size].label + ' · ' +
      VC.LAYOUTS[state.layout].label + ' · ' + VC.GRADES[state.grade].label);
  }

  // ------------------------------------------------------------ photos
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('could not load ' + src)); };
      img.src = src;
    });
  }

  function loadFileAsImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('could not read that file')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('could not read that file')); };
      reader.readAsDataURL(file);
    });
  }

  function defaultPhotoMap() {
    var n = VC.layoutPanelCount(state.layout);
    var map = [];
    for (var i = 0; i < n; i++) map.push(i % state.photos.length);
    if (state.useOnePhoto) {
      for (var j = 0; j < n; j++) map[j] = 0;
    }
    return map;
  }

  function applyPhotoToSelected(img) {
    var photo = { img: img, zoom: 1.12, ox: 0, oy: 0 };
    state.photos.push(photo);
    var idx = state.photos.length - 1;
    if (state.useOnePhoto) {
      state.photoMap = state.photoMap.map(function () { return idx; });
    } else {
      state.photoMap[state.selectedPanel] = idx;
    }
    queueRender();
  }

  // ------------------------------------------------------------ controls
  function buildChoiceButtons(containerId, items, current, onPick) {
    var box = $(containerId);
    box.innerHTML = '';
    items.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (item.value === current ? ' active' : '');
      b.textContent = item.label;
      b.setAttribute('aria-pressed', item.value === current ? 'true' : 'false');
      if (item.swatch) {
        b.style.setProperty('--swatch', item.swatch);
        b.classList.add('swatch');
      }
      b.addEventListener('click', function () { onPick(item.value); });
      box.appendChild(b);
    });
  }

  function refreshChoices() {
    buildChoiceButtons('layoutChoices', VC.LAYOUT_ORDER.map(function (k) {
      return { value: k, label: VC.LAYOUTS[k].label };
    }), state.layout, function (v) {
      state.layout = v;
      state.photoMap = defaultPhotoMap();
      state.selectedPanel = 0;
      $('layoutHint').textContent = VC.LAYOUTS[v].hint;
      refreshChoices();
      queueRender();
    });
    buildChoiceButtons('gradeChoices', VC.GRADE_ORDER.map(function (k) {
      return { value: k, label: VC.GRADES[k].label, swatch: VC.GRADES[k].sky[2] };
    }), state.grade, function (v) {
      state.grade = v;
      refreshChoices();
      queueRender();
    });
    buildChoiceButtons('sizeChoices', VC.SIZE_ORDER.map(function (k) {
      return { value: k, label: VC.SIZES[k].label };
    }), state.size, function (v) {
      state.size = v;
      refreshChoices();
      queueRender();
    });
    $('layoutHint').textContent = VC.LAYOUTS[state.layout].hint;
  }

  function updatePanelStrip() {
    var strip = $('panelStrip');
    if (!strip) return;
    var n = VC.layoutPanelCount(state.layout);
    if (strip.children.length !== n) {
      strip.innerHTML = '';
      for (var i = 0; i < n; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'panel-btn';
          b.textContent = 'Panel ' + (idx + 1);
          b.addEventListener('click', function () {
            state.selectedPanel = idx;
            syncCropSliders();
            updatePanelStrip();
          });
          strip.appendChild(b);
        })(i);
      }
    }
    for (var j = 0; j < strip.children.length; j++) {
      strip.children[j].classList.toggle('active', j === state.selectedPanel);
      var pIdx = state.photoMap[j];
      var label = 'Panel ' + (j + 1);
      if (pIdx != null && state.photos[pIdx]) label += ' · photo ' + (pIdx + 1);
      strip.children[j].textContent = label;
    }
  }

  function syncCropSliders() {
    var photo = state.photos[state.photoMap[state.selectedPanel]] || state.photos[0];
    if (!photo) return;
    $('zoomRange').value = photo.zoom;
    $('xRange').value = photo.ox;
    $('yRange').value = photo.oy;
    $('zoomVal').textContent = photo.zoom.toFixed(2) + 'x';
    $('xVal').textContent = (photo.ox * 100).toFixed(0) + '%';
    $('yVal').textContent = (photo.oy * 100).toFixed(0) + '%';
  }

  function bindCropSlider(id, key) {
    $(id).addEventListener('input', function (ev) {
      var photo = state.photos[state.photoMap[state.selectedPanel]];
      if (!photo) return;
      photo[key] = parseFloat(ev.target.value);
      syncCropSliders();
      queueRender();
    });
  }

  // ------------------------------------------------------------ export
  function exportPNG() {
    var size = VC.SIZES[state.size];
    var off = document.createElement('canvas');
    VC.renderCover(off, state);
    setStatus('Exporting ' + size.w + ' x ' + size.h + ' PNG…');
    off.toBlob(function (blob) {
      if (!blob) {
        setStatus('Export failed — the browser could not make the PNG.');
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'vice-coast-' + state.size + '-' + size.w + 'x' + size.h + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      setStatus('Exported ' + size.w + ' x ' + size.h + ' PNG (' +
        Math.round(blob.size / 1024) + ' KB).');
    }, 'image/png');
  }

  // Headless helper used by the verification script: renders at the given
  // size and resolves with a data URL plus the byte length of the PNG.
  function exportPNGDataURL(sizeName) {
    return new Promise(function (resolve) {
      var saved = state.size;
      state.size = sizeName;
      var off = document.createElement('canvas');
      VC.renderCover(off, state);
      state.size = saved;
      queueRender();
      off.toBlob(function (blob) {
        if (!blob) { resolve({ ok: false }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          resolve({ ok: true, bytes: blob.size, dataUrl: reader.result });
        };
        reader.readAsDataURL(blob);
      }, 'image/png');
    });
  }

  // ------------------------------------------------------------ shot mode
  function applyShotParams(params) {
    if (params.get('layout') && VC.LAYOUTS[params.get('layout')]) {
      state.layout = params.get('layout');
    }
    if (params.get('grade') && VC.GRADES[params.get('grade')]) {
      state.grade = params.get('grade');
    }
    if (params.get('size') && VC.SIZES[params.get('size')]) {
      state.size = params.get('size');
    }
    if (params.get('caption')) state.title = params.get('caption');
    if (params.get('sub')) state.subtitle = params.get('sub');
    if (params.get('badge')) state.badge = params.get('badge');
    var photo = params.get('photo');
    if (photo) {
      var found = SAMPLES.findIndex(function (s) { return s.name === photo; });
      if (found >= 0) {
        // Put the requested sample first so every panel uses it by default.
        var first = state.photos.splice(found, 1)[0];
        state.photos.unshift(first);
      }
    }
    state.photoMap = defaultPhotoMap();
    state.selectedPanel = 0;
  }

  // ------------------------------------------------------------ boot
  function boot() {
    canvas = $('coverCanvas');
    statusEl = $('statusLine');
    document.title = 'Vice Coast — GTA-style Cover Maker';

    // Load the two bundled sample photos so the app works out of the box.
    Promise.all(SAMPLES.map(function (s) { return loadImage(s.src); }))
      .then(function (imgs) {
        state.photos = imgs.map(function (img) {
          return { img: img, zoom: 1.12, ox: 0, oy: 0 };
        });
        state.photoMap = defaultPhotoMap();
        var params = new URLSearchParams(window.location.search);
        if (params.get('shot')) applyShotParams(params);
        refreshChoices();
        syncCropSliders();
        return document.fonts ? document.fonts.ready : Promise.resolve();
      })
      .then(function () {
        renderNow();
        var params = new URLSearchParams(window.location.search);
        if (params.get('shot')) {
          document.body.classList.add('shot-' + params.get('shot'));
          // Second paint after webfonts settle, then signal readiness.
          setTimeout(function () {
            renderNow();
            window.__shotReady = true;
          }, 250);
        }
      })
      .catch(function (err) {
        setStatus('Could not load the sample photos: ' + err.message);
      });

    // Sample photo buttons.
    var sampleBox = $('sampleChoices');
    SAMPLES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.textContent = s.label;
      b.addEventListener('click', function () {
        var idx = SAMPLES.indexOf(s);
        var photo = state.photos[idx];
        if (!photo) return;
        if (state.useOnePhoto) {
          state.photoMap = state.photoMap.map(function () { return idx; });
        } else {
          state.photoMap[state.selectedPanel] = idx;
        }
        queueRender();
      });
      sampleBox.appendChild(b);
    });

    // Upload: one or many photos from the user's machine.
    $('photoInput').addEventListener('change', function (ev) {
      var files = Array.prototype.slice.call(ev.target.files || []);
      if (!files.length) return;
      var loaded = 0;
      files.forEach(function (file) {
        loadFileAsImage(file).then(function (img) {
          applyPhotoToSelected(img);
          loaded++;
          if (loaded === files.length) {
            setStatus(files.length + ' photo(s) loaded — drag the sliders to crop.');
          }
        }).catch(function (err) { setStatus(err.message); });
      });
      ev.target.value = '';
    });

    $('onePhotoToggle').addEventListener('change', function (ev) {
      state.useOnePhoto = ev.target.checked;
      state.photoMap = defaultPhotoMap();
      queueRender();
    });

    $('applyAllBtn').addEventListener('click', function () {
      var idx = state.photoMap[state.selectedPanel];
      state.photoMap = state.photoMap.map(function () { return idx; });
      queueRender();
      setStatus('Photo ' + (idx + 1) + ' now fills every panel.');
    });

    // Caption fields.
    $('titleInput').addEventListener('input', function (ev) {
      state.title = ev.target.value || 'VICE COAST';
      queueRender();
    });
    $('subtitleInput').addEventListener('input', function (ev) {
      state.subtitle = ev.target.value;
      queueRender();
    });
    $('badgeInput').addEventListener('input', function (ev) {
      state.badge = ev.target.value;
      queueRender();
    });

    bindCropSlider('zoomRange', 'zoom');
    bindCropSlider('xRange', 'ox');
    bindCropSlider('yRange', 'oy');

    $('exportBtn').addEventListener('click', exportPNG);
    $('shuffleBtn').addEventListener('click', function () {
      var grades = VC.GRADE_ORDER;
      var layouts = VC.LAYOUT_ORDER;
      state.grade = grades[Math.floor(Math.random() * grades.length)];
      state.layout = layouts[Math.floor(Math.random() * layouts.length)];
      state.photoMap = defaultPhotoMap();
      refreshChoices();
      queueRender();
    });

    // Clicking the preview picks the panel under the pointer.
    canvas.addEventListener('click', function (ev) {
      var rect = canvas.getBoundingClientRect();
      var ux = (ev.clientX - rect.left) / rect.width;
      var uy = (ev.clientY - rect.top) / rect.height;
      var rects = VC.LAYOUTS[state.layout].panels();
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (ux >= r.x && ux <= r.x + r.w && uy >= r.y && uy <= r.y + r.h) {
          state.selectedPanel = i;
          syncCropSliders();
          updatePanelStrip();
          break;
        }
      }
    });

    window.ViceCoastApp = {
      state: state,
      render: renderNow,
      exportPNGDataURL: exportPNGDataURL,
      exportPNG: exportPNG,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
