<?php
// Lightweight regression tests for the v2 compiler. Run: php tests/compiler-smoke.php
require_once __DIR__ . '/../includes/compiler.php';

function check(bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    echo "PASS: {$message}\n";
}

$nodes = [
    'root' => ['id'=>'root','type'=>'page','children'=>['hero','videohero','copy','photo','gallery','slider','cssblock','semantic'],'props'=>[],'style'=>['base'=>[]],'meta'=>[]],
    'hero' => ['id'=>'hero','type'=>'section','children'=>[],'props'=>['backgroundType'=>'image','backgroundImage'=>'/uploads/hero.webp','backgroundPositionX'=>'35%','backgroundPositionY'=>'center','backgroundSize'=>'cover','backgroundRepeat'=>'no-repeat','videoPoster'=>'/uploads/poster.webp'],'style'=>['base'=>[]],'meta'=>['anchorId'=>'hero-section','stateStyles'=>['hover'=>['opacity'=>'0.9']]]],
    'videohero' => ['id'=>'videohero','type'=>'section','children'=>[],'props'=>['backgroundType'=>'video','backgroundVideo'=>'/uploads/hero.mp4','backgroundImage'=>'/uploads/fallback.webp','videoPoster'=>'/uploads/poster.webp','videoAutoplay'=>true,'videoMuted'=>true,'videoLoop'=>true,'videoFit'=>'contain','videoPosition'=>'40% 50%','overlayGradient'=>'linear-gradient(90deg, #0008, transparent)','overlayOpacity'=>45],'style'=>['base'=>[]],'meta'=>[]],
    'copy' => ['id'=>'copy','type'=>'text','children'=>[],'props'=>['text'=>'Editable copy'],'style'=>['base'=>['font-size'=>'clamp(1rem, 2vw, 2rem)'],'tablet'=>['font-size'=>'2rem'],'mobile'=>['font-size'=>'1.5rem']],'meta'=>['cssClass'=>'shared-copy']],
    'photo' => ['id'=>'photo','type'=>'image','children'=>[],'props'=>['src'=>'/uploads/photo.webp','alt'=>'A sample','lightbox'=>true,'width'=>'80%','objectPosition'=>'50% 30%','mobileSrc'=>'/uploads/photo-mobile.webp','srcset'=>'/uploads/photo-800.webp 800w, /uploads/photo-1600.webp 1600w','sizes'=>'(max-width: 600px) 100vw, 50vw'],'style'=>['base'=>[]],'meta'=>[]],
    'gallery' => ['id'=>'gallery','type'=>'image-gallery','children'=>[],'props'=>['images'=>[['src'=>'/uploads/one.webp','alt'=>'One']], 'lightbox'=>true],'style'=>['base'=>[]],'meta'=>[]],
    'slider' => ['id'=>'slider','type'=>'slider','children'=>[],'props'=>['slides'=>[['image'=>'/uploads/slide.webp','heading'=>'Slide heading','text'=>'Slide text']], 'transition'=>'fade','autoplay'=>false,'aspectRatio'=>'16/9'],'style'=>['base'=>[]],'meta'=>[]],
    'cssblock' => ['id'=>'cssblock','type'=>'custom-css','children'=>[],'props'=>['css'=>'outline: 2px solid red;','targetId'=>'copy'],'style'=>['base'=>[]],'meta'=>[]],
    'semantic' => ['id'=>'semantic','type'=>'html-element','children'=>['nested'],'props'=>['tag'=>'article','text'=>'Semantic content'],'style'=>['base'=>[]],'meta'=>[]],
    'nested' => ['id'=>'nested','type'=>'html-element','children'=>[],'props'=>['tag'=>'span','text'=>'Nested child'],'style'=>['base'=>[]],'meta'=>[]],
];
$page = ['version'=>2,'page'=>['id'=>1,'name'=>'Test','rootId'=>'root','nodes'=>$nodes,'settings'=>['pageTitle'=>'Smoke test','pageBackground'=>'#fff','breakpoints'=>['tablet'=>900,'mobile'=>420]],'tokens'=>['colors'=>['brand'=>'#146EF5']],'classStyles'=>['shared-copy'=>['font-weight'=>'700','color'=>'#123456']],'customCSS'=>'body { color: #222; }']];
$html = compile_page($page);
if (getenv('SB_WRITE_FIXTURE')) file_put_contents(getenv('SB_WRITE_FIXTURE'), $html);
check(strpos($html, 'background-position:35% center') !== false, 'background image focal position is compiled');
check(strpos($html, 'poster="/uploads/poster.webp"') !== false, 'video background poster is compiled');
check(strpos($html, 'object-fit:contain;object-position:40% 50%') !== false, 'video fit and focal position are compiled');
check(strpos($html, 'linear-gradient(90deg, #0008, transparent)') !== false, 'overlay gradient is compiled');
check(strpos($html, 'background-image:url("/uploads/fallback.webp")') !== false, 'video background fallback image is compiled');
check(strpos(css_background_from_props(['backgroundType'=>'gradient','gradientType'=>'radial','gradientStops'=>['#fff','#000']]), 'radial-gradient') !== false, 'radial gradients are supported');
check(strpos(css_background_from_props(['backgroundType'=>'gradient','gradientType'=>'conic','gradientStops'=>['#fff','#000']]), 'conic-gradient') !== false, 'conic gradients are supported');
check(strpos($html, 'data-sb-lightbox') !== false, 'image lightbox links are compiled');
check(strpos($html, '<picture><source media="(max-width: 420px)" srcset="/uploads/photo-mobile.webp">') !== false, 'responsive art-direction sources are compiled');
check(strpos($html, 'srcset="/uploads/photo-800.webp 800w, /uploads/photo-1600.webp 1600w"') !== false, 'responsive srcset candidates are compiled');
check(count(explode(', ', safe_srcset('/uploads/good.webp 1x, javascript:alert(1) 2x'))) === 1, 'unsafe srcset candidates are rejected');
check(strpos($html, 'sb-lightbox') !== false, 'lightbox runtime is included');
check(strpos($html, 'data-transition="fade"') !== false, 'slider transition choice is preserved');
check(strpos($html, 'aria-label="Previous slide"') !== false, 'slider controls are labeled');
check(strpos($html, '.shared-copy { font-weight:700 !important;color:#123456 !important; }') !== false || strpos($html, '.shared-copy { font-weight:700 !important;color:#123456 !important }') !== false, 'reusable class styles are compiled');
check(strpos($html, '.sb-hero:hover { opacity:0.9 !important; }') !== false, 'interaction state rules are compiled');
check(strpos($html, '.sb-copy { outline: 2px solid red }') !== false, 'custom CSS block rules are compiled and scoped');
check(strpos($html, '<article') !== false, 'generic semantic HTML element is compiled');
check(strpos($html, '<span class="sb-nested') !== false, 'generic semantic elements can contain nested elements');
check(strpos($html, '@media (max-width: 900px)') !== false, 'custom tablet breakpoint is compiled');
check(strpos($html, '@media (max-width: 420px)') !== false, 'custom mobile breakpoint is compiled');
check(strpos($html, 'prefers-reduced-motion: reduce') !== false, 'reduced-motion fallback is emitted');
check(valid_css_value('clamp(1rem, 2vw, 2rem)'), 'valid advanced CSS values are accepted');
check(!valid_css_value('red; } body { display:none'), 'CSS declaration breakout is rejected');
check(css_background_from_props(['backgroundType'=>'image','backgroundImage'=>'javascript:alert(1)']) === '', 'unsafe background URL scheme is rejected');
check(strpos(sanitize_custom_html('<script>alert(1)</script><p onclick="x()">Safe</p>'), '<script') === false, 'custom HTML strips script elements');
check(strpos(sanitize_custom_html('<p onclick="x()">Safe</p>'), 'onclick') === false, 'custom HTML strips inline event handlers');
check(strpos(sanitize_custom_html('<a href=javascript:alert(1)>bad</a>'), 'javascript:') === false, 'custom HTML neutralizes unquoted script URLs');
echo "All compiler smoke tests passed.\n";
