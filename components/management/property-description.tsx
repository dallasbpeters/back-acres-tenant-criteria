export function PropertyDescription({ text }: { text: string }) {
  return (
    <div className="property-description">
      {text
        .split(/\r?\n\s*\r?\n/)
        .filter((paragraph) => paragraph.trim())
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </div>
  );
}
