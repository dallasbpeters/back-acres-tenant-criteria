"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

interface Spot {
  excerpt: string;
  index: number;
}

/**
 * Walks the signer through each initials blank in the lease, one at a time.
 * Reports the adopted initials and the blanks done.
 */
export function InitialsStep({
  defaultValue,
  disabled,
  onChange,
  spots,
}: {
  defaultValue: string;
  disabled: boolean;
  onChange: (value: { done: number[]; initials: string }) => void;
  spots: Spot[];
}) {
  const [initials, setInitials] = useState(defaultValue);
  const [done, setDone] = useState<number[]>([]);
  const [current, setCurrent] = useState(0);
  const update = useCallback(
    (nextDone: number[], nextInitials = initials) => {
      setDone(nextDone);
      onChange({ done: nextDone, initials: nextInitials });
    },
    [initials, onChange]
  );
  const changeInitials = useCallback(
    (e: { target: { value: string } }) => {
      const value = e.target.value.toUpperCase().slice(0, 8);
      setInitials(value);
      // New initials mean every blank is initialed again.
      setDone([]);
      setCurrent(0);
      onChange({ done: [], initials: value });
    },
    [onChange]
  );
  const spot = spots[current];
  const initialHere = useCallback(() => {
    if (!spot) {
      return;
    }
    update([...new Set([...done, spot.index])]);
    setCurrent((value) => Math.min(value + 1, spots.length));
  }, [done, spot, spots.length, update]);
  const back = useCallback(
    () => setCurrent((value) => Math.max(0, value - 1)),
    []
  );
  const restart = useCallback(() => {
    update([]);
    setCurrent(0);
  }, [update]);
  const complete = done.length === spots.length;
  return (
    <section aria-labelledby="initials-heading" className="initials-step">
      <div className="initials-step-head">
        <h3 id="initials-heading">Initial the marked spots</h3>
        <span className="initials-progress" role="status">
          {done.length} of {spots.length} initialed
        </span>
      </div>
      <p className="small-note">
        The lease asks for your initials in {spots.length}{" "}
        {spots.length === 1 ? "place" : "places"}. Read each one, then initial
        it. Your initials are placed on those spots in the PDF.
      </p>
      <label className="field initials-input">
        Your initials
        <input
          autoComplete="off"
          disabled={disabled}
          maxLength={8}
          onChange={changeInitials}
          required
          value={initials}
        />
      </label>
      {complete ? (
        <div className="initials-complete">
          <p>
            All {spots.length} {spots.length === 1 ? "spot is" : "spots are"}{" "}
            initialed <strong>{initials}</strong>.
          </p>
          <Button disabled={disabled} onPress={restart} variant="quiet">
            Review again
          </Button>
        </div>
      ) : (
        spot && (
          <div className="initials-card">
            <p className="eyebrow">
              Initial {current + 1} of {spots.length}
            </p>
            <blockquote>{spot.excerpt}</blockquote>
            <div className="management-actions">
              <Button
                disabled={disabled || !initials.trim()}
                onPress={initialHere}
                variant="primary"
              >
                Initial here{initials.trim() ? ` · ${initials.trim()}` : ""}
              </Button>
              {current > 0 && (
                <Button disabled={disabled} onPress={back} variant="quiet">
                  Back
                </Button>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}
