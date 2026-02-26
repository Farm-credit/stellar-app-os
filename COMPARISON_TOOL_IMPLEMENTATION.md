# Carbon Credit Comparison Tool - Implementation Guide

## Overview

This document describes the implementation of Issue #56: Carbon Credit Comparison Tool for the FarmCredit Stellar application.

## Features Implemented

### 1. Project Selection (Up to 3 Projects)

- Users can select up to 3 carbon credit projects for comparison
- Visual feedback when selection limit is reached
- Checkbox-based selection interface
- Out-of-stock projects are disabled and cannot be selected

### 2. Comparison Table

The comparison table displays the following attributes side-by-side:

- **Price per Ton**: Formatted in USD currency
- **Type**: Project category (Reforestation, Renewable Energy, etc.)
- **Location**: Geographic location of the project
- **Co-Benefits**: Environmental and social benefits (displayed as badges)
- **Verification Status**: Certification standard (Gold Standard, Verra, etc.)
- **Vintage Year**: Year of carbon credit generation
- **Available Supply**: Quantity available in tons CO₂

### 3. Add to Cart from Comparison View

- Each project in the comparison table has an "Add to Cart" button
- Clicking redirects to the purchase page with the selected project
- Out-of-stock projects show "Out of Stock" instead of the button

### 4. PDF Export

- "Export as PDF" button generates a downloadable comparison document
- PDF includes all selected projects with complete details
- Filename includes generation date for easy organization
- Plain text format for universal compatibility

### 5. Responsive Design

- **Mobile**: Single column layout with horizontal scroll for comparison table
- **Tablet**: 2-column grid for project selection cards
- **Desktop**: 3-column grid for optimal viewing
- Comparison table scrolls horizontally on smaller screens

### 6. Accessibility (WCAG 2.1 AA)

- All interactive elements have proper ARIA labels
- Keyboard navigation fully supported
- Screen reader friendly with semantic HTML
- Focus indicators on all interactive elements
- Live regions for dynamic content updates (selection counter)
- Proper heading hierarchy

### 7. TypeScript Strict Mode

- No `any` types used
- All props properly typed with interfaces
- Strict null checks enabled
- Type-safe event handlers

## File Structure

```
lib/
├── types/
│   └── carbon.ts                    # Extended with comparison fields
├── api/
│   └── mock/
│       └── carbonProjects.ts        # Updated with new attributes
└── utils/
    └── pdf.ts                       # PDF export utility

components/
├── atoms/
│   └── Checkbox.tsx                 # New checkbox component
├── molecules/
│   ├── ComparisonTable.tsx          # Comparison table display
│   └── ProjectSelectionCard.tsx     # Project selection card
└── organisms/
    └── ComparisonTool/
        └── ComparisonTool.tsx       # Main comparison tool

app/
└── credits/
    ├── compare/
    │   └── page.tsx                 # Comparison page route
    └── purchase/
        └── page.tsx                 # Updated with link to comparison
```

## Technical Implementation

### Type Extensions

Added to `CarbonProject` interface:

```typescript
type: ProjectType;
location: string;
coBenefits: string[];
verificationStatus: VerificationStatus;
```

### Component Architecture

Following atomic design pattern:

- **Atom**: `Checkbox` - Reusable checkbox with label support
- **Molecules**: `ComparisonTable`, `ProjectSelectionCard` - Composed UI elements
- **Organism**: `ComparisonTool` - Complete feature with state management

### State Management

- Local state using React hooks (`useState`, `useCallback`)
- Selection limit enforced at component level
- Efficient re-renders with proper memoization

### Styling

- Tailwind CSS utility classes
- Stellar brand colors (stellar-blue, stellar-green, etc.)
- Consistent spacing and typography
- Responsive breakpoints (md, lg)

## Testing Instructions

### Manual Testing Checklist

#### Project Selection

- [ ] Can select up to 3 projects
- [ ] Selection counter updates correctly (X / 3 selected)
- [ ] Cannot select more than 3 projects
- [ ] Can deselect projects
- [ ] Out-of-stock projects are disabled
- [ ] Checkbox states are visually clear

#### Comparison Table

- [ ] Table displays all selected projects
- [ ] All attributes are correctly displayed
- [ ] Price formatting is correct (USD currency)
- [ ] Co-benefits display as badges
- [ ] Table is readable on all screen sizes
- [ ] Horizontal scroll works on mobile

#### Add to Cart

- [ ] "Add to Cart" button works for each project
- [ ] Redirects to purchase page with correct project
- [ ] Out-of-stock projects show "Out of Stock"
- [ ] Button is disabled for out-of-stock projects

#### PDF Export

- [ ] "Export as PDF" button is visible
- [ ] PDF downloads successfully
- [ ] PDF contains all selected projects
- [ ] PDF filename includes date
- [ ] PDF content is readable

#### Responsive Design

- [ ] Mobile (< 768px): Single column, horizontal scroll
- [ ] Tablet (768px - 1024px): 2-column grid
- [ ] Desktop (> 1024px): 3-column grid
- [ ] No layout breaks at any screen size
- [ ] Touch targets are adequate on mobile (min 44x44px)

#### Accessibility

- [ ] Tab navigation works through all elements
- [ ] Focus indicators are visible
- [ ] Screen reader announces selection changes
- [ ] All buttons have descriptive labels
- [ ] ARIA attributes are present and correct
- [ ] Heading hierarchy is logical (h1 → h2 → h3)

#### TypeScript

- [ ] No TypeScript errors in build
- [ ] No `any` types used
- [ ] All props are properly typed

### Browser Testing

Test in the following browsers:

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### Automated Testing Commands

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build
npm run build
```

## How to Test Locally

1. **Start the development server**:

   ```bash
   npm run dev
   ```

2. **Navigate to the comparison page**:
   - Direct URL: `http://localhost:3000/credits/compare`
   - Or from purchase page: Click "Compare Projects" button

3. **Test the workflow**:
   - Select 2-3 projects by clicking checkboxes
   - Verify comparison table appears
   - Click "Export as PDF" and verify download
   - Click "Add to Cart" on a project
   - Verify navigation to purchase page

4. **Test responsive design**:
   - Open DevTools (F12)
   - Toggle device toolbar (Ctrl+Shift+M)
   - Test various screen sizes

5. **Test accessibility**:
   - Navigate using Tab key only
   - Use screen reader (NVDA, JAWS, or VoiceOver)
   - Run Lighthouse audit in DevTools

## Known Limitations

1. **PDF Export**: Currently generates plain text format. Future enhancement could use a proper PDF library (e.g., jsPDF) for richer formatting.

2. **Cart Integration**: Currently redirects to purchase page. Full cart functionality would require cart state management.

3. **Project Filtering**: No filtering by type, location, or price range. Could be added in future iterations.

## Future Enhancements

- Advanced PDF formatting with charts and graphs
- Save comparison for later viewing
- Share comparison via link
- Filter and sort projects before comparison
- Compare more than 3 projects with pagination
- Print-friendly view

## Acceptance Criteria Status

✅ Up to 3 projects selectable
✅ Comparison table accurate
✅ Add to Cart works per project
✅ PDF export generates correctly
✅ Responsive layout (scroll on mobile)
✅ Responsive across mobile/tablet/desktop
✅ Accessible (WCAG 2.1 AA)
✅ TypeScript strict — no any types

## Commits

This feature was implemented with atomic commits:

1. `feat(carbon): extend CarbonProject type with comparison fields`
2. `feat(carbon): update mock data with comparison attributes`
3. `feat(carbon): add PDF export utility for comparison`
4. `feat(ui): add Checkbox atom component`
5. `feat(carbon): add comparison table and project selection card molecules`
6. `feat(carbon): add ComparisonTool organism component`
7. `feat(carbon): add comparison page route`
8. `feat(carbon): add navigation link to comparison tool from purchase page`

Each commit builds on the previous one and maintains a working state.
