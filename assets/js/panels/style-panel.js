// Style Panel: Full CSS property controls organized by section.
// Reads/writes node.style[breakpoint][property] via Store.dispatch.

const StylePanel = (() => {
  const panelEl = () => document.getElementById('stylePanel');
  let currentNode = null;
  let searchQuery = ''; // persists across re-renders so filtering survives selection changes

  function render(node) {
    currentNode = node;
    const el = panelEl();
    if (!node) {
      el.innerHTML = '<div class="panel-empty">Select an element to edit its styles.</div>';
      return;
    }

    const bp = Store.getBreakpoint();
    const resolved = NodeUtils.resolveStyles(node, bp);

    const bpLabel = { base: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }[bp] || 'Desktop';
    el.innerHTML = `
      <div class="bp-indicator">Editing <strong>${bpLabel}</strong>${bp !== 'base' ? '<span class="bp-override-note">overrides</span>' : ''}</div>
      ${renderSearchBar()}
      ${renderLayoutSection(node, resolved, bp)}
      ${renderSpacingSection(node, resolved, bp)}
      ${renderSizingSection(node, resolved, bp)}
      ${renderPositionSection(node, resolved, bp)}
      ${renderBackgroundSection(node, resolved, bp)}
      ${renderBorderSection(node, resolved, bp)}
      ${renderEffectsSection(node, resolved, bp)}
      ${renderTypographySection(node, resolved, bp)}
      ${renderTransitionSection(node, resolved, bp)}
      ${renderAdvancedCSSSection(node, resolved, bp)}
      ${renderStateStylesSection(node)}
      ${renderCustomCSSSection(node)}
      <div class="style-search-empty" hidden>No matching styles.</div>
    `;

    attachAllListeners(node, bp);
    attachStyleSearch();
  }

  // ---- Style search ----
  function renderSearchBar() {
    return `
      <div class="style-search">
        <input type="search" id="styleSearchInput" placeholder="Search styles&hellip;" autocomplete="off"
               value="${escapeHtml(searchQuery)}" aria-label="Search styles">
        <button type="button" class="style-search-clear" data-style-search-clear ${searchQuery ? '' : 'hidden'} aria-label="Clear search">&times;</button>
      </div>
    `;
  }

  function fieldMatchText(field) {
    let text = '';
    let label = null;
    try { label = field.querySelector(':scope > label'); } catch (e) { label = null; }
    if (!label) label = field.querySelector('label');
    if (label) text += ' ' + label.textContent;
    const spacelabel = field.querySelector('.spacing-label');
    if (spacelabel) text += ' ' + spacelabel.textContent;
    const spacenter = field.querySelector('.spacing-center');
    if (spacenter) text += ' ' + spacenter.textContent;
    field.querySelectorAll('input, select, textarea').forEach(inp => {
      if (inp.placeholder) text += ' ' + inp.placeholder;
      if (inp.title) text += ' ' + inp.title;
      const prop = inp.getAttribute('data-style') || inp.getAttribute('data-prop');
      if (prop) text += ' ' + prop.replace(/-/g, ' ');
    });
    field.querySelectorAll('[title]').forEach(e => { text += ' ' + e.title; });
    return text.toLowerCase();
  }

  function attachStyleSearch() {
    const el = panelEl();
    const input = el.querySelector('#styleSearchInput');
    if (!input) return;

    // Remember each group's base visibility (e.g. flex vs grid controls) so search
    // filtering never reveals sections that were hidden by the renderer.
    el.querySelectorAll(GROUP_SELECTORS).forEach(group => {
      group.dataset.searchBaseHidden = group.classList.contains('hidden') ? '1' : '0';
    });
    el.querySelectorAll(ROWS).forEach(row => {
      row.dataset.searchBaseHidden = row.classList.contains('hidden') ? '1' : '0';
    });

    input.addEventListener('input', () => {
      searchQuery = input.value;
      applyStyleSearch();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); input.value = ''; searchQuery = ''; applyStyleSearch(); }
      e.stopPropagation(); // don't trigger editor shortcuts while typing
    });
    el.querySelector('[data-style-search-clear]')?.addEventListener('click', () => {
      searchQuery = '';
      input.value = '';
      applyStyleSearch();
      input.focus();
    });

    applyStyleSearch();
  }

  const ROWS = '.style-field, .spacing-editor';
  // Conditional containers whose visibility the renderer controls (e.g. flex vs
  // grid). Search must collapse these when they hold no matching rows, but never
  // reveal the ones the renderer intentionally hid.
  const GROUP_SELECTORS = '#flexControls, #gridControls, #bgColorControls, ' +
    '#bgGradientControls, #bgImageControls, #bgVideoControls';

  function applyStyleSearch() {
    const el = panelEl();
    const q = searchQuery.trim().toLowerCase();
    const clearBtn = el.querySelector('[data-style-search-clear]');
    if (clearBtn) clearBtn.hidden = !q;

    const sections = el.querySelectorAll('.style-section');
    let anyVisible = false;

    sections.forEach(section => {
      const header = section.querySelector('.style-section-header');
      const body = section.querySelector('.style-section-body');
      if (!body) return;
      const sectionName = (header ? header.textContent : '').toLowerCase();

      if (!q) {
        // Reset to unfiltered state
        section.classList.remove('hidden', 'style-search-hit');
        body.querySelectorAll(ROWS).forEach(r => {
          r.classList.toggle('hidden', r.dataset.searchBaseHidden === '1');
        });
        body.querySelectorAll(GROUP_SELECTORS).forEach(g => {
          g.classList.toggle('hidden', g.dataset.searchBaseHidden === '1');
        });
        anyVisible = true;
        return;
      }

      const sectionMatches = sectionName.includes(q);
      section.classList.toggle('style-search-hit', sectionMatches);

      let sectionHasMatch = false;
      body.querySelectorAll(ROWS).forEach(row => {
        const baseHidden = row.dataset.searchBaseHidden === '1';
        const match = !baseHidden && (sectionMatches || fieldMatchText(row).includes(q));
        row.classList.toggle('hidden', !match);
        if (match) sectionHasMatch = true;
      });

      // Hide group wrappers that no longer contain any visible row, but keep
      // groups hidden by their base state (e.g. inactive display mode) hidden.
      body.querySelectorAll(GROUP_SELECTORS).forEach(group => {
        if (group.matches(ROWS)) return; // standalone rows are handled above
        const baseHidden = group.dataset.searchBaseHidden === '1';
        const hasVisible = Array.from(group.querySelectorAll(ROWS))
          .some(r => !r.classList.contains('hidden'));
        group.classList.toggle('hidden', baseHidden || !hasVisible);
      });

      section.classList.toggle('hidden', !sectionHasMatch);
      if (sectionHasMatch) anyVisible = true;
    });

    const emptyNote = el.querySelector('.style-search-empty');
    if (emptyNote) emptyNote.hidden = anyVisible;
  }

  // ---- Helper: create a style field ----
  function createField(label, key, value, bp, nodeId, inputHtml) {
    return `
      <div class="style-field">
        <label>${label}</label>
        ${inputHtml}
      </div>
    `;
  }

  function dispatchStyle(nodeId, bp, property, value) {
    Store.dispatch(Commands.setStyle(nodeId, bp, property, value));
  }

  // Local command: update arbitrary node.meta fields (e.g. custom CSS).
  function setNodeMeta(nodeId, key, value) {
    let old;
    return {
      type: 'SET_NODE_META',
      coalesceKey: `SET_NODE_META:${nodeId}:${key}`,
      validate(page) {
        if (!page.nodes[nodeId]) return false;
        old = page.nodes[nodeId].meta?.[key];
        return true;
      },
      apply(page) {
        const np = JSON.parse(JSON.stringify(page));
        const node = np.nodes[nodeId];
        if (!node.meta) node.meta = {};
        if (value === '' || value === null || value === undefined) delete node.meta[key];
        else node.meta[key] = value;
        return np;
      },
      inverse() { return setNodeMeta(nodeId, key, old); },
      coalesce: true
    };
  }

  // ---- Layout Section ----
  function renderLayoutSection(node, resolved, bp) {
    const display = resolved.display || '';
    const containerTypes = ['section', 'container', 'flex', 'grid', 'stack', 'navbar', 'footer', 'form', 'page'];
    const isContainer = containerTypes.includes(node.type);

    if (!isContainer) return '';

    return `
      <div class="style-section">
        <div class="style-section-header" data-section="layout">Layout</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Display</label>
            <select data-style="display">
              <option value="" ${!display ? 'selected' : ''}>Default</option>
              <option value="block" ${display === 'block' ? 'selected' : ''}>Block</option>
              <option value="flex" ${display === 'flex' ? 'selected' : ''}>Flex</option>
              <option value="grid" ${display === 'grid' ? 'selected' : ''}>Grid</option>
              <option value="inline-block" ${display === 'inline-block' ? 'selected' : ''}>Inline Block</option>
              <option value="none" ${display === 'none' ? 'selected' : ''}>None</option>
            </select>
          </div>
          <div id="flexControls" class="${display === 'flex' || (!display && ['flex','stack','navbar'].includes(node.type)) ? '' : 'hidden'}">
            ${renderFlexControls(resolved, node)}
          </div>
          <div id="gridControls" class="${display === 'grid' || (!display && node.type === 'grid') ? '' : 'hidden'}">
            ${renderGridControls(resolved)}
          </div>
        </div>
      </div>
    `;
  }

  function renderFlexControls(resolved, node) {
    const dir = resolved['flex-direction'] || (node.type === 'stack' ? 'column' : 'row');
    const justify = resolved['justify-content'] || 'flex-start';
    const align = resolved['align-items'] || 'stretch';
    const wrap = resolved['flex-wrap'] || 'nowrap';
    const gap = resolved['gap'] || '';

    return `
      <div class="style-field">
        <label>Direction</label>
        <div class="btn-group">
          <button data-flex-dir="row" class="${dir === 'row' ? 'active' : ''}" title="Row">→</button>
          <button data-flex-dir="column" class="${dir === 'column' ? 'active' : ''}" title="Column">↓</button>
          <button data-flex-dir="row-reverse" class="${dir === 'row-reverse' ? 'active' : ''}" title="Row Rev">↔</button>
          <button data-flex-dir="column-reverse" class="${dir === 'column-reverse' ? 'active' : ''}" title="Col Rev">↕</button>
        </div>
      </div>
      <div class="style-field">
        <label>Justify Content</label>
        <div class="align-grid">
          <button data-justify="flex-start" class="${justify === 'flex-start' ? 'active' : ''}" title="Start">⇤</button>
          <button data-justify="center" class="${justify === 'center' ? 'active' : ''}" title="Center">↔</button>
          <button data-justify="flex-end" class="${justify === 'flex-end' ? 'active' : ''}" title="End">⇥</button>
          <button data-justify="space-between" class="${justify === 'space-between' ? 'active' : ''}" title="Space Between">⇔</button>
          <button data-justify="space-around" class="${justify === 'space-around' ? 'active' : ''}" title="Space Around">≡</button>
          <button data-justify="space-evenly" class="${justify === 'space-evenly' ? 'active' : ''}" title="Space Evenly">≡</button>
        </div>
      </div>
      <div class="style-field">
        <label>Align Items</label>
        <div class="align-grid">
          <button data-align-items="stretch" class="${align === 'stretch' ? 'active' : ''}" title="Stretch">⬌</button>
          <button data-align-items="flex-start" class="${align === 'flex-start' ? 'active' : ''}" title="Start">⤒</button>
          <button data-align-items="center" class="${align === 'center' ? 'active' : ''}" title="Center">⤔</button>
          <button data-align-items="flex-end" class="${align === 'flex-end' ? 'active' : ''}" title="End">⤓</button>
          <button data-align-items="baseline" class="${align === 'baseline' ? 'active' : ''}" title="Baseline">⏤</button>
        </div>
      </div>
      <div class="style-field">
        <label>Gap</label>
        <input type="text" value="${escapeHtml(gap)}" placeholder="e.g. 24px" data-style="gap">
      </div>
    `;
  }

  function renderGridControls(resolved) {
    const cols = resolved['grid-template-columns'] || '';
    const gap = resolved['gap'] || '';
    return `
      <div class="style-field">
        <label>Columns</label>
        <input type="text" value="${escapeHtml(cols)}" placeholder="e.g. repeat(3, 1fr)" data-style="grid-template-columns">
      </div>
      <div class="style-field">
        <label>Gap</label>
        <input type="text" value="${escapeHtml(gap)}" placeholder="e.g. 24px" data-style="gap">
      </div>
    `;
  }

  // ---- Spacing Section ----
  function renderSpacingSection(node, resolved, bp) {
    const pt = resolved['padding-top'] || '';
    const pr = resolved['padding-right'] || '';
    const pb = resolved['padding-bottom'] || '';
    const pl = resolved['padding-left'] || '';
    const mt = resolved['margin-top'] || '';
    const mr = resolved['margin-right'] || '';
    const mb = resolved['margin-bottom'] || '';
    const ml = resolved['margin-left'] || '';

    return `
      <div class="style-section">
        <div class="style-section-header" data-section="spacing">Spacing</div>
        <div class="style-section-body">
          <div class="spacing-editor">
            <div class="spacing-label">Padding</div>
            <div class="spacing-box">
              <input type="text" placeholder="0" value="${escapeHtml(pt)}" data-style="padding-top" class="sp-top" title="Top">
              <input type="text" placeholder="0" value="${escapeHtml(pl)}" data-style="padding-left" class="sp-left" title="Left">
              <div class="spacing-center">padding</div>
              <input type="text" placeholder="0" value="${escapeHtml(pr)}" data-style="padding-right" class="sp-right" title="Right">
              <input type="text" placeholder="0" value="${escapeHtml(pb)}" data-style="padding-bottom" class="sp-bottom" title="Bottom">
            </div>
          </div>
          <div class="spacing-editor">
            <div class="spacing-label">Margin</div>
            <div class="spacing-box">
              <input type="text" placeholder="0" value="${escapeHtml(mt)}" data-style="margin-top" class="sp-top" title="Top">
              <input type="text" placeholder="0" value="${escapeHtml(ml)}" data-style="margin-left" class="sp-left" title="Left">
              <div class="spacing-center">margin</div>
              <input type="text" placeholder="0" value="${escapeHtml(mr)}" data-style="margin-right" class="sp-right" title="Right">
              <input type="text" placeholder="0" value="${escapeHtml(mb)}" data-style="margin-bottom" class="sp-bottom" title="Bottom">
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Sizing Section ----
  function renderSizingSection(node, resolved, bp) {
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="sizing">Sizing</div>
        <div class="style-section-body">
          <div class="style-field-row">
            <div class="style-field">
              <label>Width</label>
              <input type="text" value="${escapeHtml(resolved.width || '')}" placeholder="auto" data-style="width">
            </div>
            <div class="style-field">
              <label>Height</label>
              <input type="text" value="${escapeHtml(resolved.height || '')}" placeholder="auto" data-style="height">
            </div>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Min Width</label>
              <input type="text" value="${escapeHtml(resolved['min-width'] || '')}" placeholder="none" data-style="min-width">
            </div>
            <div class="style-field">
              <label>Max Width</label>
              <input type="text" value="${escapeHtml(resolved['max-width'] || '')}" placeholder="none" data-style="max-width">
            </div>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Min Height</label>
              <input type="text" value="${escapeHtml(resolved['min-height'] || '')}" placeholder="none" data-style="min-height">
            </div>
            <div class="style-field">
              <label>Max Height</label>
              <input type="text" value="${escapeHtml(resolved['max-height'] || '')}" placeholder="none" data-style="max-height">
            </div>
          </div>
          <div class="style-field">
            <label>Aspect Ratio</label>
            <input type="text" value="${escapeHtml(resolved['aspect-ratio'] || '')}" placeholder="e.g. 16/9" data-style="aspect-ratio">
          </div>
        </div>
      </div>
    `;
  }

  // ---- Position Section ----
  function renderPositionSection(node, resolved, bp) {
    const pos = resolved.position || '';
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="position">Position</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Position</label>
            <select data-style="position">
              <option value="" ${!pos ? 'selected' : ''}>Default</option>
              <option value="relative" ${pos === 'relative' ? 'selected' : ''}>Relative</option>
              <option value="absolute" ${pos === 'absolute' ? 'selected' : ''}>Absolute</option>
              <option value="fixed" ${pos === 'fixed' ? 'selected' : ''}>Fixed</option>
              <option value="sticky" ${pos === 'sticky' ? 'selected' : ''}>Sticky</option>
            </select>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Top</label>
              <input type="text" value="${escapeHtml(resolved.top || '')}" placeholder="auto" data-style="top">
            </div>
            <div class="style-field">
              <label>Right</label>
              <input type="text" value="${escapeHtml(resolved.right || '')}" placeholder="auto" data-style="right">
            </div>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Bottom</label>
              <input type="text" value="${escapeHtml(resolved.bottom || '')}" placeholder="auto" data-style="bottom">
            </div>
            <div class="style-field">
              <label>Left</label>
              <input type="text" value="${escapeHtml(resolved.left || '')}" placeholder="auto" data-style="left">
            </div>
          </div>
          <div class="style-field">
            <label>Z-Index</label>
            <input type="number" value="${escapeHtml(resolved['z-index'] || '')}" placeholder="auto" data-style="z-index">
          </div>
          <div class="style-field">
            <label>Overflow</label>
            <select data-style="overflow">
              <option value="" ${!resolved.overflow ? 'selected' : ''}>Default</option>
              <option value="visible" ${resolved.overflow === 'visible' ? 'selected' : ''}>Visible</option>
              <option value="hidden" ${resolved.overflow === 'hidden' ? 'selected' : ''}>Hidden</option>
              <option value="scroll" ${resolved.overflow === 'scroll' ? 'selected' : ''}>Scroll</option>
              <option value="auto" ${resolved.overflow === 'auto' ? 'selected' : ''}>Auto</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Background Section ----
  function renderBackgroundSection(node, resolved, bp) {
    const props = node.props || {};
    const bgType = props.backgroundType || 'none';

    return `
      <div class="style-section">
        <div class="style-section-header" data-section="background">Background</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Type</label>
            <div class="btn-group">
              <button data-bg-type="none" class="${bgType === 'none' ? 'active' : ''}">None</button>
              <button data-bg-type="color" class="${bgType === 'color' ? 'active' : ''}">Color</button>
              <button data-bg-type="gradient" class="${bgType === 'gradient' ? 'active' : ''}">Gradient</button>
              <button data-bg-type="image" class="${bgType === 'image' ? 'active' : ''}">Image</button>
              <button data-bg-type="video" class="${bgType === 'video' ? 'active' : ''}">Video</button>
            </div>
          </div>
          <div id="bgColorControls" class="${bgType === 'color' ? '' : 'hidden'}">
            <div class="style-field">
              <label>Color</label>
              <div class="color-input-row">
                <input type="color" value="${escapeHtml(props.backgroundColor || '#FFFFFF')}" data-prop="backgroundColor">
                <input type="text" value="${escapeHtml(props.backgroundColor || '#FFFFFF')}" data-prop-text="backgroundColor">
              </div>
            </div>
          </div>
          <div id="bgGradientControls" class="${bgType === 'gradient' ? '' : 'hidden'}">
            <div class="style-field"><label>Gradient type</label><select data-prop="gradientType"><option value="linear" ${!props.gradientType || props.gradientType === 'linear' ? 'selected' : ''}>Linear</option><option value="radial" ${props.gradientType === 'radial' ? 'selected' : ''}>Radial</option><option value="conic" ${props.gradientType === 'conic' ? 'selected' : ''}>Conic</option></select></div>
            <div class="style-field">
              <label>Angle / start: ${props.gradientAngle || 135}°</label>
              <input type="range" min="0" max="360" value="${props.gradientAngle || 135}" data-prop="gradientAngle">
            </div>
            <div class="style-field">
              <label>Stops</label>
              <div class="gradient-stops-editor">
                ${(props.gradientStops || ['#667eea', '#764ba2']).map((stop, i) =>
                  `<div class="gradient-stop-row">
                    <input type="color" value="${escapeHtml(stop)}" data-gradient-stop="${i}">
                    <button data-remove-stop="${i}" title="Remove">&times;</button>
                  </div>`
                ).join('')}
                <button class="btn btn-sm" data-add-stop>+ Add stop</button>
              </div>
            </div>
            <div class="gradient-preview" style="height:40px;border-radius:6px;background:${props.gradientType === 'radial' ? 'radial-gradient(ellipse at center, ' + (props.gradientStops || ['#667eea', '#764ba2']).join(', ') + ')' : props.gradientType === 'conic' ? 'conic-gradient(from ' + (props.gradientAngle || 135) + 'deg, ' + (props.gradientStops || ['#667eea', '#764ba2']).join(', ') + ')' : 'linear-gradient(' + (props.gradientAngle || 135) + 'deg, ' + (props.gradientStops || ['#667eea', '#764ba2']).join(', ') + ')'};margin-top:8px;"></div>
          </div>
          <div id="bgImageControls" class="${bgType === 'image' ? '' : 'hidden'}">
            <div class="style-field">
              <label>Image</label>
              <div class="field-upload-row">
                <button type="button" class="btn btn-sm" data-bg-upload>Upload</button>
                <button type="button" class="btn btn-sm" data-bg-library>Library</button>
                <input type="file" accept="image/*" data-bg-upload-input hidden>
              </div>
              <input type="url" placeholder="Image URL" value="${escapeHtml(props.backgroundImage || '')}" data-prop="backgroundImage">
            </div>
            <div class="style-field-row">
              <div class="style-field">
                <label>Size</label>
                <select data-prop="backgroundSize">
                  <option value="cover" ${props.backgroundSize === 'cover' || !props.backgroundSize ? 'selected' : ''}>Cover</option>
                  <option value="contain" ${props.backgroundSize === 'contain' ? 'selected' : ''}>Contain</option>
                  <option value="auto" ${props.backgroundSize === 'auto' ? 'selected' : ''}>Auto</option>
                  <option value="100% 100%" ${props.backgroundSize === '100% 100%' ? 'selected' : ''}>Stretch</option>
                </select>
              </div>
              <div class="style-field">
                <label>Position</label>
                <select data-prop="backgroundPosition">
                  <option value="center" ${props.backgroundPosition === 'center' || !props.backgroundPosition ? 'selected' : ''}>Center</option>
                  <option value="top" ${props.backgroundPosition === 'top' ? 'selected' : ''}>Top</option>
                  <option value="bottom" ${props.backgroundPosition === 'bottom' ? 'selected' : ''}>Bottom</option>
                  <option value="left" ${props.backgroundPosition === 'left' ? 'selected' : ''}>Left</option>
                  <option value="right" ${props.backgroundPosition === 'right' ? 'selected' : ''}>Right</option>
                </select>
              </div>
            </div>
            <div class="style-field-row">
              <div class="style-field"><label>Position X</label><input type="text" placeholder="50%" value="${escapeHtml(props.backgroundPositionX || '')}" data-prop="backgroundPositionX"></div>
              <div class="style-field"><label>Position Y</label><input type="text" placeholder="50%" value="${escapeHtml(props.backgroundPositionY || '')}" data-prop="backgroundPositionY"></div>
            </div>
            <div class="style-field-row">
              <div class="style-field">
                <label>Repeat</label>
                <select data-prop="backgroundRepeat">
                  <option value="no-repeat" ${props.backgroundRepeat === 'no-repeat' || !props.backgroundRepeat ? 'selected' : ''}>No Repeat</option>
                  <option value="repeat" ${props.backgroundRepeat === 'repeat' ? 'selected' : ''}>Repeat</option>
                  <option value="repeat-x" ${props.backgroundRepeat === 'repeat-x' ? 'selected' : ''}>Repeat X</option>
                  <option value="repeat-y" ${props.backgroundRepeat === 'repeat-y' ? 'selected' : ''}>Repeat Y</option>
                </select>
              </div>
              <div class="style-field">
                <label>Attachment</label>
                <select data-prop="backgroundAttachment">
                  <option value="scroll" ${props.backgroundAttachment === 'scroll' || !props.backgroundAttachment ? 'selected' : ''}>Scroll</option>
                  <option value="fixed" ${props.backgroundAttachment === 'fixed' ? 'selected' : ''}>Fixed (Parallax)</option>
                </select>
              </div>
            </div>
          </div>
          <div id="bgVideoControls" class="${bgType === 'video' ? '' : 'hidden'}">
            <div class="style-field">
              <label>Video URL</label>
              <input type="url" placeholder="MP4/WebM URL" value="${escapeHtml(props.backgroundVideo || '')}" data-prop="backgroundVideo">
            </div>
            <div class="style-field">
              <label>Fallback image URL</label>
              <input type="url" placeholder="Shown if video cannot play" value="${escapeHtml(props.backgroundImage || '')}" data-prop="backgroundImage">
            </div>
            <div class="style-field-row">
              <div class="style-field"><label>Video fit</label><select data-prop="videoFit"><option value="cover" ${!props.videoFit || props.videoFit === 'cover' ? 'selected' : ''}>Cover</option><option value="contain" ${props.videoFit === 'contain' ? 'selected' : ''}>Contain</option></select></div>
              <div class="style-field"><label>Video position</label><input type="text" placeholder="50% 50%" value="${escapeHtml(props.videoPosition || '50% 50%')}" data-prop="videoPosition"></div>
            </div>
            <div class="style-field">
              <label>Poster / fallback image</label>
              <input type="url" placeholder="Image URL shown before playback" value="${escapeHtml(props.videoPoster || '')}" data-prop="videoPoster">
            </div>
            <div class="style-field-row">
              <label class="checkbox-label"><input type="checkbox" ${props.videoAutoplay !== false ? 'checked' : ''} data-prop="videoAutoplay"> Autoplay</label>
              <label class="checkbox-label"><input type="checkbox" ${props.videoMuted !== false ? 'checked' : ''} data-prop="videoMuted"> Muted</label>
              <label class="checkbox-label"><input type="checkbox" ${props.videoLoop !== false ? 'checked' : ''} data-prop="videoLoop"> Loop</label>
            </div>
          </div>
          <div id="bgOverlayField" class="style-field ${['image','video'].includes(bgType) ? '' : 'hidden'}">
            <label>Overlay Color</label>
            <div class="color-input-row">
              <input type="color" value="${escapeHtml(props.overlayColor || '#000000')}" data-prop="overlayColor">
              <input type="text" value="${escapeHtml(props.overlayColor || '')}" placeholder="none" data-prop-text="overlayColor">
            </div>
            <label>Overlay Opacity: ${props.overlayOpacity || 50}%</label>
            <input type="range" min="0" max="100" value="${props.overlayOpacity || 50}" data-prop="overlayOpacity">
            <div class="style-field"><label>Overlay gradient (optional CSS)</label><input type="text" placeholder="linear-gradient(90deg, #0008, transparent)" value="${escapeHtml(props.overlayGradient || '')}" data-prop="overlayGradient"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Border Section ----
  function renderBorderSection(node, resolved, bp) {
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="border">Border & Radius</div>
        <div class="style-section-body">
          <div class="style-field-row">
            <div class="style-field">
              <label>Border Width</label>
              <input type="text" value="${escapeHtml(resolved['border-width'] || '')}" placeholder="0" data-style="border-width">
            </div>
            <div class="style-field">
              <label>Border Style</label>
              <select data-style="border-style">
                <option value="" ${!resolved['border-style'] ? 'selected' : ''}>None</option>
                <option value="solid" ${resolved['border-style'] === 'solid' ? 'selected' : ''}>Solid</option>
                <option value="dashed" ${resolved['border-style'] === 'dashed' ? 'selected' : ''}>Dashed</option>
                <option value="dotted" ${resolved['border-style'] === 'dotted' ? 'selected' : ''}>Dotted</option>
                <option value="double" ${resolved['border-style'] === 'double' ? 'selected' : ''}>Double</option>
              </select>
            </div>
          </div>
          <div class="style-field">
            <label>Border Color</label>
            <div class="color-input-row">
              <input type="color" value="${escapeHtml(resolved['border-color'] || '#E0E0E0')}" data-style-color="border-color">
              <input type="text" value="${escapeHtml(resolved['border-color'] || '')}" placeholder="none" data-style="border-color">
            </div>
          </div>
          <div class="style-field">
            <label>Border Radius</label>
            <div class="radius-editor">
              <input type="text" placeholder="0" value="${escapeHtml(resolved['border-radius'] || '')}" data-style="border-radius">
              <div class="radius-corners">
                <input type="text" placeholder="TL" value="${escapeHtml(resolved['border-top-left-radius'] || '')}" data-style="border-top-left-radius" title="Top Left">
                <input type="text" placeholder="TR" value="${escapeHtml(resolved['border-top-right-radius'] || '')}" data-style="border-top-right-radius" title="Top Right">
                <input type="text" placeholder="BR" value="${escapeHtml(resolved['border-bottom-right-radius'] || '')}" data-style="border-bottom-right-radius" title="Bottom Right">
                <input type="text" placeholder="BL" value="${escapeHtml(resolved['border-bottom-left-radius'] || '')}" data-style="border-bottom-left-radius" title="Bottom Left">
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Effects Section ----
  function renderEffectsSection(node, resolved, bp) {
    const shadow = resolved['box-shadow'] || '';
    const opacity = resolved.opacity || '';
    const filter = resolved.filter || '';
    const backdrop = resolved['backdrop-filter'] || '';
    const blend = resolved['mix-blend-mode'] || '';

    // Parse shadow components for the editor
    const shadowMatch = shadow.match(/(-?\d+px)\s+(-?\d+px)\s+(\d+px)\s+(-?\d+px)?\s+(.+?)(\s+inset)?$/);
    const sx = shadowMatch ? shadowMatch[1] : '0';
    const sy = shadowMatch ? shadowMatch[2] : '4px';
    const sblur = shadowMatch ? shadowMatch[3] : '6px';
    const sspread = shadowMatch ? shadowMatch[4] || '0' : '0';
    const scolor = shadowMatch ? shadowMatch[5] : 'rgba(0,0,0,0.1)';
    const sinset = shadowMatch && shadowMatch[6] ? 'checked' : '';

    return `
      <div class="style-section">
        <div class="style-section-header" data-section="effects">Effects</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Opacity: ${opacity ? Math.round(parseFloat(opacity) * 100) : 100}%</label>
            <input type="range" min="0" max="100" value="${opacity ? Math.round(parseFloat(opacity) * 100) : 100}" data-style-range="opacity">
          </div>
          <div class="style-field">
            <label>Box Shadow</label>
            <div class="shadow-editor">
              <div class="style-field-row">
                <div class="style-field"><label>X</label><input type="text" value="${escapeHtml(sx)}" data-shadow="x"></div>
                <div class="style-field"><label>Y</label><input type="text" value="${escapeHtml(sy)}" data-shadow="y"></div>
              </div>
              <div class="style-field-row">
                <div class="style-field"><label>Blur</label><input type="text" value="${escapeHtml(sblur)}" data-shadow="blur"></div>
                <div class="style-field"><label>Spread</label><input type="text" value="${escapeHtml(sspread)}" data-shadow="spread"></div>
              </div>
              <div class="style-field">
                <label>Color</label>
                <div class="color-input-row">
                  <input type="color" value="${escapeHtml(shadowToHex(scolor))}" data-shadow-color>
                  <input type="text" value="${escapeHtml(scolor)}" data-shadow-color-text>
                </div>
              </div>
              <label class="checkbox-label"><input type="checkbox" ${sinset} data-shadow="inset"> Inset</label>
            </div>
          </div>
          <div class="style-field">
            <label>Filter</label>
            <input type="text" value="${escapeHtml(filter)}" placeholder="e.g. blur(4px) grayscale(50%)" data-style="filter">
          </div>
          <div class="style-field">
            <label>Backdrop Filter</label>
            <input type="text" value="${escapeHtml(backdrop)}" placeholder="e.g. blur(10px)" data-style="backdrop-filter">
          </div>
          <div class="style-field">
            <label>Mix Blend Mode</label>
            <select data-style="mix-blend-mode">
              <option value="" ${!blend ? 'selected' : ''}>Normal</option>
              ${['multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'].map(m =>
                `<option value="${m}" ${blend === m ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </div>
          <div class="style-field">
            <label>Transform</label>
            <input type="text" value="${escapeHtml(resolved.transform || '')}" placeholder="e.g. rotate(5deg) scale(1.1)" data-style="transform">
          </div>
        </div>
      </div>
    `;
  }

  function shadowToHex(shadowColor) {
    if (!shadowColor) return '#000000';
    if (shadowColor.startsWith('#')) return shadowColor;
    const m = shadowColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(c => parseInt(c).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
  }

  // ---- Typography Section ----
  function renderTypographySection(node, resolved, bp) {
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="typography">Typography</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Font Family</label>
            <select data-style="font-family">
              <option value="" ${!resolved['font-family'] ? 'selected' : ''}>Default</option>
              ${['Inter','Poppins','Roboto','Open Sans','Lato','Montserrat','Source Sans Pro','Raleway','Nunito','JetBrains Mono','Playfair Display','Merriweather'].map(f =>
                `<option value="'${f}', sans-serif" ${resolved['font-family']?.includes(f) ? 'selected' : ''}>${f}</option>`
              ).join('')}
            </select>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Size</label>
              <input type="text" value="${escapeHtml(resolved['font-size'] || '')}" placeholder="auto" data-style="font-size">
            </div>
            <div class="style-field">
              <label>Weight</label>
              <select data-style="font-weight">
                <option value="" ${!resolved['font-weight'] ? 'selected' : ''}>Default</option>
                ${[100,200,300,400,500,600,700,800,900].map(w =>
                  `<option value="${w}" ${String(resolved['font-weight']) === String(w) ? 'selected' : ''}>${w}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="style-field-row">
            <div class="style-field">
              <label>Line Height</label>
              <input type="text" value="${escapeHtml(resolved['line-height'] || '')}" placeholder="auto" data-style="line-height">
            </div>
            <div class="style-field">
              <label>Letter Spacing</label>
              <input type="text" value="${escapeHtml(resolved['letter-spacing'] || '')}" placeholder="normal" data-style="letter-spacing">
            </div>
          </div>
          <div class="style-field">
            <label>Text Align</label>
            <div class="btn-group">
              <button data-text-align="left" class="${resolved['text-align'] === 'left' ? 'active' : ''}">Left</button>
              <button data-text-align="center" class="${resolved['text-align'] === 'center' ? 'active' : ''}">Center</button>
              <button data-text-align="right" class="${resolved['text-align'] === 'right' ? 'active' : ''}">Right</button>
              <button data-text-align="justify" class="${resolved['text-align'] === 'justify' ? 'active' : ''}">Justify</button>
            </div>
          </div>
          <div class="style-field">
            <label>Text Transform</label>
            <select data-style="text-transform">
              <option value="" ${!resolved['text-transform'] ? 'selected' : ''}>None</option>
              <option value="uppercase" ${resolved['text-transform'] === 'uppercase' ? 'selected' : ''}>UPPERCASE</option>
              <option value="lowercase" ${resolved['text-transform'] === 'lowercase' ? 'selected' : ''}>lowercase</option>
              <option value="capitalize" ${resolved['text-transform'] === 'capitalize' ? 'selected' : ''}>Capitalize</option>
            </select>
          </div>
          <div class="style-field">
            <label>Text Color</label>
            <div class="color-input-row">
              <input type="color" value="${escapeHtml(resolved.color || '#0F172A')}" data-style-color="color">
              <input type="text" value="${escapeHtml(resolved.color || '')}" placeholder="inherit" data-style="color">
            </div>
          </div>
          <div class="style-field">
            <label>Text Decoration</label>
            <select data-style="text-decoration">
              <option value="" ${!resolved['text-decoration'] ? 'selected' : ''}>None</option>
              <option value="underline" ${resolved['text-decoration'] === 'underline' ? 'selected' : ''}>Underline</option>
              <option value="line-through" ${resolved['text-decoration'] === 'line-through' ? 'selected' : ''}>Strikethrough</option>
              <option value="overline" ${resolved['text-decoration'] === 'overline' ? 'selected' : ''}>Overline</option>
            </select>
          </div>
          <div class="style-field">
            <label>Text Shadow</label>
            <input type="text" value="${escapeHtml(resolved['text-shadow'] || '')}" placeholder="e.g. 0 2px 4px rgba(0,0,0,0.2)" data-style="text-shadow">
          </div>
        </div>
      </div>
    `;
  }

  // ---- Transition Section ----
  function renderTransitionSection(node, resolved, bp) {
    const transition = resolved.transition || '';
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="transition">Transition</div>
        <div class="style-section-body">
          <div class="style-field">
            <label>Transition</label>
            <input type="text" value="${escapeHtml(transition)}" placeholder="e.g. all 0.3s ease" data-style="transition">
          </div>
          <div class="style-field">
            <label>Duration (ms)</label>
            <input type="number" value="${transition ? parseInt(transition.match(/(\d+(?:\.\d+)?)/)?.[1] || '300') : 300}" data-transition-duration>
          </div>
          <div class="style-field">
            <label>Easing</label>
            <select data-transition-easing>
              <option value="ease" ${transition.includes('ease') && !transition.includes('ease-in') && !transition.includes('ease-out') ? 'selected' : ''}>Ease</option>
              <option value="ease-in" ${transition.includes('ease-in') && !transition.includes('ease-out') ? 'selected' : ''}>Ease In</option>
              <option value="ease-out" ${transition.includes('ease-out') && !transition.includes('ease-in') ? 'selected' : ''}>Ease Out</option>
              <option value="ease-in-out" ${transition.includes('ease-in-out') ? 'selected' : ''}>Ease In Out</option>
              <option value="linear" ${transition.includes('linear') ? 'selected' : ''}>Linear</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }


  // Advanced property/value editor: keeps uncommon CSS properties available
  // without requiring a dedicated widget for every browser CSS feature.
  function renderAdvancedCSSSection(node, resolved, bp) {
    const custom = Object.entries(resolved || {}).filter(([k]) => ![
      'display','flex-direction','flex-wrap','justify-content','align-items','align-content','gap',
      'grid-template-columns','grid-template-rows','grid-auto-flow','grid-auto-columns','grid-auto-rows',
      'margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left',
      'width','height','min-width','max-width','min-height','max-height','position','top','right','bottom','left','inset','z-index','overflow',
      'background','background-color','background-image','background-size','background-position','background-repeat','background-attachment',
      'border','border-width','border-style','border-color','border-radius','box-shadow','opacity','filter','mix-blend-mode',
      'font-family','font-size','font-weight','line-height','letter-spacing','text-align','color','text-decoration','text-transform',
      'transition','transform','cursor','object-fit','object-position','aspect-ratio','align-self','order','flex','flex-grow','flex-shrink','flex-basis',
      'text-shadow','outline','outline-offset','clip-path','mask-image','backdrop-filter','transform-origin','white-space','word-break','overflow-wrap',
      'text-overflow','column-count','column-gap','column-rule','pointer-events','visibility','content','list-style-type'
    ].includes(k)).map(([k,v]) => ({k,v}));
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="advanced-css">Advanced CSS</div>
        <div class="style-section-body">
          <p class="style-help">Add any valid CSS property supported by the browser. Use standard CSS values such as <code>clamp(1rem, 3vw, 3rem)</code>, <code>minmax(0, 1fr)</code> or <code>backdrop-filter: blur(12px)</code>.</p>
          <div class="style-field-row">
            <div class="style-field"><label for="advancedCssProperty">Property</label><input id="advancedCssProperty" type="text" placeholder="e.g. text-wrap"></div>
            <div class="style-field"><label for="advancedCssValue">Value</label><input id="advancedCssValue" type="text" placeholder="e.g. balance"></div>
          </div>
          <button type="button" class="btn btn-sm" data-add-advanced-css>Add / update property</button>
          <div class="advanced-css-current">${custom.length ? custom.map(({k,v}) => `<div class="advanced-css-row"><code>${escapeHtml(k)}: ${escapeHtml(v)}</code><button type="button" data-remove-advanced-css="${escapeHtml(k)}" aria-label="Remove ${escapeHtml(k)}">Remove</button></div>`).join('') : '<span class="style-help">No additional properties set.</span>'}</div>
        </div>
      </div>`;
  }


  function renderStateStylesSection(node) {
    const states = node.meta?.stateStyles || {};
    const selectedState = 'hover';
    const rules = states[selectedState] || {};
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="state-styles">Interaction states</div>
        <div class="style-section-body">
          <p class="style-help">Set CSS values for hover, keyboard focus, active and focus-visible states. These rules are compiled into the published page.</p>
          <div class="style-field"><label>State</label><select data-state-name><option value="hover">Hover</option><option value="focus">Focus</option><option value="active">Active / pressed</option><option value="focus-visible">Keyboard focus</option></select></div>
          <div class="style-field-row"><div class="style-field"><label>Property</label><input type="text" data-state-prop placeholder="background-color"></div><div class="style-field"><label>Value</label><input type="text" data-state-value placeholder="#0d55c7"></div></div>
          <button type="button" class="btn btn-sm" data-add-state-rule>Save state rule</button>
          <div class="state-rules-list">${Object.entries(rules).map(([prop,value]) => `<div class="advanced-css-row"><code>${escapeHtml(prop)}: ${escapeHtml(value)}</code></div>`).join('') || '<span class="style-help">Choose a state to view its rules. Add rules below.</span>'}</div>
        </div>
      </div>`;
  }

  // ---- Custom CSS Section ----
  function renderCustomCSSSection(node) {
    const current = (node.meta && node.meta.customCSS) || '';
    return `
      <div class="style-section">
        <div class="style-section-header" data-section="custom-css">Element CSS</div>
        <div class="style-section-body">
          <div class="style-field">
            <textarea rows="4" placeholder="/* Custom CSS rules for this element */" data-custom-css style="width:100%;font-family:monospace;font-size:12px;padding:8px;border:1px solid #333;border-radius:4px;background:#1a1a2e;color:#e2e8f0;">${escapeHtml(current)}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  // ---- Event listeners ----
  function attachAllListeners(node, bp) {
    const el = panelEl();
    const nodeId = node.id;

    // Section collapse/expand
    el.querySelectorAll('.style-section-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        header.nextElementSibling.classList.toggle('collapsed');
      });
    });

    // Data-style inputs (direct CSS properties)
    el.querySelectorAll('[data-style]').forEach(input => {
      const event = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(event, () => {
        dispatchStyle(nodeId, bp, input.dataset.style, input.value);
      });
    });

    // Data-style-color inputs
    el.querySelectorAll('[data-style-color]').forEach(input => {
      input.addEventListener('input', () => {
        dispatchStyle(nodeId, bp, input.dataset.styleColor, input.value);
        // Sync text input
        const textInput = el.querySelector(`[data-style="${input.dataset.styleColor}"]`);
        if (textInput) textInput.value = input.value;
      });
    });

    // Opacity range
    el.querySelectorAll('[data-style-range]').forEach(input => {
      input.addEventListener('input', () => {
        const prop = input.dataset.styleRange;
        const val = prop === 'opacity' ? (Number(input.value) / 100).toFixed(2) : input.value;
        dispatchStyle(nodeId, bp, prop, val);
        // Update label
        const label = input.previousElementSibling;
        if (label) label.textContent = label.textContent.replace(/\d+%/, input.value + '%');
      });
    });

    // Data-prop inputs (block props, not styles)
    el.querySelectorAll('[data-prop]').forEach(input => {
      const event = input.type === 'checkbox' ? 'change' : (input.tagName === 'SELECT' ? 'change' : 'input');
      input.addEventListener(event, () => {
        const value = input.type === 'checkbox' ? input.checked : input.value;
        Store.dispatch(Commands.setProp(nodeId, input.dataset.prop, value));
        if (input.type === 'color') {
          const textField = el.querySelector(`[data-prop-text="${input.dataset.prop}"]`);
          if (textField) textField.value = input.value;
        }
        if ((input.tagName === 'SELECT' || input.type === 'checkbox') && typeof Editor !== 'undefined') Editor.refreshPanels(true);
      });
    });

    const angleInput = el.querySelector('[data-prop="gradientAngle"]');
    angleInput?.addEventListener('input', () => {
      const label = angleInput.closest('.style-field')?.querySelector('label');
      if (label) label.textContent = `Angle / start: ${angleInput.value}°`;
      const currentProps = Store.getPage().nodes[nodeId]?.props || {};
      const stops = (currentProps.gradientStops || ['#667eea','#764ba2']).join(', ');
      const preview = el.querySelector('.gradient-preview');
      if (preview) preview.style.background = currentProps.gradientType === 'radial' ? `radial-gradient(ellipse at center, ${stops})` : currentProps.gradientType === 'conic' ? `conic-gradient(from ${angleInput.value}deg, ${stops})` : `linear-gradient(${angleInput.value}deg, ${stops})`;
    });
    const opacityInput = el.querySelector('[data-prop="overlayOpacity"]');
    opacityInput?.addEventListener('input', () => {
      const label = opacityInput.previousElementSibling;
      if (label && label.tagName === 'LABEL') label.textContent = `Overlay Opacity: ${opacityInput.value}%`;
    });

    // Data-prop-text inputs (sync with color picker)
    el.querySelectorAll('[data-prop-text]').forEach(input => {
      input.addEventListener('input', () => {
        Store.dispatch(Commands.setProp(nodeId, input.dataset.propText, input.value));
        const colorInput = el.querySelector(`[data-prop="${input.dataset.propText}"]`);
        if (colorInput) colorInput.value = input.value;
      });
    });

    // Background type buttons
    el.querySelectorAll('[data-bg-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.dispatch(Commands.setProp(nodeId, 'backgroundType', btn.dataset.bgType));
        if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
      });
    });

    // Gradient stops
    el.querySelectorAll('[data-gradient-stop]').forEach(input => {
      input.addEventListener('input', () => {
        const idx = Number(input.dataset.gradientStop);
        const props = Store.getPage().nodes[nodeId]?.props || {};
        const stops = [...(props.gradientStops || ['#667eea', '#764ba2'])];
        stops[idx] = input.value;
        Store.dispatch(Commands.setProp(nodeId, 'gradientStops', stops));
        const preview = el.querySelector('.gradient-preview');
        const kind = props.gradientType || 'linear';
        const stopList = stops.join(', ');
        if (preview) preview.style.background = kind === 'radial' ? `radial-gradient(ellipse at center, ${stopList})` : kind === 'conic' ? `conic-gradient(from ${props.gradientAngle || 135}deg, ${stopList})` : `linear-gradient(${props.gradientAngle || 135}deg, ${stopList})`;
      });
    });

    el.querySelectorAll('[data-remove-stop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.removeStop);
        const props = Store.getPage().nodes[nodeId]?.props || {};
        const stops = [...(props.gradientStops || [])];
        if (stops.length > 2) {
          stops.splice(idx, 1);
          Store.dispatch(Commands.setProp(nodeId, 'gradientStops', stops));
          if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
        }
      });
    });

    const addStopBtn = el.querySelector('[data-add-stop]');
    if (addStopBtn) {
      addStopBtn.addEventListener('click', () => {
        const props = Store.getPage().nodes[nodeId]?.props || {};
        const stops = [...(props.gradientStops || ['#667eea', '#764ba2']), '#333333'];
        Store.dispatch(Commands.setProp(nodeId, 'gradientStops', stops));
        if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
      });
    }

    // Background upload
    const bgUploadBtn = el.querySelector('[data-bg-upload]');
    const bgUploadInput = el.querySelector('[data-bg-upload-input]');
    if (bgUploadBtn && bgUploadInput) {
      bgUploadBtn.addEventListener('click', () => bgUploadInput.click());
      bgUploadInput.addEventListener('change', async () => {
        const file = bgUploadInput.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('image', file);
        try {
          const res = await fetch('api/upload.php', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.url) {
            Store.dispatch(Commands.setProp(nodeId, 'backgroundImage', data.url));
            if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
          } else if (data.error) {
            console.error('Upload failed:', data.error);
            alert('Upload failed: ' + data.error);
          }
        } catch (e) { console.error('Upload failed:', e); }
      });
    }

    // Background image from the media library
    const bgLibraryBtn = el.querySelector('[data-bg-library]');
    if (bgLibraryBtn && typeof AssetManager !== 'undefined') {
      bgLibraryBtn.addEventListener('click', () => {
        AssetManager.open(url => {
          Store.dispatch(Commands.setProp(nodeId, 'backgroundType', 'image'));
          Store.dispatch(Commands.setProp(nodeId, 'backgroundImage', url));
          if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
        });
      });
    }

    // Flex direction buttons
    el.querySelectorAll('[data-flex-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatchStyle(nodeId, bp, 'flex-direction', btn.dataset.flexDir);
      });
    });

    // Justify buttons
    el.querySelectorAll('[data-justify]').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatchStyle(nodeId, bp, 'justify-content', btn.dataset.justify);
      });
    });

    // Align items buttons
    el.querySelectorAll('[data-align-items]').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatchStyle(nodeId, bp, 'align-items', btn.dataset.alignItems);
      });
    });

    // Text align buttons
    el.querySelectorAll('[data-text-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        dispatchStyle(nodeId, bp, 'text-align', btn.dataset.textAlign);
      });
    });

    // Shadow editor
    const shadowInputs = el.querySelectorAll('[data-shadow]');
    const shadowColor = el.querySelector('[data-shadow-color]');
    const shadowColorText = el.querySelector('[data-shadow-color-text]');
    const updateShadow = () => {
      const x = el.querySelector('[data-shadow="x"]')?.value || '0';
      const y = el.querySelector('[data-shadow="y"]')?.value || '4px';
      const blur = el.querySelector('[data-shadow="blur"]')?.value || '6px';
      const spread = el.querySelector('[data-shadow="spread"]')?.value || '0';
      const color = shadowColorText?.value || 'rgba(0,0,0,0.1)';
      const inset = el.querySelector('[data-shadow="inset"]')?.checked ? ' inset' : '';
      const shadow = `${x} ${y} ${blur} ${spread} ${color}${inset}`;
      dispatchStyle(nodeId, bp, 'box-shadow', shadow);
    };
    shadowInputs.forEach(input => input.addEventListener('input', updateShadow));
    if (shadowColor) shadowColor.addEventListener('input', () => { if (shadowColorText) shadowColorText.value = shadowColor.value; updateShadow(); });
    if (shadowColorText) shadowColorText.addEventListener('input', updateShadow);

    // State-specific CSS declarations are separate from base styles.
    const stateSelect = el.querySelector('[data-state-name]');
    const refreshStateList = () => {
      const selectedState = stateSelect?.value || 'hover';
      const rules = node.meta?.stateStyles?.[selectedState] || {};
      const list = el.querySelector('.state-rules-list');
      if (list) list.innerHTML = Object.entries(rules).map(([prop,value]) => `<div class="advanced-css-row"><code>${escapeHtml(prop)}: ${escapeHtml(value)}</code><button type="button" data-remove-state-rule="${escapeHtml(prop)}">Remove</button></div>`).join('') || '<span class="style-help">No rules for this state yet.</span>';
      list?.querySelectorAll('[data-remove-state-rule]').forEach(btn => btn.addEventListener('click', () => {
        const all = JSON.parse(JSON.stringify(Store.getPage().nodes[nodeId].meta?.stateStyles || {}));
        delete (all[selectedState] || {})[btn.dataset.removeStateRule];
        if (all[selectedState] && !Object.keys(all[selectedState]).length) delete all[selectedState];
        Store.dispatch(setNodeMeta(nodeId, 'stateStyles', all));
        if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
      }));
    };
    stateSelect?.addEventListener('change', refreshStateList);
    el.querySelector('[data-add-state-rule]')?.addEventListener('click', () => {
      const state = stateSelect?.value || 'hover';
      const prop = (el.querySelector('[data-state-prop]')?.value || '').trim().toLowerCase();
      const value = (el.querySelector('[data-state-value]')?.value || '').trim();
      if (!/^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/.test(prop) || !value || /[{}<>;]/.test(value)) { alert('Enter a valid CSS property and value.'); return; }
      const all = JSON.parse(JSON.stringify(Store.getPage().nodes[nodeId].meta?.stateStyles || {}));
      all[state] = { ...(all[state] || {}), [prop]: value };
      Store.dispatch(setNodeMeta(nodeId, 'stateStyles', all));
      if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
    });
    refreshStateList();

    // Universal advanced CSS property editor. Property names are validated here
    // and again by the server CSS generator before publication.
    const addAdvancedCss = el.querySelector('[data-add-advanced-css]');
    if (addAdvancedCss) addAdvancedCss.addEventListener('click', () => {
      const propInput = el.querySelector('#advancedCssProperty');
      const valueInput = el.querySelector('#advancedCssValue');
      const prop = (propInput?.value || '').trim().toLowerCase();
      const value = (valueInput?.value || '').trim();
      if (!/^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/.test(prop) || !value || /[;{}<>]/.test(value)) {
        propInput?.setCustomValidity('Use a valid CSS property name and a non-empty CSS value.');
        propInput?.reportValidity();
        return;
      }
      propInput.setCustomValidity('');
      dispatchStyle(nodeId, bp, prop, value);
      if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
    });
    el.querySelectorAll('[data-remove-advanced-css]').forEach(btn => btn.addEventListener('click', () => {
      dispatchStyle(nodeId, bp, btn.dataset.removeAdvancedCss, '');
      if (typeof Editor !== 'undefined') Editor.refreshPanels(true);
    }));

    // Per-element custom CSS
    const customCssInput = el.querySelector('[data-custom-css]');
    if (customCssInput) {
      customCssInput.addEventListener('input', () => {
        Store.dispatch(setNodeMeta(nodeId, 'customCSS', customCssInput.value));
      });
    }

    // Transition duration/easing
    const durInput = el.querySelector('[data-transition-duration]');
    const easeSelect = el.querySelector('[data-transition-easing]');
    if (durInput && easeSelect) {
      const updateTransition = () => {
        const dur = Number(durInput.value || 300) / 1000;
        const ease = easeSelect.value;
        dispatchStyle(nodeId, bp, 'transition', `all ${dur}s ${ease}`);
      };
      durInput.addEventListener('input', updateTransition);
      easeSelect.addEventListener('change', updateTransition);
    }
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  return { render };
})();
