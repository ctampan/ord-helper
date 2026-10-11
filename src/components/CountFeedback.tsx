import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./UnitListItem.module.css";

interface Props {
  anchor: RefObject<HTMLInputElement | null>;
  unitId: string;
  text: string;
  type: "add" | "remove";
  onComplete: () => void;
}

/** A body-level layer keeps feedback outside row/dashboard overflow clipping. */
export function CountFeedback({ anchor, unitId, text, type, onComplete }: Props) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });
  useLayoutEffect(() => {
    const input = anchor.current;
    const feedback = feedbackRef.current;
    if (!input || !feedback) return;
    let frame = 0;
    const update = () => {
      const rect = input.getBoundingClientRect();
      const halfWidth = feedback.offsetWidth / 2;
      const left = Math.max(halfWidth + 4, Math.min(rect.left + rect.width / 2,
        window.innerWidth - halfWidth - 4));
      const top = Math.max(42, rect.top + rect.height / 2);
      setPosition((previous) => previous.top === top && previous.left === left && previous.ready
        ? previous : { top, left, ready: true });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(input);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [anchor]);
  return createPortal(
    <div ref={feedbackRef} className={styles.feedbackContainer} data-count-feedback={unitId}
      aria-hidden="true" style={{ top: position.top, left: position.left,
        visibility: position.ready ? "visible" : "hidden" }}>
      <span className={`${styles.feedbackText} ${type === "add" ? styles.feedbackAdd : styles.feedbackRemove}`}
        onAnimationEnd={onComplete}>{text}</span>
    </div>, document.body,
  );
}
