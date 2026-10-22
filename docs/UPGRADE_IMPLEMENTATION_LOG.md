# SiteBuilder Professional Upgrade — Implementation Log

**Implementation snapshot:** 21 October 2026  
**Source:** uploaded `sitebuilder.zip`  
**Status convention:** `IMPLEMENTED + TESTED` means a focused automated test proves the specific behavior; `IMPLEMENTED — BROWSER VERIFICATION REQUIRED` means code is present but visual/runtime behavior was not verified in a working browser; `PARTIAL` means some but not all blueprint acceptance criteria are implemented; `NOT IMPLEMENTED` means the goal remains open. No item is marked achieved solely because a control exists.

## Executive status

The project has been upgraded in-place without replacing the PHP/MySQL + vanilla JavaScript architecture. The source now has **48 registered block types** (the original registry plus the new generic semantic HTML element block) and includes universal background CSS generation, additional gradient types, a generic semantic HTML element block, a universal advanced CSS property editor, per-state style rules, reusable CSS classes, configurable published breakpoints, responsive image sources, inline rich-text formatting controls, a published image lightbox, real slider transition modes, reduced-motion CSS, custom-CSS block compilation, and a password-gated remote-access policy.

**This is a substantial first implementation, not a claim that every product-scale blueprint item is finished.** The remaining open goals are listed explicitly below. In particular, no live MySQL workflow or full interactive browser QA was available in this execution environment; Chromium headless timed out before producing a DOM, so no visual browser test is claimed.

## Changes applied — goal and solution ledger

| ID | Goal | Solution applied | Status / evidence |
|---|---|---|---|
| F0-1 | Repeatable syntax and smoke checks | Added `tests/run-smoke.sh`, PHP compiler fixture tests and security-policy tests | **IMPLEMENTED + TESTED** — all commands in the script pass in this environment |
| F0-2 | Document local setup and security boundary | Updated `README.md`; added `docs/Professional_Upgrade_Blueprint.md` and this log | **IMPLEMENTED** |
| F0-3 | Exclude development metadata from delivery | Added root `.htaccess` protections and `.gitignore`; release ZIP is packaged without `.git/` | **IMPLEMENTED** — archive contents verified after packaging |
| F1-1 | Prevent unconfigured remote admin access | Added `config/security.php`; loopback-only mode if `SITEBUILDER_ADMIN_PASSWORD` is unset; password-authenticated session when configured | **IMPLEMENTED + HTTP TESTED** — unauthenticated dashboard redirects, API returns 401, correct password creates session |
| F1-2 | Sign-in / sign-out | Added `login.php`, `logout.php`, sign-out links in dashboard/editor | **IMPLEMENTED + HTTP TESTED** — login route/session verified |
| F1-3 | Add request-origin defense for authenticated writes | Admin API middleware compares request scheme, host and port against `Origin`, or same-host `Referer` when Origin is absent in password mode | **IMPLEMENTED** — no dedicated basic cross-origin, different-port and origin-less HTTP mutation checks pass; a full security audit remains open |
| F1-4 | Rate-limit public form submissions | Added hashed-client-key limit of 10 submissions per 10-minute window in `api/submit.php` | **IMPLEMENTED** — concurrent-request/rate-limit integration testing still required |
| F1-5 | Reduce server error leakage | Database connection and save errors now return generic messages and log detail server-side | **IMPLEMENTED** |
| F1-6 | Correct CSS background shorthand | Fixed editor preview's invalid ordering and added X/Y background position controls | **IMPLEMENTED + COMPILER TESTED** |
| F1-7 | Apply backgrounds to ordinary elements | CSS generator compiles background color, linear/radial/conic gradients, image position/size/repeat and video fallback images for any node | **IMPLEMENTED + COMPILER TESTED** |
| F1-8 | Show video poster/fallback | Added visible video-background poster field; compiler emits `poster`; video backgrounds can retain a fallback background image | **IMPLEMENTED + COMPILER TESTED** |
| F1-9 | Make custom-CSS blocks affect output | `custom-css` block `props.css` is emitted; optional `targetId` scopes declaration rules to a node ID or anchor ID | **IMPLEMENTED + COMPILER TESTED** — advanced raw CSS remains trusted-author input |
| F1-10 | Implement image/gallery lightbox | Compiler wraps opted-in images/gallery entries in links; runtime supports Escape, close control, outside click, scroll lock and focus restoration | **IMPLEMENTED + COMPILER TESTED** — focus trapping and touch/browser testing remain open |
| F1-11 | Respect slider transition selection | Published runtime and canvas runtime support slide/fade/zoom paths; autoplay pauses while hovered/focused and respects reduced-motion preference; controls have accessible names | **IMPLEMENTED — BROWSER VERIFICATION REQUIRED**; generated markup and runtime inclusion are smoke-tested |
| F1-12 | Improve custom HTML defenses | Expanded removal of dangerous tags, inline event attributes, dangerous URL schemes and unsafe style patterns | **PARTIAL** — this remains regex-based and is not a replacement for a maintained allowlist HTML sanitizer |
| F2-1 | Add generic semantic elements | Added `html-element` block with validated tag options, nested children, text, links and safe new-tab `rel` | **IMPLEMENTED + COMPILER TESTED** — only the declared tag allowlist is supported |
| F2-2 | Make uncommon CSS features accessible | Added Advanced CSS property/value input to the Style inspector; property/value validation runs in UI and compiler | **IMPLEMENTED + COMPILER TESTED** — not every CSS property has a bespoke graphical widget |
| F2-3 | Add state-specific styles | Added Hover, Focus, Active and Focus-visible declaration editor; compiler emits corresponding pseudo-class rules | **IMPLEMENTED + COMPILER TESTED** |
| F2-4 | Add reusable CSS classes | Added page-level class rule manager; assign one or more class names in element Settings; shared class styles compile to reusable selectors | **IMPLEMENTED + COMPILER TESTED** — selector usage counts, rename/detach workflow and inheritance tracing remain open |
| F2-5 | Configure published breakpoints | Added tablet/mobile breakpoint inputs in page settings and uses configured values in compiler media queries and responsive picture sources | **IMPLEMENTED + COMPILER TESTED** — canvas viewport presets and breakpoint settings are not yet fully synchronized |
| F3-1 | Edit a rich-text phrase directly | Double-click Rich Text enters contenteditable mode; toolbar supports bold, italic, underline, list, super/subscript, text/highlight color, links and Done | **IMPLEMENTED — BROWSER VERIFICATION REQUIRED**; saved HTML is sanitized during compilation |
| F3-2 | Responsive image art direction | Added mobile/tablet image sources, `srcset`, `sizes`, `object-position`, `decoding`, and `<picture>` output | **IMPLEMENTED + COMPILER TESTED** |
| F3-3 | Preserve focal-point controls | Added object/background X/Y position controls and compiler output | **IMPLEMENTED + COMPILER TESTED** |
| F4-1 | Add reusable tokens/classes foundation | Existing design tokens retained; class styles are persisted in the versioned page object and emitted on publish | **PARTIAL** — token coverage/modes and component variants are not complete |
| F5-1 | Respect reduced motion | Generated CSS includes `prefers-reduced-motion: reduce`; slider autoplay is suppressed for reduced-motion users | **IMPLEMENTED + COMPILER TESTED** |
| F5-2 | Preserve preview/publish parity | Fixed several known parity gaps (backgrounds, CSS block, slider transitions, lightbox, semantic element, responsive sources) | **PARTIAL** — a full 48+ block conformance suite and browser visual snapshots are not yet present |
| F7-1 | Regression evidence | Compiler smoke suite currently covers backgrounds, video poster/fallback, gradient types, responsive sources, lightbox, slider mode, reusable classes, state styles, custom CSS, semantic elements, breakpoints, reduced motion and CSS safety checks | **IMPLEMENTED + TESTED** |
| F7-2 | Cross-browser/accessibility/performance audit | Not run: Chromium headless timed out before producing output, and a working browser automation framework is not installed | **NOT VERIFIED** — must be completed in a real browser environment |

## Capability catalogue A–N

| Blueprint group | Status | Implemented now | Still open |
|---|---|---|---|
| A. Element selection, structure and independent editing | **PARTIAL** | Existing node/layer editor retained; generic semantic element block; rich-text inline editor toolbar | Structured rich-text run model; independent child selection for all inner component markup; lock/rename/wrap/unwrap/group controls; safe general attributes; browser verification |
| B. Layout and positioning | **PARTIAL** | Existing Flex/Grid controls; universal CSS property/value editor exposes any valid declaration including Grid areas, flex item properties, logical spacing, transforms and positioning | Dedicated visual grid-area/cell placement; resize handles, snap guides, keyboard nudges and overflow visualization |
| C. Backgrounds and hero design | **PARTIAL** | Color/image/video fallback; linear/radial/conic gradients; X/Y position; cover/contain/repeat; poster, video fit/position, fallback image and overlay-gradient fields; nested Flex/Grid still supports split heroes | Layer-stack UI, gradient stop positions/opacity, overlay gradient editor, foreground overlay node workflow, per-breakpoint video source/disable, managed video upload and mobile-data warnings |
| D. Image, video, audio and embeds | **PARTIAL** | Image alt/caption, object fit/position, responsive picture/srcset/sizes, lazy/decoding, image/gallery lightbox, video poster | Asset manager/folders, audio block, subtitle/transcript UI, SVG sanitization/import, masonry layout, responsive thumbnail/full-size pairing, sandboxed third-party embed manager |
| E. Typography and rich content | **PARTIAL** | Existing typography controls plus advanced CSS; inline rich-text toolbar for phrase styling; `clamp()` values accepted | Structured marks and migrations; reusable named text styles; contrast/readability/heading-order checks; full text decoration/stroke/column controls as dedicated widgets |
| F. Borders, surfaces and visual effects | **PARTIAL** | Existing border/shadow/effect controls plus universal CSS property editor for filters, masks, clip-path, blend modes, transforms and pseudo-related declarations | Multi-layer graphical shadow editor, pseudo-element editor, per-corner border UI, stacking-context visualization and tested fallbacks |
| G. Classes, tokens and reusable components | **PARTIAL** | Shared class rule manager and element class assignment; existing design tokens preserved | Component instances/sync/slots/variants; class rename/usage count/detach; token modes and complete token categories; cascade/inheritance trace |
| H. States and interaction builder | **PARTIAL** | CSS hover/focus/active/focus-visible styles; existing interaction widgets retained | Declarative trigger/action/target workflow, link/button interaction action editor, disabled-state UI, general event testing panel |
| I. Animations and motion | **PARTIAL** | Existing entrance/hover/parallax settings retained; slider transitions implemented; reduced-motion handling added | Timeline editor, pause controls for every auto-moving component, animation preview and browser-level motion tests |
| J. Responsive behavior | **PARTIAL** | Base/tablet/mobile model retained; published widths configurable; responsive image sources | Arbitrary named breakpoints, landscape/custom presets, container-query UI, resize handles and intermediate-width visual QA |
| K. Forms and dynamic front-end widgets | **PARTIAL** | Existing forms/widgets retained; public submission rate limit added | Rate-limit concurrency test; configurable email/integration providers; submission management UI; richer validation/success/failure action designer |
| L. Navigation, page and site settings | **PARTIAL** | Existing project dashboard, SEO/social settings, page background/font, custom CSS and tokens | Site-wide routes/navigation membership, canonical/redirect controls, structured data, social-card preview, deploy targets and multi-page export QA |
| M. Assets, performance and publishing quality | **PARTIAL** | Responsive image markup, lazy loading, async decoding, fallback/poster, generic compiler CSS validation | Asset usage map, optimizer, font loading strategy, export bundle manifest, broken-link/performance/overflow checks |
| N. Accessibility by default | **PARTIAL** | Slider control names/dot buttons, lightbox dialog semantics/Escape/restore-focus, reduced-motion behavior | Full focus trap, keyboard/touch testing, image-alt warnings, form-label audit, contrast checker, automated axe/WAI-ARIA validation |

## Editor interface blueprint status

- **Top bar — PARTIAL:** existing save status, undo/redo, responsive switcher, zoom, history, preview, export and publish remain; sign-out added. A11y/performance checkers, editable canvas dimensions/rulers, help and deployment UI are not implemented.
- **Left rail — PARTIAL:** existing Layers/Blocks remain. Reusable classes live in page Settings. Dedicated Pages, Assets, Components, Styles and Collections panels are not implemented.
- **Canvas — PARTIAL:** existing selection, drag/drop, breadcrumb and inline editing remain; rich-text formatting toolbar and slider preview interaction added. Real grid-cell placement, guides, resize handles and overflow warnings remain open.
- **Right inspector — PARTIAL:** Style includes advanced CSS, state styles, background focal point, video poster and gradient type; Content/Animation/Settings remain. Separate Interactions, Accessibility and Advanced tabs are not yet built.
- **Site settings — PARTIAL:** existing SEO/social/background/fonts/tokens/custom CSS plus reusable class rules and breakpoint values. Global theme modes, routing and publish/deploy configuration remain open.

## Architecture status

- **Versioned page IR:** retained; `classStyles`, `meta.stateStyles`, responsive image properties and settings breakpoints persist within the current page document without a schema.sql migration.
- **Preview/publish consistency:** improved for identified gaps, but JavaScript renderers and PHP compiler remain separate implementations; the blueprint's shared schema/code generation goal is open.
- **CSS cascade:** new declarations are validated and emitted; legacy widespread `!important` usage remains. A full reset → tokens → global → classes → component → element → states → breakpoints → custom CSS cascade refactor is open.
- **Advanced CSS:** common and uncommon properties can be entered directly; no browser support matrix or warning panel yet.
- **Security:** single shared administrator password/one-workspace gate, not per-user/per-project multi-tenancy. Remote access must not be exposed without a strong `SITEBUILDER_ADMIN_PASSWORD`, HTTPS, deployment configuration and additional security review. Custom HTML sanitizer is improved but still not a maintained allowlist sanitizer.

## Acceptance-test status (the blueprint's 25 tests)

| # | Acceptance test | Status |
|---:|---|---|
| 1 | Add every block, change every field, save/reload | **NOT VERIFIED** — requires browser + MySQL; no full per-block fixture suite |
| 2 | Undo/redo all edit classes | **NOT VERIFIED** — existing store retained; no browser interaction test |
| 3 | Duplicate/copy/move/nest without ID corruption | **NOT VERIFIED** — requires editor integration test |
| 4 | Migrate v1/v2 saved documents | **NOT VERIFIED** — no migration corpus run |
| 5 | Invalid property/JSON validation reports errors | **PARTIAL** — CSS property/value guard exists; all repeater/save validation is not covered |
| 6 | Preview/publish structure parity for all block types and viewports | **PARTIAL** — targeted compiler tests only; browser snapshots unavailable |
| 7 | Background gradients/images/video/overlay/focal point/fallback | **PARTIAL** — image focal point, gradient variants, video poster/fallback are compiler-tested; overlays/per-breakpoint QA open |
| 8 | Slider transitions/autoplay/infinite/accordion/tabs/lightbox | **PARTIAL** — transition markup/runtime and lightbox output tested; browser runtime behavior unverified |
| 9 | Links, anchors, buttons and form outcomes | **NOT VERIFIED** — existing behavior retained; integration tests needed |
| 10 | CSS block/page/element scope and publish output | **PARTIAL** — CSS block target and output tested; global/element raw CSS safety remains open |
| 11 | Change one phrase without changing siblings | **IMPLEMENTED — BROWSER VERIFICATION REQUIRED** — contenteditable Rich Text toolbar saves HTML |
| 12 | Split image/text desktop, stack/reorder mobile | **PARTIAL** — nested Flex/Grid support retained; no viewport browser test |
| 13 | Flex/Grid/position/overflow behavior | **PARTIAL** — advanced property editor enables declarations; visual layout test not run |
| 14 | Hover/focus/active specificity and visible focus | **IMPLEMENTED + COMPILER TESTED** for CSS emission; keyboard browser test open |
| 15 | No accidental horizontal overflow at specified widths | **NOT VERIFIED** — needs visual browser QA |
| 16 | Full editor flows without mouse | **NOT VERIFIED** |
| 17 | Alt text, labels, carousel controls and dialog focus | **PARTIAL** — carousel names and lightbox basics added; comprehensive audit/focus trap open |
| 18 | Reduced-motion preference and pause behavior | **PARTIAL** — CSS fallback and slider autoplay suppression implemented/tested; other moving widgets need review |
| 19 | Contrast, heading order, labels, broken links and keyboard tests | **NOT IMPLEMENTED** — no audit panel or automated axe suite |
| 20 | Media loading, layout stability, fallbacks and console errors | **PARTIAL** — responsive source/decoding/poster/fallback added; browser/performance testing open |
| 21 | Anonymous users cannot mutate/read private projects | **PARTIAL** — unauthenticated API gate tested when password configured; local loopback bypass is intentionally for development |
| 22 | User A cannot access User B projects/assets | **NOT IMPLEMENTED** — single-admin workspace, no user ownership model |
| 23 | Reject unsafe HTML/SVG/CSS/URL payloads | **PARTIAL** — dangerous tags/attributes/URLs and CSS declarations filtered; no maintained HTML sanitizer, SVG policy or complete payload suite |
| 24 | CSRF, MIME spoofing, oversized upload, traversal, SQL error leakage | **PARTIAL** — origin defense, existing MIME/size checks and generic DB errors; no exhaustive adversarial suite |
| 25 | Public forms cannot cause uncontrolled storage/traffic | **PARTIAL** — basic per-client rate limiter added; concurrency, retention and abuse testing open |

## Verified test command and current result

Run from the project root:

```bash
./tests/run-smoke.sh
```

The script currently passes:
- PHP syntax checks for all PHP files.
- JavaScript syntax checks for all JS files.
- Compiler assertions for image/video backgrounds, responsive image sources, lightbox output, slider transition attributes, reusable classes, state rules, custom CSS, semantic elements, configured breakpoints, reduced motion and CSS safety filters.
- Access-policy primitives and HTTP checks for redirect-to-login, 401 on unauthenticated management API, password login, and authenticated editor shell access.

**Not verified:** live database CRUD, browser visual rendering, actual click/keyboard behavior in Chrome/Firefox/Safari/Edge, cross-project authorization, full accessibility/performance audits, and a full 48-block conformance run. Chromium headless timed out in this environment before returning a DOM; that failure is recorded rather than reported as a pass.

## Next engineering gates

1. Run in XAMPP with MySQL and test create/save/load/publish/delete/revision flows.
2. Install/use browser automation (Playwright or equivalent) in a functioning browser environment; test actual editor interaction and output parity.
3. Replace regex-only HTML sanitization with a maintained allowlist sanitizer and isolate embed content.
4. Decide whether SiteBuilder is single-admin or multi-user. For multi-user, implement users, password hashing, per-project ownership, CSRF tokens, session rotation, login rate limiting and project-level authorization.
5. Complete visual Grid placement, interaction builder, synced components/variants, asset manager, accessibility audit panel and performance checks.
6. Only then label the complete blueprint finished and expose the product to public users.
