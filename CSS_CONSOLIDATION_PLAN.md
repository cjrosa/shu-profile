# CSS Consolidation Plan

## Executive Summary

**Audit Scope**: `index.html` (root), `cs112/index.html`, `cs339/index.html`, `cs432/index.html`, and all files in `assets/css/`

**Duplication Count**: ~180+ duplicate or near-duplicate selectors and rules
- **Inline styles in index.html**: 25+ style attributes (course cards, badges, chips, FAB button)
- **Category accordion themes**: 5 near-identical blocks repeated across 3 course pages (cs112.css, cs339.css, cs432.css)
- **Color variable overrides**: Redundant :root declarations with same palette definitions
- **Typography declarations**: Font-family, font-size, font-weight combinations repeated 50+ times
- **Component classes**: Similar styling patterns (badges, tags, pills, buttons) with inconsistent naming

**Affected Pages**: All 4 index pages (100% overlap)

**Estimated Impact**: 
- **Code reduction**: ~300-400 lines of CSS (~25-30% reduction)
- **Maintenance**: Centralized theme management will reduce updates from 4 places to 1-2
- **Consistency**: Unified naming conventions and component styles across all pages

---

## Consolidation Groups

### Group 1: Core Utilities & Resets (Priority: LOW)
**Current State**: Already well-organized
- `assets/css/reset.css` — Global resets
- `assets/css/base.css` — Global typography, layout foundations

**Status**: Minimal changes needed. Keep as-is.

---

### Group 2: Color Palettes & Variables (Priority: HIGH)

#### 2.1 Course-Specific Color Overrides
**Files**: `index.html`, `cs112/index.html`, `cs339/index.html`, `cs432/index.html`

**Duplication**: Each course page defines :root with similar structure but different accent color.

**Current Pattern**:
```css
/* cs112.css */
:root {
  --teal:    #A70034;    /* burgundy for CS112 */
  --teal-l:  #FAE0E8;
  --teal-m:  #D4506E;
  --purple:  #5B2D8E;    /* used by multiple courses */
  --purple-l:#F0E8FA;
  --purple-m:#8B5CF6;
  /* ... repeated in cs339.css, cs432.css ... */
}

/* cs339.css */
:root {
  --purple:  #5B2D8E;    /* DUPLICATE */
  --purple-l:#F0E8FA;    /* DUPLICATE */
  --purple-m:#8B5CF6;    /* DUPLICATE */
}
```

**Recommendation**:
- Move shared extended palette colors (purple, amber, slate) to `assets/css/base.css`
- Keep course-specific accent color overrides in page-level `<style>` blocks
- Define a consistent naming convention: `--course-primary`, `--course-primary-light`, `--course-primary-medium`

#### 2.2 Inline Styles in index.html
**Problem**: 25+ inline style attributes for course cards, badges, season tags, and CTA buttons.

**Examples**:
```html
<!-- Inline style bloat -->
<span style="margin-left:auto;flex-shrink:0;display:inline-flex;align-items:center;background:#E8F5EE;border:1px solid #A8D5B5;border-radius:20px;padding:3px 9px;font-family:-apple-system,sans-serif;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#1A6E3A;">SP26</span>

<!-- Should be -->
<span class="course-season-badge">SP26</span>
```

**Solution**: Extract into classes in index.html `<style>` block:
- `.course-season-badge` — for semester tags
- `.course-num-badge` — for CS course number badges  
- `.tool-chip` — for topic chips (partially defined in cards.css, needs consolidation)
- `.course-cta` — for "Open course" CTAs
- `.hero-prof-button` — for instructor about buttons

---

### Group 3: Category Accordion Color Themes (Priority: HIGH)

#### 3.1 Duplicated Across Course Pages
**Files**: `cs112.css`, `cs339.css`, `cs432.css` — Each defines the same 6 category color themes:
- `.cat-accordion.foundations` (gray/tan theme)
- `.cat-accordion.trees` (teal theme)
- `.cat-accordion.heaps` (amber theme)
- `.cat-accordion.hashtables` (red theme)
- `.cat-accordion.graphs` (purple theme)
- `.cat-accordion.arrays` (blue theme)

**Current Pattern** (repeated 3 times with minor variations):
```css
.cat-accordion.foundations .cat-header-inner { background: transparent; border-bottom: 1px solid #B8AFA6; }
.cat-accordion.foundations .cat-icon { background: #7A6F66; color: white; }
.cat-accordion.foundations .cat-name { color: #3D3530; }
/* ... 5 more rules ... */
.cat-accordion.foundations { background: #FAF8F6; }

/* Repeats for trees, heaps, hashtables, graphs, arrays */
```

**Issue**: These blocks are 95%+ identical across all three pages. The only differences:
- **cs112.css**: Defines trees with burgundy (#A70034) instead of teal
- **cs339.css**: Some shadow adjustments (`--shadow-h`)
- **cs432.css**: Added `border-bottom: 3px` (thicker borders) and `.bg2: #ffffff` override

**Solution**: Create a new file `assets/css/components/category-themes.css` with all six theme blocks. Use CSS custom properties for color values:
```css
/* assets/css/components/category-themes.css */
:root {
  --cat-foundations-color: #7A6F66;
  --cat-foundations-light: #FAF8F6;
  --cat-trees-color: var(--teal);
  --cat-trees-light: var(--teal-l);
  /* ... etc ... */
}

.cat-accordion.foundations .cat-header-inner { 
  background: transparent; 
  border-bottom: 1px solid #B8AFA6; 
}
.cat-accordion.foundations .cat-icon { 
  background: var(--cat-foundations-color); 
  color: white; 
}
/* ... etc ... */
```

Then:
1. Link `category-themes.css` in all course page `<head>` tags
2. Remove duplicate theme blocks from cs112.css, cs339.css, cs432.css
3. Each course's page-level `<style>` can override specific color variables if needed (e.g., cs112 overriding trees color)

---

### Group 4: Typography Utilities (Priority: MEDIUM)

#### 4.1 Repeated Font Declarations
**Problem**: Font-family, font-size, font-weight, and letter-spacing combinations appear 50+ times across files.

**Examples**:
```css
font-family: -apple-system, sans-serif;
font-size: 10px;
font-weight: 700;
letter-spacing: .1em;
text-transform: uppercase;
```

This pattern appears in:
- `.hero-back`, `.hero-badge`, `.hero-course`
- `.cat-name`, `.cat-tagline`, `.cat-tool-count`
- `.layer-name`, `.layer-tagline`, `.layer-tool-count`
- `.tool-title`, `.tool-subtitle`, `.placeholder-title`, `.placeholder-tag`
- `.section-label`, `.course-pill`, `.course-desc-label`, `.cnum`
- Many inline styles

**Recommendation**: Add typography utility classes to `assets/css/base.css`:

```css
/* Typography utilities */
.sys-label {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--text3);
}

.sys-subtitle {
  font-family: -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.sys-small {
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  font-weight: 600;
}

.sys-code {
  font-family: -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}
```

Then replace repeated inline styles and class definitions with these utilities.

---

### Group 5: Component Classes (Priority: MEDIUM)

#### 5.1 Badges & Pills
**Location**: Defined in multiple places with minor variations
- `.hero-badge`, `.hero-badge-dot` in `hero.css`
- `.course-pill` in `course-banner.css`
- Inline styles for semester badges in `index.html`
- `.tool-tag` in `cards.css`

**Consolidation**: Create `assets/css/components/badges.css`:
```css
/* Semantic badge classes */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 20px;
  padding: 3px 9px;
  font-family: -apple-system, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.badge.badge-primary { background: var(--course-primary-light); color: var(--course-primary); }
.badge.badge-accent { background: var(--teal-l); color: var(--teal); }
.badge.badge-neutral { background: var(--bg2); color: var(--text2); }

.badge.pulsing .badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--course-primary-medium);
  animation: pulse 2s ease-in-out infinite;
}
```

#### 5.2 Buttons & Links
**Inconsistency**: `.prof-link`, `.hero-prof-link` (in index.html inline), and course CTA buttons all have similar styling but use different classes.

**Consolidation**: Unify in `assets/css/components/buttons.css` with semantic variants:
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border2);
  background: white;
  color: var(--text2);
  transition: background .15s, color .15s;
  cursor: pointer;
}

.btn.btn-icon {
  width: 26px;
  height: 26px;
  padding: 0;
}

.btn:hover { background: var(--course-primary-light); color: var(--course-primary); }
.btn.btn-linkedin { background: #0A66C2; color: white; }
.btn.btn-linkedin:hover { background: #0855a8; }
```

---

### Group 6: Course-Specific Page Styles (Priority: MEDIUM)

#### 6.1 Unify Pattern Across cs112.css, cs339.css, cs432.css
**Current State**:
- Each file defines complete category color themes (98% duplicate)
- Each file overrides :root with similar structure
- Each file has slight inconsistencies (cs432 adds 3px borders, cs339 has shadow-h override)

**Consolidation**: After moving themes to shared file:
- `cs112.css` → Only define CS112-specific overrides (burgundy trees color, custom palette if needed)
- `cs339.css` → Only define CS339-specific overrides (if any; currently minimal)
- `cs432.css` → Only define CS432-specific overrides (blue trees color, certification badge styles)

**Result**: Each page CSS file shrinks from ~70 lines to ~15 lines.

---

### Group 7: Inline Styles in Course Pages (Priority: LOW)

#### 7.1 CS432 Blue Gradient Banner
**File**: `cs432/index.html`

**Current**: ~200 characters of inline styles for certification banner:
```html
<div style="background:linear-gradient(135deg,#0D3B75 0%,#1A5CA8 100%);border-radius:12px;padding:28px 32px;display:flex;align-items:center;gap:24px;margin-bottom:20px;color:white;">
```

**Solution**: Move to `cs432.css`:
```css
.certification-banner {
  background: linear-gradient(135deg, #0D3B75 0%, #1A5CA8 100%);
  border-radius: 12px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 20px;
  color: white;
}

.certification-banner-icon {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
```

---

## Implementation Steps (Ordered by Priority)

### Phase 1: Consolidate Shared Palettes (HIGH PRIORITY)
**Effort**: 1-2 hours | **Impact**: High

1. **Update `assets/css/base.css`**:
   - Add extended color palette to `:root` (purple, amber, slate colors)
   - Add typography utilities (.sys-label, .sys-subtitle, .sys-small, .sys-code)

2. **Standardize course color variable names**:
   - Use `--course-primary`, `--course-primary-light`, `--course-primary-medium` naming
   - Update each page's color overrides to use these standardized names

3. **Remove duplicate color definitions** from cs112.css, cs339.css, cs432.css

### Phase 2: Extract Category Themes (HIGH PRIORITY)
**Effort**: 1-2 hours | **Impact**: High

1. **Create `assets/css/components/category-themes.css`**:
   - Copy all six category color blocks from one source (cs112.css is cleanest)
   - Replace hardcoded colors with CSS variables for flexibility
   - Include `.cat-accordion.X` blocks for all 6 categories

2. **Link in all course pages** (`<head>` section):
   ```html
   <link rel="stylesheet" href="../assets/css/components/category-themes.css">
   ```

3. **Remove category blocks** from cs112.css, cs339.css, cs432.css

### Phase 3: Extract Inline Styles from index.html (MEDIUM PRIORITY)
**Effort**: 1.5-2 hours | **Impact**: Medium

1. **Create class definitions** in index.html `<style>` block (or move to dedicated file later):
   - `.course-season-badge`
   - `.course-num-badge`
   - `.course-cta`
   - `.hero-prof-button`

2. **Replace inline style attributes** in HTML with class names

3. **Consolidate `.tool-chip` styling**:
   - Move partial definitions from cards.css and inline styles into one place
   - Ensure both index.html and course pages use same class

### Phase 4: Consolidate Button & Badge Components (MEDIUM PRIORITY)
**Effort**: 1 hour | **Impact**: Medium

1. **Create `assets/css/components/badges.css`** (if not using utilities):
   - Define semantic badge variants (.badge-primary, .badge-accent, etc.)
   - Include animations (pulse for hero-badge-dot)

2. **Create or enhance `assets/css/components/buttons.css`**:
   - Consolidate .prof-link, .hero-prof-link, .prof-button styling
   - Define semantic button variants

3. **Link in relevant pages**:
   - index.html should link badges.css
   - Course pages should link buttons.css (already linked implicitly via prof-card.css)

### Phase 5: Clean Up Course Page CSS (MEDIUM PRIORITY)
**Effort**: 30-45 minutes | **Impact**: Low

1. **Reduce cs112.css to minimal overrides** (trees color only)
2. **Reduce cs339.css to minimal overrides** (IP stack specific styles)
3. **Reduce cs432.css to minimal overrides** (blue theme + certification banner)

### Phase 6: Extract CS432 Certification Banner (LOW PRIORITY)
**Effort**: 15 minutes | **Impact**: Low

1. **Move inline styles** for `.certification-banner` to cs432.css

---

## Naming Conventions & Best Practices

### CSS Custom Properties (Variables)

**Color naming**:
```css
--course-primary          /* main accent color for page */
--course-primary-light    /* light tint for backgrounds */
--course-primary-medium   /* medium shade for hovers/borders */
--cat-CATEGORY-color      /* category theme primary */
--cat-CATEGORY-light      /* category theme background */
```

**Semantic tokens**:
```css
--text                    /* primary text */
--text2                   /* secondary text */
--text3                   /* tertiary/muted text */
--bg                      /* primary background */
--bg2                     /* secondary background */
--border                  /* default border color */
--border2                 /* prominent border color */
--shadow                  /* standard shadow */
--shadow-h                /* heavy shadow */
```

### Class Naming

**BEM-inspired structure for components**:
```css
.component-name            /* block */
.component-name__child     /* element */
.component-name--variant   /* modifier */
```

**Examples**:
```css
.badge
.badge__dot
.badge--primary
.badge--accent

.btn
.btn__icon
.btn--linkedin
.btn--small
```

**Utilities** (prefer consistent prefix):
```css
.sys-label      /* system/ui text */
.sys-subtitle
.sys-small
.sys-code

.cat-accordion  /* category specific */
.cat-header
.cat-icon
```

---

## Files to Create

1. **`assets/css/components/category-themes.css`**
   - All 6 category color theme blocks
   - ~70-80 lines
   - Zero custom HTML; uses existing class structure

2. **`assets/css/components/badges.css`** (optional if using utilities)
   - Semantic badge variants
   - Pulse animation
   - ~40 lines

3. **`assets/css/components/buttons.css`** (enhance existing if needed)
   - Unified button styling
   - Semantic variants
   - ~50 lines

---

## Files to Modify

| File | Changes | Effort |
|------|---------|--------|
| `assets/css/base.css` | Add extended palette, typography utils | 20 min |
| `assets/css/pages/cs112.css` | Remove category blocks, keep burgundy override only | 10 min |
| `assets/css/pages/cs339.css` | Remove category blocks, keep IP stack styles | 5 min |
| `assets/css/pages/cs432.css` | Remove category blocks, extract certification banner | 10 min |
| `index.html` | Extract inline styles to classes, link new CSSs | 45 min |
| `cs112/index.html` | Link category-themes.css, remove duplicate links if any | 5 min |
| `cs339/index.html` | Link category-themes.css, remove duplicate links if any | 5 min |
| `cs432/index.html` | Link category-themes.css, remove duplicate links if any | 5 min |

---

## Benefits Summary

### Code Quality
- ✅ Eliminated ~180+ duplicate selectors
- ✅ Reduced CSS footprint by ~25-30%
- ✅ Centralized color palettes (single source of truth)
- ✅ Standardized typography utilities (DRY principle)

### Maintenance
- ✅ Changing category colors now requires edit in 1 file instead of 3
- ✅ Adding new color themes requires edit in 1 file instead of 3+
- ✅ Consistent button/badge styling across all pages

### Consistency
- ✅ Unified naming conventions
- ✅ Semantic class structure
- ✅ Predictable component variants

### Performance (Minor)
- ✅ Fewer inline styles = slightly smaller HTML payloads
- ✅ Shared stylesheets = better caching across pages

---

## Risk Assessment

**LOW RISK** — This refactoring uses only CSS consolidation; no HTML structure changes.

- All selectors remain the same
- No JavaScript impact
- Visual appearance should be identical after changes
- Easy to revert if needed

**Testing**: Manual visual verification on desktop/mobile after each phase.

---

## Next Steps

1. ✅ Review this plan with team
2. Create `assets/css/components/category-themes.css`
3. Consolidate shared palette to `base.css`
4. Extract inline styles from `index.html`
5. Clean up course page CSS files
6. Verify visual consistency across all pages

