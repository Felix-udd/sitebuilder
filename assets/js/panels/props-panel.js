// Content Panel: renders the `fields` array declared by each block in the registry.
// Field types: text, textarea, number, select, checkbox, color, url, image, align,
// gallery, slides, json-editor.

const PropsPanel = (() => {
  const panelEl = () => document.getElementById('contentPanel');
  let currentNode = null;

  function render(node) {
    currentNode = node;
    const el = panelEl();
    if (!node) {
      el.innerHTML = '<div class="panel-empty">Select an element to edit its content.</div>';
      return;
    }

    const def = BLOCK_REGISTRY[node.type];
    const fields = (def && def.fields) || [];
    const props = node.props || {};

    let body = '';
    if (fields.length === 0) {
      body = `<div class="panel-empty">This element has no editable content fields.<br>
        <small>Type=${escapeH(node.type)} — edit styles in the Style tab.</small></div>`;
    } else {
      body = fields.map(f => renderField(f, props, node.id)).join('');
    }

    if (node.type === 'navbar') {
      body += navbarLinksEditor(node);
    }

    el.innerHTML = `
      <div class="content-panel-header">
        <span class="content-type-icon">${def ? def.icon : '◻'}</span>
        <span class="content-type-label">${def ? def.label : node.type}</span>
      </div>
      <div class="content-fields">${body}</div>
    `;

    attachListeners(node);
  }

  function renderField(f, props, nodeId) {
    const value = props[f.key];

    switch (f.type) {
      case 'text':
      case 'url':
        return row(f, `<input type="${f.type === 'url' ? 'url' : 'text'}" data-prop-field="${f.key}" value="${escapeA(value ?? '')}" placeholder="${escapeA(f.placeholder || '')}">`);

      case 'textarea':
        return row(f, `<textarea data-prop-field="${f.key}" rows="5" placeholder="${escapeA(f.placeholder || '')}">${escapeH(value ?? '')}</textarea>`);

      case 'number':
        return row(f, `<input type="number" data-prop-field="${f.key}" value="${value ?? f.min ?? ''}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}>`);

      case 'select': {
        const opts = (f.options || []).map(o =>
          `<option value="${escapeA(o.value)}" ${String(value) === String(o.value) ? 'selected' : ''}>${escapeH(o.label)}</option>`
        ).join('');
        return row(f, `<select data-prop-field="${f.key}">${opts}</select>`);
      }

      case 'checkbox':
        return `<div class="field-row field-row--inline">
          <label class="checkbox-label"><input type="checkbox" data-prop-field="${f.key}" ${value ? 'checked' : ''}> ${escapeH(f.label)}</label>
        </div>`;

      case 'color':
        return row(f, `<div class="color-input-row">
          <input type="color" data-prop-color="${f.key}" value="${escapeA(value || '#000000')}">
          <input type="text" data-prop-field="${f.key}" value="${escapeA(value ?? '')}" placeholder="none">
        </div>`);

      case 'align':
        return row(f, `<div class="btn-group" data-align-group="${f.key}">
          ${['left', 'center', 'right'].map(a =>
            `<button type="button" data-align-val="${a}" class="${value === a || (!value && a === 'left') ? 'active' : ''}">${a.charAt(0).toUpperCase() + a.slice(1)}</button>`
          ).join('')}
        </div>`);

      case 'image':
        return row(f, `<div class="field-upload-row">
          <button type="button" class="btn btn-sm" data-upload-for="${f.key}">Upload</button>
          <button type="button" class="btn btn-sm" data-library-for="${f.key}">Library</button>
          <input type="file" accept="image/*" data-upload-input="${f.key}" hidden>
          <input type="url" data-prop-field="${f.key}" value="${escapeA(value ?? '')}" placeholder="Image URL">
        </div>
        ${value ? `<img src="${escapeA(value)}" class="field-thumb" alt="">` : ''}`);

      case 'gallery': {
        const images = Array.isArray(value) ? value : [];
        const rows = images.map((img, i) => `
          <div class="gallery-item" data-gallery-idx="${i}">
            <img src="${escapeA(img.src || '')}" alt="">
            <div class="gallery-item-fields">
              <input type="url" data-gallery-src="${i}" value="${escapeA(img.src || '')}" placeholder="Image URL">
              <input type="text" data-gallery-alt="${i}" value="${escapeA(img.alt || '')}" placeholder="Alt text">
            </div>
            <button type="button" class="gallery-remove" data-gallery-remove="${i}">&times;</button>
          </div>`).join('');
        return row(f, `<div class="gallery-editor" data-gallery>
          ${rows || '<div class="gallery-empty">No images yet.</div>'}
          <div class="field-upload-row">
            <button type="button" class="btn btn-sm" data-gallery-add>+ Add image</button>
            <button type="button" class="btn btn-sm" data-gallery-library>Library</button>
            <input type="file" accept="image/*" data-gallery-file hidden>
          </div>
        </div>`);
      }

      case 'slides': {
        const slides = Array.isArray(value) ? value : [];
        const rows = slides.map((s, i) => `
          <div class="slide-item" data-slide-idx="${i}">
            <div class="slide-item-header"><span>Slide ${i + 1}</span>
              <button type="button" data-slide-remove="${i}">&times;</button></div>
            <input type="url" data-slide-image="${i}" value="${escapeA(s.image || '')}" placeholder="Image URL">
            <button type="button" class="btn btn-sm" data-slide-upload="${i}">Upload image</button>
            <input type="text" data-slide-heading="${i}" value="${escapeA(s.heading || '')}" placeholder="Heading (optional)">
            <input type="text" data-slide-text="${i}" value="${escapeA(s.text || '')}" placeholder="Text (optional)">
          </div>`).join('');
        return row(f, `<div class="slides-editor" data-slides>
          ${rows || '<div class="gallery-empty">No slides yet.</div>'}
          <div class="field-upload-row">
            <button type="button" class="btn btn-sm" data-slide-add>+ Add slide</button>
            <button type="button" class="btn btn-sm" data-slide-library>Library image</button>
          </div>
          <input type="file" accept="image/*" data-slide-file hidden>
        </div>`);
      }

      case 'json-editor':
        return row(f, `<textarea data-prop-field="${f.key}" rows="8" class="json-input" spellcheck="false">${escapeH(typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2))}</textarea>
          <div class="json-error" data-json-error="${f.key}" hidden>Invalid JSON</div>`);

      default:
        return row(f, `<input type="text" data-prop-field="${f.key}" value="${escapeA(value ?? '')}">`);
    }
  }

  function row(f, inputHtml) {
    return `<div class="field-row"><label>${escapeH(f.label)}</label>${inputHtml}</div>`;
  }

  // Navbar links are real child `nav-link` nodes — list them so each can be
  // selected (and styled individually), reordered, or removed.
  function navbarLinksEditor(node) {
    const page = Store.getPage();
    const kids = (node.children || [])
      .map(id => page.nodes[id])
      .filter(n => n && n.type === 'nav-link');

    const rows = kids.map(k => `
      <div class="link-row" data-link-row="${k.id}">
        <span class="link-row-label" data-link-select="${k.id}">${escapeH(k.props?.label || 'Link')}</span>
        <span class="link-row-url">${escapeH(k.props?.url || '#')}</span>
        <button type="button" class="link-row-remove" data-link-remove="${k.id}" title="Remove link">&times;</button>
      </div>`).join('');

    return `<div class="style-section">
      <div class="style-section-header">Links</div>
      <div class="style-section-body">
        ${rows || '<div class="panel-empty panel-empty--sm">No links yet.</div>'}
        <button type="button" class="btn btn-sm" data-link-add>+ Add link</button>
        <div class="field-hint">Click a link to select it, then style it in the Style tab.</div>
      </div>
    </div>`;
  }

  function attachListeners(node) {
    const el = panelEl();
    const nodeId = node.id;
    const def = BLOCK_REGISTRY[node.type];

    // Text / number / url / textarea / select inputs
    el.querySelectorAll('[data-prop-field]').forEach(input => {
      const key = input.dataset.propField;
      const fieldDef = (def.fields || []).find(f => f.key === key);

      const handler = () => {
        let value = input.value;
        if (fieldDef && fieldDef.type === 'number') {
          value = value === '' ? '' : Number(value);
        }
        if (fieldDef && fieldDef.type === 'json-editor') {
          try {
            JSON.parse(value);
            el.querySelector(`[data-json-error="${key}"]`)?.setAttribute('hidden', '');
          } catch (e) {
            el.querySelector(`[data-json-error="${key}"]`)?.removeAttribute('hidden');
            return; // don't dispatch invalid JSON
          }
        }
        Store.dispatch(Commands.setProp(nodeId, key, value));
      };

      const evt = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(evt, handler);
    });

    // Checkbox
    el.querySelectorAll('input[type="checkbox"][data-prop-field]').forEach(input => {
      input.addEventListener('change', () => {
        Store.dispatch(Commands.setProp(nodeId, input.dataset.propField, input.checked));
      });
    });

    // Color pickers sync with text input
    el.querySelectorAll('[data-prop-color]').forEach(picker => {
      const key = picker.dataset.propColor;
      const text = el.querySelector(`[data-prop-field="${key}"]`);
      picker.addEventListener('input', () => {
        if (text) text.value = picker.value;
        Store.dispatch(Commands.setProp(nodeId, key, picker.value));
      });
      if (text) {
        text.addEventListener('input', () => {
          if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
        });
      }
    });

    // Align button groups
    el.querySelectorAll('[data-align-group]').forEach(group => {
      const key = group.dataset.alignGroup;
      group.querySelectorAll('[data-align-val]').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          Store.dispatch(Commands.setProp(nodeId, key, btn.dataset.alignVal));
        });
      });
    });

    // Image upload buttons
    el.querySelectorAll('[data-upload-for]').forEach(btn => {
      const key = btn.dataset.uploadFor;
      const fileInput = el.querySelector(`[data-upload-input="${key}"]`);
      btn.addEventListener('click', () => fileInput && fileInput.click());
      if (fileInput) {
        fileInput.addEventListener('change', () => uploadImage(fileInput.files[0], url => {
          Store.dispatch(Commands.setProp(nodeId, key, url));
        }));
      }
    });

    // Media-library pickers for single image fields
    el.querySelectorAll('[data-library-for]').forEach(btn => {
      const key = btn.dataset.libraryFor;
      btn.addEventListener('click', () => {
        if (typeof AssetManager === 'undefined') return;
        AssetManager.open(url => {
          Store.dispatch(Commands.setProp(nodeId, key, url));
          if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
        });
      });
    });

    setupGallery(nodeId, el);
    setupSlides(nodeId, el);

    // Navbar links manager
    el.querySelectorAll('[data-link-select]').forEach(rowEl => {
      rowEl.addEventListener('click', () => Store.setSelectedId(rowEl.dataset.linkSelect));
    });
    el.querySelectorAll('[data-link-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.dispatch(Commands.removeNode(btn.dataset.linkRemove));
        if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
      });
    });
    const addLinkBtn = el.querySelector('[data-link-add]');
    if (addLinkBtn) {
      addLinkBtn.addEventListener('click', () => {
        if (typeof Editor !== 'undefined') Editor.insertBlock('nav-link', nodeId);
      });
    }
  }

  // ---- Gallery editor ----
  function setupGallery(nodeId, el) {
    const wrap = el.querySelector('[data-gallery]');
    if (!wrap) return;
    const node = Store.getPage().nodes[nodeId];
    const getImages = () => Array.isArray(node.props?.images) ? node.props.images : [];
    const setImages = imgs => Store.dispatch(Commands.setProp(nodeId, 'images', imgs));

    wrap.querySelectorAll('[data-gallery-src]').forEach(input => {
      input.addEventListener('input', () => {
        const imgs = getImages();
        imgs[Number(input.dataset.gallerySrc)] = { ...imgs[Number(input.dataset.gallerySrc)], src: input.value };
        setImages([...imgs]);
      });
    });
    wrap.querySelectorAll('[data-gallery-alt]').forEach(input => {
      input.addEventListener('input', () => {
        const imgs = getImages();
        imgs[Number(input.dataset.galleryAlt)] = { ...imgs[Number(input.dataset.galleryAlt)], alt: input.value };
        setImages([...imgs]);
      });
    });
    wrap.querySelectorAll('[data-gallery-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const imgs = getImages();
        imgs.splice(Number(btn.dataset.galleryRemove), 1);
        setImages([...imgs]);
      });
    });
    const addBtn = wrap.querySelector('[data-gallery-add]');
    const fileInput = wrap.querySelector('[data-gallery-file]');
    if (addBtn && fileInput) {
      addBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => uploadImage(fileInput.files[0], url => {
        setImages([...getImages(), { src: url, alt: '' }]);
        if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
      }));
    }
    const libraryBtn = wrap.querySelector('[data-gallery-library]');
    if (libraryBtn) {
      libraryBtn.addEventListener('click', () => {
        if (typeof AssetManager === 'undefined') return;
        AssetManager.open(url => {
          setImages([...getImages(), { src: url, alt: '' }]);
          if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
        });
      });
    }
  }

  // ---- Slides editor ----
  function setupSlides(nodeId, el) {
    const wrap = el.querySelector('[data-slides]');
    if (!wrap) return;
    const node = Store.getPage().nodes[nodeId];
    const getSlides = () => Array.isArray(node.props?.slides) ? node.props.slides : [];
    const setSlides = s => Store.dispatch(Commands.setProp(nodeId, 'slides', s));
    const fileInput = wrap.querySelector('[data-slide-file]');
    let pendingSlideIdx = -1;

    const bindText = (attr, key) => {
      wrap.querySelectorAll(`[data-${attr}]`).forEach(input => {
        input.addEventListener('input', () => {
          const slides = getSlides();
          const i = Number(input.dataset[attr]);
          slides[i] = { ...slides[i], [key]: input.value };
          setSlides([...slides]);
        });
      });
    };
    bindText('slide-image', 'image');
    bindText('slide-heading', 'heading');
    bindText('slide-text', 'text');

    wrap.querySelectorAll('[data-slide-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slides = getSlides();
        slides.splice(Number(btn.dataset.slideRemove), 1);
        setSlides([...slides]);
      });
    });

    wrap.querySelectorAll('[data-slide-upload]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSlideIdx = Number(btn.dataset.slideUpload);
        fileInput.click();
      });
    });

    if (fileInput) {
      fileInput.addEventListener('change', () => uploadImage(fileInput.files[0], url => {
        const slides = getSlides();
        if (pendingSlideIdx >= 0 && slides[pendingSlideIdx]) {
          slides[pendingSlideIdx] = { ...slides[pendingSlideIdx], image: url };
          setSlides([...slides]);
        }
        pendingSlideIdx = -1;
      }));
    }

    const addBtn = wrap.querySelector('[data-slide-add]');
    if (addBtn) {
      addBtn.addEventListener('click', () => setSlides([...getSlides(), { image: '', heading: '', text: '' }]));
    }
    const libraryBtn = wrap.querySelector('[data-slide-library]');
    if (libraryBtn) {
      libraryBtn.addEventListener('click', () => {
        if (typeof AssetManager === 'undefined') return;
        AssetManager.open(url => {
          setSlides([...getSlides(), { image: url, heading: '', text: '' }]);
          if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
        });
      });
    }
  }

  async function uploadImage(file, cb) {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await fetch('api/upload.php', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) cb(data.url);
      else console.error('Upload failed:', data);
    } catch (e) { console.error('Upload failed:', e); }
  }

  function escapeH(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeA(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render };
})();
