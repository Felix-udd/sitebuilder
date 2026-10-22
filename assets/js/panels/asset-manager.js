// Media library: browse/search uploaded assets, upload new files, delete unused
// ones, and insert an asset into the current selection (image, gallery, slide,
// background, logo...). Opened from the topbar or from image fields.
const AssetManager = (() => {
  let overlay = null;
  let gridEl = null;
  let searchEl = null;
  let uploadInput = null;
  let statusEl = null;
  let assets = [];
  let selectedId = null;
  let pickCallback = null;
  let loading = false;

  function ensureModal() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay media-overlay';
    overlay.id = 'mediaModal';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal media-modal" role="dialog" aria-modal="true" aria-label="Media library">
        <div class="modal-header">
          <h3>Media library</h3>
          <div class="media-header-actions">
            <label class="btn btn-sm media-upload-btn">
              Upload
              <input type="file" accept="image/*" multiple hidden data-media-file>
            </label>
            <button type="button" class="modal-close" data-media-close aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="media-toolbar">
          <input type="search" data-media-search placeholder="Search uploads&hellip;" aria-label="Search media">
          <span class="media-status" data-media-status></span>
        </div>
        <div class="modal-body media-body">
          <div class="media-drop" data-media-drop>
            <div class="media-grid" data-media-grid></div>
          </div>
        </div>
        <div class="media-footer">
          <span class="media-hint">Click a file, then <strong>Insert</strong>. Drag &amp; drop images anywhere here to upload.</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    gridEl = overlay.querySelector('[data-media-grid]');
    searchEl = overlay.querySelector('[data-media-search]');
    uploadInput = overlay.querySelector('[data-media-file]');
    statusEl = overlay.querySelector('[data-media-status]');

    overlay.querySelector('[data-media-close]').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });

    searchEl.addEventListener('input', () => renderGrid());
    uploadInput.addEventListener('change', () => {
      const files = Array.from(uploadInput.files || []);
      uploadInput.value = '';
      handleFiles(files);
    });

    const drop = overlay.querySelector('[data-media-drop]');
    ['dragenter', 'dragover'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault();
      drop.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach(evt => drop.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === 'dragleave' && drop.contains(e.relatedTarget)) return;
      drop.classList.remove('is-dragover');
    }));
    drop.addEventListener('drop', (e) => {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
        .filter(f => /^image\//.test(f.type));
      handleFiles(files);
    });

    return overlay;
  }

  function open(callback) {
    ensureModal();
    pickCallback = typeof callback === 'function' ? callback : null;
    selectedId = null;
    overlay.hidden = false;
    searchEl.value = '';
    document.body.classList.add('sb-modal-open');
    load();
    setTimeout(() => searchEl.focus(), 30);
  }

  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove('sb-modal-open');
    pickCallback = null;
    selectedId = null;
  }

  function isOpen() {
    return !!overlay && !overlay.hidden;
  }

  async function load() {
    if (loading) return;
    loading = true;
    statusEl.textContent = 'Loading…';
    try {
      const res = await fetch('api/assets.php');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      assets = data.assets || [];
      renderGrid();
    } catch (e) {
      statusEl.textContent = 'Could not load uploads.';
      gridEl.innerHTML = `<div class="media-empty">Failed to load the media library: ${escapeH(e.message)}</div>`;
    } finally {
      loading = false;
    }
  }

  function renderGrid() {
    if (!gridEl) return;
    const query = (searchEl.value || '').trim().toLowerCase();
    const list = assets.filter(a => !query || String(a.filename).toLowerCase().includes(query));
    const missing = list.filter(a => !a.exists).length;

    statusEl.textContent = `${list.length} file${list.length === 1 ? '' : 's'}${missing ? ` · ${missing} missing on disk` : ''}`;

    if (!list.length) {
      gridEl.innerHTML = `<div class="media-empty">${assets.length ? 'No uploads match your search.' : 'No uploads yet. Upload images or drag them here.'}</div>`;
      return;
    }

    const pageJson = JSON.stringify(Store.getPage() || {});
    gridEl.innerHTML = list.map(asset => {
      const url = String(asset.url || '');
      const used = url && pageJson.indexOf(JSON.stringify(url).slice(1, -1)) !== -1;
      return `<div class="media-card${selectedId === asset.id ? ' is-selected' : ''}${asset.exists ? '' : ' is-missing'}"
                   data-asset-id="${asset.id}" data-asset-url="${escapeA(url)}" tabindex="0">
        <div class="media-thumb">
          ${asset.exists ? `<img src="${escapeA(url)}" alt="${escapeA(asset.filename)}" loading="lazy">` : `<span class="media-missing-badge">Missing file</span>`}
        </div>
        <div class="media-meta">
          <span class="media-name" title="${escapeA(asset.filename)}">${escapeH(asset.filename)}</span>
          <span class="media-sub">${formatSize(asset.size_bytes)}${used ? ' · on this page' : ''}</span>
        </div>
        <div class="media-actions">
          <button type="button" class="btn btn-sm" data-media-insert="${asset.id}">Insert</button>
          <button type="button" class="media-delete" data-media-delete="${asset.id}" title="Delete file">&times;</button>
        </div>
      </div>`;
    }).join('');

    gridEl.querySelectorAll('[data-asset-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-media-delete]') || e.target.closest('[data-media-insert]')) return;
        selectedId = Number(card.dataset.assetId);
        gridEl.querySelectorAll('.media-card').forEach(c => c.classList.toggle('is-selected', c === card));
      });
      card.addEventListener('dblclick', () => pick(Number(card.dataset.assetId)));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') pick(Number(card.dataset.assetId));
      });
    });
    gridEl.querySelectorAll('[data-media-insert]').forEach(btn => {
      btn.addEventListener('click', () => pick(Number(btn.dataset.mediaInsert)));
    });
    gridEl.querySelectorAll('[data-media-delete]').forEach(btn => {
      btn.addEventListener('click', () => removeAsset(Number(btn.dataset.mediaDelete)));
    });
  }

  function pick(id) {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    if (!asset.exists) {
      toast('That file is missing from disk. Delete it or upload it again.', true);
      return;
    }
    const url = asset.url;
    if (pickCallback) {
      pickCallback(url);
      close();
      return;
    }
    insertIntoSelection(url);
    close();
  }

  function insertIntoSelection(url) {
    const page = Store.getPage();
    if (!page) return;
    const id = Store.getSelectedId();
    const node = id ? page.nodes[id] : null;
    const setProp = (key, value) => Store.dispatch(Commands.setProp(id, key, value));

    if (node) {
      const p = node.props || {};
      switch (node.type) {
        case 'image':
          setProp('src', url);
          toast('Image updated');
          return;
        case 'image-gallery':
          setProp('images', [...(Array.isArray(p.images) ? p.images : []), { src: url, alt: '' }]);
          toast('Added to gallery');
          return;
        case 'slider':
          setProp('slides', [...(Array.isArray(p.slides) ? p.slides : []), { image: url, heading: '', text: '' }]);
          toast('Added slide image');
          return;
        case 'logo':
          setProp('image', url);
          toast('Logo image updated');
          return;
        case 'navbar':
          setProp('logoImage', url);
          toast('Navbar logo updated');
          return;
        case 'video':
          setProp('poster', url);
          toast('Poster image updated');
          return;
        case 'beforeafter':
          setProp('beforeImage', url);
          toast('Before image updated');
          return;
        case 'shape-image':
          setProp('src', url);
          toast('Image updated');
          return;
        default:
          if ('backgroundType' in p || 'backgroundImage' in p) {
            setProp('backgroundType', 'image');
            setProp('backgroundImage', url);
            toast('Background image updated');
            return;
          }
      }
    }

    // Nothing image-like selected — insert a fresh image block.
    const newId = Editor.insertBlock('image');
    if (newId) {
      Store.dispatch(Commands.setProp(newId, 'src', url));
      toast('Image inserted');
    } else {
      toast('Select a container first to insert an image', true);
    }
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    let lastUrl = null;
    for (const file of files) {
      try {
        statusEl.textContent = `Uploading ${file.name}…`;
        lastUrl = await upload(file);
      } catch (e) {
        toast('Upload failed: ' + e.message, true);
      }
    }
    await load();
    if (lastUrl && pickCallback) {
      pickCallback(lastUrl);
      close();
    } else if (lastUrl) {
      toast(files.length > 1 ? `Uploaded ${files.length} files` : 'Uploaded');
    }
  }

  async function upload(file) {
    if (!file) throw new Error('No file selected');
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('api/upload.php', { method: 'POST', body: formData });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
    if (!data.url) throw new Error('The server did not return a file URL.');
    return data.url;
  }

  async function removeAsset(id) {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    if (!confirm(`Delete "${asset.filename}"? This removes the file from disk.`)) return;
    try {
      const res = await fetch('api/assets.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      assets = assets.filter(a => a.id !== id);
      renderGrid();
      toast('Asset deleted');
    } catch (e) {
      toast('Delete failed: ' + e.message, true);
    }
  }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function toast(msg, isError) {
    if (typeof Editor !== 'undefined' && Editor.showToast) Editor.showToast(msg, isError);
  }

  function escapeH(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeA(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  return { open, close, isOpen, upload, insertIntoSelection };
})();
