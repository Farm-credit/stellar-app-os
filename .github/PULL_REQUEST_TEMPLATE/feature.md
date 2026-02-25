## Summary

<!-- 1-3 sentences: What feature was added and why? -->

## Related Issue

Closes #

## What Was Implemented

<!-- List each component, hook, or utility added. Be specific about file paths. -->

- **Component:** `components/<level>/<ComponentName>.tsx`
- **Tests:** (if applicable)
- **Documentation:** (if applicable)

## Implementation Details

<!-- 
Explain key decisions:
- Which atomic design level did this land at (atom/molecule/organism/template)?
- Why did you structure it this way?
- Any trade-offs or alternative approaches considered?
-->

**Atomic design level:** atom / molecule / organism / template (delete as appropriate)  
**Stellar color tokens used:**  
**Dependencies added (if any):**

## Screenshots / Recordings

<!-- REQUIRED: Screen recording showing the feature working end-to-end -->

| Before | After |
|--------|--------|
| N/A (new feature) | _attach recording_ |

## How to Test

1. Checkout this branch  
2. Run `pnpm dev`  
3. Navigate to:  
4. Verify:  

## Checklist

- [ ] My code follows the atomic commit convention  
- [ ] Each commit message follows Conventional Commits (`feat:`, `fix:`, etc.)  
- [ ] I have performed a self-review of my code  
- [ ] My changes build successfully (`pnpm build`)  
- [ ] My changes pass linting (`pnpm lint`)  
- [ ] I have added/updated relevant documentation  
- [ ] New components follow the atomic design pattern (atoms → molecules → organisms)  
- [ ] Components use `forwardRef` where needed and export a `displayName`  
- [ ] No barrel exports — imports reference the file directly  
- [ ] Stellar color tokens used instead of raw hex values  
- [ ] UI is responsive and tested on mobile viewports  
- [ ] Screen recording attached 