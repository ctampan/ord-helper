import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import type { Unit, UnitDetails } from "../logic/combination";
import { getRarityColor } from "../logic/rarityColors";
import { CachedImage } from "./CachedImage";
import { CountFeedback } from "./CountFeedback";
import styles from "./UnitListItem.module.css";

interface UnitListItemProps {
  unit: Unit;
  count: number;
  details: UnitDetails;
  isBanned: boolean;
  onAction: (
    unitId: string,
    isRightClick: boolean,
    isCtrlPressed: boolean,
    isAltPressed: boolean,
  ) => void;
  onCountChange: (unitId: string, newCount: number) => void;
  showRecipeButtons: boolean;
  shortcut?: string;
  onHoverChange: (unitId: string | null, anchor?: HTMLElement) => void;
  onShowRecipe: (unitId: string) => void;
}

export const UnitListItem: React.FC<UnitListItemProps> = React.memo(
  ({
    unit,
    count,
    details,
    isBanned,
    onAction,
    onCountChange,
    showRecipeButtons,
    shortcut,
    onHoverChange,
    onShowRecipe,
  }) => {
    const [imageError, setImageError] = useState(false);
    const { status, buildableCount, progress, materialProgress, wispProgress, wispCost, isWispAssisted } = details;

    const handleImageError = () => {
      setImageError(true);
    };

    const [prevImage, setPrevImage] = useState(unit.image);
    if (unit.image !== prevImage) {
      setPrevImage(unit.image);
      setImageError(false);
    }

    const handleLeftClick = (e: React.MouseEvent) => {
      e.preventDefault();
      inputCountRef.current = null;
      onAction(unit.id, false, e.ctrlKey, e.altKey);
    };

    const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      inputCountRef.current = null;
      onAction(unit.id, true, e.ctrlKey, false);
    };

    const [feedbacks, setFeedbacks] = useState<{
      text: string;
      type: "add" | "remove";
      id: number;
    }[]>([]);
    const prevCountRef = useRef(count);
    const inputCountRef = useRef<number | null>(null);
    const inputFeedbackStartRef = useRef<number | null>(null);
    const feedbackSequence = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (count !== prevCountRef.current) {
        const isInputChange = inputCountRef.current === count;
        inputCountRef.current = null;
        if (isInputChange) {
          inputFeedbackStartRef.current ??= prevCountRef.current;
        } else {
          inputFeedbackStartRef.current = null;
        }
        const diff = count - (inputFeedbackStartRef.current ?? prevCountRef.current);
        const type: "add" | "remove" = diff > 0 ? "add" : "remove";
        const text = diff > 0 ? `+${diff}` : `${diff}`;

        // Debounce only typed changes, using the net difference for the burst.
        // Clicks and other updates keep their existing immediate feedback.
        const timeoutId = setTimeout(() => {
          inputFeedbackStartRef.current = null;
          if (diff !== 0) {
            const feedback = { text, type, id: ++feedbackSequence.current };
            setFeedbacks((current) => [...current, feedback]);
          }
        }, isInputChange ? 300 : 0);

        prevCountRef.current = count;
        return () => clearTimeout(timeoutId);
      }
    }, [count]);

    return (
      <div
        data-unit-id={unit.id}
        className={`${styles.container} ${styles[status]} ${
          isBanned ? styles.banned : ""
        }`}
        onClick={handleLeftClick}
        onContextMenu={handleRightClick}
        onMouseEnter={(event) => onHoverChange(unit.id, event.currentTarget)}
        onMouseLeave={(event) => {
          if (event.relatedTarget instanceof Element &&
            event.relatedTarget.closest("[data-tooltip-unit-id]")?.getAttribute("data-tooltip-unit-id") === unit.id) return;
          onHoverChange(null);
        }}
      >
        {/* Background Progress Bar */}
        {progress > 0 && !isBanned && (
          <div
            className={`${styles.progressBackground} ${
              progress < 100 ? styles.gray : ""
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        )}

        <div className={styles.contentWrapper}>
          <div className={styles.iconWrapper}>
            {!imageError ? (
              <CachedImage
                src={unit.image}
                alt={unit.name}
                className={styles.icon}
                onError={handleImageError}
                style={{
                  border: `2px solid ${getRarityColor(unit.rarity)}`,
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <div className={styles.fallbackIcon}>
                {unit.name.substring(0, 2)}
              </div>
            )}
            {isBanned && <div className={styles.banOverlay}>BAN</div>}
            {shortcut && (
              <div className={styles.shortcutOverlay}>{shortcut}</div>
            )}
          </div>

          <div className={styles.info}>
            <span className={styles.name}>{unit.name}</span>
            {buildableCount > 0 && !isBanned && (
              <span className={styles.buildableBadge}>+{buildableCount}</span>
            )}
          </div>

          {progress > 0 &&
            !isBanned &&
            unit.rarity !== "Common" &&
            (isWispAssisted || progress < 100) && (
              <div className={styles.progressContainer}>
                {isWispAssisted ? (
                  <div className={styles.splitProgress}>
                    <span className={styles.textGreen}>
                      {Math.round(materialProgress)}%
                    </span>
                    <span className={styles.separator}>+</span>
                    <span className={styles.textOrange}>
                      {Math.round(wispProgress)}%
                    </span>
                  </div>
                ) : (
                  <span className={styles.textGreen}>
                    {Math.round(progress)}%
                  </span>
                )}
              </div>
            )}

          {status === "orange" && wispCost > 0 && (
            <span className={styles.wispCost}>{wispCost} 👻</span>
          )}

          <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={count}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                const newCount = Math.max(0, isNaN(val) ? 0 : val);
                inputCountRef.current = newCount !== count ? newCount : null;
                onCountChange(unit.id, newCount);
              }}
              onFocus={(e) => e.target.select()}
              className={styles.input}
            />
            {showRecipeButtons && (
              <button
                className={styles.recipeBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowRecipe(unit.id);
                }}
                title="Show Recipe"
              >
                📖
              </button>
            )}
          </div>
        </div>
        {feedbacks.map((feedback) => <CountFeedback key={feedback.id} anchor={inputRef} unitId={unit.id}
          text={feedback.text} type={feedback.type} onComplete={() => setFeedbacks((current) =>
            current.filter((item) => item.id !== feedback.id))} />)}
      </div>
    );
  },
);
