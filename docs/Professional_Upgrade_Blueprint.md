# SiteBuilder Professional Upgrade Blueprint

**Technical review date:** 21 October 2026  
**Subject:** Front-end capability audit, source-level findings, interface blueprint, implementation architecture, and acceptance plan  
**Repository inspected:** The uploaded `sitebuilder.zip` archive

---

## 1. Executive assessment

SiteBuilder is a PHP/MySQL-backed visual landing-page builder with a modular vanilla-JavaScript editor. Its current architecture already has several solid foundations: a versioned page document, a node registry, a canvas and layer tree, a store with undo/redo commands, three responsive editing modes, a large style inspector, reusable design tokens, animations, revisions, and a server-side HTML/CSS compiler.

The project should not be treated as an empty builder that merely needs more blocks. It needs a carefully staged upgrade from a block-based landing-page editor into a **general-purpose visual front-end builder**. The main gap is that its current editing model and exposed controls cover only a fraction of modern HTML/CSS/JavaScript authoring. Some controls are also advertised but are not implemented consistently in the published output.

### Main recommendation

Keep the current PHP/MySQL foundation for the first upgrade. Repair correctness and security issues first, then evolve the current node model, inspector, styling system, interactions, and publishing compiler. A rewrite before those issues are understood would add risk without guaranteeing a better editor.

The target should support:

- Free-form nested layouts built from semantic elements and containers, not only predefined marketing blocks.
- A selected heading, paragraph, image, button, wrapper, or child element being styled independently.
- WYSIWYG inline text editing, including styling a specific word or phrase in a paragraph.
- Full practical visual controls for CSS layout, typography, backgrounds, media, borders, effects, responsive rules, states, and animation.
- A generic advanced CSS property editor and custom CSS escape hatch for properties that do not have dedicated controls.
- An event/action builder for interactions, without requiring users to write JavaScript for common behavior.
- Reusable classes, tokens, components, templates, shared assets, and page-wide design systems.
- Reliable exports that reproduce the canvas, with validation and accessible behavior.

**A realistic limitation:** no finite set of buttons can guarantee a visual editor offers every conceivable future CSS property or arbitrary application behavior. The robust approach is a complete practical inspector plus a searchable universal CSS-property/value editor and scoped custom CSS/JS for advanced users. Complex backend applications, authentication, payment workflows, and custom business logic also exceed what front-end HTML/CSS alone can do; those require backend services or integrations.

“Full-proof” cannot honestly be promised for software. The plan below makes errors less likely through explicit contracts, safe defaults, automated checks, cross-browser tests, and measurable acceptance criteria.

---

## 2. Scope and method

I inspected the archive listing, README, editor shell, block registry, style/content/animation panels, canvas/layer modules, store and command model, CSS generator, PHP compiler, legacy renderer, APIs, schema, upload handling, published example, and Git status. I also researched current browser-platform capabilities and documented patterns from MDN, W3C/WAI, OWASP, Webflow, Elementor, and Framer.

This is a source-level audit, not a claim that every feature has been exercised in a live browser or deployed environment. Static source inspection can prove that controls, data paths, and implementations exist or are absent; browser-level functional testing is still required to determine runtime behavior under actual viewport, content, browser, and network conditions.

### Archive snapshot

- The registry has **47 block types** in `assets/js/registry/blocks.js`; the PHP compiler has matching cases for the same 47 types.
- The legacy `assets/js/blocks.js` remains in the archive but is not loaded by `editor.html`. It contains an older block registry. The older `includes/render.php` also remains as a legacy rendering path.
- The current frontend is vanilla JavaScript with separate modules for state, commands, canvas, layers, property panels, and block definitions. There is no `package.json`, Composer manifest, test suite, or browser-test configuration in the archive.
- The current renderer duplicates parts of block behavior between JavaScript previews and PHP compilation. That duplication is already creating visible sources of drift.
- The archive's Git working tree includes modified tracked files, deleted `.gitignore`, and newly added files that are not committed in the included repository history. Before development continues, the team should establish a clean baseline branch and commit the current working tree deliberately.

---

## 3. What exists today

### Current editor surface

`editor.html` defines a top toolbar, a left sidebar with Layers and Blocks, a central canvas and breadcrumb, and a right panel with Style, Content, Animation, and Settings tabs. It already offers zoom, desktop/tablet/mobile previews, undo/redo, revision history, preview, export, save, and publish.

### Existing block families

The current registry includes layout containers (section, container, flex, grid, stack, spacer, divider); typography (heading, text, rich text, list, quote, code); media (image, image gallery, video, video embed, shape image, icon, before/after); interactive items (slider, accordion, tabs); form elements; marketing blocks; navigation/footer/logo/social blocks; and advanced elements such as custom HTML/CSS, code embed, progress bar, marquee, countdown, table, and button.

### Existing CSS controls

The Style panel currently has sections for layout, spacing, sizing, position, background, border, effects, typography, transition, and per-element CSS. It already covers several useful individual values: width/height and min/max size, aspect ratio, margin/padding, position and offsets, z-index, color, linear gradients, one background image/video on supported block types, overlays, border/shadow, font family/size/weight/line-height/letter spacing, filters/backdrop filters, blend mode, transform text input, and transition text input.

### Existing responsive/animation model

Styles are stored as `base`, `tablet`, and `mobile` maps. The compiler emits desktop/base styles plus media queries at `max-width: 991px` and `max-width: 479px`. The animation panel provides a fixed set of entrance effects, a few hover presets, transition controls, and a parallax toggle. This is a reasonable starting point, but not a complete responsive or interaction editor.

---

## 4. Priority source-level findings

These findings should be verified with regression tests after fixes. They are more important than adding another dozen block types.

### P0 — Do not expose the editor as a multi-user public service without access control

The inspected project structure and core APIs (`save.php`, `delete.php`, `publish.php`, `upload.php`, `revisions.php`, and others) do not show an authentication/authorization layer. Prepared SQL statements are used in principal database operations, but prepared statements do not prevent an unauthenticated visitor from invoking a privileged endpoint. There is also no visible CSRF protection in the inspected mutation endpoints.

**Action:** before Internet exposure, require authentication for dashboard/editor APIs, authorize every project/page/asset by owner or workspace, enforce CSRF protection for cookie-authenticated mutations, rate-limit public form submission, and keep published form submission as a deliberately separate public capability. Add security tests for unauthenticated and cross-project access.

### P1 — The background-image preview shorthand appears malformed

In `assets/js/registry/blocks.js`, `buildBackground()` constructs a background-image shorthand in the order `url(...) size position/size repeat attachment`. CSS background shorthand expects the position before `/` and the size after it. The PHP compiler's `build_background_css()` uses a different order (`url(...) position/size repeat attachment`). The editor preview and published output can therefore disagree or the preview declaration can be rejected by the browser.

**Action:** use a single validated background-value builder, test the output in a real browser, and verify image, gradient and video backgrounds against published pages.

### P1 — The custom-CSS block's saved CSS appears to be ignored on publish

The `custom-css` block defines `props.css` and `props.targetId`, but `compile_node()` returns an empty string for `custom-css`, while `compile_styles_to_css()` reads `node.meta.customCSS` and not the `props.css` value. The block's own CSS setting therefore has no evident path into the published stylesheet.

**Action:** either implement the block as page-level/scoped CSS with proper targeting and validation, or remove the misleading block and expose the supported CSS mechanism in a clearly labeled global/custom-code panel. Add a test that proves a CSS block changes the published result.

### P1 — “Lightbox on click” is exposed but no output implementation is evident

Image and gallery block definitions expose a `lightbox` flag. The PHP compiler's image/gallery output and `generate_runtime_js()` do not implement the lightbox behavior in the inspected paths. A gallery thumbnail can show a zoom cursor in the editor while published output remains non-interactive.

**Action:** add a real, accessible lightbox runtime (keyboard Escape, focus management, close control, alt text, scroll locking, touch support), or stop offering the setting until implemented.

### P1 — Slider transition choices are not respected by the compiler

The slider UI offers `slide`, `fade`, and `zoom`, but the editor renderer and PHP compiler hard-code a track with a transform transition. The chosen transition is not used to select distinct transition implementations in the inspected paths.

**Action:** define explicit transition modes and test each option in editor preview and published output. Test autoplay pause, keyboard support, touch swipe, infinite boundaries, reduced motion, and screen-reader names.

### P1 — CSS/background controls are too generic for the implementations behind them

The Background section is rendered for selected nodes broadly, but block-specific renderers consume `backgroundType`, `backgroundImage`, `backgroundVideo`, and overlay props only for a subset of block types such as sections and hero-style blocks. For other types, those property values do not automatically become their visible background. A control shown for a type should either work on that type or be disabled/hidden with an explanation.

**Action:** separate universal element CSS backgrounds (handled by the style system) from component-specific media-background settings. The universal layer should apply to every ordinary HTML element; section/hero background video can be a special component behavior layered on top.

### P1 — JavaScript preview and PHP publishing implementations drift

The preview registry and server compiler duplicate formatting/rendering logic. For example, the JavaScript rich-text helper includes inline code and `==highlight==` syntax, while the PHP rich-text renderer handles fewer forms. Other block render functions have their own independent markup. This creates a risk that a page looks correct on the canvas but differs after publish.

**Action:** establish a shared, versioned block/property schema and generated conformance fixtures. For every registered block, test preview-relevant defaults and compiled HTML. Do not permit a block to be considered complete until its editor representation, server output, and runtime behavior agree.

### P1 — Custom HTML sanitizer is not a complete security boundary

`sanitize_custom_html()` uses regular-expression filtering for script/style tags, inline event handlers, and simple `javascript:` URL patterns. This is not equivalent to a robust HTML sanitizer. Likewise, raw custom CSS, CSS property values and arbitrary embed HTML need strict trust boundaries when projects can be made by different users. The `code-embed` compiler also runs custom HTML through the sanitizer that strips scripts, so many third-party embeds that require a script will not function despite the field being named “Code Embed.”

**Action:** use a maintained allowlist HTML sanitizer appropriate to the PHP stack, validate URL protocols by context, parse and validate CSS where possible, isolate third-party embeds in sandboxed iframes, and reserve unrestricted script execution for explicitly trusted projects/admins. Follow OWASP's context-sensitive output encoding and sanitization guidance.

### P2 — Responsive rules are limited and hard-coded

The editor offers three breakpoints and emits two fixed `max-width` queries. There is no visible workflow for adding/renaming breakpoints, setting a custom width, editing a component against its own container size, or building multiple custom responsive variants. Current cascade behavior needs a documented contract and tests.

**Action:** provide editable named breakpoints and add container-query support for reusable components. Support per-breakpoint display/visibility, order, dimensions, typography, spacing and image treatment.

### P2 — No reusable style classes or synced components

There are design tokens, but no equivalent of a robust class-selector system where styling a class updates all its instances. The builder also lacks a general reusable component/symbol workflow with shared structure and exposed per-instance properties/slots. This makes large sites expensive to maintain and makes one-paragraph or one-button consistency less reliable.

**Action:** implement style classes and component instances before adding numerous overlapping style widgets.

### P2 — Automation and release confidence are low

No test suite or frontend build/lint setup is included. The code can pass syntax checks and still have missing behaviors, incorrect breakpoints, compiler/preview mismatch, broken links, unsafe CSS, or inaccessible interactions.

**Action:** add automated unit, integration, accessibility, security, and cross-browser tests (see the acceptance plan).

---

## 5. Complete capability-gap catalogue

The list below is a practical front-end coverage plan. Some capabilities can already be approximated with custom CSS or nested Flex/Grid blocks, but that is not the same as a clear, safe and discoverable visual control.

### A. Element selection, structure, and independent editing

**Current limitation:** the builder has a layer tree and individual nodes, but the content model is centered on registered blocks. Text block properties are largely edited through form fields; rich text is entered as text/HTML rather than a full word-processor-like inline editor.

**Required upgrade:**

- Insert semantic HTML elements independently: `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `div`, `span`, `p`, `h1`–`h6`, `a`, `button`, `picture`, `figure`, `figcaption`, list elements, and supported form controls.
- Let a user select a paragraph, heading, button label, icon, image, overlay, column, or nested child independently in the canvas and Navigator.
- Inline rich-text editing: select one word/phrase and set bold, italic, underline, color, font family/size/weight, link, highlight, code, superscript/subscript and alignment where valid.
- Keep each paragraph as its own node when requested. Support multiple paragraphs inside a rich-text flow while retaining per-run styles.
- Provide duplicate/copy/paste, wrap in container, unwrap, group, reorder, hide, lock, rename, anchor ID, semantic tag, accessibility label, and keyboard-accessible Navigator actions.
- Separate content properties, presentation styles, semantic settings and interactions in the data model.
- Allow safe custom attributes (aria attributes, data attributes, rel, target, download, `loading`, `decoding`, and carefully validated attributes).

**Important design decision:** implement rich text as a structured document/run tree, not only a raw HTML string. The editor can render it as editable DOM, but serialization should preserve valid structured marks and links. Sanitize on import and output; do not make arbitrary HTML the default content representation.

### B. Layout and positioning

Current flex and grid blocks are a good foundation, but the visual editor should expose considerably more of the layout models documented in CSS Flexbox and Grid (MDN references below).

**Flexbox controls:** direction, wrap, row/column gap, justify content, align items/content, align-self, order, flex-grow, flex-shrink, flex-basis and shorthand, min/max sizing, and per-breakpoint reordering. Explain which controls affect a parent container versus a child item.

**Grid controls:** columns and rows; repeat/minmax/auto-fit/auto-fill presets; grid-template areas; named lines where feasible; auto rows/columns/flow; row/column gap; each child's row/column start/end/span; align/justify self/items/content; and visual grid-cell placement. Provide a simple grid UI for non-experts and an advanced track-definition field for expert users.

**General layout controls:** display presets (block, inline, inline-block, flex, grid, contents, none, and safe advanced values), width/height/min/max, `aspect-ratio`, overflow, clipping, box sizing, object fit/position, logical margin/padding, column layout, text wrapping, sticky/fixed/absolute/relative positioning, inset values, z-index and stacking-context warnings.

**Canvas interaction:** drag element edges to resize; drag inside grid to assign grid cell; direct spacing/margin handles; snapping and alignment guides; keyboard nudges; show ancestor boundaries and overflow warnings. Do not make freeform absolute positioning the default because it commonly causes fragile responsive pages.

### C. Backgrounds and hero design

**Current limitation:** basic color/linear gradient/image/video background props exist on specific components. Image background position is a short preset list; video background is URL-only in its visible controls. The video poster property exists in the model/compiler but has no visible control in the current background panel. The image-background preview shorthand needs correction.

**Required controls for every applicable element:**

- Solid color, theme token and alpha/color picker.
- Multiple background layers: one or more images and gradients composed in a defined layer order.
- Linear, radial and conic gradients; editable stop color/position; direction/angle; opacity; transparency and gradient presets.
- Image selection from asset manager, upload, paste URL, focal point/pan controls, X/Y background position, cover/contain/custom size, repeat, clip/origin, attachment only where appropriate, blend mode, and mobile/tablet variants.
- Overlay color, overlay gradient, opacity, and optional foreground overlay layer whose z-index does not block links/buttons.
- Video background controls: source/upload or managed URL, poster image, autoplay, muted, loop, playsinline, fit/position, overlay, fallback background image, mobile-specific source or disabled-video option, and accessibility/performance warnings.
- Hero templates with content and media independently editable. For split heroes, user can place a heading/paragraph/buttons next to an image/video using the same free-form nested layout as any other section.
- Focal-point preservation across breakpoints and a clear fallback for failed loads.

Browser autoplay behavior is not fully under builder control. Background videos should generally default to muted + playsinline, avoid sound autoplay, provide a poster/fallback, and respect data/performance preferences. MDN documents autoplay restrictions and the relevant video attributes.

### D. Image, video, audio and embeds

**Images:** independent `alt`, caption, link, dimensions, crop, object position, border/radius, shape mask, loading priority, decoding, aspect ratio, responsive source sets, mobile art direction (`picture`/`source`), `srcset`/`sizes`, and decorative-image handling. Make it possible to mark decorative images with empty alt text deliberately and warn about missing alt text on meaningful images.

**Gallery:** masonry or uniform grid, spacing, row and column control, captions, lightbox, thumbnail/large-source pairing, keyboard navigation and responsive columns.

**Video:** MP4/WebM URL or managed uploads, poster, captions/subtitles tracks, transcript links, controls, muted autoplay, loop, crop and aspect ratio, playback-start behavior, and a responsive poster fallback. Treat YouTube/Vimeo embeds separately from native `<video>`.

**Other media:** audio player, SVG/vector asset support with sanitization, icon library + custom SVG import, animation/Lottie only with a vetted runtime, and third-party embeds isolated with permissions and sandbox policies.

**Responsive output:** use real HTML responsive image capabilities such as `srcset`, `sizes`, and `picture` when appropriate, rather than merely scaling one oversized image. MDN explains how these approaches can reduce image transfer sizes on different screen widths.

### E. Typography and rich content

Controls should include:

- Font family, local/custom font upload or licensed remote font, variable-font axes if supported, weight, size, line height, letter spacing and text color.
- Text alignment, decoration, transform, indentation, whitespace and wrapping, word-break/overflow-wrap, hyphenation, text balance/wrap, columns, underline style, text shadow, text stroke where supported, and text-overflow/line clamp.
- Responsive font-size presets using CSS `clamp()` plus min/preferred/max fields; units including px, rem, em, %, vw and supported container-relative units.
- Paragraph margins, rich-text block spacing, headings semantic level, link state styling, list marker type, quote details, code block theme, inline links, highlights and inline emphasis.
- Reusable text styles such as Display, Heading 1–6, Body, Small, Caption and Link, not only ad hoc numbers.
- Readability assistance: insufficient contrast warnings, very small text warnings and heading-structure checks.

The user should be able to click a phrase directly in the canvas, select it, and change its inline style. A selected text run should not force the user to find a separate raw HTML field.

### F. Borders, surfaces and visual effects

Add dedicated, understandable controls for:

- Border on each side; width, style, color, radius for all corners or individual corners; outline and outline offset.
- Box shadow with multiple shadow layers, spread/blur/offset/color and inset; text shadow with multiple layers.
- Opacity, filters, backdrop filters, blend modes, transforms (translate, rotate, scale, skew), transform origin, 3D perspective when useful, and transition property/duration/easing/delay.
- Clip path/masks/shape controls; background clipping and image masks with visual presets plus advanced values.
- Cursor, visibility, overflow, pointer events and stacking context indicators.
- Pseudo-element `::before`/`::after` content, icon/image content, positioning, size, decorative behavior and z-index, with accessible defaults.

Provide friendly controls and an advanced CSS-value input. Not every complex filter/transform should require a text string, but the raw value remains available to experienced users.

### G. CSS classes, design tokens and reusable components

This is one of the highest-value missing product capabilities.

**Style classes:** allow a selected node to receive one or multiple named classes. Editing a class updates every element that uses it. Show the number of affected elements and where a style comes from (element, class, breakpoint, state, global tag). Support sensible class naming, rename, detach, duplicate, and unused-class cleanup.

**Design tokens:** support color, font, font size, line height, spacing, radius, shadow, border, container width, breakpoints and numeric values. Tokens should be selectable directly inside style controls. Changing a token should update every consumer. Include token modes (e.g. light/dark) if feasible.

**Components/symbols:** convert any selected subtree into a reusable component. Provide synced instances, per-instance properties, editable slots, variants, detach instance, and component-level responsive styles. Header, navbar, footer, CTA, cards, badges, buttons, testimonials and pricing plans should be reusable components, not just one-off block types.

**Templates/libraries:** full-page templates, section templates, saved user blocks, reusable design systems, asset folders and import/export of a complete project bundle with dependency checks.

Webflow's public documentation is a useful benchmark for reusable classes, component instances, state-specific styling and tokens. Those concepts matter more to professional maintainability than adding ever more preset blocks.

### H. Element states and interaction builder

Current hover animation presets are not equivalent to styling all CSS states. Provide named style states for at least:

- Default, hover, focus, focus-visible, active/pressed, visited link, disabled, checked/selected, open/expanded, and responsive visibility.
- Conditional states should be type-aware: link states for links, form states for form controls, open for disclosure elements, and so on.
- In the editor, preview a chosen state without accidentally navigating or submitting a form.

Add a declarative interaction/action builder with a trigger → action → target structure. Common triggers: click/tap, hover/focus, page load, element in viewport, scroll threshold, form success, timer, and media controls. Common actions: show/hide, toggle, open/close modal or drawer, switch tab, toggle class/state, scroll to anchor, change slide, play/pause media, set a CSS variable, copy text, open URL, and submit to a form endpoint.

Use semantic buttons and links and add keyboard interactions automatically. Provide scoped custom JavaScript only as an advanced, explicit trust level; never silently execute imported script content.

### I. Animations and motion

Upgrade from a fixed preset list to:

- Entrance, exit, hover, click/toggle and scroll-triggered animations.
- Timeline/keyframe editor with property, value, duration, delay, easing, direction, fill, iteration and stagger controls.
- Scroll-driven animation where supported, plus IntersectionObserver-based fallback behavior for older browsers.
- Parallax with restrained defaults and a single-site “reduce motion” switch.
- Slider/carousel transitions: slide, fade, zoom or no motion, implemented rather than merely displayed as options.
- Preview, pause, reset, reduced-motion emulation, and device-performance warnings.

MDN distinguishes scroll-triggered animations (time-based animation starts when a threshold is reached) from scroll-driven animations (animation progress follows the scroll timeline). The UI should model that distinction rather than label both things simply “scroll animation.” W3C guidance recommends a way to disable non-essential interaction-triggered motion, and automatically moving content may require pause/stop/hide controls.

### J. Responsive behavior

The responsive system should include:

- Customizable named breakpoints, each with a user-set viewport width and live preview.
- Desktop, tablet, mobile landscape, mobile portrait and optional user-defined sizes. Avoid encoding device brands as fixed truth; breakpoints should correspond to layout needs.
- True device-width preview handles and viewports, rather than only a zoom scaling the canvas.
- Per-breakpoint visibility, ordering, flex direction, grid tracks/placement, spacing, size, typography, object position, background, alignment and selected animation settings.
- Container queries for components whose layout depends on their container width, not just total screen width.
- Device-specific media source/fallback settings and CSS `clamp()`/relative units for fluid layouts.
- Validation at common widths plus intermediate widths, not only the named presets.

Current three-mode base/tablet/mobile support should be retained as a migration baseline. Existing saved projects must not change appearance silently when new breakpoints are introduced.

### K. Forms and dynamic front-end widgets

Existing form support is a starting point but needs more professional controls:

- Inputs: email, phone, number, date/time, password (careful handling), radio, checkbox, file upload if securely supported, range, hidden fields, consent checkbox and select/multiselect.
- Required/min/max/pattern/length validation, labels, help text, success/failure states, focus/error styling, anti-spam measures and accessible error announcements.
- Form actions: store submission, authorized email/webhook integrations, redirect, thank-you state, or integration endpoint configured by an administrator.
- Common frontend components: dropdowns/mega menus, modals, drawers, search UI, tabs, accordions, testimonial and content carousels, logos ticker, pricing toggles, video lightboxes, sticky headers, progress and count-up stats, FAQ, anchor scroll and table of contents.
- All controls should be accessible by keyboard and work on touchscreens. Autoplaying widgets need pause controls and reduced-motion handling.

### L. Navigation, page and site settings

Provide a true site/page structure panel, not only a single saved page per project:

- Multiple pages with page names, slugs, parent pages, navigation assignment, canonical URL, noindex, redirects, favicon, language, title/description, Open Graph and social image.
- Shared header and footer components and a reusable navigation menu with mobile dropdown behavior.
- SEO controls for headings, alt text, structured metadata where appropriate, clean URL, canonical, sitemap/robots export or hosting hooks, and preview of search/social cards.
- Per-page and site-wide CSS, reusable global styles, custom fonts and design tokens.
- Publishing configuration for a deployment target/domain. Static HTML publication is suitable for marketing sites, portfolios and content pages but does not by itself deliver CMS, authentication, shopping cart, server-side search or business logic.

### M. Assets, performance and publishing quality

- Central asset manager with search, filtering, folders, deduplication, replace asset, file dimensions/size, optimized variants, alt text, and references/usage tracking.
- Image optimization and responsive renditions; do not downscale every image manually or send the same oversized source to every viewport.
- Explicit width/height or aspect ratio to reduce layout shift, lazy loading for offscreen media, eager/high-priority loading for the LCP hero image only when justified, and optional self-hosted fonts.
- Video fallback/poster, file-size warnings and reduced-motion/data recommendations.
- Preview at real widths, test links/forms and final HTML, warn about horizontal overflow, missing alt text, empty links, broken media URLs, duplicate IDs, unbalanced headings and unsafe CSS.
- Export organized assets rather than relying on hidden references to the editor installation. Provide a static site bundle with assets and CSS, and make the handling of forms/integrations explicit.

### N. Accessibility by default

Use WCAG 2.2 as a design and testing target. At minimum:

- Semantic HTML and valid heading order.
- Keyboard operation for every interactive component, visible focus states, no keyboard traps, correct button/link usage and sensible focus management in dialogs.
- Color contrast checks, non-text contrast checks, text resizing/reflow checks, accessible names, form labels/instructions and error announcements.
- Captions/transcripts or alternatives for meaningful media; video background defaults should not convey essential information by motion alone.
- Respect `prefers-reduced-motion`, provide user pause/stop controls for automatic motion where needed, and avoid excessive animation defaults.
- Let users explicitly mark images decorative, while warning when meaningful images have no alternative text.
- Carousel buttons and slide state should have descriptive labels; autoplay must stop/pause appropriately and not trap focus.

Accessibility checks should be built into the editor and continuous testing—not left entirely to the person making the page.

---

## 6. Recommended complete editor interface blueprint

The interface should be predictable and consistent. Avoid scattering related controls across unrelated tabs or making every capability a special block.

### A. Global top bar

**Left group:** back to workspace/dashboard; project/site name; current page selector; save state (Saved/Saving/Offline/Unsaved); Undo; Redo.

**Center group:** breakpoint/device preview selector; editable viewport width and height; desktop/tablet/mobile presets; rotate viewport; zoom; rulers/guides toggle; canvas fit.

**Right group:** Preview; accessibility/performance checks; Export; Publish; share/deployment controls where supported; profile/help menu.

Always disable Undo/Redo when no operation is available and show clear error feedback if save/publish fails. Do not report success until the server confirms it.

### B. Left rail and navigator

Make the left rail an icon bar with labeled sections:

1. **Add** — search and categorized elements/components.
2. **Pages** — page tree, create/duplicate/rename, page settings and navigation membership.
3. **Navigator** — full hierarchy, drag reorder, expand/collapse, rename, lock, hide, duplicate, delete, copy/paste, context menu.
4. **Assets** — uploaded/remote assets, search, folders, image/video/audio/SVG tabs, used/unused assets.
5. **Components** — reusable components, variants, saved blocks, page/section templates.
6. **Styles** — classes/selectors and style usage/inheritance.
7. **Variables** — colors, fonts, sizes, spacing, radii, shadows and variable modes.
8. **CMS/Collections** — add in a later phase when collection-backed dynamic pages are implemented.

The existing Layers and Blocks tabs can be migrated into Navigator and Add rather than thrown away.

### C. Central canvas

- Render the site at the selected viewport's real CSS width.
- Selection overlay: outline, label, quick actions, drag handles, spacing guides and responsive overflow warnings.
- Breadcrumb trail for ancestors, with one-click parent selection.
- Click selects; double-click text enters rich edit; Enter/keyboard shortcuts remain available for non-pointer users.
- Show safe drop targets and flex/grid placement previews while dragging.
- View modes: Design (selection handles), Preview (real interactions without editor chrome), and optional Outline/Wireframe.
- Canvas rendering and published output should share the same block schema and behavior rules; unavoidable canvas-only wrappers must not change CSS layout.

### D. Right inspector — dynamic tabs

Use a compact tab bar for **Content**, **Style**, **Interactions**, **Accessibility**, and **Advanced**. Keep responsive state visible at the top. Show sections based on selected element type, but never render a visible control that has no effect.

#### Content tab

- Semantic element and content fields.
- Rich-text editor for text/runs, links and formatting.
- Image/video/audio picker, alt/caption, source, crop, poster, responsive sources and asset actions.
- Repeater item editors for slides, gallery images, FAQ items, feature cards, nav links and pricing rows.
- Link/action destination; open in new tab, rel and download options.

#### Style tab — order of sections

1. **Selector and class** — tag, classes applied, current state, affected-element count, computed/inherited style indicator.
2. **Layout** — display, flex/grid controls, item ordering, alignment, gaps, grid tracks and placement.
3. **Spacing** — visual margin/padding editor and linked/unlinked sides; logical properties advanced mode.
4. **Size** — width/height/min/max, aspect ratio, box sizing, overflow, object fit/position.
5. **Position** — static/relative/absolute/fixed/sticky, inset, z-index and stacking context.
6. **Typography** — font, responsive size, weight, line-height, tracking, color, alignment, decoration, text wrap, columns.
7. **Backgrounds** — layer stack for color, gradients, images, and allowed video; position/crop/repeat/clip and overlays.
8. **Borders and outlines** — per-side border and corner radius; outline settings.
9. **Effects** — multiple box/text shadows, filters, backdrop, blend, opacity, clip/mask and cursor.
10. **Transforms** — move/rotate/scale/skew, origin, perspective when supported.
11. **Transitions** — properties, duration, delay, easing and reduced-motion preview.
12. **Responsive overrides** — values for each named breakpoint, mobile visibility and custom breakpoint rules.
13. **Advanced CSS** — searchable raw property/value input, vendor/browser support indicator, current declaration view and scoped CSS editor.

Support live input preview, reset-to-inherited, token linking, copy/paste style, and clear markers for overridden values.

#### Interactions tab

- Element event list with triggers.
- Timeline/interaction action chain: trigger, target, action, parameters, start/end, reverse/toggle behavior.
- Modal/drawer, tabs, accordions, navbar dropdowns, carousel actions, scroll-to-anchor, show/hide, toggle classes, form-result actions and media controls.
- Preview, debug log and reduced-motion mode.

#### Accessibility tab

- HTML tag/role, accessible name, alt/label/description, tab order warnings and focus behavior.
- Contrast results, heading outline, landmark outline, keyboard checks and media captions/transcript.
- Fix suggestions only when safe; allow an override with an explanation for intentional exceptions.

#### Advanced tab

- Anchor ID and custom attributes.
- Element ID, generated class, data attributes.
- Scoped CSS and, if trusted custom code is allowed, isolated custom-code settings.
- Visibility/SEO semantics, diagnostics and output snippet.
- Keep potentially dangerous custom code visibly separate from ordinary CSS styling.

### E. Global project/site settings

Use a dedicated site settings surface (not a random element's Style panel) for pages, routes, global fonts, design tokens, breakpoints, default body style, SEO defaults, favicons, custom code with trust levels, integrations, form handling, publishing and asset management.

---

## 7. Data model and rendering architecture

### Keep the versioned page-document approach

A page represented as a node map is appropriate for selection, nesting, reorder, serialization and command-based undo. Evolve the existing version-2 model instead of throwing it away.

A target node model should include:

- `id`, `type`, `tag`, `children`, `props` and validated `attributes`.
- `styles.base` and style overrides keyed by named breakpoints.
- `states.default`, `states.hover`, `states.focus`, etc., each with property overrides.
- `classIds`, `componentId`/instance data, `animations`, `interactions`, `meta`, and accessibility settings.
- Text as a structured run/document representation where inline formatting is needed.

Global project document should hold pages, reusable components, classes, tokens, breakpoints, asset references and publishing settings. For early single-user builds, some of these can remain embedded in the serialized document; the schema should allow moving them to relational tables when multi-user/team sharing is implemented.

### Single-source-of-truth contract

The block registry and PHP compiler cannot remain loosely synchronized hand-written copies forever. Use shared JSON schemas for block property definitions and validation metadata. Keep JS preview renderers and PHP compiler emitters separate where runtime differences require it, but generate test fixtures from the same schema and compare expected properties, required behavior and HTML/CSS output.

Every block schema must declare:

- Stable type/version identifier.
- Semantic tag/children rules.
- Property names, types, defaults, validation, editor control, and whether a property is safe on the public output.
- CSS/style support and responsive behavior.
- Preview renderer and published compiler contract.
- Required runtime modules and accessibility requirements.
- Migrations for older saved versions.

### CSS generation and cascade

Replace the reliance on broadly emitted `!important` declarations with a documented class/token/cascade model. Generated CSS should have predictable ordering: reset/normalize, design tokens, global/tag styles, reusable classes, component styles, element styles, state selectors, breakpoint rules, then explicitly ordered custom CSS. Use CSS variables to resolve tokens and avoid baking all styles into inline attributes.

Custom CSS should be scoped to a selected element by default, with an explicit `:global`/page-wide choice. Lint and validate rules; show parse errors and tell the user which selector applies. Do not silently drop CSS or pretend a raw CSS field is tied to an element when it is not.

### Browser support and advanced CSS

Maintain a supported feature matrix. Standard CSS property/value declarations should be accepted through the advanced inspector even when no graphical control exists. For newer or inconsistently supported capabilities, show a browser-support warning and use graceful fallback CSS. MDN's CSS reference and compatibility tables should inform this matrix.

---

## 8. Implementation roadmap

Work in small releasable phases, preserving old projects and keeping the application usable after each phase.

### Phase 0 — Baseline, reproducibility and tests

- Create a clean branch and commit the exact archive's intended starting state.
- Restore/decide `.gitignore` and exclude `.git`, secrets, local config, and accidental build artifacts from deployment bundles.
- Document PHP/MySQL version assumptions and supported browsers.
- Create representative fixture documents for every block type and saved-document migration version.
- Add automated PHP/JS syntax checks and a smoke test that creates, saves, loads, previews, publishes and deletes a disposable test page.

**Exit gate:** a repeatable local install and a baseline test report before feature edits begin.

### Phase 1 — Security and renderer correctness

- Add authentication and per-project authorization before public hosting.
- Add CSRF protection to authenticated mutation endpoints and rate limiting to public submission paths.
- Replace regex-only HTML sanitization with an allowlist sanitizer; validate dangerous URL schemes and user-controlled CSS/attributes.
- Correct the background shorthand in preview.
- Implement or remove lightbox flags; make slider transition modes actually work.
- Make custom CSS block behavior explicit and ensure its data is emitted properly.
- Add render-parity tests for all 47 blocks and safe media failures.

**Exit gate:** no advertised control is knowingly inert; published output matches expected preview; security regression tests pass.

### Phase 2 — Universal element/style inspector

- Expand element schema and valid semantic element types.
- Implement selector/class foundations and a general CSS property/value grid.
- Complete flex/grid item controls, typography, spacing, dimensions, positioning and CSS state styling.
- Add advanced CSS search, reset-to-inherited, validation, CSS support warnings and per-element scoped CSS.
- Standardize background control behavior for all element types.

**Exit gate:** users can reproduce a responsive two-column image/text section, hero overlay, button states, nested grid cards and typography variants without custom HTML.

### Phase 3 — Rich text, assets and media

- Add inline rich-text editing and structured runs.
- Extend asset manager, video poster, responsive image sources, image focal point, gallery lightbox, native video captions and accessible embeds.
- Add split hero presets that remain editable as normal nested elements.
- Add background image and video fallbacks with per-breakpoint control.

**Exit gate:** a user can select and style a single phrase, individual paragraphs, any image, and every content item in a slider/gallery with preview-to-publish parity.

### Phase 4 — Responsive engine, classes and design system

- Make breakpoints editable, add mobile landscape/custom presets and real canvas viewport handles.
- Add container query declarations and preview support.
- Implement reusable classes/selectors, reusable tokens in every style control, classes panel and style inheritance tracing.
- Build reusable component instances, properties, slots, variants and synced updates.

**Exit gate:** editing one reusable button class changes all intended instances; responsive overrides are predictable and validated at intermediate widths.

### Phase 5 — Interactions and animation editor

- Build declarative triggers/actions/targets.
- Add state-specific styles and interaction previews.
- Implement functional slider transitions, accessible modal/drawer/dropdown, responsive nav, form success/failure actions, scroll effects and event action controls.
- Add animation timeline and respect reduced-motion preferences and pause controls.

**Exit gate:** interactions work with mouse, keyboard and touch, and pass the a11y test suite.

### Phase 6 — Site-level production capabilities

- Multiple pages/routes and shared components.
- SEO metadata completeness, redirects, canonical URLs, structured metadata, social-card preview, site asset bundle export.
- Optional CMS collections and content templates if the product needs article listings or data-driven pages.
- Publishing targets, configuration and safe form integrations.

**Exit gate:** a production marketing site can be built, shared components changed globally, and exported/deployed with required assets and documented form handling.

### Phase 7 — Polish, performance and compatibility

- Accessibility audits, keyboard-only testing, responsive visual snapshots, browser tests and performance budget.
- Image optimization, asset usage map, lazy/eager loading policy, font loading, broken-link and overflow checks.
- Error/empty/loading states, autosave resilience, offline/failed-network feedback, migration backups and release notes.

**Exit gate:** defined acceptance suite passes on Chrome, Firefox, Safari/WebKit and Edge at representative viewport sizes; failures are reported rather than silently ignored.

---

## 9. Required acceptance tests

These are the minimum non-negotiable checks for a professional builder upgrade.

### Editing and persistence

1. Add every registered block, change every declared field, save, reload and confirm properties persist.
2. Undo and redo add/delete/reorder/property/style operations, including repeated keystrokes, without corrupting the document.
3. Duplicate, copy/paste, move and nest nodes without duplicate IDs or broken parent/child links.
4. Migrate archived version-1 documents and version-2 documents without losing content.
5. Ensure an invalid property or malformed repeater JSON returns a clear validation error rather than a silent partial save.

### Preview and published parity

6. For each block type, compare expected canvas and published structure/styles at desktop, tablet and mobile widths.
7. Verify linear/radial/conic gradients, uploaded backgrounds, background video, overlay, poster fallback and focal point.
8. Check all three slider transition modes; autoplay/infinite settings; accordion multiple-open state; tabs; before/after; gallery/image lightbox.
9. Test links, external links, anchors, buttons and form submission success/failure.
10. Verify custom CSS block/page/element CSS has an explicit documented scope and appears in the published output as expected.

### CSS and responsive behavior

11. Change one paragraph or word/run without changing sibling paragraphs.
12. Place an image beside text on desktop; stack/reorder on mobile; test widths immediately above/below each breakpoint.
13. Validate flex item growth/shrinkage, grid rows/columns/areas, absolute/sticky positioning and overflow.
14. Verify hover/focus/active/disabled states are emitted with correct selector specificity and keyboard focus remains visible.
15. Check no element has unintended horizontal overflow at 320px, 375px, 480px, 768px, 1024px, 1280px and 1440px unless intentionally designed.

### Accessibility and performance

16. Complete every editor and published page flow without a mouse.
17. Ensure meaningful images have alt text, form controls have labels, carousel buttons have accessible names and dialogs manage focus.
18. Respect reduced-motion preference and provide pause controls for auto-moving content where required.
19. Run contrast, heading-order, labels, broken-links and keyboard tests on representative templates.
20. Check image/video loading behavior, layout stability, failed media fallbacks and console errors.

### Security

21. Anonymous visitors cannot save, delete, publish, load private projects or read revisions.
22. One authenticated user cannot access another user's projects/assets by changing IDs.
23. Reject or sanitize dangerous HTML/SVG/CSS/URL payloads; isolate trusted embeds.
24. Test CSRF, upload MIME spoofing, oversized uploads, filename traversal, script injection, CSS injection and database error leakage.
25. Published forms cannot be abused for uncontrolled storage/traffic and do not reveal stored submissions publicly.

---

## 10. Recommended research references

These sources were used to compare the current implementation with browser capabilities, safety/accessibility requirements, and established visual-builder design patterns.

### Browser and CSS/HTML platform

- MDN — CSS background property and layered backgrounds: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background
- MDN — Flexbox basics and the growth/shrink/basis model: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts
- MDN — Flexbox overview: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout
- MDN — CSS Grid layout and grid properties: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout
- MDN — Container queries: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- MDN — Pseudo-classes, including interaction states: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/Pseudo-classes
- MDN — CSS animations reference: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Animations
- MDN — Scroll-driven animations: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations
- MDN — Responsive images (`srcset`, `sizes`, `<picture>`): https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images
- MDN — HTML video element: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video
- MDN — Autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN — Reduced-motion media feature: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

### Accessibility and security

- W3C WAI — WCAG 2.2 understanding documents: https://www.w3.org/WAI/WCAG22/Understanding/
- W3C WAI — Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide
- W3C WAI — Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- OWASP — Cross-Site Scripting Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

### Visual-builder product patterns

- Webflow — Style panel, selectors and states: https://help.webflow.com/hc/en-us/articles/33961362040723-Style-panel-overview
- Webflow — States: https://help.webflow.com/hc/en-us/articles/33961301727251-States
- Webflow — Classes: https://help.webflow.com/hc/en-us/articles/33961311094419-Classes
- Webflow — Components: https://help.webflow.com/hc/en-us/articles/33961303934611-Components-overview
- Webflow — Variables/design tokens: https://help.webflow.com/hc/en-us/articles/33961268146323-Variables
- Elementor — Responsive containers: https://elementor.com/help/responsive-design-using-containers/
- Elementor — Motion effects: https://elementor.com/help/motion-effects/
- Framer — Responsive website-building concepts: https://www.framer.com/solutions/responsive-website-builder/

The commercial builder references are not proof that every feature is appropriate for SiteBuilder. They are useful examples of interaction patterns and design-system concepts that professional users expect.

---

## 11. Final recommendation

Treat this as a product-quality upgrade in this order:

1. **Repair unsafe and nonfunctional paths.** Correct the image-background preview mismatch, the no-op custom-CSS block, the nonfunctional lightbox settings, and slider transition settings. Add access control before public deployment.
2. **Build the universal style and element model.** Any ordinary element should have deterministic style support; user should not need a special block just to apply a background, a responsive flex layout, a hover state or a custom CSS property.
3. **Add rich text, responsive media and layout depth.** This directly meets the requirement to edit any paragraph/phrase and place text beside images or video with responsive behavior.
4. **Add reusable classes, tokens and component instances.** These turn a collection of individually styled pages into a professional maintainable website project.
5. **Complete interactions, accessibility, testing and publishing.** Treat these as quality gates, not optional polish.

The most meaningful milestone is not “50 more blocks.” It is this: **a user can select any element, precisely change its content and appearance, define its behavior and responsive rules, reuse the design elsewhere, save it, and publish the exact same result without writing code unless they choose to.**
