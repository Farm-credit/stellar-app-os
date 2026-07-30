import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = () => {};
