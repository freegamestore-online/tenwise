/** A ring that drains as the question's time runs out. `fraction` is 1 at the start and 0 at the end. */
export function TimerRing({ fraction, seconds }: { fraction: number; seconds: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const low = seconds <= 5;

  return (
    <div role="timer" aria-label={`${seconds} seconds left`} className="relative h-12 w-12">
      <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={low ? "var(--error)" : "var(--accent)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-semibold">{seconds}</span>
    </div>
  );
}
