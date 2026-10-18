const pattern1 = /\r?\n\s*\r?\n/;
export function PropertyDescription({
  text,
  grid = false,
}: {
  text: string;
  grid?: boolean;
}) {
  const occurrences = new Map<string, number>();
  const paragraphs = text
    .split(pattern1)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => {
      const occurrence = occurrences.get(paragraph) ?? 0;
      occurrences.set(paragraph, occurrence + 1);
      return { key: JSON.stringify([paragraph, occurrence]), paragraph };
    });
  return (
    <div
      className={[
        "property-description",
        grid ? "property-description--grid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {paragraphs.map(({ key, paragraph }) => (
        <p key={key}>{paragraph}</p>
      ))}
    </div>
  );
}
