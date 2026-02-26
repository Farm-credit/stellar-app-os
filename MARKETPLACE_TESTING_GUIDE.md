# Marketplace Testing Guide - Quick Reference

## Quick Start

```bash
# 1. Start dev server
pnpm dev

# 2. Open browser
http://localhost:3000/marketplace

# 3. Test all features below
```

---

## Test Scenarios

### ✅ Basic Display
1. Navigate to `/marketplace`
2. Verify 9 listings display in 3x3 grid
3. Check each card shows:
   - Project name
   - Project type badge
   - Seller name and avatar
   - Location
   - Quantity (tons CO₂)
   - Price per ton
   - Total price
   - Vintage year
   - Verification status
   - Listed date
   - "View Details" button

### ✅ Project Type Filter
1. Click "All Project Types" dropdown
2. Select "Renewable Energy"
3. Verify only Renewable Energy listings show
4. Check results count updates
5. Check URL has `?type=Renewable+Energy`
6. Select "All Project Types"
7. Verify all listings return

### ✅ Sort by Price
1. Click "Newest First" dropdown
2. Select "Price: Low to High"
3. Verify listings sorted by price ascending
4. Check URL has `?sort=price-asc`
5. Select "Price: High to Low"
6. Verify listings sorted by price descending
7. Check URL has `?sort=price-desc`

### ✅ Sort by Date
1. Click sort dropdown
2. Select "Oldest First"
3. Verify listings sorted by date ascending
4. Check URL has `?sort=date-oldest`
5. Select "Newest First"
6. Verify listings sorted by date descending (default)

### ✅ Search Functionality
1. Type "amazon" in search box
2. Verify only Amazon-related listings show
3. Check results count updates
4. Check URL has `?search=amazon`
5. Type "solar"
6. Verify only Solar-related listings show
7. Click X button to clear
8. Verify all listings return

### ✅ Combined Filters
1. Select "Reforestation" type
2. Type "brazil" in search
3. Select "Price: Low to High"
4. Verify all filters apply together
5. Check URL has all params: `?type=Reforestation&sort=price-asc&search=brazil`
6. Verify results match all criteria

### ✅ Active Filters Display
1. Apply project type filter
2. Verify filter chip appears below filters
3. Click X on chip
4. Verify filter removed and results update
5. Apply search query
6. Verify search chip appears
7. Click X on search chip
8. Verify search cleared

### ✅ Pagination
1. Scroll to bottom of page
2. Verify pagination controls visible
3. Click "Next" button
4. Verify page 2 loads
5. Check URL has `?page=2`
6. Verify smooth scroll to top
7. Click page number "1"
8. Verify page 1 loads
9. Click "Previous" button (should be disabled on page 1)

### ✅ Pagination with Filters
1. Apply a filter (e.g., "Renewable Energy")
2. Navigate to page 2
3. Verify filter preserved in URL
4. Verify filtered results on page 2
5. Change filter
6. Verify resets to page 1

### ✅ Detail Page
1. Click "View Details" on any listing
2. Verify navigates to `/marketplace/[id]`
3. Check detail page shows:
   - Project name and badges
   - Seller information card
   - Project details (location, vintage, verification, quantity)
   - Listed date
   - Pricing sidebar (price per ton, quantity, total)
   - "Purchase Credits" button
4. Click "Purchase Credits"
5. Verify placeholder alert appears
6. Click "Back to Marketplace"
7. Verify returns to listings page

### ✅ Invalid Listing ID
1. Navigate to `/marketplace/invalid-id`
2. Verify 404 page displays
3. Check shows "Listing Not Found" message
4. Click "Back to Marketplace"
5. Verify returns to listings page

### ✅ Empty State
1. Type "xyz123" in search (no results)
2. Verify empty state displays
3. Check shows icon and message
4. Clear search
5. Verify listings return

### ✅ URL State Management
1. Apply filters: type=Reforestation, sort=price-asc, search=amazon, page=2
2. Copy URL from address bar
3. Open new tab
4. Paste URL
5. Verify all filters/sort/search/page preserved
6. Use browser back button
7. Verify previous state restored
8. Use browser forward button
9. Verify next state restored

### ✅ Responsive - Mobile (< 640px)
1. Resize browser to 375px width
2. Verify 1 column grid
3. Verify filters stack vertically
4. Verify search bar full width
5. Verify pagination shows "Page X of Y"
6. Verify cards are touch-friendly
7. Verify no horizontal scroll

### ✅ Responsive - Tablet (640-1024px)
1. Resize browser to 768px width
2. Verify 2 column grid
3. Verify filters side-by-side
4. Verify pagination shows page numbers

### ✅ Responsive - Desktop (> 1024px)
1. Resize browser to 1280px width
2. Verify 3 column grid
3. Verify filters side-by-side
4. Verify pagination shows all page numbers
5. Verify detail page sidebar is sticky

### ✅ Keyboard Navigation
1. Press Tab repeatedly
2. Verify focus moves through:
   - Search input
   - Project type dropdown
   - Sort dropdown
   - Active filter chips
   - Listing cards
   - "View Details" buttons
   - Pagination controls
3. Verify focus indicators visible
4. Press Enter on "View Details"
5. Verify navigates to detail page
6. Press Tab to "Back to Marketplace"
7. Press Enter
8. Verify returns to listings

### ✅ Screen Reader (Optional)
1. Enable screen reader (NVDA/JAWS/VoiceOver)
2. Navigate to marketplace
3. Verify announces "Marketplace listings"
4. Apply filter
5. Verify announces results count update
6. Navigate through listings
7. Verify announces listing details
8. Navigate to detail page
9. Verify announces page structure

### ✅ Performance
1. Open DevTools Network tab
2. Navigate to marketplace
3. Verify page loads < 2 seconds
4. Apply filter
5. Verify instant update (no loading spinner needed)
6. Change sort
7. Verify instant update
8. Type in search
9. Verify instant update

### ✅ Console Errors
1. Open DevTools Console
2. Navigate to marketplace
3. Verify no errors
4. Apply all filters
5. Verify no errors
6. Navigate to detail page
7. Verify no errors
8. Navigate back
9. Verify no errors

---

## Expected Results Summary

| Feature | Expected Behavior |
|---------|------------------|
| Grid Display | 3x3 grid on desktop, 2x2 on tablet, 1 col on mobile |
| Project Filter | Filters listings, updates URL, resets to page 1 |
| Sort | Reorders listings, updates URL, resets to page 1 |
| Search | Filters by name/seller/location, updates URL, resets to page 1 |
| Pagination | 9 items per page, preserves filters, smooth scroll |
| Detail Page | Shows full listing info, purchase button, back nav |
| URL State | All params in URL, shareable, back/forward works |
| Responsive | Adapts layout at breakpoints, no horizontal scroll |
| Accessibility | Keyboard nav, ARIA labels, screen reader friendly |
| Performance | Instant updates, no loading states needed |

---

## Common Issues & Solutions

### Issue: Listings not displaying
**Solution:** Check mock data is imported correctly in `app/marketplace/page.tsx`

### Issue: Filters not working
**Solution:** Check URL params are updating in browser address bar

### Issue: Pagination not working
**Solution:** Verify `PaginationControl` component is receiving correct props

### Issue: Detail page 404
**Solution:** Check listing ID exists in mock data

### Issue: Responsive layout broken
**Solution:** Check Tailwind breakpoints: sm (640px), md (768px), lg (1024px)

### Issue: TypeScript errors
**Solution:** Run `getDiagnostics` on all marketplace files

---

## Browser Testing

Test in these browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## Accessibility Testing Tools

1. **Keyboard Only:** Navigate entire page without mouse
2. **Screen Reader:** Test with NVDA/JAWS/VoiceOver
3. **Color Contrast:** Use browser DevTools or WebAIM tool
4. **WAVE:** Browser extension for accessibility audit
5. **axe DevTools:** Browser extension for WCAG compliance

---

## Performance Testing

1. **Lighthouse:** Run audit in Chrome DevTools
   - Target: 90+ Performance, 100 Accessibility
2. **Network:** Check bundle size and load time
3. **React DevTools:** Check for unnecessary re-renders

---

## Sign-Off Checklist

Before creating PR:
- [ ] All test scenarios pass
- [ ] No console errors
- [ ] Responsive on all breakpoints
- [ ] Keyboard navigation works
- [ ] Screen reader friendly
- [ ] Performance acceptable
- [ ] TypeScript strict (0 errors)
- [ ] Build passes
- [ ] Lint passes
- [ ] Screen recording created

---

## Screen Recording Checklist

Record these in order:
1. [ ] Initial page load
2. [ ] Filter by project type
3. [ ] Sort by price
4. [ ] Search functionality
5. [ ] Combined filters
6. [ ] Pagination
7. [ ] Detail page
8. [ ] Back navigation
9. [ ] Responsive demo (resize browser)
10. [ ] Keyboard navigation

**Duration:** 2-3 minutes
**Format:** MP4 or WebM
**Resolution:** 1920x1080 or 1280x720

---

## Quick Commands

```bash
# Start dev server
pnpm dev

# Build (check for errors)
pnpm build

# Lint (check for issues)
pnpm lint

# Type check
pnpm tsc --noEmit

# Create PR branch
git checkout -b feat/issue-23-marketplace-listings
```

---

**Last Updated:** February 23, 2026
**Status:** Ready for Testing
