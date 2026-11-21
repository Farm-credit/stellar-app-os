import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSwipeGesture } from '../useSwipeGesture';
import type { TouchEvent } from 'react';

function makeTouch(overrides: Partial<Touch> = {}): Touch {
  return {
    clientX: 0,
    clientY: 0,
    screenX: 0,
    screenY: 0,
    pageX: 0,
    pageY: 0,
    identifier: 0,
    target: document.body,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 0,
    ...overrides,
  } as Touch;
}

function makeTouchEvent(
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: Touch[]
): TouchEvent {
  return {
    type,
    touches: type === 'touchend' ? ([] as unknown as TouchList) : touches,
    changedTouches: touches,
    targetTouches: type === 'touchend' ? ([] as unknown as TouchList) : touches,
    currentTarget: document.body,
    target: document.body,
    bubbles: true,
    cancelable: true,
    composed: false,
    timeStamp: Date.now(),
    isTrusted: true,
    cancelBubble: false,
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    preventDefault: vi.fn(),
    eventPhase: 0,
    defaultPrevented: false,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    detail: 0,
    view: null,
    which: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    button: 0,
    buttons: 0,
    EVENT_PHASE: 0,
  } as unknown as TouchEvent;
}

describe('useSwipeGesture', () => {
  const onSwipeRight = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSwipeRight on a rightward swipe exceeding the default threshold', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 200, clientY: 200 })])
      );
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('does not call onSwipeRight when swipe distance is below threshold', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 100, clientY: 200 })])
      );
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not call onSwipeRight on a leftward swipe', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 200, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not call onSwipeRight when vertical movement exceeds verticalThreshold', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 200, clientY: 400 })])
      );
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('uses custom threshold value', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight, threshold: 30 }));

    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 90, clientY: 200 })])
      );
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('uses custom verticalThreshold value', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight, verticalThreshold: 50 }));

    // Horizontal: 150px right, vertical: 40px (under 50 threshold)
    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 200, clientY: 240 })])
      );
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('does not call onSwipeRight when no touch start occurred', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 200, clientY: 200 })])
      );
    });

    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('provides onTouchMove handler (no-op but callable)', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    expect(typeof result.current.onTouchMove).toBe('function');

    // Should not throw when called
    act(() => {
      result.current.onTouchMove(
        makeTouchEvent('touchmove', [makeTouch({ clientX: 100, clientY: 200 })])
      );
    });
  });

  it('handles multiple swipe sequences correctly', () => {
    const { result } = renderHook(() => useSwipeGesture({ onSwipeRight }));

    // First swipe
    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 50, clientY: 200 })])
      );
    });
    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 200, clientY: 200 })])
      );
    });

    // Second swipe
    act(() => {
      result.current.onTouchStart(
        makeTouchEvent('touchstart', [makeTouch({ clientX: 10, clientY: 100 })])
      );
    });
    act(() => {
      result.current.onTouchEnd(
        makeTouchEvent('touchend', [makeTouch({ clientX: 150, clientY: 100 })])
      );
    });

    expect(onSwipeRight).toHaveBeenCalledTimes(2);
  });
});
