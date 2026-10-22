<?php
// CSS Compiler: Turns the page IR into production-ready CSS.
// Generates class-based CSS with sparse per-breakpoint media queries.
// Only overridden properties are emitted per breakpoint.

function compile_tokens_css($tokens) {
    $lines = [':root {'];
    if (!empty($tokens['colors'])) {
        foreach ($tokens['colors'] as $name => $value) {
            $lines[] = '  --color-' . sanitize_css_name($name) . ': ' . $value . ';';
        }
    }
    if (!empty($tokens['fonts'])) {
        foreach ($tokens['fonts'] as $name => $value) {
            $lines[] = '  --font-' . sanitize_css_name($name) . ': "' . $value . '", system-ui, sans-serif;';
        }
    }
    if (!empty($tokens['spacing'])) {
        foreach ($tokens['spacing'] as $name => $value) {
            $lines[] = '  --spacing-' . sanitize_css_name($name) . ': ' . $value . ';';
        }
    }
    if (!empty($tokens['radii'])) {
        foreach ($tokens['radii'] as $name => $value) {
            $lines[] = '  --radius-' . sanitize_css_name($name) . ': ' . $value . ';';
        }
    }
    if (!empty($tokens['shadows'])) {
        foreach ($tokens['shadows'] as $name => $value) {
            $lines[] = '  --shadow-' . sanitize_css_name($name) . ': ' . $value . ';';
        }
    }
    $lines[] = '}';
    return implode("\n", $lines);
}

function sanitize_css_name($name) {
    return preg_replace('/[^a-z0-9\-]/', '-', strtolower((string) $name));
}

function valid_css_property_name($name) {
    return (bool) preg_match('/^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/i', (string) $name);
}

function valid_css_value($value) {
    $value = trim((string) $value);
    if ($value === '' || preg_match('/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) return false;
    // A declaration value cannot terminate its declaration or escape into a rule.
    if (strpos($value, ';') !== false || strpos($value, '{') !== false || strpos($value, '}') !== false) return false;
    if (preg_match('/expression\s*\(|javascript\s*:/i', $value)) return false;
    return true;
}

function css_background_from_props($props) {
    $type = $props['backgroundType'] ?? 'none';
    if ($type === 'color' && !empty($props['backgroundColor']) && valid_css_value($props['backgroundColor'])) {
        return 'background-color:' . $props['backgroundColor'];
    }
    if ($type === 'gradient') {
        $angle = max(0, min(360, (int) ($props['gradientAngle'] ?? 135)));
        $stops = $props['gradientStops'] ?? ['#667eea', '#764ba2'];
        if (!is_array($stops) || count($stops) < 2) return '';
        $safeStops = [];
        foreach ($stops as $stop) {
            if (!valid_css_value($stop)) return '';
            $safeStops[] = trim($stop);
        }
        $kind = in_array(($props['gradientType'] ?? 'linear'), ['linear','radial','conic'], true) ? ($props['gradientType'] ?? 'linear') : 'linear';
        if ($kind === 'radial') $gradient = 'radial-gradient(ellipse at center,' . implode(',', $safeStops) . ')';
        elseif ($kind === 'conic') $gradient = 'conic-gradient(from ' . $angle . 'deg,' . implode(',', $safeStops) . ')';
        else $gradient = 'linear-gradient(' . $angle . 'deg,' . implode(',', $safeStops) . ')';
        return 'background-image:' . $gradient;
    }
    if (in_array($type, ['image','video'], true) && !empty($props['backgroundImage'])) {
        $url = trim((string) $props['backgroundImage']);
        $unsafeUrlCharacter = false;
        foreach ([chr(34), chr(92), chr(13), chr(10), ';', '{', '}', '(', ')', '<', '>'] as $badChar) {
            if (strpos($url, $badChar) !== false) { $unsafeUrlCharacter = true; break; }
        }
        if (preg_match('/^(javascript|data|vbscript):/i', $url) || $unsafeUrlCharacter) return '';
        $posX = $props['backgroundPositionX'] ?? ($props['backgroundPosition'] ?? 'center');
        $posY = $props['backgroundPositionY'] ?? 'center';
        $size = $props['backgroundSize'] ?? 'cover';
        $repeat = $props['backgroundRepeat'] ?? 'no-repeat';
        foreach ([$posX, $posY, $size, $repeat] as $v) if (!valid_css_value($v)) return '';
        return 'background-image:url("' . str_replace(['\\','"'], '', $url) . '");background-position:' . $posX . ' ' . $posY . ';background-size:' . $size . ';background-repeat:' . $repeat;
    }
    return '';
}

function compile_styles_to_css($nodes, $rootId) {
    $baseRules = [];
    $tabletRules = [];
    $mobileRules = [];
    $animationRules = [];
    $hoverRules = [];
    $keyframes = [];
    $nodeCustomCss = [];

    foreach ($nodes as $node) {
        if ($node['type'] === 'page') continue;

        // Per-element custom CSS (raw rules provided by the editor)
        if (!empty($node['meta']['customCSS'])) {
            $nodeCustomCss[] = $node['meta']['customCSS'];
        }
        $class = 'sb-' . $node['id'];
        $def = get_block_def($node['type']);

        // Base styles
        $baseDeclarations = [];
        // Universal backgrounds work on any block, not only section/hero templates.
        $bgDeclaration = css_background_from_props($node['props'] ?? []);
        if ($bgDeclaration !== '') {
            foreach (explode(';', $bgDeclaration) as $declaration) {
                if (strpos($declaration, ':') !== false) $baseDeclarations[] = $declaration . ' !important';
            }
        }
        if (!empty($node['style']['base'])) {
            foreach ($node['style']['base'] as $prop => $value) {
                if ($value !== '' && $value !== null && valid_css_property_name($prop) && valid_css_value($value)) {
                    // !important lets editor style overrides beat the block's
                    // own inline defaults (which are baked in at render time).
                    $baseDeclarations[] = $prop . ':' . $value . ' !important';
                }
            }
        }
        if (!empty($baseDeclarations)) {
            $baseRules[] = '.' . $class . ' { ' . implode('; ', $baseDeclarations) . '; }';
        }

        // Tablet overrides
        if (!empty($node['style']['tablet'])) {
            $tabletDeclarations = [];
            foreach ($node['style']['tablet'] as $prop => $value) {
                if ($value !== '' && $value !== null && valid_css_property_name($prop) && valid_css_value($value)) {
                    $tabletDeclarations[] = $prop . ':' . $value . ' !important';
                }
            }
            if (!empty($tabletDeclarations)) {
                $tabletRules[] = '.' . $class . ' { ' . implode('; ', $tabletDeclarations) . '; }';
            }
        }

        // Mobile overrides
        if (!empty($node['style']['mobile'])) {
            $mobileDeclarations = [];
            foreach ($node['style']['mobile'] as $prop => $value) {
                if ($value !== '' && $value !== null && valid_css_property_name($prop) && valid_css_value($value)) {
                    $mobileDeclarations[] = $prop . ':' . $value . ' !important';
                }
            }
            if (!empty($mobileDeclarations)) {
                $mobileRules[] = '.' . $class . ' { ' . implode('; ', $mobileDeclarations) . '; }';
            }
        }

        // Entrance animations
        // Config shape (from the editor): { animation, duration(ms), delay(ms), easing, trigger }
        // Legacy shape: { type: 'fadeIn', duration(s), delay(s), easing }
        if (!empty($node['animations']['entrance'])) {
            $anim = $node['animations']['entrance'];

            $map = [
                'fade-up' => 'fadeInUp', 'fade-down' => 'fadeInDown',
                'fade-left' => 'fadeInLeft', 'fade-right' => 'fadeInRight',
                'fade-in' => 'fadeIn', 'zoom-in' => 'zoomIn', 'zoom-out' => 'zoomOut',
                'bounce-in' => 'bounceIn', 'flip-up' => 'flipInX', 'rotate-in' => 'rotateIn',
                'slide-up' => 'slideUp',
            ];
            $key = $anim['animation'] ?? $anim['type'] ?? 'fade-up';
            $kfType = $map[$key] ?? 'fadeIn';

            // Duration: editor sends ms, legacy sends seconds
            if (isset($anim['animation'])) {
                $durationMs = (int)($anim['duration'] ?? 600);
                $delayMs = (int)($anim['delay'] ?? 0);
            } else {
                $durationMs = (int)round(($anim['duration'] ?? 0.6) * 1000);
                $delayMs = (int)round(($anim['delay'] ?? 0) * 1000);
            }
            $easing = $anim['easing'] ?? 'ease-out';
            $trigger = $anim['trigger'] ?? 'load';

            $kfName = 'sb-anim-' . $kfType;
            $kf = get_keyframes($kfType);
            if ($kf) {
                $keyframes[$kfName] = $kf;
            }

            $playState = ($trigger === 'viewport') ? ' animation-play-state: paused;' : '';
            $animationRules[] = '.' . $class . ' { opacity: 0; animation: ' . $kfName . ' ' . $durationMs . 'ms ' . $easing . ' ' . $delayMs . 'ms forwards;' . $playState . ' }';
        }

        // Hover animations
        // Config shape (from the editor): { effect, intensity, duration(ms) }
        // Legacy shape: { properties: {...}, duration(s), easing }
        if (!empty($node['animations']['hover'])) {
            $hover = $node['animations']['hover'];
            $hoverDeclarations = [];

            if (!empty($hover['effect']) && $hover['effect'] !== 'none') {
                $intensity = max(10, (int)($hover['intensity'] ?? 100)) / 100;
                switch ($hover['effect']) {
                    case 'scale':
                        $hoverDeclarations[] = 'transform: scale(' . round(1 + 0.04 * $intensity, 3) . ')';
                        break;
                    case 'scale-down':
                        $hoverDeclarations[] = 'transform: scale(' . round(1 - 0.04 * $intensity, 3) . ')';
                        break;
                    case 'lift':
                        $hoverDeclarations[] = 'transform: translateY(' . round(-6 * $intensity) . 'px)';
                        $hoverDeclarations[] = 'box-shadow: 0 ' . round(12 * $intensity) . 'px ' . round(28 * $intensity) . 'px rgba(0,0,0,0.18)';
                        break;
                    case 'glow':
                        $hoverDeclarations[] = 'box-shadow: 0 0 ' . round(24 * $intensity) . 'px rgba(20,110,245,' . round(0.45 * $intensity, 2) . ')';
                        break;
                    case 'brightness':
                        $hoverDeclarations[] = 'filter: brightness(' . round(1 + 0.15 * $intensity, 2) . ')';
                        break;
                    case 'grayscale':
                        $hoverDeclarations[] = 'filter: grayscale(100%)';
                        break;
                    case 'tilt':
                        $hoverDeclarations[] = 'transform: rotate(' . round(-2 * $intensity, 2) . 'deg) scale(' . round(1 + 0.01 * $intensity, 3) . ')';
                        break;
                }
            }

            if (!empty($hover['properties'])) {
                foreach ($hover['properties'] as $prop => $value) {
                    $hoverDeclarations[] = $prop . ':' . $value;
                }
            }

            $durationMs = isset($hover['effect'])
                ? (int)($hover['duration'] ?? 300)
                : (int)round(($hover['duration'] ?? 0.3) * 1000);
            $easing = $hover['easing'] ?? 'ease-out';

            // Hover values must beat inline defaults too
            $hoverDeclarations = array_map(function ($d) { return $d . ' !important'; }, $hoverDeclarations);
            $hoverDeclarations[] = 'transition: all ' . $durationMs . 'ms ' . $easing;

            if (!empty($hoverDeclarations)) {
                $hoverRules[] = '.' . $class . ':hover { ' . implode('; ', $hoverDeclarations) . '; }';
            }
        }

        // Explicit element states (hover/focus/active/focus-visible) are stored
        // separately from base styles so they never leak into normal rendering.
        $states = $node['meta']['stateStyles'] ?? [];
        foreach (['hover' => ':hover', 'focus' => ':focus', 'active' => ':active', 'focus-visible' => ':focus-visible'] as $stateName => $pseudo) {
            $stateDeclarations = [];
            foreach (($states[$stateName] ?? []) as $prop => $value) {
                if (valid_css_property_name($prop) && valid_css_value($value)) {
                    $stateDeclarations[] = $prop . ':' . $value . ' !important';
                }
            }
            if ($stateDeclarations) $hoverRules[] = '.' . $class . $pseudo . ' { ' . implode('; ', $stateDeclarations) . '; }';
        }
    }

    // Custom CSS blocks now compile their saved props.css. A targetId matching
    // a node id scopes the rules to that node; otherwise authored selectors are retained.
    foreach ($nodes as $cssNode) {
        if (($cssNode['type'] ?? '') !== 'custom-css') continue;
        $raw = trim((string) ($cssNode['props']['css'] ?? ''));
        if ($raw === '') continue;
        $targetId = trim((string) ($cssNode['props']['targetId'] ?? ''));
        if ($targetId !== '' && isset($nodes[$targetId])) {
            $selector = '.sb-' . preg_replace('/[^A-Za-z0-9_-]/', '', $targetId);
            if ($selector !== '.sb-') $nodeCustomCss[] = $selector . ' { ' . trim($raw, " ;\n\r\t") . ' }';
        } elseif ($targetId !== '') {
            $anchorFound = false;
            foreach ($nodes as $targetNode) {
                if (($targetNode['meta']['anchorId'] ?? '') === $targetId) {
                    $nodeCustomCss[] = '#' . preg_replace('/[^A-Za-z0-9_.:-]/', '', $targetId) . ' { ' . trim($raw, " ;\n\r\t") . ' }';
                    $anchorFound = true; break;
                }
            }
            if (!$anchorFound) $nodeCustomCss[] = $raw;
        } else {
            $nodeCustomCss[] = $raw;
        }
    }

    // Shared reusable class styles stored as page.classStyles: {name:{property:value}}.
    // Only safe class identifiers and CSS declarations are emitted.
    $pageClassStyles = $GLOBALS['SB_PAGE_CLASS_STYLES'] ?? [];
    foreach ($pageClassStyles as $className => $declarations) {
        $className = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $className);
        if ($className === '' || !is_array($declarations)) continue;
        $pairs = [];
        foreach ($declarations as $prop => $value) {
            if (valid_css_property_name($prop) && valid_css_value($value)) $pairs[] = $prop . ':' . $value;
        }
        if ($pairs) $nodeCustomCss[] = '.' . $className . ' { ' . implode(';', array_map(function ($pair) { return $pair . ' !important'; }, $pairs)) . ' }';
    }

    // Build CSS
    $css = '';

    // Keyframes
    foreach ($keyframes as $name => $kf) {
        $css .= '@keyframes ' . $name . ' { ' . $kf . " }\n";
    }

    // Base rules
    foreach ($baseRules as $rule) {
        $css .= $rule . "\n";
    }

    // Tablet media query
    if (!empty($tabletRules)) {
        $tabletWidth = max(320, min(1920, (int) (($GLOBALS['SB_BREAKPOINTS']['tablet'] ?? 991))));
        $css .= "\n@media (max-width: " . $tabletWidth . "px) {\n";
        foreach ($tabletRules as $rule) {
            $css .= '  ' . $rule . "\n";
        }
        $css .= "}\n";
    }

    // Mobile media query
    if (!empty($mobileRules)) {
        $mobileWidth = max(240, min(1200, (int) (($GLOBALS['SB_BREAKPOINTS']['mobile'] ?? 479))));
        $css .= "\n@media (max-width: " . $mobileWidth . "px) {\n";
        foreach ($mobileRules as $rule) {
            $css .= '  ' . $rule . "\n";
        }
        $css .= "}\n";
    }

    // Hover rules
    foreach ($hoverRules as $rule) {
        $css .= $rule . "\n";
    }

    // Animation rules
    foreach ($animationRules as $rule) {
        $css .= $rule . "\n";
    }

    // Per-element custom CSS
    foreach ($nodeCustomCss as $custom) {
        $css .= $custom . "\n";
    }

    return $css;
}

function get_keyframes($type) {
    $kf = [
        'fadeIn' => 'from { opacity: 0; } to { opacity: 1; }',
        'fadeInUp' => 'from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); }',
        'fadeInDown' => 'from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); }',
        'fadeInLeft' => 'from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); }',
        'fadeInRight' => 'from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); }',
        'zoomIn' => 'from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); }',
        'zoomOut' => 'from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); }',
        'slideUp' => 'from { opacity: 0; transform: translateY(60px); } to { opacity: 1; transform: translateY(0); }',
        'bounceIn' => '0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); }',
        'rotateIn' => 'from { opacity: 0; transform: rotate(-200deg); } to { opacity: 1; transform: rotate(0); }',
        'flipInX' => 'from { opacity: 0; transform: perspective(600px) rotateX(70deg); } to { opacity: 1; transform: perspective(600px) rotateX(0); }',
    ];
    return $kf[$type] ?? $kf['fadeIn'];
}

function get_block_def($type) {
    // Minimal metadata for the PHP compiler — the full definitions live in JS
    $containerTypes = ['page', 'section', 'container', 'flex', 'grid', 'stack', 'navbar', 'footer', 'form'];
    return ['canHaveChildren' => in_array($type, $containerTypes)];
}

function generate_google_fonts_link($tokens) {
    $fonts = [];
    if (!empty($tokens['fonts'])) {
        foreach ($tokens['fonts'] as $font) {
            $fonts[$font] = ['400', '500', '600', '700', '800'];
        }
    }
    if (empty($fonts)) {
        $fonts['Inter'] = ['400', '500', '600', '700'];
    }

    $parts = [];
    foreach ($fonts as $family => $weights) {
        $familyParam = str_replace(' ', '+', $family);
        $parts[] = 'family=' . $familyParam . ':wght@' . implode(';', $weights);
    }
    $parts[] = 'display=swap';
    return 'https://fonts.googleapis.com/css2?' . implode('&', $parts);
}
