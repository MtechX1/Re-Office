import type { FigureSpec } from "@/lib/office/figures";

export function BotFigure({ spec }: { spec: FigureSpec }) {
  const ink = "#14120f";
  return (
    <svg
      className="bot-figure"
      viewBox="0 0 80 96"
      role="img"
      aria-label={`${spec.name}, seated at a desk`}
      data-figure={spec.occupantId}
      data-shape={spec.shape}
      data-posture={spec.posture}
    >
      <rect x="18" y="48" width="44" height="26" rx="6" fill="#2a241c" />
      <rect x="26" y="38" width="28" height="28" rx="8" fill={spec.body} stroke={ink} strokeWidth="2.5" />
      {spec.shape === "human" ? (
        <circle cx="40" cy="26" r="14" fill={spec.head} stroke={ink} strokeWidth="2.5" />
      ) : (
        <polygon
          points="40,10 52,17 52,31 40,38 28,31 28,17"
          fill={spec.head}
          stroke={ink}
          strokeWidth="2.5"
        />
      )}
      {spec.shape === "bot" ? (
        <>
          <line x1="40" y1="10" x2="40" y2="4" stroke={ink} strokeWidth="2.5" />
          <circle cx="40" cy="3.5" r="2.5" fill="#f4efe6" stroke={ink} strokeWidth="1.5" />
        </>
      ) : null}
      <Mark mark={spec.mark} />
      <rect x="8" y="72" width="64" height="16" rx="4" fill="#4a3724" stroke={ink} strokeWidth="2.5" />
      <rect x="10" y="66" width="60" height="8" rx="2" fill="#c4a574" stroke={ink} strokeWidth="2" />
      <rect x="18" y="63" width="12" height="6" rx="2" fill={spec.body} stroke={ink} strokeWidth="1.5" />
      <rect x="50" y="63" width="12" height="6" rx="2" fill={spec.body} stroke={ink} strokeWidth="1.5" />
    </svg>
  );
}

function Mark({ mark }: { mark: FigureSpec["mark"] }) {
  const ink = "#f7f1e6";
  switch (mark) {
    case "bar":
      return <rect x="32" y="46" width="16" height="4" rx="1" fill={ink} />;
    case "watch":
      return (
        <>
          <circle cx="35" cy="47" r="3" fill={ink} />
          <circle cx="45" cy="47" r="3" fill={ink} />
        </>
      );
    case "house":
      return <polygon points="40,43 48,49 32,49" fill={ink} />;
    case "flag":
      return <polygon points="33,44 48,48 33,52" fill={ink} />;
    case "page":
      return <rect x="34" y="44" width="12" height="10" rx="1" fill={ink} />;
    case "lens":
      return <circle cx="40" cy="48" r="5" fill="none" stroke={ink} strokeWidth="2" />;
    case "play":
      return <polygon points="35,44 47,48 35,53" fill={ink} />;
    default:
      return null;
  }
}

export function EmptyChair() {
  return (
    <svg className="bot-figure" viewBox="0 0 80 96" role="img" aria-label="Empty desk" data-figure="none" data-posture="empty">
      <rect x="22" y="36" width="36" height="30" rx="6" fill="none" stroke="#14120f" strokeWidth="2.5" strokeDasharray="4 3" />
      <rect x="8" y="72" width="64" height="16" rx="4" fill="#d9cbb8" stroke="#14120f" strokeWidth="2.5" />
      <rect x="10" y="66" width="60" height="8" rx="2" fill="#efe6d6" stroke="#14120f" strokeWidth="2" />
    </svg>
  );
}
