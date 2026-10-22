// Complete block type registry — 50+ blocks organized by category.
// Each entry: label, icon, category, defaultProps, fields[], canHaveChildren, render().
// Render functions produce editor-canvas HTML (the PHP compiler mirrors these).

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function safeUrl(url) {
  if (!url) return '#';
  return escapeHtml(url);
}

// Safe rich text: **bold**, *italic*, [label](url), `code`, ==highlight==
function richText(raw) {
  raw = String(raw ?? '');
  const tokens = [];
  const store = html => { tokens.push(html); return `\x01${tokens.length - 1}\x02`; };

  raw = raw.replace(/\[([^\]\[]+)\]\(([^()]+)\)/g, (_, label, url) =>
    store(`<a href="${safeUrl(url.trim())}">${escapeHtml(label)}</a>`));
  raw = raw.replace(/\*\*([^*]+)\*\*/g, (_, t) => store(`<strong>${escapeHtml(t)}</strong>`));
  raw = raw.replace(/\*([^*]+)\*/g, (_, t) => store(`<em>${escapeHtml(t)}</em>`));
  raw = raw.replace(/`([^`]+)`/g, (_, t) => store(`<code>${escapeHtml(t)}</code>`));
  raw = raw.replace(/==([^=]+)==/g, (_, t) => store(`<mark>${escapeHtml(t)}</mark>`));

  raw = escapeHtml(raw).replace(/\n/g, '<br>');
  raw = raw.replace(/\x01(\d+)\x02/g, (_, i) => tokens[Number(i)] || '');
  return raw;
}

// Convert style object to inline CSS string
function styleObjToCSS(style) {
  if (!style) return '';
  return Object.entries(style)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// Apply resolved styles as inline style
function nodeStyle(node) {
  const resolved = NodeUtils.resolveStyles(node, Store.getBreakpoint());
  return styleObjToCSS(resolved);
}

// Build CSS background value from props
function buildBackground(p) {
  if (!p.backgroundType || p.backgroundType === 'none') return '';
  if (p.backgroundType === 'color') return p.backgroundColor || '';
  if (p.backgroundType === 'gradient') {
    const angle = p.gradientAngle || 135;
    const stops = (p.gradientStops || ['#667eea', '#764ba2']).map(s => s).join(', ');
    const kind = ['linear','radial','conic'].includes(p.gradientType) ? p.gradientType : 'linear';
    if (kind === 'radial') return `radial-gradient(ellipse at center, ${stops})`;
    if (kind === 'conic') return `conic-gradient(from ${angle}deg, ${stops})`;
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  if (p.backgroundType === 'image' && p.backgroundImage) {
    const size = p.backgroundSize || 'cover';
    const posX = p.backgroundPositionX || p.backgroundPosition || 'center';
    const posY = p.backgroundPositionY || 'center';
    const repeat = p.backgroundRepeat || 'no-repeat';
    const attachment = p.backgroundAttachment || 'scroll';
    return `url('${String(p.backgroundImage).replace(/["'\\\n\r]/g, '')}') ${posX} ${posY} / ${size} ${repeat} ${attachment}`;
  }
  return '';
}

function buildBackgroundCSS(p) {
  const bg = buildBackground(p);
  if (bg) return `background:${bg};`;
  if (p.backgroundType === 'color' && p.backgroundColor) return `background:${p.backgroundColor};`;
  return '';
}

function buildOverlay(p) {
  if (!p.overlayColor && !p.overlayGradient) return '';
  const opacity = p.overlayOpacity ?? 50;
  return `<div class="sb-overlay" style="position:absolute;inset:0;background:${p.overlayGradient || p.overlayColor};opacity:${opacity / 100};pointer-events:none;z-index:1;"></div>`;
}

function buildVideoBG(p) {
  if (p.backgroundType !== 'video' || !p.backgroundVideo) return '';
  const attrs = [
    p.videoAutoplay !== false ? 'autoplay' : '',
    p.videoMuted !== false ? 'muted' : '',
    p.videoLoop !== false ? 'loop' : '',
    'playsinline'
  ].filter(Boolean).join(' ');
  const poster = p.videoPoster ? ` poster="${safeUrl(p.videoPoster)}"` : '';
  return `<video ${attrs}${poster} style="position:absolute;inset:0;width:100%;height:100%;object-fit:${escapeHtml(p.videoFit || 'cover')};object-position:${escapeHtml(p.videoPosition || '50% 50%')};z-index:0;" src="${safeUrl(p.backgroundVideo)}"></video>`;
}

const BLOCK_REGISTRY = {

  // ============================================================
  // LAYOUT
  // ============================================================

  section: {
    label: 'Section', icon: '▣', category: 'layout',
    canHaveChildren: true,
    defaultProps: {
      backgroundType: 'none', backgroundColor: '#FFFFFF',
      padding: '80px 24px', maxWidth: '', fullWidth: true,
      overlayColor: '', overlayOpacity: 50,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'scroll',
      gradientType: 'linear', gradientAngle: 135, gradientStops: ['#667eea', '#764ba2'],
      backgroundVideo: '', videoAutoplay: true, videoMuted: true, videoLoop: true, videoPoster: ''
    },
    fields: [],
    render(p, children) {
      const bgStyle = buildBackgroundCSS(p);
      const pad = p.padding || '80px 24px';
      const maxWidth = p.maxWidth ? `max-width:${p.maxWidth};margin:0 auto;` : '';
      const isVisual = p.backgroundType === 'image' || p.backgroundType === 'video';
      const inner = `<div style="${maxWidth}position:relative;z-index:2;">${children}</div>`;
      return `<section class="sb-section" style="${bgStyle}padding:${pad};position:relative;${p.fullWidth === false ? 'max-width:' + (p.maxWidth || '1200px') + ';margin:0 auto;' : ''}overflow:hidden;">
        ${buildVideoBG(p)}
        ${isVisual ? buildOverlay(p) : ''}
        ${inner}
      </section>`;
    }
  },

  'html-element': {
    label: 'HTML Element', icon: '</>', category: 'advanced',
    canHaveChildren: true,
    defaultProps: { tag: 'div', text: '', href: '', target: '_self', title: '' },
    fields: [
      { key: 'tag', label: 'Semantic HTML tag', type: 'select', options: [
        {value:'div',label:'div'}, {value:'section',label:'section'}, {value:'article',label:'article'},
        {value:'header',label:'header'}, {value:'footer',label:'footer'}, {value:'main',label:'main'},
        {value:'nav',label:'nav'}, {value:'aside',label:'aside'}, {value:'span',label:'span'},
        {value:'p',label:'p'}, {value:'h1',label:'h1'}, {value:'h2',label:'h2'}, {value:'h3',label:'h3'},
        {value:'h4',label:'h4'}, {value:'h5',label:'h5'}, {value:'h6',label:'h6'}, {value:'a',label:'a'},
        {value:'button',label:'button'}, {value:'blockquote',label:'blockquote'}, {value:'figure',label:'figure'},
        {value:'figcaption',label:'figcaption'}, {value:'ul',label:'ul'}, {value:'ol',label:'ol'}, {value:'li',label:'li'}
      ]},
      { key: 'text', label: 'Text (optional)', type: 'textarea' },
      { key: 'href', label: 'Link URL (for anchor tag)', type: 'url' },
      { key: 'target', label: 'Link target', type: 'select', options: [{value:'_self',label:'Same tab'},{value:'_blank',label:'New tab'}] },
      { key: 'title', label: 'Title attribute', type: 'text' }
    ],
    render(p, children) {
      const allowed = ['div','section','article','header','footer','main','nav','aside','span','p','h1','h2','h3','h4','h5','h6','a','button','blockquote','figure','figcaption','ul','ol','li'];
      const tag = allowed.includes(p.tag) ? p.tag : 'div';
      const attrs = p.title ? ` title="${escapeHtml(p.title)}"` : '';
      if (tag === 'a') return `<a href="${safeUrl(p.href || '#')}" target="${p.target === '_blank' ? '_blank' : '_self'}"${p.target === '_blank' ? ' rel="noopener noreferrer"' : ''}${attrs}>${escapeHtml(p.text || '')}${children}</a>`;
      if (tag === 'button') return `<button type="button"${attrs}>${escapeHtml(p.text || '')}${children}</button>`;
      return `<${tag}${attrs}>${escapeHtml(p.text || '')}${children}</${tag}>`;
    }
  },

  container: {
    label: 'Container', icon: '□', category: 'layout',
    canHaveChildren: true,
    defaultProps: { maxWidth: '1200px', padding: '0', align: 'center' },
    fields: [
      { key: 'maxWidth', label: 'Max width', type: 'text' },
      { key: 'padding', label: 'Padding', type: 'text' }
    ],
    render(p, children) {
      return `<div class="sb-container" style="max-width:${escapeHtml(p.maxWidth || '1200px')};margin:0 auto;padding:${escapeHtml(p.padding || '0')};">${children}</div>`;
    }
  },

  flex: {
    label: 'Flex', icon: '⇔', category: 'layout',
    canHaveChildren: true,
    defaultProps: {
      direction: 'row', justify: 'flex-start', align: 'stretch',
      wrap: 'nowrap', gap: '24px'
    },
    fields: [
      { key: 'direction', label: 'Direction', type: 'select', options: [
        { value: 'row', label: 'Row (horizontal)' },
        { value: 'column', label: 'Column (vertical)' },
        { value: 'row-reverse', label: 'Row reversed' },
        { value: 'column-reverse', label: 'Column reversed' }
      ]},
      { key: 'justify', label: 'Justify', type: 'select', options: [
        { value: 'flex-start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'flex-end', label: 'End' },
        { value: 'space-between', label: 'Space between' },
        { value: 'space-around', label: 'Space around' },
        { value: 'space-evenly', label: 'Space evenly' }
      ]},
      { key: 'align', label: 'Align items', type: 'select', options: [
        { value: 'stretch', label: 'Stretch' },
        { value: 'flex-start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'flex-end', label: 'End' },
        { value: 'baseline', label: 'Baseline' }
      ]},
      { key: 'wrap', label: 'Wrap', type: 'select', options: [
        { value: 'nowrap', label: 'No wrap' },
        { value: 'wrap', label: 'Wrap' },
        { value: 'wrap-reverse', label: 'Wrap reversed' }
      ]},
      { key: 'gap', label: 'Gap', type: 'text' }
    ],
    render(p, children) {
      return `<div class="sb-flex" style="display:flex;flex-direction:${escapeHtml(p.direction || 'row')};justify-content:${escapeHtml(p.justify || 'flex-start')};align-items:${escapeHtml(p.align || 'stretch')};flex-wrap:${escapeHtml(p.wrap || 'nowrap')};gap:${escapeHtml(p.gap || '24px')};">${children}</div>`;
    }
  },

  grid: {
    label: 'Grid', icon: '▦', category: 'layout',
    canHaveChildren: true,
    defaultProps: {
      columns: 3, rows: 'auto', gap: '24px',
      justifyItems: 'stretch', alignItems: 'stretch', autoFlow: 'row'
    },
    fields: [
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 12 },
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'justifyItems', label: 'Justify items', type: 'select', options: [
        { value: 'stretch', label: 'Stretch' },
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' }
      ]},
      { key: 'alignItems', label: 'Align items', type: 'select', options: [
        { value: 'stretch', label: 'Stretch' },
        { value: 'start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'End' }
      ]},
      { key: 'autoFlow', label: 'Auto flow', type: 'select', options: [
        { value: 'row', label: 'Row' },
        { value: 'column', label: 'Column' },
        { value: 'dense', label: 'Dense' }
      ]}
    ],
    render(p, children) {
      const cols = Math.max(1, Math.min(12, p.columns || 3));
      return `<div class="sb-grid" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${escapeHtml(p.gap || '24px')};justify-items:${escapeHtml(p.justifyItems || 'stretch')};align-items:${escapeHtml(p.alignItems || 'stretch')};grid-auto-flow:${escapeHtml(p.autoFlow || 'row')};">${children}</div>`;
    }
  },

  stack: {
    label: 'Stack', icon: '☰', category: 'layout',
    canHaveChildren: true,
    defaultProps: { direction: 'column', gap: '16px', align: 'stretch', reverse: false },
    fields: [
      { key: 'direction', label: 'Direction', type: 'select', options: [
        { value: 'column', label: 'Vertical' },
        { value: 'row', label: 'Horizontal' }
      ]},
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'align', label: 'Align', type: 'select', options: [
        { value: 'stretch', label: 'Stretch' },
        { value: 'flex-start', label: 'Start' },
        { value: 'center', label: 'Center' },
        { value: 'flex-end', label: 'End' }
      ]},
      { key: 'reverse', label: 'Reverse order', type: 'checkbox' }
    ],
    render(p, children) {
      const dir = p.reverse ? (p.direction === 'column' ? 'column-reverse' : 'row-reverse') : (p.direction || 'column');
      return `<div class="sb-stack" style="display:flex;flex-direction:${escapeHtml(dir)};gap:${escapeHtml(p.gap || '16px')};align-items:${escapeHtml(p.align || 'stretch')};">${children}</div>`;
    }
  },

  spacer: {
    label: 'Spacer', icon: '↕', category: 'layout',
    defaultProps: { height: '40px' },
    fields: [
      { key: 'height', label: 'Height', type: 'text' }
    ],
    render(p) {
      const h = p.height || '40px';
      return `<div style="height:${escapeHtml(h)};"></div>`;
    }
  },

  divider: {
    label: 'Divider', icon: '—', category: 'layout',
    defaultProps: { color: '#E0E0E0', thickness: '1px', style: 'solid', width: '100%', align: 'center' },
    fields: [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'thickness', label: 'Thickness', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' }
      ]},
      { key: 'width', label: 'Width', type: 'text' },
      { key: 'align', label: 'Align', type: 'align' }
    ],
    render(p) {
      const margin = p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin:0 0 0 auto;' : '';
      return `<div style="width:${escapeHtml(p.width || '100%')};${margin}"><hr style="border:none;border-top:${escapeHtml(p.thickness || '1px')} ${escapeHtml(p.style || 'solid')} ${escapeHtml(p.color || '#E0E0E0')};margin:0;"></div>`;
    }
  },

  // ============================================================
  // TYPOGRAPHY
  // ============================================================

  heading: {
    label: 'Heading', icon: 'H', category: 'typography',
    defaultProps: { text: 'Section heading', level: 'h2', tag: 'h2' },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'level', label: 'Size', type: 'select', options: [
        { value: 'h1', label: 'Heading 1 (48px)' },
        { value: 'h2', label: 'Heading 2 (36px)' },
        { value: 'h3', label: 'Heading 3 (28px)' },
        { value: 'h4', label: 'Heading 4 (22px)' },
        { value: 'h5', label: 'Heading 5 (18px)' },
        { value: 'h6', label: 'Heading 6 (16px)' }
      ]},
      { key: 'tag', label: 'HTML tag', type: 'select', options: [
        { value: 'h1', label: 'H1' }, { value: 'h2', label: 'H2' }, { value: 'h3', label: 'H3' },
        { value: 'h4', label: 'H4' }, { value: 'h5', label: 'H5' }, { value: 'h6', label: 'H6' },
        { value: 'p', label: 'Paragraph' }, { value: 'div', label: 'Div' }
      ]}
    ],
    render(p) {
      const tag = p.tag || p.level || 'h2';
      const sizes = { h1: '48px', h2: '36px', h3: '28px', h4: '22px', h5: '18px', h6: '16px' };
      const size = sizes[p.level] || '36px';
      return `<${tag} style="font-size:${size};font-weight:700;line-height:1.2;margin:0;">${escapeHtml(p.text || '')}</${tag}>`;
    }
  },

  text: {
    label: 'Text', icon: 'T', category: 'typography',
    defaultProps: { text: 'Write a paragraph of body copy here. Supports **bold**, *italic*, `code`, and [links](https://example.com).' },
    fields: [
      { key: 'text', label: 'Text (supports **bold**, *italic*, `code`, [link](url))', type: 'textarea' }
    ],
    render(p) {
      return `<p style="margin:0;line-height:1.6;">${richText(p.text || '')}</p>`;
    }
  },

  'rich-text': {
    label: 'Rich Text', icon: '¶', category: 'typography',
    defaultProps: { html: '<p>Rich text content with <strong>bold</strong>, <em>italic</em>, and <a href="#">links</a>.</p>' },
    fields: [
      { key: 'html', label: 'HTML content (sanitized on publish)', type: 'textarea' }
    ],
    render(p) {
      // Basic sanitization for editor preview
      let html = String(p.html || '');
      html = html.replace(/<script\b[^>]*>.*?<\/script>/gis, '');
      html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
      html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
      return `<div class="sb-rich-text" style="line-height:1.7;">${html}</div>`;
    }
  },

  list: {
    label: 'List', icon: '≡', category: 'typography',
    defaultProps: {
      items: 'First item|Second item|Third item',
      ordered: false, style: 'disc'
    },
    fields: [
      { key: 'items', label: 'Items (one per line or | separated)', type: 'textarea' },
      { key: 'ordered', label: 'Ordered (numbered)', type: 'checkbox' },
      { key: 'style', label: 'Bullet style', type: 'select', options: [
        { value: 'disc', label: '● Disc' },
        { value: 'circle', label: '○ Circle' },
        { value: 'square', label: '■ Square' },
        { value: 'none', label: 'None' }
      ]}
    ],
    render(p) {
      const items = String(p.items || '').split(/[|\n]/).map(s => s.trim()).filter(Boolean);
      const tag = p.ordered ? 'ol' : 'ul';
      const listStyle = p.style || 'disc';
      const itemsHtml = items.map(item => `<li>${richText(item)}</li>`).join('');
      return `<${tag} style="margin:0;padding-left:1.5em;list-style-type:${escapeHtml(listStyle)};line-height:1.8;">${itemsHtml}</${tag}>`;
    }
  },

  blockquote: {
    label: 'Quote', icon: '"', category: 'typography',
    defaultProps: { text: 'This is a great quote that inspires action.', author: 'Author Name', align: 'left' },
    fields: [
      { key: 'text', label: 'Quote text', type: 'textarea' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'align' }
    ],
    render(p) {
      return `<blockquote style="margin:0;padding:20px 24px;border-left:4px solid #146EF5;background:#F8FAFC;font-style:italic;font-size:1.1em;text-align:${escapeHtml(p.align || 'left')};">
        <p style="margin:0 0 8px 0;">${escapeHtml(p.text || '')}</p>
        ${p.author ? `<cite style="font-style:normal;font-size:0.85em;color:#64748B;">— ${escapeHtml(p.author)}</cite>` : ''}
      </blockquote>`;
    }
  },

  code: {
    label: 'Code Block', icon: '{ }', category: 'typography',
    defaultProps: { code: 'function hello() {\n  console.log("Hello, world!");\n}', language: 'javascript' },
    fields: [
      { key: 'code', label: 'Code', type: 'textarea' },
      { key: 'language', label: 'Language', type: 'text' }
    ],
    render(p) {
      return `<pre style="margin:0;padding:20px;background:#1E293B;color:#E2E8F0;border-radius:8px;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:14px;line-height:1.5;"><code>${escapeHtml(p.code || '')}</code></pre>`;
    }
  },

  // ============================================================
  // MEDIA
  // ============================================================

  image: {
    label: 'Image', icon: '🖼', category: 'media',
    defaultProps: { src: '', alt: '', caption: '', width: '100%', height: 'auto', objectFit: 'cover', objectPosition: '50% 50%', mobileSrc: '', tabletSrc: '', srcset: '', sizes: '100vw', lightbox: false, lazy: true, borderRadius: '0px' },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'width', label: 'Width', type: 'text' },
      { key: 'height', label: 'Height', type: 'text' },
      { key: 'objectFit', label: 'Object fit', type: 'select', options: [
        { value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' },
        { value: 'fill', label: 'Fill' }, { value: 'none', label: 'None' }
      ]},
      { key: 'objectPosition', label: 'Focal point (e.g. 50% 35%)', type: 'text' },
      { key: 'tabletSrc', label: 'Tablet image URL (optional)', type: 'url' },
      { key: 'mobileSrc', label: 'Mobile image URL (optional)', type: 'url' },
      { key: 'srcset', label: 'Responsive srcset (optional)', type: 'text', placeholder: 'image-800.webp 800w, image-1600.webp 1600w' },
      { key: 'sizes', label: 'Responsive sizes', type: 'text', placeholder: '(max-width: 600px) 100vw, 50vw' },
      { key: 'borderRadius', label: 'Border radius', type: 'text' },
      { key: 'lightbox', label: 'Lightbox on click', type: 'checkbox' },
      { key: 'lazy', label: 'Lazy loading', type: 'checkbox' }
    ],
    render(p) {
      if (!p.src) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Click to add an image</div>`;
      }
      const lazy = p.lazy !== false ? ' loading="lazy"' : '';
      const sources = `${p.tabletSrc ? `<source media="(max-width: 991px)" srcset="${safeUrl(p.tabletSrc)}">` : ''}${p.mobileSrc ? `<source media="(max-width: 479px)" srcset="${safeUrl(p.mobileSrc)}">` : ''}`;
      const srcset = p.srcset ? ` srcset="${escapeHtml(p.srcset)}"` : '';
      const sizes = p.sizes ? ` sizes="${escapeHtml(p.sizes)}"` : '';
      let img = `<picture>${sources}<img src="${safeUrl(p.src)}"${srcset}${sizes} alt="${escapeHtml(p.alt || '')}"${lazy} decoding="async" style="width:${escapeHtml(p.width || '100%')};height:${escapeHtml(p.height || 'auto')};object-fit:${escapeHtml(p.objectFit || 'cover')};object-position:${escapeHtml(p.objectPosition || '50% 50%')};border-radius:${escapeHtml(p.borderRadius || '0px')};display:block;"></picture>`;
      if (p.lightbox) img = `<a href="${safeUrl(p.src)}" data-sb-lightbox data-lightbox-alt="${escapeHtml(p.alt || '')}" style="display:block;cursor:zoom-in;">${img}</a>`;
      if (p.caption) {
        return `<figure style="margin:0;">${img}<figcaption style="text-align:center;font-size:0.85em;color:#64748B;padding:8px 0;">${escapeHtml(p.caption)}</figcaption></figure>`;
      }
      return img;
    }
  },

  'image-gallery': {
    label: 'Gallery', icon: '▦', category: 'media',
    defaultProps: {
      images: [],
      columns: 3, gap: '12px', aspectRatio: '1/1',
      borderRadius: '8px', lightbox: true, captions: false
    },
    fields: [
      { key: 'images', label: 'Images', type: 'gallery' },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 6 },
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: [
        { value: '1/1', label: 'Square' }, { value: '16/9', label: '16:9' },
        { value: '4/3', label: '4:3' }, { value: '3/2', label: '3:2' }, { value: 'auto', label: 'Auto' }
      ]},
      { key: 'borderRadius', label: 'Border radius', type: 'text' },
      { key: 'lightbox', label: 'Lightbox on click', type: 'checkbox' }
    ],
    render(p) {
      const images = Array.isArray(p.images) ? p.images : [];
      if (images.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add images in the panel →</div>`;
      }
      const cols = Math.max(1, Math.min(6, p.columns || 3));
      const cells = images.map((img, i) =>
        `<div style="position:relative;overflow:hidden;border-radius:${escapeHtml(p.borderRadius || '8px')};aspect-ratio:${escapeHtml(p.aspectRatio || '1/1')};cursor:${p.lightbox !== false ? 'zoom-in' : 'default'};">
          ${p.lightbox !== false ? `<a href="${safeUrl(img.src)}" data-sb-lightbox data-lightbox-alt="${escapeHtml(img.alt || '')}" style="display:block;width:100%;height:100%;"><img src="${safeUrl(img.src)}" alt="${escapeHtml(img.alt || '')}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;"></a>` : `<img src="${safeUrl(img.src)}" alt="${escapeHtml(img.alt || '')}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">`}
        </div>`
      ).join('');
      return `<div class="sb-gallery" style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${escapeHtml(p.gap || '12px')};">${cells}</div>`;
    }
  },

  video: {
    label: 'Video', icon: '▶', category: 'media',
    defaultProps: { src: '', poster: '', autoplay: false, muted: false, loop: false, controls: true, width: '100%', aspectRatio: '16/9' },
    fields: [
      { key: 'src', label: 'Video URL (MP4/WebM)', type: 'url' },
      { key: 'poster', label: 'Poster image', type: 'image' },
      { key: 'autoplay', label: 'Autoplay', type: 'checkbox' },
      { key: 'muted', label: 'Muted', type: 'checkbox' },
      { key: 'loop', label: 'Loop', type: 'checkbox' },
      { key: 'controls', label: 'Show controls', type: 'checkbox' },
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' },
        { value: '1/1', label: 'Square' }, { value: '21/9', label: 'Cinematic' }
      ]}
    ],
    render(p) {
      if (!p.src) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add a video URL →</div>`;
      }
      const attrs = [
        p.controls !== false ? 'controls' : '',
        p.autoplay ? 'autoplay' : '',
        p.muted ? 'muted' : '',
        p.loop ? 'loop' : '',
        'playsinline'
      ].filter(Boolean).join(' ');
      const poster = p.poster ? ` poster="${safeUrl(p.poster)}"` : '';
      return `<video ${attrs}${poster} style="width:100%;aspect-ratio:${escapeHtml(p.aspectRatio || '16/9')};background:#000;border-radius:8px;display:block;" src="${safeUrl(p.src)}"></video>`;
    }
  },

  'video-embed': {
    label: 'Video Embed', icon: '⧉', category: 'media',
    defaultProps: { url: '', aspectRatio: '16/9', autoplay: false, loop: false, controls: true },
    fields: [
      { key: 'url', label: 'YouTube/Vimeo URL', type: 'url' },
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: '1/1', label: 'Square' }
      ]}
    ],
    render(p) {
      if (!p.url) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Paste a YouTube or Vimeo URL →</div>`;
      }
      let embedUrl = '';
      const ytMatch = p.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/);
      const vimeoMatch = p.url.match(/vimeo\.com\/(\d+)/);
      if (ytMatch) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
      } else if (vimeoMatch) {
        embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      } else {
        embedUrl = p.url;
      }
      return `<iframe src="${safeUrl(embedUrl)}" style="width:100%;aspect-ratio:${escapeHtml(p.aspectRatio || '16/9')};border:none;border-radius:8px;display:block;" allowfullscreen loading="lazy"></iframe>`;
    }
  },

  'shape-image': {
    label: 'Shape Image', icon: '◐', category: 'media',
    defaultProps: {
      src: '', alt: '', text: 'Text wraps naturally around the shape using CSS shape-outside, creating a clean editorial layout. Replace this text and the image to build magazine-style content sections that adapt beautifully across screen sizes.',
      shape: 'circle(50% at 50% 50%)', float: 'left', width: '42%', margin: '16px', borderRadius: '0px'
    },
    fields: [
      { key: 'src', label: 'Image', type: 'image' },
      { key: 'alt', label: 'Alt text', type: 'text' },
      { key: 'text', label: 'Wrapping text', type: 'textarea' },
      { key: 'shape', label: 'Shape', type: 'select', options: [
        { value: 'circle(50% at 50% 50%)', label: 'Circle' },
        { value: 'ellipse(45% 55% at 50% 50%)', label: 'Ellipse' },
        { value: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', label: 'Diamond' },
        { value: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)', label: 'Home Plate' },
        { value: 'inset(8% 8% 8% 8% round 24px)', label: 'Rounded Box' },
        { value: 'none', label: 'None (rectangle)' }
      ]},
      { key: 'float', label: 'Float', type: 'select', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }
      ]},
      { key: 'width', label: 'Image width', type: 'text' },
      { key: 'margin', label: 'Wrap margin', type: 'text' },
      { key: 'borderRadius', label: 'Border radius', type: 'text' }
    ],
    render(p) {
      if (!p.src) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Click to add a shape image</div>`;
      }
      const float = p.float === 'right' ? 'right' : 'left';
      const shape = (!p.shape || p.shape === 'none') ? '' : `shape-outside:${escapeHtml(p.shape)};shape-margin:${escapeHtml(p.margin || '16px')};`;
      const sideMargin = float === 'left' ? `margin-right:${escapeHtml(p.margin || '16px')};` : `margin-left:${escapeHtml(p.margin || '16px')};`;
      return `<div class="sb-shape-image" style="overflow:hidden;">
        <div style="float:${float};width:${escapeHtml(p.width || '42%')};${shape}${sideMargin}margin-top:${escapeHtml(p.margin || '16px')};margin-bottom:${escapeHtml(p.margin || '16px')};">
          <img src="${safeUrl(p.src)}" alt="${escapeHtml(p.alt || '')}" loading="lazy" style="width:100%;border-radius:${escapeHtml(p.borderRadius || '0px')};display:block;">
        </div>
        <p style="margin:0;line-height:1.7;">${escapeHtml(p.text || '')}</p>
      </div>`;
    }
  },

  icon: {
    label: 'Icon', icon: '★', category: 'media',
    defaultProps: { icon: '⭐', size: '32px', color: '#146EF5', backgroundColor: '', borderRadius: '0', url: '' },
    fields: [
      { key: 'icon', label: 'Icon (emoji or unicode)', type: 'text' },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'backgroundColor', label: 'Background color', type: 'color' },
      { key: 'borderRadius', label: 'Border radius', type: 'text' },
      { key: 'url', label: 'Link (optional)', type: 'url' }
    ],
    render(p) {
      const bg = p.backgroundColor ? `background:${p.backgroundColor};` : '';
      const inner = `<span style="font-size:${escapeHtml(p.size || '32px')};color:${escapeHtml(p.color || '#146EF5')};${bg}border-radius:${escapeHtml(p.borderRadius || '0')};display:inline-flex;align-items:center;justify-content:center;${bg ? 'width:calc(' + escapeHtml(p.size || '32px') + ' * 1.5);height:calc(' + escapeHtml(p.size || '32px') + ' * 1.5);' : ''}">${escapeHtml(p.icon || '⭐')}</span>`;
      if (p.url) {
        return `<a href="${safeUrl(p.url)}" style="display:inline-block;text-decoration:none;">${inner}</a>`;
      }
      return inner;
    }
  },

  beforeafter: {
    label: 'Before/After', icon: '◫', category: 'media',
    defaultProps: { beforeImage: '', afterImage: '', beforeLabel: 'Before', afterLabel: 'After', initialPosition: 50 },
    fields: [
      { key: 'beforeImage', label: 'Before image', type: 'image' },
      { key: 'afterImage', label: 'After image', type: 'image' },
      { key: 'beforeLabel', label: 'Before label', type: 'text' },
      { key: 'afterLabel', label: 'After label', type: 'text' },
      { key: 'initialPosition', label: 'Initial position (%)', type: 'number', min: 0, max: 100 }
    ],
    render(p) {
      if (!p.beforeImage || !p.afterImage) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add both before and after images →</div>`;
      }
      const pos = p.initialPosition || 50;
      return `<div class="sb-beforeafter" style="position:relative;overflow:hidden;border-radius:8px;user-select:none;" data-position="${pos}">
        <img src="${safeUrl(p.afterImage)}" alt="After" style="width:100%;display:block;">
        <div style="position:absolute;inset:0;width:${pos}%;overflow:hidden;">
          <img src="${safeUrl(p.beforeImage)}" alt="Before" style="width:100vw;max-width:none;display:block;">
        </div>
        <div style="position:absolute;top:0;bottom:0;left:${pos}%;width:3px;background:#fff;cursor:ew-resize;transform:translateX(-50%);z-index:2;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">⟷</div>
        </div>
      </div>`;
    }
  },

  // ============================================================
  // INTERACTIVE
  // ============================================================

  slider: {
    label: 'Slider', icon: '◧', category: 'interactive',
    defaultProps: {
      slides: [],
      autoplay: true, interval: 5000, infinite: true,
      arrows: true, dots: true, transition: 'slide', aspectRatio: '16/9'
    },
    fields: [
      { key: 'slides', label: 'Slides', type: 'slides' },
      { key: 'transition', label: 'Transition', type: 'select', options: [
        { value: 'slide', label: 'Slide' }, { value: 'fade', label: 'Fade' }, { value: 'zoom', label: 'Zoom' }
      ]},
      { key: 'autoplay', label: 'Autoplay', type: 'checkbox' },
      { key: 'interval', label: 'Interval (ms)', type: 'number', min: 1000, max: 30000 },
      { key: 'infinite', label: 'Infinite loop', type: 'checkbox' },
      { key: 'arrows', label: 'Show arrows', type: 'checkbox' },
      { key: 'dots', label: 'Show dots', type: 'checkbox' },
      { key: 'aspectRatio', label: 'Aspect ratio', type: 'select', options: [
        { value: '16/9', label: '16:9' }, { value: '4/3', label: '4:3' }, { value: '1/1', label: 'Square' }, { value: 'auto', label: 'Auto' }
      ]}
    ],
    render(p) {
      const slides = Array.isArray(p.slides) ? p.slides : [];
      if (slides.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add slides in the panel →</div>`;
      }
      const slideHtml = slides.map((slide, i) => {
        if (slide.image) {
          return `<div class="sb-slide" style="min-width:100%;height:100%;position:relative;">
            <img src="${safeUrl(slide.image)}" alt="${escapeHtml(slide.alt || '')}" style="width:100%;height:100%;aspect-ratio:unset;object-fit:cover;display:block;">
            ${slide.heading || slide.text ? `<div style="position:absolute;bottom:0;left:0;right:0;padding:40px;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:#fff;">
              ${slide.heading ? `<h3 style="margin:0 0 8px 0;">${escapeHtml(slide.heading)}</h3>` : ''}
              ${slide.text ? `<p style="margin:0;">${escapeHtml(slide.text)}</p>` : ''}
            </div>` : ''}
          </div>`;
        }
        return `<div class="sb-slide" style="min-width:100%;height:100%;padding:40px;background:#F8FAFC;display:flex;align-items:center;justify-content:center;aspect-ratio:${escapeHtml(p.aspectRatio || '16/9')};">
          <div style="text-align:center;">
            ${slide.heading ? `<h3 style="margin:0 0 8px 0;">${escapeHtml(slide.heading)}</h3>` : ''}
            ${slide.text ? `<p style="margin:0;color:#64748B;">${escapeHtml(slide.text)}</p>` : ''}
          </div>
        </div>`;
      }).join('');

      const dotsHtml = p.dots !== false ? `<div style="display:flex;justify-content:center;gap:8px;padding:12px 0;">
        ${slides.map((_, i) => `<button type="button" class="sb-slider-dot" data-index="${i}" aria-label="Go to slide ${i + 1}" aria-current="${i === 0 ? 'true' : 'false'}" style="width:10px;height:10px;border:0;border-radius:50%;background:${i === 0 ? '#146EF5' : '#CBD5E1'};display:inline-block;cursor:pointer;padding:0;"></button>`).join('')}
      </div>` : '';

      const arrowsHtml = p.arrows !== false ? `
        <button type="button" aria-label="Previous slide" class="sb-slider-prev" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:none;cursor:pointer;z-index:2;font-size:18px;">←</button>
        <button type="button" aria-label="Next slide" class="sb-slider-next" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:none;cursor:pointer;z-index:2;font-size:18px;">→</button>
      ` : '';

      return `<div class="sb-slider" data-transition="${escapeHtml(p.transition || 'slide')}" data-autoplay="${p.autoplay !== false}" data-interval="${Number(p.interval || 5000)}" data-infinite="${p.infinite !== false}" style="position:relative;overflow:hidden;border-radius:8px;${p.aspectRatio && p.aspectRatio !== 'auto' ? 'aspect-ratio:' + escapeHtml(p.aspectRatio) + ';' : ''}">
        <div class="sb-slider-track" style="display:flex;height:100%;transition:transform 0.5s ease;">${slideHtml}</div>
        ${arrowsHtml}
        ${dotsHtml}
      </div>`;
    }
  },

  accordion: {
    label: 'Accordion', icon: '☰', category: 'interactive',
    defaultProps: {
      items: JSON.stringify([
        { q: 'What is this?', a: 'An accordion component.' },
        { q: 'How does it work?', a: 'Click to expand and collapse items.' }
      ]),
      openFirst: true, allowMultiple: false
    },
    fields: [
      { key: 'items', label: 'Items (JSON: [{q, a}, ...])', type: 'json-editor' },
      { key: 'openFirst', label: 'Open first item by default', type: 'checkbox' },
      { key: 'allowMultiple', label: 'Allow multiple open', type: 'checkbox' }
    ],
    render(p) {
      let items = [];
      try { items = JSON.parse(p.items || '[]'); } catch(e) { items = []; }
      if (!Array.isArray(items) || items.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add FAQ items in the panel →</div>`;
      }
      const html = items.map((item, i) => {
        const isOpen = p.openFirst !== false && i === 0;
        return `<div class="sb-accordion-item" style="border:1px solid #E2E8F0;border-radius:8px;margin-bottom:8px;overflow:hidden;">
          <button class="sb-accordion-trigger" style="width:100%;padding:16px 20px;background:#fff;border:none;text-align:left;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:inherit;color:inherit;">
            <span>${escapeHtml(item.q || 'Question')}</span>
            <span style="transition:transform 0.2s;transform:rotate(${isOpen ? '180' : '0'}deg);">▼</span>
          </button>
          <div class="sb-accordion-content" style="max-height:${isOpen ? '200' : '0'}px;overflow:hidden;transition:max-height 0.3s ease;">
            <div style="padding:0 20px 16px;color:#64748B;">${escapeHtml(item.a || '')}</div>
          </div>
        </div>`;
      }).join('');
      return `<div class="sb-accordion">${html}</div>`;
    }
  },

  tabs: {
    label: 'Tabs', icon: '⊞', category: 'interactive',
    defaultProps: {
      tabs: JSON.stringify([
        { title: 'Tab 1', content: 'Content for tab 1' },
        { title: 'Tab 2', content: 'Content for tab 2' },
        { title: 'Tab 3', content: 'Content for tab 3' }
      ]),
      style: 'underline', position: 'top'
    },
    fields: [
      { key: 'tabs', label: 'Tabs (JSON: [{title, content}, ...])', type: 'json-editor' },
      { key: 'style', label: 'Tab style', type: 'select', options: [
        { value: 'underline', label: 'Underline' },
        { value: 'pills', label: 'Pills' },
        { value: 'boxed', label: 'Boxed' }
      ]}
    ],
    render(p) {
      let tabs = [];
      try { tabs = JSON.parse(p.tabs || '[]'); } catch(e) { tabs = []; }
      if (!Array.isArray(tabs) || tabs.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add tabs in the panel →</div>`;
      }
      const activeBg = p.style === 'pills' ? 'background:#146EF5;color:#fff;border-radius:6px;' : p.style === 'boxed' ? 'background:#F1F5F9;border-radius:6px 6px 0 0;' : 'border-bottom:2px solid #146EF5;color:#146EF5;';
      const tabHeaders = tabs.map((tab, i) =>
        `<button style="padding:10px 20px;background:none;border:none;cursor:pointer;font-size:inherit;color:${i === 0 ? (p.style === 'underline' ? '#146EF5' : '#fff') : '#64748B'};font-weight:${i === 0 ? '600' : '400'};${i === 0 ? activeBg : ''}">${escapeHtml(tab.title || 'Tab')}</button>`
      ).join('');
      const activeContent = tabs[0] ? tabs[0].content : '';
      return `<div class="sb-tabs">
        <div style="display:flex;gap:4px;border-bottom:${p.style === 'underline' ? '1px solid #E2E8F0' : 'none'};">${tabHeaders}</div>
        <div style="padding:20px 0;">${escapeHtml(activeContent || '')}</div>
      </div>`;
    }
  },

  // ============================================================
  // FORMS
  // ============================================================

  form: {
    label: 'Form', icon: '✉', category: 'forms',
    canHaveChildren: true,
    defaultProps: {
      submitMethod: 'email', recipient: '', successMessage: 'Thank you! We\'ll be in touch.',
      redirectUrl: '', formId: ''
    },
    fields: [
      { key: 'submitMethod', label: 'Submit to', type: 'select', options: [
        { value: 'email', label: 'Email' },
        { value: 'webhook', label: 'Webhook URL' },
        { value: 'database', label: 'Store in database' }
      ]},
      { key: 'recipient', label: 'Email / Webhook URL', type: 'text' },
      { key: 'successMessage', label: 'Success message', type: 'text' },
      { key: 'redirectUrl', label: 'Redirect after submit (optional)', type: 'url' }
    ],
    render(p, children) {
      return `<form class="sb-form" data-form-id="${escapeHtml(p.formId || '')}" style="display:flex;flex-direction:column;gap:16px;">
        ${children}
        <div class="sb-form-message" style="display:none;padding:12px;border-radius:6px;background:#F0FDF4;color:#166534;"></div>
      </form>`;
    }
  },

  input: {
    label: 'Input', icon: '▭', category: 'forms',
    defaultProps: { inputType: 'text', label: 'Label', placeholder: 'Enter text...', required: false, name: '', width: '100%' },
    fields: [
      { key: 'inputType', label: 'Type', type: 'select', options: [
        { value: 'text', label: 'Text' }, { value: 'email', label: 'Email' },
        { value: 'tel', label: 'Phone' }, { value: 'url', label: 'URL' },
        { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' },
        { value: 'password', label: 'Password' }
      ]},
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'placeholder', label: 'Placeholder', type: 'text' },
      { key: 'required', label: 'Required', type: 'checkbox' },
      { key: 'name', label: 'Field name (auto if empty)', type: 'text' },
      { key: 'width', label: 'Width', type: 'text' }
    ],
    render(p) {
      const name = p.name || p.inputType + '_' + Math.random().toString(36).slice(2, 6);
      return `<div style="width:${escapeHtml(p.width || '100%')};">
        ${p.label ? `<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">${escapeHtml(p.label)}${p.required ? ' *' : ''}</label>` : ''}
        <input type="${escapeHtml(p.inputType || 'text')}" name="${escapeHtml(name)}" placeholder="${escapeHtml(p.placeholder || '')}"${p.required ? ' required' : ''} style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;box-sizing:border-box;">
      </div>`;
    }
  },

  textarea: {
    label: 'Textarea', icon: '▤', category: 'forms',
    defaultProps: { label: 'Message', placeholder: 'Write your message...', required: false, rows: 4, name: '' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'placeholder', label: 'Placeholder', type: 'text' },
      { key: 'required', label: 'Required', type: 'checkbox' },
      { key: 'rows', label: 'Rows', type: 'number', min: 2, max: 20 },
      { key: 'name', label: 'Field name', type: 'text' }
    ],
    render(p) {
      const name = p.name || 'textarea_' + Math.random().toString(36).slice(2, 6);
      return `<div>
        ${p.label ? `<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">${escapeHtml(p.label)}${p.required ? ' *' : ''}</label>` : ''}
        <textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(p.placeholder || '')}" rows="${p.rows || 4}"${p.required ? ' required' : ''} style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical;"></textarea>
      </div>`;
    }
  },

  select: {
    label: 'Select', icon: '▼', category: 'forms',
    defaultProps: { label: 'Choose...', options: 'Option 1|Option 2|Option 3', required: false, name: '' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'options', label: 'Options (| separated)', type: 'textarea' },
      { key: 'required', label: 'Required', type: 'checkbox' },
      { key: 'name', label: 'Field name', type: 'text' }
    ],
    render(p) {
      const name = p.name || 'select_' + Math.random().toString(36).slice(2, 6);
      const options = String(p.options || '').split('|').map(s => s.trim()).filter(Boolean);
      const optionsHtml = options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      return `<div>
        ${p.label ? `<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">${escapeHtml(p.label)}${p.required ? ' *' : ''}</label>` : ''}
        <select name="${escapeHtml(name)}"${p.required ? ' required' : ''} style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;background:#fff;box-sizing:border-box;">
          <option value="">Select...</option>
          ${optionsHtml}
        </select>
      </div>`;
    }
  },

  'submit-button': {
    label: 'Submit Button', icon: '✓', category: 'forms',
    defaultProps: { text: 'Submit', align: 'left', fullWidth: false },
    fields: [
      { key: 'text', label: 'Button text', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'align' },
      { key: 'fullWidth', label: 'Full width', type: 'checkbox' }
    ],
    render(p) {
      const width = p.fullWidth ? 'width:100%;' : '';
      return `<div style="text-align:${escapeHtml(p.align || 'left')};">
        <button type="submit" style="${width}padding:12px 28px;background:#146EF5;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">${escapeHtml(p.text || 'Submit')}</button>
      </div>`;
    }
  },

  // ============================================================
  // MARKETING
  // ============================================================

  hero: {
    label: 'Hero', icon: '★', category: 'marketing',
    canHaveChildren: true,
    defaultProps: {
      heading: 'Build something amazing',
      subheading: 'A short supporting line that explains the value.',
      buttonText: 'Get started', buttonUrl: '#',
      secondaryButtonText: '', secondaryButtonUrl: '#',
      backgroundType: 'color', backgroundColor: '#1D2027',
      align: 'center', minHeight: '60vh', contentWidth: '800px',
      padding: '120px 24px',
      overlayColor: '', overlayOpacity: 40,
      backgroundSize: 'cover', backgroundPosition: 'center',
      gradientAngle: 135, gradientStops: ['#1a1a2e', '#16213e'],
      backgroundVideo: '', videoAutoplay: true, videoMuted: true, videoLoop: true, videoPoster: ''
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'textarea' },
      { key: 'buttonText', label: 'Primary button', type: 'text' },
      { key: 'buttonUrl', label: 'Primary button link', type: 'url' },
      { key: 'secondaryButtonText', label: 'Secondary button (optional)', type: 'text' },
      { key: 'secondaryButtonUrl', label: 'Secondary button link', type: 'url' },
      { key: 'align', label: 'Alignment', type: 'align' },
      { key: 'minHeight', label: 'Min height', type: 'text' },
      { key: 'contentWidth', label: 'Content max width', type: 'text' }
    ],
    render(p, children) {
      const bg = buildBackgroundCSS(p);
      const isVisual = p.backgroundType === 'image' || p.backgroundType === 'video';
      const btn = p.buttonText
        ? `<a href="${safeUrl(p.buttonUrl)}" style="display:inline-block;padding:14px 32px;background:#146EF5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${escapeHtml(p.buttonText)}</a>`
        : '';
      const btn2 = p.secondaryButtonText
        ? `<a href="${safeUrl(p.secondaryButtonUrl)}" style="display:inline-block;padding:14px 32px;background:transparent;color:inherit;border:2px solid currentColor;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${escapeHtml(p.secondaryButtonText)}</a>`
        : '';
      const buttons = btn || btn2 ? `<div style="display:flex;gap:16px;justify-content:${p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start'};margin-top:32px;flex-wrap:wrap;">${btn}${btn2}</div>` : '';
      return `<section class="sb-hero" style="${bg}min-height:${escapeHtml(p.minHeight || '60vh')};padding:${escapeHtml(p.padding || '120px 24px')};display:flex;align-items:center;justify-content:center;text-align:${escapeHtml(p.align || 'center')};position:relative;overflow:hidden;">
        ${buildVideoBG(p)}
        ${isVisual ? buildOverlay(p) : ''}
        <div style="max-width:${escapeHtml(p.contentWidth || '800px')};position:relative;z-index:2;width:100%;">
          ${children || `<h1 style="font-size:clamp(32px,5vw,56px);font-weight:800;margin:0 0 16px 0;line-height:1.1;color:inherit;">${escapeHtml(p.heading || '')}</h1>
          ${p.subheading ? `<p style="font-size:clamp(16px,2vw,20px);margin:0 0 8px 0;opacity:0.85;line-height:1.5;">${escapeHtml(p.subheading)}</p>` : ''}`}
          ${buttons}
        </div>
      </section>`;
    }
  },

  'cta-banner': {
    label: 'CTA Banner', icon: '📣', category: 'marketing',
    canHaveChildren: true,
    defaultProps: {
      heading: 'Ready to get started?',
      subheading: 'Join thousands of users today.',
      buttonText: 'Start now', buttonUrl: '#',
      backgroundType: 'gradient', gradientAngle: 135, gradientStops: ['#667eea', '#764ba2'],
      textColor: '#FFFFFF', align: 'center', padding: '60px 24px', borderRadius: '0px'
    },
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'subheading', label: 'Subheading', type: 'text' },
      { key: 'buttonText', label: 'Button text', type: 'text' },
      { key: 'buttonUrl', label: 'Button link', type: 'url' },
      { key: 'align', label: 'Alignment', type: 'align' },
      { key: 'textColor', label: 'Text color', type: 'color' },
      { key: 'padding', label: 'Padding', type: 'text' },
      { key: 'borderRadius', label: 'Border radius', type: 'text' }
    ],
    render(p, children) {
      const bg = buildBackgroundCSS(p);
      return `<section class="sb-cta" style="${bg}color:${escapeHtml(p.textColor || '#FFFFFF')};padding:${escapeHtml(p.padding || '60px 24px')};text-align:${escapeHtml(p.align || 'center')};border-radius:${escapeHtml(p.borderRadius || '0px')};">
        <div style="max-width:700px;margin:0 auto;">
          ${children || `<h2 style="font-size:32px;font-weight:700;margin:0 0 12px 0;">${escapeHtml(p.heading || '')}</h2>
          ${p.subheading ? `<p style="margin:0 0 24px 0;opacity:0.9;font-size:18px;">${escapeHtml(p.subheading)}</p>` : ''}
          ${p.buttonText ? `<a href="${safeUrl(p.buttonUrl)}" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,0.2);color:inherit;border:2px solid rgba(255,255,255,0.4);border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(p.buttonText)}</a>` : ''}`}
        </div>
      </section>`;
    }
  },

  'pricing-table': {
    label: 'Pricing Table', icon: '💲', category: 'marketing',
    defaultProps: {
      plans: JSON.stringify([
        { name: 'Starter', price: '$9', period: '/mo', features: 'Feature 1|Feature 2|Feature 3', buttonText: 'Choose', featured: false },
        { name: 'Pro', price: '$29', period: '/mo', features: 'All Starter features|Feature 4|Feature 5', buttonText: 'Choose', featured: true },
        { name: 'Enterprise', price: '$99', period: '/mo', features: 'All Pro features|Feature 6|Feature 7', buttonText: 'Contact us', featured: false }
      ]),
      columns: 3, gap: '24px', currency: '$'
    },
    fields: [
      { key: 'plans', label: 'Plans (JSON)', type: 'json-editor' },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 4 },
      { key: 'gap', label: 'Gap', type: 'text' }
    ],
    render(p) {
      let plans = [];
      try { plans = JSON.parse(p.plans || '[]'); } catch(e) { plans = []; }
      if (plans.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add pricing plans in the panel →</div>`;
      }
      const cols = Math.max(1, Math.min(4, p.columns || 3));
      const cards = plans.map(plan => {
        const features = String(plan.features || '').split('|').map(s => s.trim()).filter(Boolean);
        const featured = plan.featured;
        return `<div style="background:${featured ? '#146EF5' : '#fff'};color:${featured ? '#fff' : '#0F172A'};border:2px solid ${featured ? '#146EF5' : '#E2E8F0'};border-radius:12px;padding:32px;text-align:center;${featured ? 'transform:scale(1.05);' : ''}">
          <h3 style="margin:0 0 8px 0;font-size:18px;font-weight:600;">${escapeHtml(plan.name || 'Plan')}</h3>
          <div style="font-size:40px;font-weight:800;margin:16px 0;">${escapeHtml(plan.price || '$0')}<span style="font-size:16px;font-weight:400;opacity:0.7;">${escapeHtml(plan.period || '/mo')}</span></div>
          <ul style="list-style:none;padding:0;margin:24px 0;text-align:left;">
            ${features.map(f => `<li style="padding:8px 0;border-bottom:1px solid ${featured ? 'rgba(255,255,255,0.2)' : '#F1F5F9'};">✓ ${escapeHtml(f)}</li>`).join('')}
          </ul>
          <a href="#" style="display:block;padding:12px;background:${featured ? '#fff' : '#146EF5'};color:${featured ? '#146EF5' : '#fff'};border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(plan.buttonText || 'Choose')}</a>
        </div>`;
      }).join('');
      return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${escapeHtml(p.gap || '24px')};align-items:center;">${cards}</div>`;
    }
  },

  testimonial: {
    label: 'Testimonial', icon: '💬', category: 'marketing',
    defaultProps: {
      quote: 'This product changed the way we work. Highly recommended!',
      author: 'Jane Smith', role: 'CEO at Acme', avatar: '',
      rating: 5, layout: 'centered'
    },
    fields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'author', label: 'Author name', type: 'text' },
      { key: 'role', label: 'Author role', type: 'text' },
      { key: 'avatar', label: 'Avatar image', type: 'image' },
      { key: 'rating', label: 'Star rating (0-5)', type: 'number', min: 0, max: 5 },
      { key: 'layout', label: 'Layout', type: 'select', options: [
        { value: 'centered', label: 'Centered' },
        { value: 'side', label: 'Side by side' }
      ]}
    ],
    render(p) {
      const stars = '★'.repeat(Math.max(0, Math.min(5, p.rating || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, p.rating || 0)));
      const avatarHtml = p.avatar
        ? `<img src="${safeUrl(p.avatar)}" alt="${escapeHtml(p.author || '')}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:56px;height:56px;border-radius:50%;background:#146EF5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;">${escapeHtml((p.author || 'A').charAt(0))}</div>`;
      const starsHtml = `<div style="color:#F59E0B;font-size:18px;margin-bottom:12px;">${stars}</div>`;
      const authorHtml = `<div style="margin-top:16px;">
        <div style="font-weight:600;">${escapeHtml(p.author || 'Anonymous')}</div>
        ${p.role ? `<div style="font-size:14px;color:#64748B;">${escapeHtml(p.role)}</div>` : ''}
      </div>`;

      if (p.layout === 'side') {
        return `<div class="sb-testimonial" style="display:flex;gap:24px;align-items:flex-start;padding:24px;background:#F8FAFC;border-radius:12px;">
          ${avatarHtml}
          <div>
            ${starsHtml}
            <p style="margin:0;font-size:18px;line-height:1.6;font-style:italic;">"${escapeHtml(p.quote || '')}"</p>
            ${authorHtml}
          </div>
        </div>`;
      }
      return `<div class="sb-testimonial" style="text-align:center;padding:32px;background:#F8FAFC;border-radius:12px;">
        ${avatarHtml ? `<div style="margin-bottom:16px;display:flex;justify-content:center;">${avatarHtml}</div>` : ''}
        ${starsHtml}
        <p style="margin:0;font-size:18px;line-height:1.6;font-style:italic;">"${escapeHtml(p.quote || '')}"</p>
        ${authorHtml}
      </div>`;
    }
  },

  'feature-grid': {
    label: 'Feature Grid', icon: '⊞', category: 'marketing',
    defaultProps: {
      features: JSON.stringify([
        { icon: '⚡', title: 'Fast', description: 'Lightning fast performance.' },
        { icon: '🔒', title: 'Secure', description: 'Enterprise-grade security.' },
        { icon: '🎨', title: 'Beautiful', description: 'Stunning design out of the box.' },
        { icon: '📱', title: 'Responsive', description: 'Works on every device.' }
      ]),
      columns: 2, gap: '32px', align: 'center', iconSize: '48px'
    },
    fields: [
      { key: 'features', label: 'Features (JSON)', type: 'json-editor' },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 4 },
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'align', label: 'Alignment', type: 'select', options: [
        { value: 'center', label: 'Center' }, { value: 'left', label: 'Left' }
      ]}
    ],
    render(p) {
      let features = [];
      try { features = JSON.parse(p.features || '[]'); } catch(e) { features = []; }
      if (features.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add features in the panel →</div>`;
      }
      const cols = Math.max(1, Math.min(4, p.columns || 2));
      const align = p.align === 'center' ? 'center' : 'flex-start';
      const cards = features.map(f =>
        `<div style="text-align:${escapeHtml(align)};${align === 'center' ? '' : 'display:flex;gap:16px;align-items:flex-start;'}">
          <div style="font-size:${escapeHtml(p.iconSize || '48px')};${align === 'center' ? 'margin-bottom:16px;' : ''}">${escapeHtml(f.icon || '⭐')}</div>
          <div>
            <h3 style="margin:0 0 8px 0;font-size:18px;font-weight:600;">${escapeHtml(f.title || 'Feature')}</h3>
            <p style="margin:0;color:#64748B;line-height:1.5;">${escapeHtml(f.description || '')}</p>
          </div>
        </div>`
      ).join('');
      return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${escapeHtml(p.gap || '32px')};">${cards}</div>`;
    }
  },

  stats: {
    label: 'Stats / Counter', icon: '📊', category: 'marketing',
    defaultProps: {
      stats: JSON.stringify([
        { number: '10000', suffix: '+', label: 'Happy customers' },
        { number: '99', suffix: '%', label: 'Satisfaction rate' },
        { number: '24', suffix: '/7', label: 'Support available' }
      ]),
      columns: 3, gap: '32px'
    },
    fields: [
      { key: 'stats', label: 'Stats (JSON)', type: 'json-editor' },
      { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 6 },
      { key: 'gap', label: 'Gap', type: 'text' }
    ],
    render(p) {
      let stats = [];
      try { stats = JSON.parse(p.stats || '[]'); } catch(e) { stats = []; }
      if (stats.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:40px 20px;background:#F8FAFC;">Add stats in the panel →</div>`;
      }
      const cols = Math.max(1, Math.min(6, p.columns || 3));
      const items = stats.map(s =>
        `<div style="text-align:center;">
          <div style="font-size:48px;font-weight:800;color:#146EF5;" class="sb-counter" data-target="${escapeHtml(s.number || '0')}">${escapeHtml(s.number || '0')}${escapeHtml(s.suffix || '')}</div>
          <div style="color:#64748B;margin-top:8px;">${escapeHtml(s.label || '')}</div>
        </div>`
      ).join('');
      return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:${escapeHtml(p.gap || '32px')};">${items}</div>`;
    }
  },

  // ============================================================
  // NAVIGATION
  // ============================================================

  navbar: {
    label: 'Navbar', icon: '☰', category: 'navigation',
    canHaveChildren: true,
    defaultProps: {
      logoText: 'Brand', logoUrl: '#', logoImage: '',
      links: 'Home:#|About:#about|Services:#services|Contact:#contact',
      ctaText: '', ctaUrl: '#',
      sticky: true, transparent: false, mobileMenu: true,
      backgroundType: 'color', backgroundColor: '#FFFFFF',
      padding: '16px 24px', maxWidth: '1200px'
    },
    fields: [
      { key: 'logoText', label: 'Logo text', type: 'text' },
      { key: 'logoImage', label: 'Logo image (optional)', type: 'image' },
      { key: 'logoUrl', label: 'Logo link', type: 'url' },
      { key: 'ctaText', label: 'CTA button text', type: 'text' },
      { key: 'ctaUrl', label: 'CTA button link', type: 'url' },
      { key: 'sticky', label: 'Sticky on scroll', type: 'checkbox' },
      { key: 'transparent', label: 'Transparent background', type: 'checkbox' },
      { key: 'padding', label: 'Padding', type: 'text' }
    ],
    render(p, children) {
      const bg = p.transparent ? 'background:transparent;' : buildBackgroundCSS(p) || `background:${p.backgroundColor || '#FFFFFF'};`;
      const sticky = p.sticky !== false ? 'position:sticky;top:0;z-index:100;' : '';
      const pairs = String(p.links || '').split('|').map(s => s.trim()).filter(Boolean);
      const fallbackLinks = pairs.map(pair => {
        const [label, url] = pair.split(':').map(s => (s || '').trim());
        return label ? `<a href="${safeUrl(url || '#')}" style="color:inherit;text-decoration:none;font-weight:500;padding:8px 0;">${escapeHtml(label)}</a>` : '';
      }).join('');
      // Links are real child nodes (nav-link) when present; the legacy string prop
      // `links` is only used as a fallback so old pages still render.
      const linksHtml = (children && String(children).trim()) ? children : fallbackLinks;
      const cta = p.ctaText
        ? `<a href="${safeUrl(p.ctaUrl)}" style="padding:10px 20px;background:#146EF5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(p.ctaText)}</a>`
        : '';
      const logo = p.logoImage
        ? `<a href="${safeUrl(p.logoUrl)}"><img src="${safeUrl(p.logoImage)}" alt="${escapeHtml(p.logoText)}" style="height:32px;"></a>`
        : `<a href="${safeUrl(p.logoUrl)}" style="color:inherit;text-decoration:none;font-weight:700;font-size:20px;">${escapeHtml(p.logoText || 'Brand')}</a>`;
      return `<nav class="sb-navbar" style="${bg}${sticky}border-bottom:1px solid rgba(0,0,0,0.05);">
        <div style="max-width:${escapeHtml(p.maxWidth || '1200px')};margin:0 auto;padding:${escapeHtml(p.padding || '16px 24px')};display:flex;align-items:center;justify-content:space-between;">
          ${logo}
          <div style="display:flex;align-items:center;gap:24px;">
            ${linksHtml}
            ${cta}
          </div>
        </div>
      </nav>`;
    }
  },

  // A single navbar link — lives as a real child node of `navbar` so it can be
  // selected and styled individually. Hidden from the palette (added via navbar).
  'nav-link': {
    label: 'Nav Link', icon: '🔗', category: 'navigation', hiddenInPalette: true,
    canHaveChildren: false,
    defaultProps: { label: 'Link', url: '#', newTab: false },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'newTab', label: 'Open in new tab', type: 'checkbox' }
    ],
    render(p) {
      const target = p.newTab ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${safeUrl(p.url || '#')}"${target} style="color:inherit;text-decoration:none;font-weight:500;padding:8px 0;display:inline-block;">${escapeHtml(p.label || 'Link')}</a>`;
    }
  },

  footer: {
    label: 'Footer', icon: '▬', category: 'navigation',
    canHaveChildren: true,
    defaultProps: {
      logoText: 'Brand', copyright: '© 2026 Your Company. All rights reserved.',
      columns: JSON.stringify([
        { title: 'Product', links: 'Features:#|Pricing:#|Docs:#' },
        { title: 'Company', links: 'About:#|Blog:#|Careers:#' },
        { title: 'Support', links: 'Help:#|Contact:#|Status:#' }
      ]),
      backgroundType: 'color', backgroundColor: '#0F172A',
      textColor: '#94A3B8', headingColor: '#FFFFFF', padding: '64px 24px 32px'
    },
    fields: [
      { key: 'logoText', label: 'Logo text', type: 'text' },
      { key: 'columns', label: 'Link columns (JSON)', type: 'json-editor' },
      { key: 'copyright', label: 'Copyright text', type: 'text' },
      { key: 'padding', label: 'Padding', type: 'text' }
    ],
    render(p, children) {
      let columns = [];
      try { columns = JSON.parse(p.columns || '[]'); } catch(e) { columns = []; }
      const bg = buildBackgroundCSS(p) || `background:${p.backgroundColor || '#0F172A'};`;
      const colHtml = columns.map(col => {
        const links = String(col.links || '').split('|').map(s => s.trim()).filter(Boolean);
        return `<div>
          <h4 style="margin:0 0 16px 0;color:${escapeHtml(p.headingColor || '#FFFFFF')};font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(col.title || '')}</h4>
          ${links.map(link => {
            const [label, url] = link.split(':').map(s => (s || '').trim());
            return label ? `<a href="${safeUrl(url || '#')}" style="color:${escapeHtml(p.textColor || '#94A3B8')};text-decoration:none;display:block;padding:4px 0;font-size:14px;">${escapeHtml(label)}</a>` : '';
          }).join('')}
        </div>`;
      }).join('');
      return `<footer class="sb-footer" style="${bg}color:${escapeHtml(p.textColor || '#94A3B8')};padding:${escapeHtml(p.padding || '64px 24px 32px')};">
        <div style="max-width:1200px;margin:0 auto;">
          ${children || `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-bottom:48px;">
            <div>
              <div style="color:${escapeHtml(p.headingColor || '#FFFFFF')};font-weight:700;font-size:20px;margin-bottom:16px;">${escapeHtml(p.logoText || 'Brand')}</div>
            </div>
            ${colHtml}
          </div>`}
          <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;text-align:center;font-size:14px;">${escapeHtml(p.copyright || '')}</div>
        </div>
      </footer>`;
    }
  },

  'social-icons': {
    label: 'Social Icons', icon: '🔗', category: 'navigation',
    defaultProps: {
      links: JSON.stringify([
        { platform: 'twitter', url: 'https://twitter.com', icon: '𝕏' },
        { platform: 'github', url: 'https://github.com', icon: '⌨' },
        { platform: 'linkedin', url: 'https://linkedin.com', icon: 'in' }
      ]),
      size: '40px', color: '#64748B', hoverColor: '#146EF5',
      shape: 'circle', gap: '12px'
    },
    fields: [
      { key: 'links', label: 'Links (JSON)', type: 'json-editor' },
      { key: 'size', label: 'Icon size', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'shape', label: 'Shape', type: 'select', options: [
        { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'none', label: 'None' }
      ]},
      { key: 'gap', label: 'Gap', type: 'text' }
    ],
    render(p) {
      let links = [];
      try { links = JSON.parse(p.links || '[]'); } catch(e) { links = []; }
      if (links.length === 0) {
        return `<div style="text-align:center;color:#94A3B8;border:2px dashed #CBD5E1;border-radius:8px;padding:20px;background:#F8FAFC;">Add social links in the panel →</div>`;
      }
      const radius = p.shape === 'circle' ? '50%' : p.shape === 'square' ? '6px' : '0';
      const icons = links.map(link =>
        `<a href="${safeUrl(link.url)}" style="display:inline-flex;align-items:center;justify-content:center;width:${escapeHtml(p.size || '40px')};height:${escapeHtml(p.size || '40px')};border-radius:${radius};background:${escapeHtml(p.color || '#64748B')};color:#fff;text-decoration:none;font-weight:700;font-size:16px;">${escapeHtml(link.icon || '🔗')}</a>`
      ).join('');
      return `<div style="display:flex;gap:${escapeHtml(p.gap || '12px')};">${icons}</div>`;
    }
  },

  // ============================================================
  // ADVANCED
  // ============================================================

  'custom-html': {
    label: 'Custom HTML', icon: '</>', category: 'advanced',
    defaultProps: { code: '<div style="padding:20px;text-align:center;">\n  <p>Your custom HTML goes here.</p>\n</div>' },
    fields: [
      { key: 'code', label: 'HTML code (scripts stripped on publish)', type: 'textarea' }
    ],
    render(p) {
      let html = String(p.code || '');
      html = html.replace(/<script\b[^>]*>.*?<\/script>/gis, '');
      html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
      html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
      return `<div class="sb-custom-html">${html}</div>`;
    }
  },

  'custom-css': {
    label: 'Custom CSS', icon: '🎨', category: 'advanced',
    defaultProps: { css: '.my-class {\n  color: red;\n}', targetId: '' },
    fields: [
      { key: 'css', label: 'CSS rules', type: 'textarea' },
      { key: 'targetId', label: 'Target element ID (optional)', type: 'text' }
    ],
    render(p) {
      return `<div style="padding:12px;background:#FEF3C7;border:1px dashed #F59E0B;border-radius:6px;font-size:12px;color:#92400E;">
        Custom CSS: <code>${escapeHtml((p.css || '').slice(0, 80))}${(p.css || '').length > 80 ? '...' : ''}</code>
      </div>`;
    }
  },

  'code-embed': {
    label: 'Code Embed', icon: '⌘', category: 'advanced',
    defaultProps: { code: '<!-- Paste your embed code here -->', height: 'auto' },
    fields: [
      { key: 'code', label: 'Embed code', type: 'textarea' },
      { key: 'height', label: 'Height', type: 'text' }
    ],
    render(p) {
      let html = String(p.code || '');
      html = html.replace(/<script\b[^>]*>.*?<\/script>/gis, '');
      return `<div style="min-height:${escapeHtml(p.height || 'auto')};border:1px dashed #CBD5E1;border-radius:6px;padding:12px;overflow:hidden;">${html}</div>`;
    }
  },

  'progress-bar': {
    label: 'Progress Bar', icon: '▰', category: 'advanced',
    defaultProps: { value: 75, label: 'Progress', color: '#146EF5', bgColor: '#E2E8F0', height: '8px', showLabel: true },
    fields: [
      { key: 'value', label: 'Value (%)', type: 'number', min: 0, max: 100 },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'color', label: 'Fill color', type: 'color' },
      { key: 'bgColor', label: 'Background color', type: 'color' },
      { key: 'height', label: 'Height', type: 'text' },
      { key: 'showLabel', label: 'Show label', type: 'checkbox' }
    ],
    render(p) {
      const val = Math.max(0, Math.min(100, p.value || 0));
      return `<div style="width:100%;">
        ${p.showLabel !== false ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>${escapeHtml(p.label || '')}</span><span>${val}%</span></div>` : ''}
        <div style="width:100%;height:${escapeHtml(p.height || '8px')};background:${escapeHtml(p.bgColor || '#E2E8F0')};border-radius:999px;overflow:hidden;">
          <div class="sb-progress-fill" data-value="${val}" style="width:${val}%;height:100%;background:${escapeHtml(p.color || '#146EF5')};border-radius:999px;transition:width 1s ease;"></div>
        </div>
      </div>`;
    }
  },

  marquee: {
    label: 'Marquee', icon: '→→→', category: 'advanced',
    defaultProps: { text: '★ Amazing features ★ Built for speed ★ Designed for you', speed: '20s', direction: 'left', fontSize: '24px', color: '#0F172A' },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'speed', label: 'Speed (animation duration)', type: 'text' },
      { key: 'direction', label: 'Direction', type: 'select', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }
      ]},
      { key: 'fontSize', label: 'Font size', type: 'text' },
      { key: 'color', label: 'Color', type: 'color' }
    ],
    render(p) {
      const text = escapeHtml(p.text || '');
      return `<div style="overflow:hidden;white-space:nowrap;">
        <div class="sb-marquee" style="display:inline-block;animation:marquee-${escapeHtml(p.direction || 'left')} ${escapeHtml(p.speed || '20s')} linear infinite;font-size:${escapeHtml(p.fontSize || '24px')};color:${escapeHtml(p.color || '#0F172A')};font-weight:700;">
          ${text} &nbsp; ${text} &nbsp; ${text} &nbsp; ${text}
        </div>
      </div>`;
    }
  },

  'countdown': {
    label: 'Countdown', icon: '⏰', category: 'advanced',
    defaultProps: { targetDate: '2027-01-01T00:00:00', format: 'days-hours-min-sec', expiredMessage: 'Time is up!', label: 'Launching in' },
    fields: [
      { key: 'targetDate', label: 'Target date/time', type: 'datetime' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'expiredMessage', label: 'Expired message', type: 'text' }
    ],
    render(p) {
      return `<div class="sb-countdown" data-target="${escapeHtml(p.targetDate || '')}" style="text-align:center;">
        <div style="font-size:18px;margin-bottom:16px;font-weight:600;">${escapeHtml(p.label || '')}</div>
        <div style="display:flex;justify-content:center;gap:24px;">
          ${['Days', 'Hours', 'Min', 'Sec'].map(unit =>
            `<div style="text-align:center;">
              <div class="sb-countdown-${unit.toLowerCase()}" style="font-size:48px;font-weight:800;color:#146EF5;font-family:'JetBrains Mono',monospace;">00</div>
              <div style="font-size:14px;color:#64748B;">${unit}</div>
            </div>`
          ).join('')}
        </div>
      </div>`;
    }
  },

  table: {
    label: 'Table', icon: '⊞', category: 'advanced',
    defaultProps: {
      headers: 'Feature|Basic|Pro|Enterprise',
      rows: JSON.stringify([
        ['Storage', '1GB', '10GB', 'Unlimited'],
        ['Users', '1', '10', 'Unlimited'],
        ['Support', 'Email', 'Priority', '24/7 Phone']
      ]),
      striped: true, bordered: true, headerBg: '#F1F5F9'
    },
    fields: [
      { key: 'headers', label: 'Headers (| separated)', type: 'text' },
      { key: 'rows', label: 'Rows (JSON: [[...], ...])', type: 'json-editor' },
      { key: 'striped', label: 'Striped rows', type: 'checkbox' },
      { key: 'bordered', label: 'Bordered', type: 'checkbox' },
      { key: 'headerBg', label: 'Header background', type: 'color' }
    ],
    render(p) {
      const headers = String(p.headers || '').split('|').map(s => s.trim()).filter(Boolean);
      let rows = [];
      try { rows = JSON.parse(p.rows || '[]'); } catch(e) { rows = []; }
      const border = p.bordered !== false ? 'border:1px solid #E2E8F0;' : '';
      const headerHtml = headers.length ? `<thead><tr>${headers.map(h =>
        `<th style="padding:12px 16px;background:${escapeHtml(p.headerBg || '#F1F5F9')};text-align:left;font-weight:600;${border}">${escapeHtml(h)}</th>`
      ).join('')}</tr></thead>` : '';
      const rowsHtml = rows.map((row, i) =>
        `<tr style="background:${p.striped !== false && i % 2 === 1 ? '#F8FAFC' : '#fff'};">
          ${row.map(cell => `<td style="padding:12px 16px;${border}">${escapeHtml(cell)}</td>`).join('')}
        </tr>`
      ).join('');
      return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;">${headerHtml}<tbody>${rowsHtml}</tbody></table></div>`;
    }
  },

  // ============================================================
  // COMPONENTS (special block types)
  // ============================================================

  logo: {
    label: 'Logo', icon: '◆', category: 'navigation',
    defaultProps: { text: 'Brand', image: '', url: '#', height: '32px' },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'height', label: 'Height', type: 'text' }
    ],
    render(p) {
      const inner = p.image
        ? `<img src="${safeUrl(p.image)}" alt="${escapeHtml(p.text || 'Logo')}" style="height:${escapeHtml(p.height || '32px')};display:block;">`
        : `<span style="font-weight:700;font-size:20px;">${escapeHtml(p.text || 'Brand')}</span>`;
      return `<a href="${safeUrl(p.url)}" style="display:inline-block;text-decoration:none;color:inherit;">${inner}</a>`;
    }
  },

  button: {
    label: 'Button', icon: '⬡', category: 'marketing',
    defaultProps: { text: 'Click here', url: '#', variant: 'primary', size: 'md', fullWidth: false, icon: '' },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'url', label: 'Link', type: 'url' },
      { key: 'variant', label: 'Variant', type: 'select', options: [
        { value: 'primary', label: 'Primary' },
        { value: 'secondary', label: 'Secondary' },
        { value: 'outline', label: 'Outline' },
        { value: 'ghost', label: 'Ghost' },
        { value: 'danger', label: 'Danger' }
      ]},
      { key: 'size', label: 'Size', type: 'select', options: [
        { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }
      ]},
      { key: 'icon', label: 'Icon (optional)', type: 'text' },
      { key: 'fullWidth', label: 'Full width', type: 'checkbox' }
    ],
    render(p) {
      const variants = {
        primary: 'background:#146EF5;color:#fff;border:2px solid #146EF5;',
        secondary: 'background:#7C3AED;color:#fff;border:2px solid #7C3AED;',
        outline: 'background:transparent;color:#146EF5;border:2px solid #146EF5;',
        ghost: 'background:transparent;color:#146EF5;border:2px solid transparent;',
        danger: 'background:#EF4444;color:#fff;border:2px solid #EF4444;'
      };
      const sizes = { sm: 'padding:8px 16px;font-size:13px;', md: 'padding:12px 24px;font-size:15px;', lg: 'padding:16px 32px;font-size:17px;' };
      const width = p.fullWidth ? 'width:100%;display:block;text-align:center;' : 'display:inline-block;';
      const icon = p.icon ? escapeHtml(p.icon) + ' ' : '';
      return `<a href="${safeUrl(p.url)}" style="${variants[p.variant] || variants.primary}${sizes[p.size] || sizes.md}${width}border-radius:8px;text-decoration:none;font-weight:600;">${icon}${escapeHtml(p.text || 'Click here')}</a>`;
    }
  }
};

// Category metadata for the palette
const BLOCK_CATEGORIES = {
  layout: { label: 'Layout', order: 1 },
  typography: { label: 'Typography', order: 2 },
  media: { label: 'Media', order: 3 },
  interactive: { label: 'Interactive', order: 4 },
  forms: { label: 'Forms', order: 5 },
  marketing: { label: 'Marketing', order: 6 },
  navigation: { label: 'Navigation', order: 7 },
  advanced: { label: 'Advanced', order: 8 }
};

// Create a new node of a given type
function createNode(type, overrides = {}) {
  const def = BLOCK_REGISTRY[type];
  if (!def) return null;
  const id = NodeUtils.genId();
  const defaultProps = {};
  // Handle JSON-typed defaults that need cloning
  Object.entries(def.defaultProps || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      defaultProps[k] = JSON.parse(JSON.stringify(v));
    } else if (typeof v === 'object' && v !== null) {
      defaultProps[k] = JSON.parse(JSON.stringify(v));
    } else {
      defaultProps[k] = v;
    }
  });
  return {
    id,
    type,
    children: [],
    props: { ...defaultProps, ...overrides.props },
    style: overrides.style || { base: {} },
    animations: overrides.animations || {},
    meta: overrides.meta || {}
  };
}

// Generate a CSS class name for a node
function nodeClassName(node) {
  return `sb-${node.id}`;
}
