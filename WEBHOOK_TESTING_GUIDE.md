# Webhook Event Logs Viewer - Testing Guide

## 🧪 Manual Testing Checklist

### Setup
1. Start the development server: `npm run dev` or `pnpm dev`
2. Navigate to: `http://localhost:3000/admin/webhooks`

### Test 1: Initial Load
**Expected**: Table displays with 10 mock events

- [ ] Page loads without errors
- [ ] Table header shows: Timestamp, Event Type, Status, HTTP, Payload Preview, Retries, Actions
- [ ] 10 rows are visible
- [ ] Each row has properly formatted data
- [ ] Status badges show correct colors and icons
- [ ] "Live" indicator is visible (pulsing green dot)

**Pass Criteria**: All 10 events display correctly with proper formatting

---

### Test 2: Search Functionality
**Expected**: Events filter based on search input

**Steps**:
1. Type "credit" in search box
2. Observe filtered results
3. Clear search
4. Type "failed" in search box
5. Type "GAXYZ" (wallet address)

**Expected Results**:
- "credit" → Shows 3 events (credit.issued, credit.retired, credit.transferred)
- "failed" → Shows 2 events (transaction.failed, payment.failed)
- "GAXYZ" → Shows events with that wallet address in payload
- Results count updates (e.g., "Showing 3 of 10 events")

**Pass Criteria**: Search filters correctly across all searchable fields

---

### Test 3: Status Filter
**Expected**: Dropdown filters by event status

**Steps**:
1. Click "Status" dropdown
2. Select "Success"
3. Verify only successful events show
4. Select "Failed"
5. Select "Retrying"
6. Select "Pending"
7. Select "All Statuses"

**Expected Results**:
- Success → 5 events
- Failed → 2 events
- Retrying → 1 event
- Pending → 1 event
- All → 10 events

**Pass Criteria**: Each filter shows correct number of events

---

### Test 4: Event Type Filter
**Expected**: Dropdown filters by event type

**Steps**:
1. Click "Event Type" dropdown
2. Select "credit.issued"
3. Select "transaction.failed"
4. Select "All Types"

**Expected Results**:
- credit.issued → 1 event
- transaction.failed → 1 event
- All Types → 10 events

**Pass Criteria**: Filter shows only matching event types

---

### Test 5: Sorting
**Expected**: Events reorder based on sort selection

**Steps**:
1. Click "Sort By" dropdown
2. Select "Event Type"
3. Observe alphabetical order
4. Click "Order" dropdown
5. Select "Oldest First"
6. Select "Newest First"
7. Change "Sort By" to "Status"

**Expected Results**:
- Event Type + Newest → Events sorted alphabetically (Z-A)
- Event Type + Oldest → Events sorted alphabetically (A-Z)
- Status + Newest → Events grouped by status
- Timestamp + Newest → Most recent events first (default)

**Pass Criteria**: Sorting works correctly for all combinations

---

### Test 6: View Details Modal
**Expected**: Modal opens with full event details

**Steps**:
1. Click "View" button on first event
2. Observe modal content
3. Scroll through modal
4. Click "Copy" button on payload
5. Paste in text editor to verify
6. Click "Copy" button on response
7. Click X button to close
8. Click "View" on another event
9. Press ESC key
10. Click "View" again
11. Click outside modal (backdrop)

**Expected Results**:
- Modal opens with smooth animation
- Shows all event metadata (timestamp, type, status, HTTP status, endpoint, retry count)
- Payload displays as formatted JSON
- Response displays as formatted JSON (if available)
- Error message shows in red box (if failed)
- Copy buttons work (shows "Copied!" feedback)
- Modal closes via X, ESC, or backdrop click
- Focus returns to "View" button after close

**Pass Criteria**: Modal displays all data correctly and closes properly

---

### Test 7: Retry Functionality
**Expected**: Retry button triggers API call and updates UI

**Steps**:
1. Find a failed event (red "✕ failed" badge)
2. Click "Retry" button
3. Observe button state change
4. Wait for completion
5. Check event status update

**Expected Results**:
- Retry button only visible on failed events
- Button shows "Retrying..." during operation
- Button is disabled during retry
- After 1 second, status changes to "retrying" (yellow badge with ↻)
- Retry count increments (e.g., 3/3 → 4/3 or status updates)
- Console shows: "Retrying event: wh-002"

**Pass Criteria**: Retry triggers correctly and UI updates optimistically

---

### Test 8: Real-time Updates
**Expected**: Events update automatically every 5 seconds

**Steps**:
1. Observe "Live" indicator (pulsing green dot)
2. Wait 5 seconds
3. Watch for status changes
4. Wait another 5 seconds

**Expected Results**:
- Live indicator pulses continuously
- Retrying events may change to success or failed
- No page refresh required
- Updates happen smoothly

**Pass Criteria**: Real-time updates work without errors

---

### Test 9: Responsive Design - Mobile
**Expected**: Layout adapts to mobile screens

**Steps**:
1. Open Chrome DevTools (F12)
2. Click device toolbar (Ctrl+Shift+M)
3. Select "iPhone 12 Pro" (390px)
4. Scroll through page
5. Try all interactions

**Expected Results**:
- Filters stack vertically
- Table scrolls horizontally
- All buttons are touch-friendly (≥44px)
- Modal is full-width
- Text is readable
- No horizontal overflow on page

**Pass Criteria**: All features work on mobile viewport

---

### Test 10: Responsive Design - Tablet
**Expected**: Layout optimized for tablet

**Steps**:
1. In DevTools, select "iPad" (768px)
2. Observe layout changes
3. Test all features

**Expected Results**:
- Filters in 2-column grid
- Table fits better
- Modal is centered with padding
- Touch targets remain large

**Pass Criteria**: Layout looks good on tablet

---

### Test 11: Responsive Design - Desktop
**Expected**: Full desktop layout

**Steps**:
1. Resize browser to 1440px or larger
2. Observe layout

**Expected Results**:
- Filters in 4-column grid
- Table shows all columns without scroll
- Modal is large but not full-width
- Plenty of whitespace

**Pass Criteria**: Desktop layout is spacious and readable

---

### Test 12: Keyboard Navigation
**Expected**: All features accessible via keyboard

**Steps**:
1. Click in search box
2. Press Tab repeatedly
3. Navigate through all interactive elements
4. Press Enter on "View" button
5. Press Tab in modal
6. Press ESC to close
7. Press Tab to "Retry" button
8. Press Enter

**Expected Results**:
- Tab moves focus to next element
- Focus indicator is visible (blue outline)
- Enter activates buttons
- ESC closes modal
- Focus returns to trigger element after modal close
- All elements are reachable

**Pass Criteria**: Complete keyboard navigation works

---

### Test 13: Screen Reader (Optional)
**Expected**: Screen reader announces content correctly

**Steps** (with NVDA or JAWS):
1. Navigate to page
2. Tab through table
3. Listen to announcements
4. Open modal
5. Navigate modal content

**Expected Results**:
- Table structure announced
- Status badges have descriptive text
- Buttons have clear labels
- Modal role announced
- All content is readable

**Pass Criteria**: Screen reader can access all content

---

### Test 14: Empty State
**Expected**: Message shows when no results

**Steps**:
1. Search for "nonexistent"
2. Observe empty state

**Expected Results**:
- Table disappears
- Message shows: "No webhook events found"
- Subtext: "Try adjusting your filters"

**Pass Criteria**: Empty state displays correctly

---

### Test 15: Combined Filters
**Expected**: Multiple filters work together

**Steps**:
1. Search for "credit"
2. Filter by "Success" status
3. Sort by "Event Type"

**Expected Results**:
- Shows only successful credit events
- Sorted alphabetically
- Results count accurate

**Pass Criteria**: Filters combine correctly

---

### Test 16: Payload Preview
**Expected**: Table shows first 3 payload keys

**Steps**:
1. Look at "Payload Preview" column
2. Compare with full payload in modal

**Expected Results**:
- Shows first 3 keys (e.g., "creditId, projectId, quantity...")
- Truncates with "..." if more keys exist
- Shows "Empty payload" if no keys

**Pass Criteria**: Preview is accurate and helpful

---

### Test 17: HTTP Status Color Coding
**Expected**: Status codes have appropriate colors

**Steps**:
1. Observe HTTP status column
2. Check colors

**Expected Results**:
- 200, 201 → Green text
- 400, 500, 503 → Red text
- null → Gray "—"

**Pass Criteria**: Colors match HTTP status semantics

---

### Test 18: Error Message Display
**Expected**: Failed events show error details

**Steps**:
1. Find failed event (wh-002 or wh-008)
2. Click "View"
3. Scroll to error section

**Expected Results**:
- Error message in red box
- Full error text visible
- Clearly separated from other content

**Pass Criteria**: Errors are prominent and readable

---

### Test 19: Copy to Clipboard
**Expected**: JSON copies correctly

**Steps**:
1. Open any event modal
2. Click "Copy" on payload
3. Paste in text editor
4. Verify JSON is valid

**Expected Results**:
- Button shows "Copied!" for 2 seconds
- Pasted content is valid JSON
- Formatting is preserved

**Pass Criteria**: Copy works and JSON is valid

---

### Test 20: Performance
**Expected**: Page loads and responds quickly

**Steps**:
1. Open Chrome DevTools Performance tab
2. Record page load
3. Interact with filters
4. Check frame rate

**Expected Results**:
- Initial load < 2 seconds
- Filter updates < 100ms
- No frame drops during interactions
- Smooth animations

**Pass Criteria**: No performance issues

---

## 🐛 Known Issues to Check

### Issue 1: React Import Warnings
**Symptom**: TypeScript shows "Cannot find module 'react'"
**Fix**: Ensure `@types/react` is installed
**Command**: `pnpm add -D @types/react@19`

### Issue 2: Modal Not Closing
**Symptom**: Modal stays open after clicking backdrop
**Fix**: Check `onClick` handler on backdrop div
**Location**: `WebhookDetailsModal.tsx` line 42

### Issue 3: Real-time Updates Not Working
**Symptom**: Events don't update after 5 seconds
**Fix**: Check `enableRealtime` prop is `true`
**Location**: `app/admin/webhooks/page.tsx` line 20

### Issue 4: Retry Button Always Visible
**Symptom**: Retry shows on successful events
**Fix**: Check `canRetryEvent` function logic
**Location**: `lib/webhook/webhookFilters.ts` line 58

---

## 📊 Test Results Template

```
Date: ___________
Tester: ___________
Browser: ___________
Device: ___________

| Test # | Test Name | Pass/Fail | Notes |
|--------|-----------|-----------|-------|
| 1 | Initial Load | ☐ | |
| 2 | Search | ☐ | |
| 3 | Status Filter | ☐ | |
| 4 | Event Type Filter | ☐ | |
| 5 | Sorting | ☐ | |
| 6 | View Details | ☐ | |
| 7 | Retry | ☐ | |
| 8 | Real-time | ☐ | |
| 9 | Mobile | ☐ | |
| 10 | Tablet | ☐ | |
| 11 | Desktop | ☐ | |
| 12 | Keyboard | ☐ | |
| 13 | Screen Reader | ☐ | |
| 14 | Empty State | ☐ | |
| 15 | Combined Filters | ☐ | |
| 16 | Payload Preview | ☐ | |
| 17 | HTTP Colors | ☐ | |
| 18 | Error Display | ☐ | |
| 19 | Copy Clipboard | ☐ | |
| 20 | Performance | ☐ | |

Overall Result: ☐ Pass ☐ Fail

Issues Found:
1. ___________
2. ___________
3. ___________
```

---

## 🔧 Debugging Tips

### Console Logs
Check browser console for:
- "Retrying event: wh-XXX" (retry triggered)
- No red errors
- No yellow warnings

### Network Tab
Check API calls:
- POST to `/api/webhooks/retry` when retry clicked
- Response status 200
- Response body contains `success: true`

### React DevTools
Check component state:
- `filters` object updates on filter change
- `selectedEvent` is set when modal opens
- `retryingEventId` is set during retry

### Accessibility Inspector
Check ARIA attributes:
- `role="dialog"` on modal
- `aria-modal="true"` on modal
- `aria-label` on buttons
- `title` attributes on badges

---

## ✅ Sign-off

After completing all tests:

- [ ] All 20 tests pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Responsive on all devices
- [ ] Accessible via keyboard
- [ ] Performance is acceptable
- [ ] Ready for production

**Tested by**: ___________
**Date**: ___________
**Approved by**: ___________
**Date**: ___________
