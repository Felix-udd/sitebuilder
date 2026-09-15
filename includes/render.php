<?php
// Turns a page's block data into a complete, standalone HTML page.
// This is the single source of truth for output - both the "preview"
// endpoint and the "publish" endpoint call render_page() so what you
// see in preview is exactly what gets published.

function h($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function safe_url($url) {
    $url = trim((string) $url);
    if ($url === '') {
        return '#';
    }
    // Allow relative links, mailto, tel, and http(s) only.
    if (preg_match('#^(https?:)?//#i', $url) ||
        preg_match('#^(mailto:|tel:)#i', $url) ||
        preg_match('#^[^:]*$#', $url)) {
        return h($url);
    }
    return '#';
}

// Safe, bounded "rich text": supports **bold**, *italic*, [label](url).
// Everything else is escaped exactly like plain text - this never opens up
// arbitrary HTML, it only ever emits <strong>/<em>/<a> that we build ourselves.
// Mirrors richText() in assets/js/blocks.js exactly.
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

// Basic defense-in-depth for the custom-html block. This is a single-user,
// local tool - the person importing a template is the same person who'll
// publish it, so this isn't guarding a real trust boundary the way it would
// on a public multi-tenant site. It just strips the most common accidental
// hazards (a script tag copied in from an untrusted downloaded snippet).
function sanitize_custom_html($html) {
    $html = (string) $html;
    $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html);
    $html = preg_replace('#<style\b[^>]*>.*?</style>#is', '', $html);
    $html = preg_replace('#\son\w+\s*=\s*"[^"]*"#i', '', $html);
    $html = preg_replace("#\son\w+\s*=\s*'[^']*'#i", '', $html);
    $html = preg_replace('#\son\w+\s*=\s*[^\s>]+#i', '', $html);
    $html = preg_replace('#(href|src)\s*=\s*("|\')\s*javascript:[^"\']*("|\')#i', '$1=$2#$3', $html);
    return $html;
}

function render_block($block) {
    $type  = $block['type'] ?? '';
    $props = $block['props'] ?? [];

    switch ($type) {
        case 'hero':
            $align = h($props['align'] ?? 'center');
            $bg    = h($props['bgColor'] ?? '#1D2027');
            $fg    = h($props['textColor'] ?? '#FFFFFF');
            $heading = h($props['heading'] ?? '');
            $sub     = h($props['subheading'] ?? '');
            $btnText = trim($props['buttonText'] ?? '');
            $btnUrl  = safe_url($props['buttonUrl'] ?? '');
            $btnHtml = '';
            if ($btnText !== '') {
                $btnHtml = '<a class="sb-btn" href="' . $btnUrl . '">' . h($btnText) . '</a>';
            }
            return '<section class="sb-block sb-hero" style="background:' . $bg . ';color:' . $fg . ';text-align:' . $align . ';">'
                 . '<h1>' . $heading . '</h1>'
                 . ($sub !== '' ? '<p class="sb-hero-sub">' . $sub . '</p>' : '')
                 . $btnHtml
                 . '</section>';

        case 'heading':
            $level = in_array($props['level'] ?? 'h2', ['h1','h2','h3','h4'], true) ? $props['level'] : 'h2';
            $align = h($props['align'] ?? 'left');
            $color = h($props['color'] ?? '#1A1A1A');
            $text  = h($props['text'] ?? '');
            return '<div class="sb-block" style="text-align:' . $align . ';">'
                 . '<' . $level . ' style="color:' . $color . ';margin:0;">' . $text . '</' . $level . '>'
                 . '</div>';

        case 'text':
            $align = h($props['align'] ?? 'left');
            $color = h($props['color'] ?? '#333333');
            $size  = (int) ($props['fontSize'] ?? 16);
            $text  = render_rich_text($props['text'] ?? '');
            return '<div class="sb-block" style="text-align:' . $align . ';">'
                 . '<p style="color:' . $color . ';font-size:' . $size . 'px;margin:0;">' . $text . '</p>'
                 . '</div>';

        case 'image':
            $src   = safe_url($props['src'] ?? '');
            $alt   = h($props['alt'] ?? '');
            $width = h($props['width'] ?? '100%');
            $align = h($props['align'] ?? 'center');
            if (trim($props['src'] ?? '') === '') {
                return '';
            }
            return '<div class="sb-block" style="text-align:' . $align . ';">'
                 . '<img src="' . $src . '" alt="' . $alt . '" style="max-width:' . $width . ';height:auto;border-radius:4px;">'
                 . '</div>';

        case 'button':
            $text  = h($props['text'] ?? 'Click here');
            $url   = safe_url($props['url'] ?? '');
            $bg    = h($props['bgColor'] ?? '#7C6FF0');
            $fg    = h($props['textColor'] ?? '#FFFFFF');
            $align = h($props['align'] ?? 'left');
            return '<div class="sb-block" style="text-align:' . $align . ';">'
                 . '<a class="sb-btn" href="' . $url . '" style="background:' . $bg . ';color:' . $fg . ';">' . $text . '</a>'
                 . '</div>';

        case 'spacer':
            $height = (int) ($props['height'] ?? 40);
            return '<div class="sb-block" style="height:' . $height . 'px;"></div>';

        case 'divider':
            $color = h($props['color'] ?? '#E0E0E0');
            $thickness = (int) ($props['thickness'] ?? 1);
            return '<div class="sb-block"><hr style="border:none;border-top:' . $thickness . 'px solid ' . $color . ';margin:0;"></div>';

        case 'columns':
            $left  = render_rich_text($props['leftText'] ?? '');
            $right = render_rich_text($props['rightText'] ?? '');
            return '<div class="sb-block sb-columns">'
                 . '<div class="sb-col">' . $left . '</div>'
                 . '<div class="sb-col">' . $right . '</div>'
                 . '</div>';

        case 'grid':
            $cols = max(1, min(6, (int) ($props['columns'] ?? 3)));
            $gap  = (int) ($props['gap'] ?? 16);
            $cells = is_array($props['cells'] ?? null) ? $props['cells'] : [];
            $cellsHtml = '';
            foreach ($cells as $cell) {
                $cellsHtml .= '<div class="sb-grid-cell">' . render_rich_text($cell) . '</div>';
            }
            return '<div class="sb-block sb-grid" style="grid-template-columns:repeat(' . $cols . ',1fr);gap:' . $gap . 'px;">'
                 . $cellsHtml
                 . '</div>';

        case 'html':
            return '<div class="sb-block sb-custom-html">' . sanitize_custom_html($props['code'] ?? '') . '</div>';

        case 'nav':
            $bg    = h($props['bgColor'] ?? '#FFFFFF');
            $fg    = h($props['textColor'] ?? '#1A1A1A');
            $logo  = h($props['logoText'] ?? 'Brand');
            $ctaText = trim($props['ctaText'] ?? '');
            $ctaUrl  = safe_url($props['ctaUrl'] ?? '');
            $ctaColor = h($props['ctaColor'] ?? '#7C6FF0');
            $linksRaw = (string) ($props['links'] ?? '');
            $linksHtml = '';
            foreach (explode('|', $linksRaw) as $pair) {
                $pair = trim($pair);
                if ($pair === '') continue;
                $parts = explode(':', $pair, 2);
                $label = trim($parts[0] ?? '');
                $url   = safe_url(trim($parts[1] ?? '#'));
                if ($label === '') continue;
                $linksHtml .= '<a href="' . $url . '">' . h($label) . '</a>';
            }
            $ctaHtml = $ctaText !== ''
                ? '<a class="sb-nav-cta" href="' . $ctaUrl . '" style="background:' . $ctaColor . ';color:#fff;">' . h($ctaText) . '</a>'
                : '';
            return '<nav class="sb-block sb-nav" style="background:' . $bg . ';color:' . $fg . ';">'
                 . '<div class="sb-nav-logo">' . $logo . '</div>'
                 . '<div class="sb-nav-links">' . $linksHtml . $ctaHtml . '</div>'
                 . '</nav>';

        default:
            return '';
    }
}

function render_block_outer($block) {
    $inner = render_block($block);
    if ($inner === '') {
        return '';
    }
    $layout = $block['layout'] ?? [];
    $width  = isset($layout['widthPct']) ? max(10, min(100, (float) $layout['widthPct'])) : 100;
    $offset = isset($layout['offsetXPct']) ? max(0, min(100 - $width, (float) $layout['offsetXPct'])) : 0;
    $minHeight = isset($layout['minHeight']) ? max(0, (int) $layout['minHeight']) : 0;

    $style = 'width:' . $width . '%;margin-left:' . $offset . '%;';
    if ($minHeight > 0) {
        $style .= 'min-height:' . $minHeight . 'px;display:flex;flex-direction:column;justify-content:center;';
    }

    return '<div class="sb-pos" style="' . $style . '">' . $inner . '</div>';
}

function render_page($pageName, $blocks, $settings = []) {
    $title = h($settings['pageTitle'] ?? $pageName);
    $bg    = h($settings['pageBackground'] ?? '#FFFFFF');
    $font  = h($settings['fontFamily'] ?? 'Arial, Helvetica, sans-serif');

    $body = '';
    foreach ($blocks as $block) {
        $body .= render_block_outer($block) . "\n";
    }

    $sharedCss = @file_get_contents(__DIR__ . '/../assets/css/site-blocks.css');
    if ($sharedCss === false) {
        $sharedCss = '';
    }

    return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{$title}</title>
<style>
  body { margin: 0; background: {$bg}; font-family: {$font}; }
  .sb-pos { max-width: 100%; }
  {$sharedCss}
</style>
</head>
<body>
{$body}
</body>
</html>
HTML;
}
