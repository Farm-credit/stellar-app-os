import { useCallback, useRef, useState } from 'react';

const TILT_MAX = 12;

interface TiltState {
  rotateX: number;
  rotateY: number;
  glareX: number;
  glareY: number;
  active: boolean;
}

export function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TiltState>({
    rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, active: false,
  });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = (e.clientX - left) / width;
    const y = (e.clientY - top) / height;
    setState({
      rotateX: (0.5 - y) * TILT_MAX * 2,
      rotateY: (x - 0.5) * TILT_MAX * 2,
      glareX: x * 100,
      glareY: y * 100,
      active: true,
    });
  }, []);

  const onMouseLeave = useCallback(() => {
    setState({ rotateX: 0, rotateY: 0, glareX: 50, glareY: 50, active: false });
  }, []);

  return { ref, state, onMouseMove, onMouseLeave };
}
