export function PropertyDescription({
  text,
  grid = false,
}: {
  text: string;
  grid?: boolean;
}) {
  return (
    <div
      className={`property-description${grid ? " property-description--grid" : ""}`}
    >
      {text
        .split(/\r?\n\s*\r?\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </div>
  );
}
