# Comparison Tool - Manual Testing Checklist

Use this checklist when testing the comparison tool feature. Check off each item as you verify it works correctly.

## Pre-Testing Setup

- [ ] Branch: `feat/issue-56-comparison-tool` checked out
- [ ] Dependencies installed: `npm install`
- [ ] Dev server running: `npm run dev`
- [ ] Browser: Chrome/Edge (latest version)
- [ ] DevTools open (F12) for responsive testing

## Test 1: Navigation

### From Purchase Page

- [ ] Navigate to `http://localhost:3000/credits/purchase`
- [ ] Verify "Compare Projects" button is visible in top right
- [ ] Click "Compare Projects" button
- [ ] Verify navigation to `/credits/compare`
- [ ] Verify page loads without errors

### Direct Access

- [ ] Navigate directly to `http://localhost:3000/credits/compare`
- [ ] Verify page loads correctly
- [ ] Verify all projects are displayed

## Test 2: Project Selection

### Basic Selection

- [ ] Click checkbox on "Amazon Rainforest Reforestation"
- [ ] Verify checkbox is checked
- [ ] Verify counter shows "1 / 3 selected"
- [ ] Verify counter text is gray

### Multiple Selection

- [ ] Click checkbox on "Wind Energy Farm - Texas"
- [ ] Verify counter shows "2 / 3 selected"
- [ ] Click checkbox on "Mangrove Restoration - Indonesia"
- [ ] Verify counter shows "3 / 3 selected"
- [ ] Verify counter text turns blue and bold

### Selection Limit

- [ ] Try to click checkbox on "Sustainable Agriculture - Kenya"
- [ ] Verify checkbox does NOT check
- [ ] Verify counter stays at "3 / 3 selected"
- [ ] Verify the card appears slightly dimmed/disabled

### Deselection

- [ ] Click checkbox on "Wind Energy Farm - Texas" to deselect
- [ ] Verify checkbox is unchecked
- [ ] Verify counter shows "2 / 3 selected"
- [ ] Verify "Sustainable Agriculture - Kenya" is now selectable

### Out of Stock

- [ ] Verify "Solar Power Initiative - India" has "Out of Stock" badge
- [ ] Verify its checkbox is disabled (grayed out)
- [ ] Try to click it - verify nothing happens

## Test 3: Comparison Table

### Table Appearance

- [ ] With 2-3 projects selected, scroll down to comparison section
- [ ] Verify "Comparison" heading is visible
- [ ] Verify table has proper borders and styling
- [ ] Verify table is readable

### Table Content - Row by Row

- [ ] **Price per Ton**: Verify shows "$XX.XX" format in blue
- [ ] **Type**: Verify shows badge with project type
- [ ] **Location**: Verify shows location text
- [ ] **Co-Benefits**: Verify shows multiple green badges
- [ ] **Verification Status**: Verify shows certification badge
- [ ] **Vintage Year**: Verify shows year (2022-2024)
- [ ] **Available Supply**: Verify shows "XXX.XX tons CO₂"
- [ ] **Actions**: Verify shows "Add to Cart" buttons

### Table Accuracy

- [ ] Compare table data with project cards above
- [ ] Verify all prices match
- [ ] Verify all types match
- [ ] Verify all locations match

## Test 4: Add to Cart

### Working Projects

- [ ] Click "Add to Cart" on first project in comparison
- [ ] Verify navigation to `/credits/purchase?projectId=proj-XXX`
- [ ] Verify URL contains correct project ID
- [ ] Use browser back button to return to comparison
- [ ] Verify selections are maintained

### Out of Stock (if selected before)

- [ ] If "Solar Power Initiative" is in comparison
- [ ] Verify button shows "Out of Stock"
- [ ] Verify button is disabled (grayed out)
- [ ] Try to click - verify nothing happens

## Test 5: PDF Export

### Export Functionality

- [ ] Click "Export as PDF" button
- [ ] Verify download starts immediately
- [ ] Verify file downloads to Downloads folder
- [ ] Verify filename format: `carbon-projects-comparison-YYYY-MM-DD.pdf`

### PDF Content

- [ ] Open the downloaded PDF file
- [ ] Verify title: "Carbon Credit Projects Comparison"
- [ ] Verify generation date is present
- [ ] Verify shows "Comparing X project(s)"
- [ ] Verify all selected projects are listed
- [ ] For each project, verify it shows:
  - [ ] Project name
  - [ ] Type
  - [ ] Location
  - [ ] Price per Ton
  - [ ] Vintage Year
  - [ ] Verification Status
  - [ ] Available Supply
  - [ ] Co-Benefits
  - [ ] Description

## Test 6: Clear Selection

### Clear Functionality

- [ ] With projects selected, click "Clear Selection" button
- [ ] Verify all checkboxes become unchecked
- [ ] Verify counter shows "0 / 3 selected"
- [ ] Verify comparison table disappears
- [ ] Verify empty state message appears: "Select projects above to start comparing"

### Re-selection After Clear

- [ ] Select projects again
- [ ] Verify comparison table reappears
- [ ] Verify everything works as before

## Test 7: Responsive Design

### Mobile View (375px)

- [ ] Open DevTools (F12)
- [ ] Click device toolbar icon (Ctrl+Shift+M)
- [ ] Select "iPhone SE" or set width to 375px
- [ ] Verify project cards are in single column
- [ ] Verify cards are full width
- [ ] Verify comparison table has horizontal scroll
- [ ] Scroll table horizontally - verify all columns visible
- [ ] Verify buttons stack vertically if needed
- [ ] Verify text is readable (not too small)

### Tablet View (768px)

- [ ] Set width to 768px (iPad)
- [ ] Verify project cards are in 2-column grid
- [ ] Verify cards have proper spacing
- [ ] Verify comparison table is readable
- [ ] Verify buttons are properly sized

### Desktop View (1920px)

- [ ] Set width to 1920px or maximize window
- [ ] Verify project cards are in 3-column grid
- [ ] Verify comparison table uses full width
- [ ] Verify no excessive white space
- [ ] Verify content is centered with max-width

### Breakpoint Transitions

- [ ] Slowly resize browser from 375px to 1920px
- [ ] Verify smooth transitions between layouts
- [ ] Verify no layout breaks or overlaps
- [ ] Verify no horizontal scrollbar on page (only on table)

## Test 8: Accessibility

### Keyboard Navigation

- [ ] Close DevTools
- [ ] Click in address bar, then press Tab
- [ ] Verify focus moves to "Compare Projects" link (if on purchase page)
- [ ] Continue pressing Tab through all elements:
  - [ ] Project checkboxes (5 total)
  - [ ] Clear Selection button
  - [ ] Export PDF button
  - [ ] Add to Cart buttons (one per selected project)
- [ ] Verify focus indicator is clearly visible on each element
- [ ] Verify focus indicator has good contrast

### Keyboard Interaction

- [ ] Tab to a project checkbox
- [ ] Press Space to check/uncheck
- [ ] Verify checkbox toggles
- [ ] Tab to "Clear Selection" button
- [ ] Press Enter to activate
- [ ] Verify selection clears

### Screen Reader (Optional)

- [ ] Enable screen reader (NVDA, JAWS, or VoiceOver)
- [ ] Navigate through page
- [ ] Verify all elements are announced
- [ ] Verify selection counter updates are announced
- [ ] Verify button labels are descriptive

### ARIA Attributes

- [ ] Right-click on selection counter → Inspect
- [ ] Verify `aria-live="polite"` attribute exists
- [ ] Right-click on checkbox → Inspect
- [ ] Verify `aria-label` describes the project
- [ ] Right-click on buttons → Inspect
- [ ] Verify `aria-label` attributes are present

## Test 9: Edge Cases

### No Selection

- [ ] Clear all selections
- [ ] Verify empty state message is shown
- [ ] Verify no comparison table is visible
- [ ] Verify "Export PDF" button is not visible

### Single Selection

- [ ] Select only 1 project
- [ ] Verify comparison table shows with 1 column
- [ ] Verify "Export PDF" works with 1 project
- [ ] Verify "Add to Cart" works

### Maximum Selection

- [ ] Select exactly 3 projects
- [ ] Verify all 4th+ projects are disabled
- [ ] Verify comparison table shows 3 columns
- [ ] Verify table is readable with 3 columns

### Rapid Clicking

- [ ] Rapidly click checkboxes on/off
- [ ] Verify counter updates correctly
- [ ] Verify no UI glitches
- [ ] Verify comparison table updates smoothly

## Test 10: Browser Compatibility

### Chrome/Edge

- [ ] Test all features in Chrome or Edge
- [ ] Verify everything works
- [ ] Note any issues: **\*\***\_\_\_**\*\***
- [ ] Note any issues: ******\_\_\_******

### Firefox

- [ ] Test all features in Firefox
- [ ] Verify everything works
- [ ] Note any issues: **\*\***\_\_\_**\*\***
- [ ] Note any issues: ******\_\_\_******

### Safari (if available)

- [ ] Test all features in Safari
- [ ] Verify everything works
- [ ] Note any issues: **\*\***\_\_\_**\*\***
- [ ] Note any issues: ******\_\_\_******

### Mobile Browser

- [ ] Test on actual mobile device or emulator
- [ ] Verify touch interactions work
- [ ] Verify scrolling is smooth
- [ ] Note any issues: **\*\***\_\_\_**\*\***
- [ ] Note any issues: ******\_\_\_******

## Test 11: Performance

### Load Time

- [ ] Clear browser cache
- [ ] Navigate to `/credits/compare`
- [ ] Verify page loads in < 2 seconds
- [ ] Verify no loading spinners or delays

### Interaction Speed

- [ ] Click checkboxes rapidly
- [ ] Verify immediate visual feedback
- [ ] Verify no lag or delay
- [ ] Verify smooth animations

### Memory Usage

- [ ] Open DevTools → Performance tab
- [ ] Record while interacting with page
- [ ] Verify no memory leaks
- [ ] Verify smooth 60fps performance

## Test 12: Error Handling

### Network Issues (Optional)

- [ ] Open DevTools → Network tab
- [ ] Set throttling to "Offline"
- [ ] Try to use the page
- [ ] Verify graceful degradation (since using mock data, should still work)

### Console Errors

- [ ] Open DevTools → Console tab
- [ ] Interact with all features
- [ ] Verify NO errors in console
- [ ] Verify NO warnings in console

## Final Verification

### Code Quality

- [ ] Run `npm run lint` - verify no errors
- [ ] Run `npm run build` - verify build succeeds
- [ ] Run `npx tsc --noEmit` - verify no TypeScript errors

### Documentation

- [ ] Read `COMPARISON_TOOL_IMPLEMENTATION.md`
- [ ] Verify documentation matches implementation
- [ ] Verify all features documented are present

### Acceptance Criteria

- [ ] Up to 3 projects selectable ✅
- [ ] Comparison table accurate ✅
- [ ] Add to Cart works per project ✅
- [ ] PDF export generates correctly ✅
- [ ] Responsive layout (scroll on mobile) ✅
- [ ] Responsive across mobile/tablet/desktop ✅
- [ ] Accessible (WCAG 2.1 AA) ✅
- [ ] TypeScript strict — no any types ✅

## Issues Found

Document any issues found during testing:

1. ***
2. ***
3. ***

## Testing Sign-Off

- **Tester Name**: **\*\***\_\_\_**\*\***
- **Date**: **\*\***\_\_\_**\*\***
- **Browser(s) Tested**: **\*\***\_\_\_**\*\***
- **Device(s) Tested**: **\*\***\_\_\_**\*\***
- **Tester Name**: ******\_\_\_******
- **Date**: ******\_\_\_******
- **Browser(s) Tested**: ******\_\_\_******
- **Device(s) Tested**: ******\_\_\_******
- **Overall Status**: [ ] PASS [ ] FAIL
- **Ready for PR**: [ ] YES [ ] NO

## Notes

Additional observations or comments:

---

---

---
