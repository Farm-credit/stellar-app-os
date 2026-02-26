# Screen Recording Script for Issue #56

## Recording Setup

- Screen resolution: 1920x1080 or 1280x720
- Browser: Chrome or Edge (latest version)
- Duration: 2-3 minutes
- Show mouse cursor
- Include browser address bar

## Recording Script

### 1. Introduction (5 seconds)

- Show the purchase page at `http://localhost:3000/credits/purchase`
- Highlight the "Compare Projects" button in the top right

### 2. Navigate to Comparison Tool (5 seconds)

- Click "Compare Projects" button
- Show the comparison page loading

### 3. Project Selection (30 seconds)

- Show the project selection cards grid
- Point out the selection counter "0 / 3 selected"
- Select the first project (Amazon Rainforest Reforestation)
  - Show checkbox becoming checked
  - Show counter updating to "1 / 3 selected"
- Select the second project (Wind Energy Farm - Texas)
  - Show counter updating to "2 / 3 selected"
- Select the third project (Mangrove Restoration - Indonesia)
  - Show counter updating to "3 / 3 selected"
- Try to select a fourth project
  - Show that it's disabled (checkbox doesn't respond)
- Deselect one project
  - Show counter updating back to "2 / 3 selected"
- Reselect to have 3 projects selected

### 4. Comparison Table (45 seconds)

- Scroll down to show the comparison table
- Highlight the table headers showing project names
- Scroll through the comparison attributes:
  - Price per Ton (show formatted currency)
  - Type (show badges)
  - Location
  - Co-Benefits (show multiple badges)
  - Verification Status
  - Vintage Year
  - Available Supply
- Show the "Add to Cart" buttons at the bottom

### 5. Add to Cart (15 seconds)

- Click "Add to Cart" for one of the projects
- Show navigation to purchase page with project pre-selected
- Use browser back button to return to comparison

### 6. PDF Export (20 seconds)

- Click "Export as PDF" button
- Show the download starting
- Open the downloaded PDF file
- Scroll through the PDF content showing all project details

### 7. Clear Selection (10 seconds)

- Click "Clear Selection" button
- Show all checkboxes becoming unchecked
- Show comparison table disappearing
- Show the empty state message

### 8. Responsive Design (30 seconds)

- Open DevTools (F12)
- Toggle device toolbar
- Show mobile view (375px width)
  - Show single column layout
  - Show horizontal scroll on comparison table
- Show tablet view (768px width)
  - Show 2-column grid
- Show desktop view (1920px width)
  - Show 3-column grid
- Close DevTools

### 9. Accessibility Demo (20 seconds)

- Close any open menus
- Press Tab key repeatedly to show focus indicators
- Navigate through:
  - Compare Projects button
  - Project checkboxes
  - Clear Selection button
  - Export PDF button
  - Add to Cart buttons
- Show focus indicators are clearly visible

### 10. Conclusion (5 seconds)

- Show the full comparison page one more time
- End recording

## Recording Tips

1. **Smooth movements**: Move mouse slowly and deliberately
2. **Pause briefly**: After each action, pause 1-2 seconds
3. **Show feedback**: Ensure visual feedback is visible (hover states, clicks)
4. **No errors**: Test the flow before recording to avoid mistakes
5. **Clear audio** (optional): If adding narration, speak clearly and concisely

## Post-Recording

1. Review the recording for clarity
2. Trim any unnecessary parts at the beginning/end
3. Ensure file size is reasonable (< 50MB)
4. Upload to GitHub PR or hosting service
5. Add link to PR description

## Alternative: GIF Recording

If video is too large, create a GIF:

- Use tools like ScreenToGif or LICEcap
- Focus on key interactions only
- Keep under 10MB
- Supplement with screenshots if needed
