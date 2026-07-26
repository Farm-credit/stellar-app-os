import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — polyfill as a no-op so components
// that call it don't crash in tests. Not a component-logic fix, just an
// environment gap.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
