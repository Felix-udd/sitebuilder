// Block type registry.
// Each entry defines: label + icon (for the palette), default props for a
// freshly-added block, a render(props) function that produces the live
// canvas HTML, and a fields[] list that drives the property panel.
//
// IMPORTANT: render() here must stay visually equivalent to render_block()
// in includes/render.php - that PHP function is what actually gets
// published, this one is only for the live editing preview.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function safeUrl(url) {
  if (!url) return '#';
  return escapeHtml(url);
}

// Safe, bounded "rich text": supports **bold**, *italic*, [label](url).
// Everything else is escaped exactly like plain text - this never opens up
// arbitrary HTML, it only ever emits <strong>/<em>/<a> that we build ourselves.
// Mirrors render_rich_text() in includes/render.php exactly.
function richText(raw) {
  raw = String(raw ?? '');
  const tokens = [];
  const store = html => { tokens.push(html); return `\x01${tokens.length - 1}\x02`; };

  raw = raw.replace(/\[([^\]\[]+)\]\(([^()]+)\)/g, (_, label, url) =>
    store(`<a href="${safeUrl(url.trim())}">${escapeHtml(label)}</a>`));
  raw = raw.replace(/\*\*([^*]+)\*\*/g, (_, t) => store(`<strong>${escapeHtml(t)}</strong>`));
  raw = raw.replace(/\*([^*]+)\*/g, (_, t) => store(`<em>${escapeHtml(t)}</em>`));

  raw = escapeHtml(raw).replace(/\n/g, '<br>');
  raw = raw.replace(/\x01(\d+)\x02/g, (_, i) => tokens[Number(i)] || '');
  return raw;
}

const BLOCK_TYPES = {
  hero: {
    label: 'Hero',
    icon: 'HR',
    defaultProps: {
      heading: 'Your headline here',
      subheading: 'A short supporting line that explains the offer.',
      buttonText: 'Get started',
      buttonUrl: '#',
      bgColor: '#1D2027',
      textColor: '#FFFFFF',
      align: 'center'
    },
    render(p) {
      const btn = p.buttonText
        ? `<a class="sb-btn" href="${safeUrl(p.buttonUrl)}">${escapeHtml(p.buttonText)}</a>`
        : '';
      return `<section class="sb-block sb-hero" style="background:${p.bgColor};color:${p.textColor};text-align:${p.align};">
        <h1>${escapeHtml(p.heading)}</h1>
        ${p.subheading ? `<p class="sb-hero-sub">${escapeHtml(p.subheading)}</p>` : ''}
        ${btn}
      </section>`;
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'textarea' },
      { key: 'buttonText', label: 'Button text', type: 'text' },
      { key: 'buttonUrl', label: 'Button link', type: 'url' },
      { key: 'bgColor', label: 'Background', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'align', label: 'Alignment', type: 'align' }
    ]
  },

  heading: {
    label: 'Heading',
    icon: 'H',
    defaultProps: { text: 'Section heading', level: 'h2', align: 'left', color: '#1A1A1A' },
    render(p) {
      return `<div class="sb-block" style="text-align:${p.align};">
        <${p.level} style="color:${p.color};margin:0;">${escapeHtml(p.text)}</${p.level}>
      </div>`;
    },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'level', label: 'Size', type: 'select', options: [
        { value: 'h1', label: 'Extra large' },
        { value: 'h2', label: 'Large' },
        { value: 'h3', label: 'Medium' },
        { value: 'h4', label: 'Small' }
      ]},
      { key: 'align', label: 'Alignment', type: 'align' },
      { key: 'color', label: 'Color', type: 'color' }
    ]
  },

  text: {
    label: 'Text',
    icon: 'T',
    defaultProps: { text: 'Write a paragraph of body copy here.', align: 'left', color: '#333333', fontSize: 16 },
    render(p) {
      return `<div class="sb-block" style="text-align:${p.align};">
        <p style="color:${p.color};font-size:${p.fontSize}px;margin:0;">${richText(p.text)}</p>
      </div>`;
    },
    fields: [
      { key: 'text', label: 'Text (supports **bold**, *italic*, [link](url))', type: 'textarea' },
      { key: 'align', label: 'Alignment', type: 'align' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'fontSize', label: 'Font size (px)', type: 'number' }
    ]
  },

  image: {
    label: 'Image',
    icon: 'IMG',
    defaultProps: { src: '', alt: '', width: '100%', align: 'center' },
    render(p) {
      if (!p.src) {
        return `<div class="sb-block" style="text-align:center;color:#aaa;border:1px dashed #ddd;padding:30px;">
          Add an image URL in the panel →
        </div>`;
      }
      return `<div class="sb-block" style="text-align:${p.align};">
        <img src="${safeUrl(p.src)}" alt="${escapeHtml(p.alt)}" style="max-width:${p.width};height:auto;border-radius:4px;">
      </div>`;
    },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'width', label: 'Width (e.g. 100%, 400px)', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'align' }
    ]
  },

  button: {
    label: 'Button',
    icon: 'BTN',
    defaultProps: { text: 'Click here', url: '#', bgColor: '#7C6FF0', textColor: '#FFFFFF', align: 'left' },
    render(p) {
      return `<div class="sb-block" style="text-align:${p.align};">
        <a class="sb-btn" href="${safeUrl(p.url)}" style="background:${p.bgColor};color:${p.textColor};">${escapeHtml(p.text)}</a>
      </div>`;
    },
    fields: [
      { key: 'text', label: 'Button text', type: 'text' },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'bgColor', label: 'Background', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'align', label: 'Alignment', type: 'align' }
    ]
  },

  spacer: {
    label: 'Spacer',
    icon: '↕',
    defaultProps: { height: 40 },
    render(p) {
      return `<div class="sb-block" style="height:${p.height}px;background:repeating-linear-gradient(45deg,#f7f7f5,#f7f7f5 6px,#efefec 6px,#efefec 12px);"></div>`;
    },
    fields: [
      { key: 'height', label: 'Height (px)', type: 'number' }
    ]
  },

  divider: {
    label: 'Divider',
    icon: '—',
    defaultProps: { color: '#E0E0E0', thickness: 1 },
    render(p) {
      return `<div class="sb-block"><hr style="border:none;border-top:${p.thickness}px solid ${p.color};margin:0;"></div>`;
    },
    fields: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'thickness', label: 'Thickness (px)', type: 'number' }
    ]
  },

  columns: {
    label: '2 Columns',
    icon: '⫲',
    defaultProps: { leftText: 'Left column text.', rightText: 'Right column text.' },
    render(p) {
      return `<div class="sb-block sb-columns">
        <div class="sb-col" draggable="true" data-col-side="left">${richText(p.leftText)}</div>
        <div class="sb-col" draggable="true" data-col-side="right">${richText(p.rightText)}</div>
      </div>`;
    },
    fields: [
      { key: 'leftText', label: 'Left column (supports **bold**, *italic*, [link](url))', type: 'textarea' },
      { key: 'rightText', label: 'Right column (supports **bold**, *italic*, [link](url))', type: 'textarea' }
    ]
  },

  grid: {
    label: 'Grid',
    icon: '▦',
    defaultProps: { columns: 3, gap: 16, cells: ['Item one', 'Item two', 'Item three'] },
    render(p) {
      const cols = Math.max(1, Math.min(6, p.columns || 3));
      const cells = (p.cells || []).map((c, i) =>
        `<div class="sb-grid-cell" draggable="true" data-cell-index="${i}">${richText(c)}</div>`
      ).join('');
      return `<div class="sb-block sb-grid" style="grid-template-columns:repeat(${cols},1fr);gap:${p.gap ?? 16}px;">
        ${cells}
      </div>`;
    },
    fields: [
      { key: 'grid', label: 'Grid layout', type: 'grid' }
    ]
  },

  nav: {
    label: 'Navigation',
    icon: '☰',
    defaultProps: {
      logoText: 'Brand',
      links: 'Home:#|About:#about|Contact:#contact',
      ctaText: 'Get started',
      ctaUrl: '#',
      bgColor: '#FFFFFF',
      textColor: '#1A1A1A',
      ctaColor: '#7C6FF0'
    },
    render(p) {
      const pairs = String(p.links || '').split('|').map(s => s.trim()).filter(Boolean);
      const links = pairs.map((pair, i) => {
        const [label, url] = pair.split(':').map(s => (s || '').trim());
        return label
          ? `<a href="${safeUrl(url || '#')}" draggable="true" data-link-index="${i}">${escapeHtml(label)}</a>`
          : '';
      }).join('');
      const cta = p.ctaText
        ? `<a class="sb-nav-cta" href="${safeUrl(p.ctaUrl)}" style="background:${p.ctaColor};color:#fff;">${escapeHtml(p.ctaText)}</a>`
        : '';
      return `<nav class="sb-block sb-nav" style="background:${p.bgColor};color:${p.textColor};">
        <div class="sb-nav-logo">${escapeHtml(p.logoText)}</div>
        <div class="sb-nav-links">${links}${cta}</div>
      </nav>`;
    },
    fields: [
      { key: 'logoText', label: 'Logo text', type: 'text' },
      { key: 'links', label: 'Links (Label:URL, separated by |)', type: 'textarea' },
      { key: 'ctaText', label: 'Button text (optional)', type: 'text' },
      { key: 'ctaUrl', label: 'Button link', type: 'url' },
      { key: 'bgColor', label: 'Background', type: 'color' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'ctaColor', label: 'Button color', type: 'color' }
    ]
  },

  html: {
    label: 'Custom HTML',
    icon: '</>',
    defaultProps: { code: '<div style="padding:20px;text-align:center;">\n  <p>Your custom HTML goes here.</p>\n</div>' },
    render(p) {
      return `<div class="sb-block sb-custom-html">${p.code || ''}</div>`;
    },
    fields: [
      { key: 'code', label: 'HTML code (scripts and inline event handlers are stripped on publish)', type: 'textarea' }
    ]
  }
};

const DEFAULT_LAYOUT = { widthPct: 100, offsetXPct: 0, minHeight: 0 };

function normalizeLayout(layout) {
  const l = { ...DEFAULT_LAYOUT, ...(layout || {}) };
  l.widthPct = Math.max(10, Math.min(100, Number(l.widthPct) || 100));
  l.offsetXPct = Math.max(0, Math.min(100 - l.widthPct, Number(l.offsetXPct) || 0));
  l.minHeight = Math.max(0, Number(l.minHeight) || 0);
  return l;
}

// Wraps a block's rendered HTML with its width / horizontal position / height
// layout - mirrors render_block_outer() in includes/render.php exactly.
function renderBlockOuter(block) {
  const def = BLOCK_TYPES[block.type];
  if (!def) return '';
  const layout = normalizeLayout(block.layout);
  let style = `width:${layout.widthPct}%;margin-left:${layout.offsetXPct}%;`;
  if (layout.minHeight > 0) {
    style += `min-height:${layout.minHeight}px;display:flex;flex-direction:column;justify-content:center;`;
  }
  return `<div class="sb-pos" style="${style}">${def.render(block.props)}</div>`;
}

function createBlock(type) {
  const def = BLOCK_TYPES[type];
  if (!def) return null;
  return {
    id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    props: { ...def.defaultProps },
    layout: { ...DEFAULT_LAYOUT }
  };
}
