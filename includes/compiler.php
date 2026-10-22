<?php
// Production compiler: Turns the page IR into a complete standalone HTML page.
// Replaces the old render.php for v2 pages. Handles nested containers,
// per-breakpoint styles, animations, backgrounds, and all 50+ block types.

require_once __DIR__ . '/css-generator.php';

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function safe_url($url) {
    $url = trim((string) $url);
    if ($url === '') return '#';
    if (preg_match('#^(https?:)?//#i', $url) ||
        preg_match('#^(mailto:|tel:)#i', $url) ||
        preg_match('#^[^:]*$#', $url)) {
        return h($url);
    }
    return '#';
}


function safe_srcset($srcset) {
    $parts = array_filter(array_map('trim', explode(',', (string) $srcset)));
    $safe = [];
    foreach ($parts as $part) {
        $pieces = preg_split('/\s+/', $part, 2);
        $url = trim($pieces[0] ?? '');
        $descriptor = trim($pieces[1] ?? '');
        if ($url === '' || preg_match('/^(javascript|data|vbscript):/i', $url)) continue;
        if ($descriptor !== '' && !preg_match('/^(\d+(?:\.\d+)?x|\d+w)$/', $descriptor)) continue;
        $safe[] = h($url) . ($descriptor !== '' ? ' ' . h($descriptor) : '');
    }
    return implode(', ', $safe);
}

function render_rich_text($raw) {
    $raw = (string) $raw;
    $tokens = [];
    $raw = preg_replace_callback('/\[([^\]\[]+)\]\(([^()]+)\)/', function ($m) use (&$tokens) {
        $tokens[] = '<a href="' . safe_url(trim($m[2])) . '">' . h($m[1]) . '</a>';
        return "\x01" . (count($tokens) - 1) . "\x02";
    }, $raw);
    $raw = preg_replace_callback('/\*\*([^*]+)\*\*/', function ($m) use (&$tokens) {
        $tokens[] = '<strong>' . h($m[1]) . '</strong>';
        return "\x01" . (count($tokens) - 1) . "\x02";
    }, $raw);
    $raw = preg_replace_callback('/\*([^*]+)\*/', function ($m) use (&$tokens) {
        $tokens[] = '<em>' . h($m[1]) . '</em>';
        return "\x01" . (count($tokens) - 1) . "\x02";
    }, $raw);
    $raw = nl2br(h($raw));
    $raw = preg_replace_callback('/\x01(\d+)\x02/', function ($m) use ($tokens) {
        return $tokens[(int) $m[1]] ?? '';
    }, $raw);
    return $raw;
}

function sanitize_custom_html($html) {
    $html = (string) $html;
    $html = preg_replace('#<(script|style|object|embed|applet|base|meta|link)\b[^>]*>.*?</\1\s*>#is', '', $html);
    $html = preg_replace('#<(script|style|object|embed|applet|base|meta|link)\b[^>]*/?>#is', '', $html);
    $html = preg_replace('#<svg\b[^>]*>.*?</svg\s*>#is', '', $html);
    $html = preg_replace('#\s(?:on[a-z]+|srcdoc|formaction|xlink:href)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html);
    $html = preg_replace_callback('#\b(href|src|poster)\s*=\s*("|\')(.*?)\2#is', function ($m) {
        $url = trim(html_entity_decode($m[3], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if (preg_match('/^(javascript|vbscript|data):/i', $url)) return $m[1] . '=' . $m[2] . '#' . $m[2];
        return $m[0];
    }, $html);
    $html = preg_replace_callback('#\sstyle\s*=\s*("|\')(.*?)\1#is', function ($m) {
        $style = $m[2];
        if (preg_match('/expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:/i', $style)) return '';
        return ' style=' . $m[1] . $style . $m[1];
    }, $html);
    $html = preg_replace('#\b(href|src|poster)\s*=\s*(?:javascript|vbscript|data):[^\s>]*#i', '$1="#"', $html);
    return $html;
}

function build_background_css($props) {
    $type = $props['backgroundType'] ?? 'none';
    if ($type === 'color' && !empty($props['backgroundColor'])) {
        return 'background:' . h($props['backgroundColor']) . ';';
    }
    if ($type === 'gradient') {
        $angle = max(0, min(360, (int) ($props['gradientAngle'] ?? 135)));
        $stops = $props['gradientStops'] ?? ['#667eea', '#764ba2'];
        if (!is_array($stops)) $stops = ['#667eea', '#764ba2'];
        $stopsStr = implode(', ', array_map(function($stop) { return h($stop); }, $stops));
        $kind = in_array(($props['gradientType'] ?? 'linear'), ['linear','radial','conic'], true) ? ($props['gradientType'] ?? 'linear') : 'linear';
        if ($kind === 'radial') return 'background:radial-gradient(ellipse at center, ' . $stopsStr . ');';
        if ($kind === 'conic') return 'background:conic-gradient(from ' . $angle . 'deg, ' . $stopsStr . ');';
        return 'background:linear-gradient(' . $angle . 'deg, ' . $stopsStr . ');';
    }
    if ($type === 'image' && !empty($props['backgroundImage'])) {
        $size = h($props['backgroundSize'] ?? 'cover');
        $posX = h($props['backgroundPositionX'] ?? ($props['backgroundPosition'] ?? 'center'));
        $posY = h($props['backgroundPositionY'] ?? 'center');
        $repeat = h($props['backgroundRepeat'] ?? 'no-repeat');
        $attach = h($props['backgroundAttachment'] ?? 'scroll');
        return 'background:url(' . safe_url($props['backgroundImage']) . ') ' . $posX . ' ' . $posY . ' / ' . $size . ' ' . $repeat . ' ' . $attach . ';';
    }
    return '';
}

function build_overlay_html($props) {
    if (empty($props['overlayColor']) && empty($props['overlayGradient'])) return '';
    $opacity = max(0, min(100, (int) ($props['overlayOpacity'] ?? 50))) / 100;
    $backgroundValue = !empty($props['overlayGradient']) ? trim((string) $props['overlayGradient']) : trim((string) $props['overlayColor']);
    if (!valid_css_value($backgroundValue)) return '';
    if (!empty($props['overlayGradient']) && !preg_match('/^(linear|radial|conic)-gradient\s*\(/i', $backgroundValue)) return '';
    $background = h($backgroundValue);
    return '<div aria-hidden="true" style="position:absolute;inset:0;background:' . $background . ';opacity:' . $opacity . ';pointer-events:none;z-index:1;"></div>';
}

function build_video_bg_html($props) {
    $type = $props['backgroundType'] ?? 'none';
    if ($type !== 'video' || empty($props['backgroundVideo'])) return '';
    $attrs = [];
    if (($props['videoAutoplay'] ?? true) !== false) $attrs[] = 'autoplay';
    if (($props['videoMuted'] ?? true) !== false) $attrs[] = 'muted';
    if (($props['videoLoop'] ?? true) !== false) $attrs[] = 'loop';
    $attrs[] = 'playsinline';
    $poster = !empty($props['videoPoster']) ? ' poster="' . safe_url($props['videoPoster']) . '"' : '';
    $fit = in_array(($props['videoFit'] ?? 'cover'), ['cover','contain'], true) ? ($props['videoFit'] ?? 'cover') : 'cover';
    $positionValue = trim((string) ($props['videoPosition'] ?? '50% 50%'));
    $position = h(valid_css_value($positionValue) ? $positionValue : '50% 50%');
    return '<video ' . implode(' ', $attrs) . $poster . ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:' . $fit . ';object-position:' . $position . ';z-index:0;" src="' . safe_url($props['backgroundVideo']) . '"></video>'; 
}

// Sanitize an anchor/id value: letters, numbers, dash, underscore, dot, colon.
function sanitize_anchor($value) {
    $value = preg_replace('/[^A-Za-z0-9_.:\-]/', '-', trim((string) $value));
    return trim($value, '-');
}

// Extra attributes contributed by a node's Settings tab: anchor id and ARIA
// label. Anchors make in-page links (#id) work natively. Returns a prefix
// string that already includes leading spaces, or '' when nothing is set.
function node_extra_attrs($node) {
    $meta = $node['meta'] ?? [];
    $attrs = '';

    if (!empty($meta['anchorId'])) {
        $attrs .= ' id="' . h(sanitize_anchor($meta['anchorId'])) . '"';
    }
    if (!empty($meta['ariaLabel'])) {
        $attrs .= ' aria-label="' . h($meta['ariaLabel']) . '"';
    }

    return $attrs;
}

// Sanitized user-supplied class names from meta.cssClass (may be empty).
function node_extra_classes($node) {
    $meta = $node['meta'] ?? [];
    $assigned = $meta['cssClasses'] ?? [];
    if (!is_array($assigned)) $assigned = [];
    if (!empty($meta['cssClass'])) $assigned = array_merge($assigned, preg_split('/\s+/', trim((string) $meta['cssClass'])));
    if (empty($assigned)) return '';
    $classes = $assigned;
    $classes = array_filter(array_map(function ($c) {
        return preg_replace('/[^A-Za-z0-9_\-]/', '-', $c);
    }, $classes));
    return implode(' ', $classes);
}

function compile_node($node, $nodes, $context = []) {
    $type = $node['type'] ?? '';
    $props = $node['props'] ?? [];
    $className = 'sb-' . $node['id'];
    $classList = $className . ' sb-' . h($type);

    // Entrance animations: add a marker + trigger so the runtime observer can
    // start paused viewport animations when the element scrolls into view.
    if (!empty($node['animations']['entrance'])) {
        $trigger = $node['animations']['entrance']['trigger'] ?? 'load';
        $classList .= ' sb-has-entrance';
    }

    $extraClasses = node_extra_classes($node);
    if ($extraClasses !== '') {
        $classList .= ' ' . $extraClasses;
    }

    $classAttr = 'class="' . $classList . '"';
    if (!empty($node['animations']['entrance'])) {
        $trigger = $node['animations']['entrance']['trigger'] ?? 'load';
        $classAttr .= ' data-entrance-trigger="' . h($trigger) . '"';
    }

    // Element-level Settings: anchor id / custom class / aria-label. Appended to
    // $classAttr so every block (all of which emit $classAttr on their root
    // element) picks them up without touching individual cases.
    $classAttr .= node_extra_attrs($node);

    // Compile children recursively
    $childrenHtml = '';
    if (!empty($node['children'])) {
        foreach ($node['children'] as $childId) {
            if (!empty($nodes[$childId])) {
                $childrenHtml .= compile_node($nodes[$childId], $nodes, $context);
            }
        }
    }

    switch ($type) {
        case 'section':
            $bgCss = build_background_css($props);
            $pad = h($props['padding'] ?? '80px 24px');
            $isVisual = ($props['backgroundType'] ?? 'none') === 'image' || ($props['backgroundType'] ?? 'none') === 'video';
            $inner = '<div style="position:relative;z-index:2;">' . $childrenHtml . '</div>';
            return '<section ' . $classAttr . ' style="' . $bgCss . 'padding:' . $pad . ';position:relative;overflow:hidden;">'
                . build_video_bg_html($props)
                . ($isVisual ? build_overlay_html($props) : '')
                . $inner . '</section>';

        case 'html-element':
            $allowedTags = ['div','section','article','header','footer','main','nav','aside','span','p','h1','h2','h3','h4','h5','h6','a','button','blockquote','figure','figcaption','ul','ol','li'];
            $tag = in_array(($props['tag'] ?? 'div'), $allowedTags, true) ? ($props['tag'] ?? 'div') : 'div';
            $titleAttr = !empty($props['title']) ? ' title="' . h($props['title']) . '"' : '';
            $content = h($props['text'] ?? '') . $childrenHtml;
            if ($tag === 'a') {
                $target = ($props['target'] ?? '_self') === '_blank' ? '_blank' : '_self';
                $rel = $target === '_blank' ? ' rel="noopener noreferrer"' : '';
                return '<a ' . $classAttr . ' href="' . safe_url($props['href'] ?? '#') . '" target="' . $target . '"' . $rel . $titleAttr . '>' . $content . '</a>';
            }
            if ($tag === 'button') return '<button ' . $classAttr . ' type="button"' . $titleAttr . '>' . $content . '</button>';
            return '<' . $tag . ' ' . $classAttr . $titleAttr . '>' . $content . '</' . $tag . '>';

        case 'container':
            $maxW = h($props['maxWidth'] ?? '1200px');
            $pad = h($props['padding'] ?? '0');
            return '<div ' . $classAttr . ' style="max-width:' . $maxW . ';margin:0 auto;padding:' . $pad . ';">' . $childrenHtml . '</div>';

        case 'flex':
            return '<div ' . $classAttr . ' style="display:flex;flex-direction:' . h($props['direction'] ?? 'row') . ';justify-content:' . h($props['justify'] ?? 'flex-start') . ';align-items:' . h($props['align'] ?? 'stretch') . ';flex-wrap:' . h($props['wrap'] ?? 'nowrap') . ';gap:' . h($props['gap'] ?? '24px') . ';">' . $childrenHtml . '</div>';

        case 'grid':
            $cols = max(1, min(12, (int)($props['columns'] ?? 3)));
            return '<div ' . $classAttr . ' style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:' . h($props['gap'] ?? '24px') . ';justify-items:' . h($props['justifyItems'] ?? 'stretch') . ';align-items:' . h($props['alignItems'] ?? 'stretch') . ';">' . $childrenHtml . '</div>';

        case 'stack':
            $dir = ($props['reverse'] ?? false) ? (($props['direction'] ?? 'column') === 'column' ? 'column-reverse' : 'row-reverse') : ($props['direction'] ?? 'column');
            return '<div ' . $classAttr . ' style="display:flex;flex-direction:' . h($dir) . ';gap:' . h($props['gap'] ?? '16px') . ';align-items:' . h($props['align'] ?? 'stretch') . ';">' . $childrenHtml . '</div>';

        case 'spacer':
            return '<div ' . $classAttr . ' style="height:' . h($props['height'] ?? '40px') . ';"></div>';

        case 'divider':
            $margin = ($props['align'] ?? 'left') === 'center' ? 'margin:0 auto;' : (($props['align'] ?? 'left') === 'right' ? 'margin:0 0 0 auto;' : '');
            return '<div ' . $classAttr . ' style="width:' . h($props['width'] ?? '100%') . ';' . $margin . '"><hr style="border:none;border-top:' . h($props['thickness'] ?? '1px') . ' ' . h($props['style'] ?? 'solid') . ' ' . h($props['color'] ?? '#E0E0E0') . ';margin:0;"></div>';

        case 'heading':
            $tag = $props['tag'] ?? 'h2';
            if (!in_array($tag, ['h1','h2','h3','h4','h5','h6','p','div'], true)) {
                $tag = 'h2';
            }
            $level = $props['level'] ?? $tag;
            if (!in_array($level, ['h1','h2','h3','h4','h5','h6'], true)) {
                $level = 'h2';
            }
            $sizes = ['h1'=>'48px','h2'=>'36px','h3'=>'28px','h4'=>'22px','h5'=>'18px','h6'=>'16px'];
            $size = $sizes[$level] ?? '36px';
            return '<' . $tag . ' ' . $classAttr . ' style="font-size:' . $size . ';font-weight:700;line-height:1.2;margin:0;">' . h($props['text'] ?? '') . '</' . $tag . '>';

        case 'text':
            return '<p ' . $classAttr . ' style="margin:0;line-height:1.6;">' . render_rich_text($props['text'] ?? '') . '</p>';

        case 'rich-text':
            $html = sanitize_custom_html($props['html'] ?? '');
            return '<div ' . $classAttr . ' style="line-height:1.7;">' . $html . '</div>';

        case 'list':
            $items = preg_split('/[|\n]/', (string)($props['items'] ?? ''));
            $items = array_filter(array_map('trim', $items));
            $tag = ($props['ordered'] ?? false) ? 'ol' : 'ul';
            $style = h($props['style'] ?? 'disc');
            $itemsHtml = '';
            foreach ($items as $item) {
                $itemsHtml .= '<li>' . render_rich_text($item) . '</li>';
            }
            return '<' . $tag . ' ' . $classAttr . ' style="margin:0;padding-left:1.5em;list-style-type:' . $style . ';line-height:1.8;">' . $itemsHtml . '</' . $tag . '>';

        case 'blockquote':
            return '<blockquote ' . $classAttr . ' style="margin:0;padding:20px 24px;border-left:4px solid #146EF5;background:#F8FAFC;font-style:italic;font-size:1.1em;text-align:' . h($props['align'] ?? 'left') . ';"><p style="margin:0 0 8px 0;">' . h($props['text'] ?? '') . '</p>' . (!empty($props['author']) ? '<cite style="font-style:normal;font-size:0.85em;color:#64748B;">— ' . h($props['author']) . '</cite>' : '') . '</blockquote>';

        case 'code':
            return '<pre ' . $classAttr . ' style="margin:0;padding:20px;background:#1E293B;color:#E2E8F0;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:14px;line-height:1.5;"><code>' . h($props['code'] ?? '') . '</code></pre>';

        case 'image':
            if (empty($props['src'])) return '';
            $lazy = ($props['lazy'] ?? true) !== false ? ' loading="lazy"' : '';
            $sourceTags = '';
            $tabletWidth = max(320, min(1920, (int) ($GLOBALS['SB_BREAKPOINTS']['tablet'] ?? 991)));
            $mobileWidth = max(240, min(1200, (int) ($GLOBALS['SB_BREAKPOINTS']['mobile'] ?? 479)));
            // Most-specific media condition first so the mobile source wins at phone widths.
            if (!empty($props['mobileSrc'])) $sourceTags .= '<source media="(max-width: ' . $mobileWidth . 'px)" srcset="' . safe_url($props['mobileSrc']) . '">';
            if (!empty($props['tabletSrc'])) $sourceTags .= '<source media="(max-width: ' . $tabletWidth . 'px)" srcset="' . safe_url($props['tabletSrc']) . '">';
            $srcsetAttr = !empty($props['srcset']) ? ' srcset="' . safe_srcset($props['srcset']) . '"' : '';
            $sizesAttr = !empty($props['sizes']) ? ' sizes="' . h($props['sizes']) . '"' : '';
            $img = '<picture>' . $sourceTags . '<img src="' . safe_url($props['src']) . '"' . $srcsetAttr . $sizesAttr . ' alt="' . h($props['alt'] ?? '') . '"' . $lazy . ' decoding="async" style="width:' . h($props['width'] ?? '100%') . ';height:' . h($props['height'] ?? 'auto') . ';object-fit:' . h($props['objectFit'] ?? 'cover') . ';object-position:' . h($props['objectPosition'] ?? '50% 50%') . ';border-radius:' . h($props['borderRadius'] ?? '0px') . ';display:block;"></picture>';
            if (!empty($props['lightbox'])) $img = '<a href="' . safe_url($props['src']) . '" data-sb-lightbox data-lightbox-alt="' . h($props['alt'] ?? '') . '" style="display:block;cursor:zoom-in;">' . $img . '</a>';
            if (!empty($props['caption'])) {
                return '<figure ' . $classAttr . ' style="margin:0;">' . $img . '<figcaption style="text-align:center;font-size:0.85em;color:#64748B;padding:8px 0;">' . h($props['caption']) . '</figcaption></figure>';
            }
            return '<div ' . $classAttr . '>' . $img . '</div>';

        case 'image-gallery':
            $images = $props['images'] ?? [];
            if (empty($images)) return '';
            $cols = max(1, min(6, (int)($props['columns'] ?? 3)));
            $cells = '';
            foreach ($images as $img) {
                $imageHtml = '<img src="' . safe_url($img['src'] ?? '') . '" alt="' . h($img['alt'] ?? '') . '" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;">';
                if (($props['lightbox'] ?? true) !== false) $imageHtml = '<a href="' . safe_url($img['src'] ?? '') . '" data-sb-lightbox data-lightbox-alt="' . h($img['alt'] ?? '') . '" style="display:block;width:100%;height:100%;cursor:zoom-in;">' . $imageHtml . '</a>';
                $cells .= '<div style="overflow:hidden;border-radius:' . h($props['borderRadius'] ?? '8px') . ';aspect-ratio:' . h($props['aspectRatio'] ?? '1/1') . ';">' . $imageHtml . '</div>';
            }
            return '<div ' . $classAttr . ' style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:' . h($props['gap'] ?? '12px') . ';">' . $cells . '</div>';

        case 'video':
            if (empty($props['src'])) return '';
            $attrs = [];
            if (($props['controls'] ?? true) !== false) $attrs[] = 'controls';
            if (!empty($props['autoplay'])) $attrs[] = 'autoplay';
            if (!empty($props['muted'])) $attrs[] = 'muted';
            if (!empty($props['loop'])) $attrs[] = 'loop';
            $attrs[] = 'playsinline';
            $poster = !empty($props['poster']) ? ' poster="' . safe_url($props['poster']) . '"' : '';
            return '<video ' . implode(' ', $attrs) . $poster . ' ' . $classAttr . ' style="width:100%;aspect-ratio:' . h($props['aspectRatio'] ?? '16/9') . ';background:#000;border-radius:8px;display:block;" src="' . safe_url($props['src']) . '"></video>';

        case 'video-embed':
            if (empty($props['url'])) return '';
            $embedUrl = $props['url'];
            if (preg_match('/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/]+)/', $props['url'], $m)) {
                $embedUrl = 'https://www.youtube.com/embed/' . $m[1];
            } elseif (preg_match('/vimeo\.com\/(\d+)/', $props['url'], $m)) {
                $embedUrl = 'https://player.vimeo.com/video/' . $m[1];
            }
            return '<iframe src="' . safe_url($embedUrl) . '" ' . $classAttr . ' style="width:100%;aspect-ratio:' . h($props['aspectRatio'] ?? '16/9') . ';border:none;border-radius:8px;display:block;" allowfullscreen loading="lazy"></iframe>';

        case 'shape-image':
            if (empty($props['src'])) return '';
            $float = (($props['float'] ?? 'left') === 'right') ? 'right' : 'left';
            $shape = (!empty($props['shape']) && $props['shape'] !== 'none')
                ? 'shape-outside:' . h($props['shape']) . ';shape-margin:' . h($props['margin'] ?? '16px') . ';'
                : '';
            $sideMargin = $float === 'left'
                ? 'margin-right:' . h($props['margin'] ?? '16px') . ';'
                : 'margin-left:' . h($props['margin'] ?? '16px') . ';';
            $img = '<img src="' . safe_url($props['src']) . '" alt="' . h($props['alt'] ?? '') . '" loading="lazy" style="width:100%;border-radius:' . h($props['borderRadius'] ?? '0px') . ';display:block;">';
            return '<div ' . $classAttr . ' style="overflow:hidden;">'
                . '<div style="float:' . $float . ';width:' . h($props['width'] ?? '42%') . ';' . $shape . $sideMargin
                . 'margin-top:' . h($props['margin'] ?? '16px') . ';margin-bottom:' . h($props['margin'] ?? '16px') . ';">' . $img . '</div>'
                . '<p style="margin:0;line-height:1.7;">' . h($props['text'] ?? '') . '</p>'
                . '</div>';

        case 'icon':
            $bg = !empty($props['backgroundColor']) ? 'background:' . h($props['backgroundColor']) . ';' : '';
            $inner = '<span style="font-size:' . h($props['size'] ?? '32px') . ';color:' . h($props['color'] ?? '#146EF5') . ';' . $bg . 'border-radius:' . h($props['borderRadius'] ?? '0') . ';display:inline-flex;align-items:center;justify-content:center;">' . h($props['icon'] ?? '⭐') . '</span>';
            if (!empty($props['url'])) {
                return '<a href="' . safe_url($props['url']) . '" ' . $classAttr . ' style="display:inline-block;text-decoration:none;">' . $inner . '</a>';
            }
            return '<span ' . $classAttr . '>' . $inner . '</span>';

        case 'slider':
            $slides = $props['slides'] ?? [];
            if (empty($slides)) return '';
            $slideHtml = '';
            foreach ($slides as $slide) {
                if (!empty($slide['image'])) {
                    $slideHtml .= '<div style="min-width:100%;height:100%;position:relative;">'
                        . '<img src="' . safe_url($slide['image']) . '" alt="' . h($slide['alt'] ?? '') . '" style="width:100%;height:100%;object-fit:cover;display:block;">'
                        . (!empty($slide['heading']) || !empty($slide['text']) ? '<div style="position:absolute;bottom:0;left:0;right:0;padding:40px;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:#fff;">' . (!empty($slide['heading']) ? '<h3 style="margin:0 0 8px 0;">' . h($slide['heading']) . '</h3>' : '') . (!empty($slide['text']) ? '<p style="margin:0;">' . h($slide['text']) . '</p>' : '') . '</div>' : '')
                        . '</div>';
                } else {
                    $slideHtml .= '<div style="min-width:100%;height:100%;padding:40px;box-sizing:border-box;background:#F8FAFC;display:flex;align-items:center;justify-content:center;text-align:center;">'
                        . '<div>' . (!empty($slide['heading']) ? '<h3 style="margin:0 0 8px 0;">' . h($slide['heading']) . '</h3>' : '')
                        . (!empty($slide['text']) ? '<p style="margin:0;color:#64748B;">' . h($slide['text']) . '</p>' : '') . '</div></div>';
                }
            }
            $dotsHtml = '';
            if (($props['dots'] ?? true) !== false) {
                $dots = '';
                foreach ($slides as $i => $s) {
                    $dots .= '<button type="button" aria-label="Go to slide ' . ($i + 1) . '" aria-current="' . ($i === 0 ? 'true' : 'false') . '" class="sb-slider-dot' . ($i === 0 ? ' active' : '') . '" data-index="' . $i . '" style="width:10px;height:10px;border:0;border-radius:50%;background:' . ($i === 0 ? '#146EF5' : '#CBD5E1') . ';display:inline-block;cursor:pointer;padding:0;"></button>';
                }
                $dotsHtml = '<div class="sb-slider-dots" style="display:flex;justify-content:center;gap:8px;padding:12px 0;">' . $dots . '</div>';
            }
            $arrowsHtml = '';
            if (($props['arrows'] ?? true) !== false) {
                $arrowsHtml = '<button type="button" aria-label="Previous slide" class="sb-slider-prev" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:none;cursor:pointer;z-index:2;font-size:18px;">←</button>'
                    . '<button type="button" aria-label="Next slide" class="sb-slider-next" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:none;cursor:pointer;z-index:2;font-size:18px;">→</button>';
            }
            $transition = in_array(($props['transition'] ?? 'slide'), ['slide','fade','zoom'], true) ? ($props['transition'] ?? 'slide') : 'slide';
            $dataAttrs = ' data-transition="' . h($transition) . '" data-autoplay="' . (($props['autoplay'] ?? true) ? 'true' : 'false') . '" data-interval="' . h($props['interval'] ?? 5000) . '" data-infinite="' . (($props['infinite'] ?? true) ? 'true' : 'false') . '"';
            return '<div ' . $classAttr . ' style="position:relative;overflow:hidden;border-radius:8px;' . (($props['aspectRatio'] ?? '16/9') !== 'auto' ? 'aspect-ratio:' . h($props['aspectRatio'] ?? '16/9') . ';' : '') . '"' . $dataAttrs . '>'
                . '<div class="sb-slider-track" style="display:flex;height:100%;transition:transform 0.5s ease;">' . $slideHtml . '</div>'
                . $arrowsHtml . $dotsHtml . '</div>';

        case 'accordion':
            $items = json_decode($props['items'] ?? '[]', true);
            if (!is_array($items) || empty($items)) return '';
            $html = '';
            foreach ($items as $i => $item) {
                $isOpen = ($props['openFirst'] ?? true) && $i === 0;
                $html .= '<div class="sb-accordion-item" style="border:1px solid #E2E8F0;border-radius:8px;margin-bottom:8px;overflow:hidden;">'
                    . '<button class="sb-accordion-trigger" style="width:100%;padding:16px 20px;background:#fff;border:none;text-align:left;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:inherit;color:inherit;">'
                    . '<span>' . h($item['q'] ?? '') . '</span><span style="transition:transform 0.2s;transform:rotate(' . ($isOpen ? '180' : '0') . 'deg);">▼</span></button>'
                    . '<div class="sb-accordion-content" style="max-height:' . ($isOpen ? '500' : '0') . 'px;overflow:hidden;transition:max-height 0.3s ease;">'
                    . '<div style="padding:0 20px 16px;color:#64748B;">' . h($item['a'] ?? '') . '</div></div></div>';
            }
            return '<div ' . $classAttr . '>' . $html . '</div>';

        case 'tabs':
            $tabs = json_decode($props['tabs'] ?? '[]', true);
            if (!is_array($tabs) || empty($tabs)) return '';
            $headers = '';
            foreach ($tabs as $i => $tab) {
                $active = $i === 0;
                $headers .= '<button class="sb-tab-btn" data-index="' . $i . '" style="padding:10px 20px;background:none;border:none;cursor:pointer;font-size:inherit;color:' . ($active ? '#146EF5' : '#64748B') . ';font-weight:' . ($active ? '600' : '400') . ';' . ($active ? 'border-bottom:2px solid #146EF5;' : '') . '">' . h($tab['title'] ?? '') . '</button>';
            }
            $activeContent = h($tabs[0]['content'] ?? '');
            // data-tabs drives the runtime: clicking a header swaps the panel.
            $tabsJson = h(json_encode($tabs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            return '<div ' . $classAttr . ' data-tabs="' . $tabsJson . '"><div class="sb-tabs-header" style="display:flex;gap:4px;border-bottom:1px solid #E2E8F0;">' . $headers . '</div>'
                . '<div class="sb-tabs-content" style="padding:20px 0;">' . $activeContent . '</div></div>';

        case 'form':
            $formId = h($props['formId'] ?? uniqid());
            $dataAttrs = ' data-submit-method="' . h($props['submitMethod'] ?? 'email') . '" data-recipient="' . h($props['recipient'] ?? '') . '" data-success="' . h($props['successMessage'] ?? 'Thank you!') . '"';
            $dataAttrs .= !empty($props['redirectUrl']) ? ' data-redirect="' . safe_url($props['redirectUrl']) . '"' : '';
            $dataAttrs .= ' data-submit-url="' . h($context['submitUrl'] ?? 'api/submit.php') . '"';
            $dataAttrs .= ' data-page-id="' . (int) ($context['dbPageId'] ?? 0) . '"';
            return '<form ' . $classAttr . ' data-form-id="' . $formId . '"' . $dataAttrs . ' style="display:flex;flex-direction:column;gap:16px;">'
                . $childrenHtml
                . '<div class="sb-form-message" style="display:none;padding:12px;border-radius:6px;background:#F0FDF4;color:#166534;"></div></form>';

        case 'input':
            $name = h($props['name'] ?? ($props['inputType'] ?? 'text') . '_' . substr(md5($node['id']), 0, 6));
            $label = '';
            if (!empty($props['label'])) {
                $label = '<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">' . h($props['label']) . (!empty($props['required']) ? ' *' : '') . '</label>';
            }
            return '<div ' . $classAttr . ' style="width:' . h($props['width'] ?? '100%') . ';">' . $label
                . '<input type="' . h($props['inputType'] ?? 'text') . '" name="' . $name . '" placeholder="' . h($props['placeholder'] ?? '') . '"'
                . (!empty($props['required']) ? ' required' : '')
                . ' style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;box-sizing:border-box;"></div>';

        case 'textarea':
            $name = h($props['name'] ?? 'textarea_' . substr(md5($node['id']), 0, 6));
            $label = '';
            if (!empty($props['label'])) {
                $label = '<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">' . h($props['label']) . (!empty($props['required']) ? ' *' : '') . '</label>';
            }
            return '<div ' . $classAttr . '>' . $label
                . '<textarea name="' . $name . '" placeholder="' . h($props['placeholder'] ?? '') . '" rows="' . (int)($props['rows'] ?? 4) . '"'
                . (!empty($props['required']) ? ' required' : '')
                . ' style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical;"></textarea></div>';

        case 'select':
            $name = h($props['name'] ?? 'select_' . substr(md5($node['id']), 0, 6));
            $options = preg_split('/\|/', (string)($props['options'] ?? ''));
            $optionsHtml = '<option value="">Select...</option>';
            foreach ($options as $opt) {
                $opt = trim($opt);
                if ($opt !== '') {
                    $optionsHtml .= '<option value="' . h($opt) . '">' . h($opt) . '</option>';
                }
            }
            $label = '';
            if (!empty($props['label'])) {
                $label = '<label style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;">' . h($props['label']) . (!empty($props['required']) ? ' *' : '') . '</label>';
            }
            return '<div ' . $classAttr . '>' . $label
                . '<select name="' . $name . '"' . (!empty($props['required']) ? ' required' : '')
                . ' style="width:100%;padding:10px 14px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;background:#fff;box-sizing:border-box;">'
                . $optionsHtml . '</select></div>';

        case 'submit-button':
            $width = ($props['fullWidth'] ?? false) ? 'width:100%;' : '';
            return '<div ' . $classAttr . ' style="text-align:' . h($props['align'] ?? 'left') . ';">'
                . '<button type="submit" style="' . $width . 'padding:12px 28px;background:#146EF5;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">' . h($props['text'] ?? 'Submit') . '</button></div>';

        case 'hero':
            $bgCss = build_background_css($props);
            $isVisual = ($props['backgroundType'] ?? 'none') === 'image' || ($props['backgroundType'] ?? 'none') === 'video';
            $btn = !empty($props['buttonText'])
                ? '<a href="' . safe_url($props['buttonUrl'] ?? '#') . '" style="display:inline-block;padding:14px 32px;background:#146EF5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">' . h($props['buttonText']) . '</a>' : '';
            $btn2 = !empty($props['secondaryButtonText'])
                ? '<a href="' . safe_url($props['secondaryButtonUrl'] ?? '#') . '" style="display:inline-block;padding:14px 32px;background:transparent;color:inherit;border:2px solid currentColor;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">' . h($props['secondaryButtonText']) . '</a>' : '';
            $buttons = ($btn || $btn2) ? '<div style="display:flex;gap:16px;justify-content:' . ($props['align'] === 'center' ? 'center' : ($props['align'] === 'right' ? 'flex-end' : 'flex-start')) . ';margin-top:32px;flex-wrap:wrap;">' . $btn . $btn2 . '</div>' : '';
            $content = $childrenHtml !== '' ? $childrenHtml
                : '<h1 style="font-size:clamp(32px,5vw,56px);font-weight:800;margin:0 0 16px 0;line-height:1.1;">' . h($props['heading'] ?? '') . '</h1>'
                . (!empty($props['subheading']) ? '<p style="font-size:clamp(16px,2vw,20px);margin:0 0 8px 0;opacity:0.85;line-height:1.5;">' . h($props['subheading']) . '</p>' : '');
            return '<section ' . $classAttr . ' style="' . $bgCss . 'min-height:' . h($props['minHeight'] ?? '60vh') . ';padding:' . h($props['padding'] ?? '120px 24px') . ';display:flex;align-items:center;justify-content:center;text-align:' . h($props['align'] ?? 'center') . ';position:relative;overflow:hidden;">'
                . build_video_bg_html($props)
                . ($isVisual ? build_overlay_html($props) : '')
                . '<div style="max-width:' . h($props['contentWidth'] ?? '800px') . ';position:relative;z-index:2;width:100%;">' . $content . $buttons . $childrenHtml . '</div></section>';

        case 'cta-banner':
            $bgCss = build_background_css($props);
            return '<section ' . $classAttr . ' style="' . $bgCss . 'color:' . h($props['textColor'] ?? '#FFFFFF') . ';padding:' . h($props['padding'] ?? '60px 24px') . ';text-align:' . h($props['align'] ?? 'center') . ';border-radius:' . h($props['borderRadius'] ?? '0px') . ';">'
                . '<div style="max-width:700px;margin:0 auto;">'
                . ($childrenHtml ?: '<h2 style="font-size:32px;font-weight:700;margin:0 0 12px 0;">' . h($props['heading'] ?? '') . '</h2>'
                    . (!empty($props['subheading']) ? '<p style="margin:0 0 24px 0;opacity:0.9;font-size:18px;">' . h($props['subheading']) . '</p>' : '')
                    . (!empty($props['buttonText']) ? '<a href="' . safe_url($props['buttonUrl'] ?? '#') . '" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,0.2);color:inherit;border:2px solid rgba(255,255,255,0.4);border-radius:8px;text-decoration:none;font-weight:600;">' . h($props['buttonText']) . '</a>' : ''))
                . '</div></section>';

        case 'pricing-table':
            $plans = json_decode($props['plans'] ?? '[]', true);
            if (!is_array($plans) || empty($plans)) return '';
            $cols = max(1, min(4, (int)($props['columns'] ?? 3)));
            $cards = '';
            foreach ($plans as $plan) {
                $features = preg_split('/\|/', (string)($plan['features'] ?? ''));
                $features = array_filter(array_map('trim', $features));
                $featured = !empty($plan['featured']);
                $featHtml = '';
                foreach ($features as $f) {
                    $featHtml .= '<li style="padding:8px 0;border-bottom:1px solid ' . ($featured ? 'rgba(255,255,255,0.2)' : '#F1F5F9') . ';">✓ ' . h($f) . '</li>';
                }
                $cards .= '<div style="background:' . ($featured ? '#146EF5' : '#fff') . ';color:' . ($featured ? '#fff' : '#0F172A') . ';border:2px solid ' . ($featured ? '#146EF5' : '#E2E8F0') . ';border-radius:12px;padding:32px;text-align:center;' . ($featured ? 'transform:scale(1.05);' : '') . '">'
                    . '<h3 style="margin:0 0 8px 0;font-size:18px;font-weight:600;">' . h($plan['name'] ?? 'Plan') . '</h3>'
                    . '<div style="font-size:40px;font-weight:800;margin:16px 0;">' . h($plan['price'] ?? '$0') . '<span style="font-size:16px;font-weight:400;opacity:0.7;">' . h($plan['period'] ?? '/mo') . '</span></div>'
                    . '<ul style="list-style:none;padding:0;margin:24px 0;text-align:left;">' . $featHtml . '</ul>'
                    . '<a href="#" style="display:block;padding:12px;background:' . ($featured ? '#fff' : '#146EF5') . ';color:' . ($featured ? '#146EF5' : '#fff') . ';border-radius:8px;text-decoration:none;font-weight:600;">' . h($plan['buttonText'] ?? 'Choose') . '</a></div>';
            }
            return '<div ' . $classAttr . ' style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:' . h($props['gap'] ?? '24px') . ';align-items:center;">' . $cards . '</div>';

        case 'testimonial':
            $rating = max(0, min(5, (int)($props['rating'] ?? 5)));
            $stars = str_repeat('★', $rating) . str_repeat('☆', 5 - $rating);
            $avatarHtml = !empty($props['avatar'])
                ? '<img src="' . safe_url($props['avatar']) . '" alt="' . h($props['author'] ?? '') . '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">'
                : '<div style="width:56px;height:56px;border-radius:50%;background:#146EF5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;">' . h(mb_substr($props['author'] ?? 'A', 0, 1)) . '</div>';
            $authorHtml = '<div style="margin-top:16px;"><div style="font-weight:600;">' . h($props['author'] ?? 'Anonymous') . '</div>'
                . (!empty($props['role']) ? '<div style="font-size:14px;color:#64748B;">' . h($props['role']) . '</div>' : '') . '</div>';
            if (($props['layout'] ?? 'centered') === 'side') {
                return '<div ' . $classAttr . ' style="display:flex;gap:24px;align-items:flex-start;padding:24px;background:#F8FAFC;border-radius:12px;">'
                    . $avatarHtml . '<div><div style="color:#F59E0B;font-size:18px;margin-bottom:12px;">' . $stars . '</div>'
                    . '<p style="margin:0;font-size:18px;line-height:1.6;font-style:italic;">"' . h($props['quote'] ?? '') . '"</p>' . $authorHtml . '</div></div>';
            }
            return '<div ' . $classAttr . ' style="text-align:center;padding:32px;background:#F8FAFC;border-radius:12px;">'
                . '<div style="margin-bottom:16px;display:flex;justify-content:center;">' . $avatarHtml . '</div>'
                . '<div style="color:#F59E0B;font-size:18px;margin-bottom:12px;">' . $stars . '</div>'
                . '<p style="margin:0;font-size:18px;line-height:1.6;font-style:italic;">"' . h($props['quote'] ?? '') . '"</p>' . $authorHtml . '</div>';

        case 'feature-grid':
            $features = json_decode($props['features'] ?? '[]', true);
            if (!is_array($features) || empty($features)) return '';
            $cols = max(1, min(4, (int)($props['columns'] ?? 2)));
            $align = ($props['align'] ?? 'center') === 'center' ? 'center' : 'flex-start';
            $cards = '';
            foreach ($features as $f) {
                $cards .= '<div style="text-align:' . h($align) . ';">'
                    . '<div style="font-size:' . h($props['iconSize'] ?? '48px') . ';margin-bottom:16px;">' . h($f['icon'] ?? '⭐') . '</div>'
                    . '<h3 style="margin:0 0 8px 0;font-size:18px;font-weight:600;">' . h($f['title'] ?? 'Feature') . '</h3>'
                    . '<p style="margin:0;color:#64748B;line-height:1.5;">' . h($f['description'] ?? '') . '</p></div>';
            }
            return '<div ' . $classAttr . ' style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:' . h($props['gap'] ?? '32px') . ';">' . $cards . '</div>';

        case 'stats':
            $stats = json_decode($props['stats'] ?? '[]', true);
            if (!is_array($stats) || empty($stats)) return '';
            $cols = max(1, min(6, (int)($props['columns'] ?? 3)));
            $items = '';
            foreach ($stats as $s) {
                $items .= '<div style="text-align:center;">'
                    . '<div style="font-size:48px;font-weight:800;color:#146EF5;" class="sb-counter" data-target="' . h($s['number'] ?? '0') . '">' . h($s['number'] ?? '0') . h($s['suffix'] ?? '') . '</div>'
                    . '<div style="color:#64748B;margin-top:8px;">' . h($s['label'] ?? '') . '</div></div>';
            }
            return '<div ' . $classAttr . ' style="display:grid;grid-template-columns:repeat(' . $cols . ',1fr);gap:' . h($props['gap'] ?? '32px') . ';">' . $items . '</div>';

        case 'nav-link':
            $target = !empty($props['newTab']) ? ' target="_blank" rel="noopener"' : '';
            return '<a ' . $classAttr . ' href="' . safe_url($props['url'] ?? '#') . '"' . $target . ' style="color:inherit;text-decoration:none;font-weight:500;padding:8px 0;display:inline-block;">' . h($props['label'] ?? 'Link') . '</a>';

        case 'navbar':
            $bgCss = build_background_css($props);
            if (empty($bgCss) && empty($props['transparent'])) {
                $bgCss = 'background:' . h($props['backgroundColor'] ?? '#FFFFFF') . ';';
            }
            $sticky = ($props['sticky'] ?? true) !== false ? 'position:sticky;top:0;z-index:100;' : '';
            $pairs = preg_split('/\|/', (string)($props['links'] ?? ''));
            $propLinksHtml = '';
            foreach ($pairs as $pair) {
                $pair = trim($pair);
                if ($pair === '') continue;
                $parts = explode(':', $pair, 2);
                $label = trim($parts[0] ?? '');
                $url = safe_url(trim($parts[1] ?? '#'));
                if ($label !== '') {
                    $propLinksHtml .= '<a href="' . $url . '" style="color:inherit;text-decoration:none;font-weight:500;padding:8px 0;">' . h($label) . '</a>';
                }
            }
            // Individual nav links are real child nodes when present; the legacy
            // string prop `links` is only a fallback for older pages.
            $linksHtml = ($childrenHtml !== '') ? $childrenHtml : $propLinksHtml;
            $cta = !empty($props['ctaText'])
                ? '<a href="' . safe_url($props['ctaUrl'] ?? '#') . '" style="padding:10px 20px;background:#146EF5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">' . h($props['ctaText']) . '</a>' : '';
            $logo = !empty($props['logoImage'])
                ? '<a href="' . safe_url($props['logoUrl'] ?? '#') . '"><img src="' . safe_url($props['logoImage']) . '" alt="' . h($props['logoText'] ?? '') . '" style="height:32px;"></a>'
                : '<a href="' . safe_url($props['logoUrl'] ?? '#') . '" style="color:inherit;text-decoration:none;font-weight:700;font-size:20px;">' . h($props['logoText'] ?? 'Brand') . '</a>';
            return '<nav ' . $classAttr . ' style="' . $bgCss . $sticky . 'border-bottom:1px solid rgba(0,0,0,0.05);">'
                . '<div style="max-width:' . h($props['maxWidth'] ?? '1200px') . ';margin:0 auto;padding:' . h($props['padding'] ?? '16px 24px') . ';display:flex;align-items:center;justify-content:space-between;">'
                . $logo . '<div style="display:flex;align-items:center;gap:24px;">' . $linksHtml . $cta . '</div></div></nav>';

        case 'footer':
            $columns = json_decode($props['columns'] ?? '[]', true);
            $bgCss = build_background_css($props);
            if (empty($bgCss)) $bgCss = 'background:' . h($props['backgroundColor'] ?? '#0F172A') . ';';
            $colHtml = '';
            if (is_array($columns)) {
                foreach ($columns as $col) {
                    $links = preg_split('/\|/', (string)($col['links'] ?? ''));
                    $linksHtml = '';
                    foreach ($links as $link) {
                        $link = trim($link);
                        if ($link === '') continue;
                        $parts = explode(':', $link, 2);
                        $label = trim($parts[0] ?? '');
                        $url = safe_url(trim($parts[1] ?? '#'));
                        if ($label !== '') {
                            $linksHtml .= '<a href="' . $url . '" style="color:' . h($props['textColor'] ?? '#94A3B8') . ';text-decoration:none;display:block;padding:4px 0;font-size:14px;">' . h($label) . '</a>';
                        }
                    }
                    $colHtml .= '<div><h4 style="margin:0 0 16px 0;color:' . h($props['headingColor'] ?? '#FFFFFF') . ';font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">' . h($col['title'] ?? '') . '</h4>' . $linksHtml . '</div>';
                }
            }
            return '<footer ' . $classAttr . ' style="' . $bgCss . 'color:' . h($props['textColor'] ?? '#94A3B8') . ';padding:' . h($props['padding'] ?? '64px 24px 32px') . ';"><div style="max-width:1200px;margin:0 auto;">'
                . ($childrenHtml ?: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-bottom:48px;"><div><div style="color:' . h($props['headingColor'] ?? '#FFFFFF') . ';font-weight:700;font-size:20px;margin-bottom:16px;">' . h($props['logoText'] ?? 'Brand') . '</div></div>' . $colHtml . '</div>')
                . '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;text-align:center;font-size:14px;">' . h($props['copyright'] ?? '') . '</div></div></footer>';

        case 'social-icons':
            $links = json_decode($props['links'] ?? '[]', true);
            if (!is_array($links) || empty($links)) return '';
            $radius = ($props['shape'] ?? 'circle') === 'circle' ? '50%' : (($props['shape'] ?? 'circle') === 'square' ? '6px' : '0');
            $icons = '';
            foreach ($links as $link) {
                $icons .= '<a href="' . safe_url($link['url'] ?? '#') . '" style="display:inline-flex;align-items:center;justify-content:center;width:' . h($props['size'] ?? '40px') . ';height:' . h($props['size'] ?? '40px') . ';border-radius:' . $radius . ';background:' . h($props['color'] ?? '#64748B') . ';color:#fff;text-decoration:none;font-weight:700;font-size:16px;">' . h($link['icon'] ?? '🔗') . '</a>';
            }
            return '<div ' . $classAttr . ' style="display:flex;gap:' . h($props['gap'] ?? '12px') . ';">' . $icons . '</div>';

        case 'progress-bar':
            $val = max(0, min(100, (int)($props['value'] ?? 0)));
            return '<div ' . $classAttr . ' style="width:100%;">'
                . (($props['showLabel'] ?? true) !== false ? '<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>' . h($props['label'] ?? '') . '</span><span>' . $val . '%</span></div>' : '')
                . '<div style="width:100%;height:' . h($props['height'] ?? '8px') . ';background:' . h($props['bgColor'] ?? '#E2E8F0') . ';border-radius:999px;overflow:hidden;">'
                . '<div style="width:' . $val . '%;height:100%;background:' . h($props['color'] ?? '#146EF5') . ';border-radius:999px;"></div></div></div>';

        case 'marquee':
            $text = h($props['text'] ?? '');
            $dir = ($props['direction'] ?? 'left') === 'right' ? 'right' : 'left';
            $kfName = 'sb-marquee-' . $dir;
            return '<style>@keyframes ' . $kfName . ' { from { transform: translateX(' . ($dir === 'left' ? '0' : '-50%') . '); } to { transform: translateX(' . ($dir === 'left' ? '-50%' : '0') . '); } }</style>'
                . '<div ' . $classAttr . ' style="overflow:hidden;white-space:nowrap;"><div style="display:inline-block;animation:' . $kfName . ' ' . h($props['speed'] ?? '20s') . ' linear infinite;font-size:' . h($props['fontSize'] ?? '24px') . ';color:' . h($props['color'] ?? '#0F172A') . ';font-weight:700;">'
                . $text . ' &nbsp; ' . $text . ' &nbsp; ' . $text . ' &nbsp; ' . $text . '</div></div>';

        case 'countdown':
            return '<div ' . $classAttr . ' data-target="' . h($props['targetDate'] ?? '') . '" data-expired="' . h($props['expiredMessage'] ?? 'Time is up!') . '" style="text-align:center;">'
                . '<div style="font-size:18px;margin-bottom:16px;font-weight:600;">' . h($props['label'] ?? '') . '</div>'
                . '<div class="sb-countdown-display" style="display:flex;justify-content:center;gap:24px;">'
                . '<div style="text-align:center;"><div class="sb-cd-days" style="font-size:48px;font-weight:800;color:#146EF5;">00</div><div style="font-size:14px;color:#64748B;">Days</div></div>'
                . '<div style="text-align:center;"><div class="sb-cd-hours" style="font-size:48px;font-weight:800;color:#146EF5;">00</div><div style="font-size:14px;color:#64748B;">Hours</div></div>'
                . '<div style="text-align:center;"><div class="sb-cd-mins" style="font-size:48px;font-weight:800;color:#146EF5;">00</div><div style="font-size:14px;color:#64748B;">Min</div></div>'
                . '<div style="text-align:center;"><div class="sb-cd-secs" style="font-size:48px;font-weight:800;color:#146EF5;">00</div><div style="font-size:14px;color:#64748B;">Sec</div></div>'
                . '</div></div>';

        case 'table':
            $headers = preg_split('/\|/', (string)($props['headers'] ?? ''));
            $headers = array_filter(array_map('trim', $headers));
            $rows = json_decode($props['rows'] ?? '[]', true);
            $border = ($props['bordered'] ?? true) !== false ? 'border:1px solid #E2E8F0;' : '';
            $headerHtml = '';
            if (!empty($headers)) {
                $headerHtml = '<thead><tr>';
                foreach ($headers as $hdr) {
                    $headerHtml .= '<th style="padding:12px 16px;background:' . h($props['headerBg'] ?? '#F1F5F9') . ';text-align:left;font-weight:600;' . $border . '">' . h($hdr) . '</th>';
                }
                $headerHtml .= '</tr></thead>';
            }
            $rowsHtml = '';
            if (is_array($rows)) {
                foreach ($rows as $i => $row) {
                    $bg = ($props['striped'] ?? true) !== false && $i % 2 === 1 ? '#F8FAFC' : '#fff';
                    $rowsHtml .= '<tr style="background:' . $bg . ';">';
                    foreach ((array)$row as $cell) {
                        $rowsHtml .= '<td style="padding:12px 16px;' . $border . '">' . h($cell) . '</td>';
                    }
                    $rowsHtml .= '</tr>';
                }
            }
            return '<div ' . $classAttr . ' style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;">' . $headerHtml . '<tbody>' . $rowsHtml . '</tbody></table></div>';

        case 'custom-html':
            return '<div ' . $classAttr . '>' . sanitize_custom_html($props['code'] ?? '') . '</div>';

        case 'custom-css':
            // CSS is compiled separately; this is a visual placeholder in output
            return '';

        case 'code-embed':
            return '<div ' . $classAttr . ' style="min-height:' . h($props['height'] ?? 'auto') . ';">' . sanitize_custom_html($props['code'] ?? '') . '</div>';

        case 'logo':
            $inner = !empty($props['image'])
                ? '<img src="' . safe_url($props['image']) . '" alt="' . h($props['text'] ?? 'Logo') . '" style="height:' . h($props['height'] ?? '32px') . ';display:block;">'
                : '<span style="font-weight:700;font-size:20px;">' . h($props['text'] ?? 'Brand') . '</span>';
            return '<a href="' . safe_url($props['url'] ?? '#') . '" ' . $classAttr . ' style="display:inline-block;text-decoration:none;color:inherit;">' . $inner . '</a>';

        case 'button':
            $variants = [
                'primary' => 'background:#146EF5;color:#fff;border:2px solid #146EF5;',
                'secondary' => 'background:#7C3AED;color:#fff;border:2px solid #7C3AED;',
                'outline' => 'background:transparent;color:#146EF5;border:2px solid #146EF5;',
                'ghost' => 'background:transparent;color:#146EF5;border:2px solid transparent;',
                'danger' => 'background:#EF4444;color:#fff;border:2px solid #EF4444;'
            ];
            $sizes = [
                'sm' => 'padding:8px 16px;font-size:13px;',
                'md' => 'padding:12px 24px;font-size:15px;',
                'lg' => 'padding:16px 32px;font-size:17px;'
            ];
            $v = $variants[$props['variant'] ?? 'primary'] ?? $variants['primary'];
            $s = $sizes[$props['size'] ?? 'md'] ?? $sizes['md'];
            $w = ($props['fullWidth'] ?? false) ? 'width:100%;display:block;text-align:center;' : 'display:inline-block;';
            $icon = !empty($props['icon']) ? h($props['icon']) . ' ' : '';
            return '<a href="' . safe_url($props['url'] ?? '#') . '" ' . $classAttr . ' style="' . $v . $s . $w . 'border-radius:8px;text-decoration:none;font-weight:600;">' . $icon . h($props['text'] ?? 'Click here') . '</a>';

        case 'beforeafter':
            if (empty($props['beforeImage']) || empty($props['afterImage'])) return '';
            $pos = (int)($props['initialPosition'] ?? 50);
            return '<div ' . $classAttr . ' class="sb-beforeafter" data-position="' . $pos . '" style="position:relative;overflow:hidden;border-radius:8px;user-select:none;">'
                . '<img src="' . safe_url($props['afterImage']) . '" alt="After" style="width:100%;display:block;">'
                . '<div class="sb-ba-overlay" style="position:absolute;inset:0;width:' . $pos . '%;overflow:hidden;"><img src="' . safe_url($props['beforeImage']) . '" alt="Before" style="width:100vw;max-width:none;display:block;"></div>'
                . '<div class="sb-ba-handle" style="position:absolute;top:0;bottom:0;left:' . $pos . '%;width:3px;background:#fff;cursor:ew-resize;transform:translateX(-50%);z-index:2;">'
                . '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:14px;">⟷</div></div></div>';

        default:
            // Generic fallback — render children if container, otherwise skip
            if (!empty($childrenHtml)) {
                return '<div ' . $classAttr . '>' . $childrenHtml . '</div>';
            }
            return '';
    }
}

function compile_page($pageData) {
    $page = $pageData['page'] ?? null;
    if (!$page) return '';

    $nodes = $page['nodes'] ?? [];
    $rootId = $page['rootId'] ?? '';
    $settings = $page['settings'] ?? [];
    $tokens = $page['tokens'] ?? [];
    $GLOBALS['SB_PAGE_CLASS_STYLES'] = is_array($page['classStyles'] ?? null) ? $page['classStyles'] : [];
    $GLOBALS['SB_BREAKPOINTS'] = is_array(($page['settings']['breakpoints'] ?? null)) ? $page['settings']['breakpoints'] : ['tablet' => 991, 'mobile' => 479];

    // Runtime context (form submissions need the endpoint + DB page id)
    $context = [
        'submitUrl' => $pageData['submitUrl'] ?? 'api/submit.php',
        'dbPageId' => (int) ($pageData['dbPageId'] ?? 0),
    ];

    // Compile body from root
    $body = '';
    if ($rootId && !empty($nodes[$rootId])) {
        $rootNode = $nodes[$rootId];
        if (!empty($rootNode['children'])) {
            foreach ($rootNode['children'] as $childId) {
                if (!empty($nodes[$childId])) {
                    $body .= compile_node($nodes[$childId], $nodes, $context) . "\n";
                }
            }
        }
    }

    // Generate CSS
    $tokensCss = compile_tokens_css($tokens);
    $nodeCss = compile_styles_to_css($nodes, $rootId);
    $customCss = $page['customCSS'] ?? '';
    $fontsLink = generate_google_fonts_link($tokens);

    // Page-level styles
    $bg = h($settings['pageBackground'] ?? '#FFFFFF');
    $fontFamily = h($settings['fontFamily'] ?? 'Inter, system-ui, sans-serif');
    $title = h($settings['pageTitle'] ?? 'Untitled');
    $description = h($settings['pageDescription'] ?? '');
    $ogImage = !empty($settings['ogImage']) ? '<meta property="og:image" content="' . safe_url($settings['ogImage']) . '">' : '';
    $ogTitle = !empty($settings['ogTitle']) ? '<meta property="og:title" content="' . h($settings['ogTitle']) . '">' : '<meta property="og:title" content="' . $title . '">';
    $favicon = !empty($settings['favicon']) ? '<link rel="icon" href="' . safe_url($settings['favicon']) . '">' : '';

    // Runtime JS for interactive components
    $runtimeJs = generate_runtime_js($nodes);

    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{$title}</title>
{$description}
{$ogTitle}
{$ogImage}
{$favicon}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{$fontsLink}" rel="stylesheet">
<style>
{$tokensCss}
body { margin: 0; background: {$bg}; font-family: {$fontFamily}; }
{$nodeCss}
{$customCss}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
</style>
</head>
<body>
{$body}
<script>
{$runtimeJs}
</script>
</body>
</html>
HTML;
}

function generate_runtime_js($nodes) {
    $js = '';

    // Check what interactive components exist
    $hasSlider = false;
    $hasAccordion = false;
    $hasTabs = false;
    $hasCountdown = false;
    $hasCounter = false;
    $hasForm = false;
    $hasBeforeAfter = false;
    $hasEntranceAnim = false;
    $hasLightbox = false;

    foreach ($nodes as $node) {
        if (!empty($node['props']['lightbox']) && in_array(($node['type'] ?? ''), ['image','image-gallery'], true)) $hasLightbox = true;
        switch ($node['type'] ?? '') {
            case 'slider': $hasSlider = true; break;
            case 'accordion': $hasAccordion = true; break;
            case 'tabs': $hasTabs = true; break;
            case 'countdown': $hasCountdown = true; break;
            case 'stats': $hasCounter = true; break;
            case 'form': $hasForm = true; break;
            case 'beforeafter': $hasBeforeAfter = true; break;
        }
        if (!empty($node['animations']['entrance'])) $hasEntranceAnim = true;
    }

    // Entrance animations (IntersectionObserver)
    if ($hasEntranceAnim) {
        $js .= <<<JS
// Entrance animations
(function(){
  var targets = document.querySelectorAll('[data-entrance-trigger="viewport"]');
  if(!targets.length) return;
  if(!('IntersectionObserver' in window)){
    targets.forEach(function(el){el.style.animationPlayState='running';});
    return;
  }
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.style.animationPlayState='running';
        observer.unobserve(entry.target);
      }
    });
  },{threshold:0.15});
  targets.forEach(function(el){observer.observe(el);});
})();
JS;
    }

    // Slider runtime
    if ($hasSlider) {
        $js .= <<<JS
// Slider
document.querySelectorAll('.sb-slider').forEach(function(slider){
  var track=slider.querySelector('.sb-slider-track');
  var slides=track?track.children:[];
  var dots=slider.querySelectorAll('.sb-slider-dot');
  var prev=slider.querySelector('.sb-slider-prev');
  var next=slider.querySelector('.sb-slider-next');
  var current=0;
  var autoplay=slider.dataset.autoplay==='true';
  var interval=parseInt(slider.dataset.interval||'5000');
  var infinite=slider.dataset.infinite==='true';
  function goTo(i){
    if(i<0)i=infinite?slides.length-1:0;
    if(i>=slides.length)i=infinite?0:slides.length-1;
    current=i;
    var mode=slider.dataset.transition||'slide';
    if(mode==='fade'){
      Array.prototype.forEach.call(slides,function(slide,j){slide.style.minWidth='100%';slide.style.position='absolute';slide.style.inset='0';slide.style.opacity=j===i?'1':'0';slide.style.transition='opacity .45s ease';slide.style.pointerEvents=j===i?'auto':'none';});
      track.style.position='relative'; track.style.transform='none';
    } else if(mode==='zoom'){
      Array.prototype.forEach.call(slides,function(slide,j){slide.style.minWidth='100%';slide.style.position='absolute';slide.style.inset='0';slide.style.opacity=j===i?'1':'0';slide.style.transform=j===i?'scale(1)':'scale(1.06)';slide.style.transition='opacity .45s ease, transform .45s ease';slide.style.pointerEvents=j===i?'auto':'none';});
      track.style.position='relative'; track.style.transform='none';
    } else { track.style.transform='translateX(-'+(i*100)+'%)'; }
    dots.forEach(function(d,j){d.style.background=j===i?'#146EF5':'#CBD5E1';d.setAttribute('aria-current',j===i?'true':'false');});
  }
  if(prev)prev.addEventListener('click',function(){goTo(current-1);});
  if(next)next.addEventListener('click',function(){goTo(current+1);});
  dots.forEach(function(d){d.addEventListener('click',function(){goTo(parseInt(d.dataset.index));});});
  var timer=null;
  function start(){if(autoplay&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&!timer)timer=setInterval(function(){if(!slider.matches(':hover')&&!slider.contains(document.activeElement))goTo(current+1);},Math.max(1500,interval));}
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  slider.addEventListener('mouseenter',stop); slider.addEventListener('mouseleave',start);
  slider.addEventListener('focusin',stop); slider.addEventListener('focusout',start);
  slider.setAttribute('aria-roledescription','carousel');
  if(slides.length){Array.prototype.forEach.call(slides,function(slide,i){slide.setAttribute('aria-label','Slide '+(i+1)+' of '+slides.length);});goTo(0);}
  start();
  // Touch swipe
  var startX=0;
  slider.addEventListener('touchstart',function(e){startX=e.touches[0].clientX;},{passive:true});
  slider.addEventListener('touchend',function(e){
    var diff=e.changedTouches[0].clientX-startX;
    if(Math.abs(diff)>50){diff>0?goTo(current-1):goTo(current+1);}
  },{passive:true});
});
JS;
    }

    // Accordion
    if ($hasAccordion) {
        $js .= <<<JS
// Accordion
document.querySelectorAll('.sb-accordion-trigger').forEach(function(btn){
  btn.addEventListener('click',function(){
    var content=btn.nextElementSibling;
    var isOpen=content.style.maxHeight&&content.style.maxHeight!=='0px';
    content.style.maxHeight=isOpen?'0px':content.scrollHeight+'px';
    var arrow=btn.querySelector('span:last-child');
    if(arrow)arrow.style.transform=isOpen?'rotate(0deg)':'rotate(180deg)';
  });
});
JS;
    }

    // Tabs
    if ($hasTabs) {
        $js .= <<<JS
// Tabs
document.querySelectorAll('.sb-tabs').forEach(function(tabs){
  var header=tabs.querySelector('.sb-tabs-header');
  var content=tabs.querySelector('.sb-tabs-content');
  if(!header||!content)return;
  var btns=header.querySelectorAll('.sb-tab-btn');
  var tabData=[];
  try{tabData=JSON.parse(tabs.dataset.tabs||'[]');}catch(e){}
  btns.forEach(function(btn){
    btn.addEventListener('click',function(){
      btns.forEach(function(b){b.style.borderBottom='none';b.style.color='#64748B';b.style.fontWeight='400';});
      btn.style.borderBottom='2px solid #146EF5';btn.style.color='#146EF5';btn.style.fontWeight='600';
      var idx=parseInt(btn.dataset.index);
      if(tabData[idx])content.textContent=tabData[idx].content||'';
    });
  });
});
JS;
    }

    // Countdown
    if ($hasCountdown) {
        $js .= <<<JS
// Countdown
document.querySelectorAll('.sb-countdown').forEach(function(el){
  var target=new Date(el.dataset.target||'').getTime();
  var expiredMsg=el.dataset.expired||'Time is up!';
  if(isNaN(target))return;
  var daysEl=el.querySelector('.sb-cd-days');
  var hoursEl=el.querySelector('.sb-cd-hours');
  var minsEl=el.querySelector('.sb-cd-mins');
  var secsEl=el.querySelector('.sb-cd-secs');
  function update(){
    var now=Date.now();
    var diff=target-now;
    if(diff<=0){
      el.querySelector('.sb-countdown-display').innerHTML='<div style="font-size:24px;font-weight:600;color:#146EF5;">'+expiredMsg+'</div>';
      return;
    }
    var d=Math.floor(diff/86400000);
    var h=Math.floor((diff%86400000)/3600000);
    var m=Math.floor((diff%3600000)/60000);
    var s=Math.floor((diff%60000)/1000);
    if(daysEl)daysEl.textContent=String(d).padStart(2,'0');
    if(hoursEl)hoursEl.textContent=String(h).padStart(2,'0');
    if(minsEl)minsEl.textContent=String(m).padStart(2,'0');
    if(secsEl)secsEl.textContent=String(s).padStart(2,'0');
  }
  update();
  setInterval(update,1000);
});
JS;
    }

    // Counter animation
    if ($hasCounter) {
        $js .= <<<JS
// Counter animation
(function(){
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting)return;
      var el=entry.target;
      var target=parseInt(el.dataset.target||'0');
      if(isNaN(target)){observer.unobserve(el);return;}
      var suffix=el.textContent.replace(/^[\d,]+/,'');
      var current=0;
      var step=Math.ceil(target/60);
      function animate(){
        current+=step;
        if(current>=target){current=target;}
        el.textContent=current.toLocaleString()+suffix;
        if(current<target)requestAnimationFrame(animate);
      }
      animate();
      observer.unobserve(el);
    });
  },{threshold:0.5});
  document.querySelectorAll('.sb-counter').forEach(function(el){observer.observe(el);});
})();
JS;
    }

    // Form handling
    if ($hasForm) {
        $js .= <<<JS
// Forms
document.querySelectorAll('.sb-form').forEach(function(form){
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var method=form.dataset.submitMethod||'email';
    var recipient=form.dataset.recipient||'';
    var successMsg=form.dataset.success||'Thank you!';
    var redirect=form.dataset.redirect||'';
    var formData=new FormData(form);
    var data={};
    formData.forEach(function(v,k){data[k]=v;});
    var msgEl=form.querySelector('.sb-form-message');
    var url=form.dataset.submitUrl||'api/submit.php';
    var pageId=parseInt(form.dataset.pageId||'0',10);
    function showMessage(text,ok){
      if(!msgEl)return;
      msgEl.style.display='block';
      msgEl.textContent=text;
      msgEl.style.background=ok?'#F0FDF4':'#FEF2F2';
      msgEl.style.color=ok?'#166534':'#991B1B';
    }
    var submitBtn=form.querySelector('button[type="submit"]');
    if(submitBtn)submitBtn.disabled=true;
    fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pageId:pageId,formId:form.dataset.formId||'',data:data})
    }).then(function(res){return res.json().catch(function(){return {success:res.ok};});})
      .then(function(res){
        if(res&&res.success){
          showMessage(successMsg,true);
          form.reset();
          if(redirect)setTimeout(function(){window.location.href=redirect;},1200);
        }else{
          showMessage((res&&res.error)||'Something went wrong. Please try again.',false);
        }
      })
      .catch(function(){showMessage('Network error. Please try again.',false);})
      .then(function(){if(submitBtn)submitBtn.disabled=false;});
  });
});
JS;
    }

    // Before/After slider
    if ($hasBeforeAfter) {
        $js .= <<<JS
// Before/After
document.querySelectorAll('.sb-beforeafter').forEach(function(ba){
  var overlay=ba.querySelector('.sb-ba-overlay');
  var handle=ba.querySelector('.sb-ba-handle');
  if(!overlay||!handle)return;
  var isDragging=false;
  function setPosition(x){
    var rect=ba.getBoundingClientRect();
    var pos=Math.max(0,Math.min(100,((x-rect.left)/rect.width)*100));
    overlay.style.width=pos+'%';
    handle.style.left=pos+'%';
  }
  handle.addEventListener('mousedown',function(e){e.preventDefault();isDragging=true;});
  document.addEventListener('mousemove',function(e){if(isDragging)setPosition(e.clientX);});
  document.addEventListener('mouseup',function(){isDragging=false;});
  ba.addEventListener('click',function(e){setPosition(e.clientX);});
});
JS;
    }

    // Accessible lightbox for image blocks and galleries.
    if ($hasLightbox) {
        $js .= <<<'JS'
// Accessible SiteBuilder lightbox (Escape, click-outside, focus restore, scroll lock).
(function(){
  var overlay, image, closeButton, previousFocus;
  function close(){
    if(!overlay) return;
    overlay.hidden=true; document.body.style.overflow='';
    if(previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function ensure(){
    if(overlay) return;
    overlay=document.createElement('div'); overlay.className='sb-lightbox'; overlay.hidden=true;
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','Image preview');
    overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:5vw;';
    image=document.createElement('img'); image.style.cssText='max-width:100%;max-height:90vh;object-fit:contain;';
    closeButton=document.createElement('button'); closeButton.type='button'; closeButton.textContent='Close'; closeButton.setAttribute('aria-label','Close image preview');
    closeButton.style.cssText='position:absolute;top:16px;right:16px;padding:10px 14px;border:0;border-radius:6px;background:#fff;color:#111;cursor:pointer;';
    overlay.appendChild(image); overlay.appendChild(closeButton); document.body.appendChild(overlay);
    closeButton.addEventListener('click',close); overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    document.addEventListener('keydown',function(e){if(!overlay.hidden&&e.key==='Escape')close();});
  }
  document.addEventListener('click',function(e){
    var link=e.target.closest('a[data-sb-lightbox]'); if(!link)return;
    e.preventDefault(); ensure(); previousFocus=document.activeElement;
    var img=link.querySelector('img'); image.src=link.href; image.alt=link.dataset.lightboxAlt||(img?img.alt:'');
    overlay.hidden=false; document.body.style.overflow='hidden'; closeButton.focus();
  });
})();
JS;
    }

    return $js;
}
