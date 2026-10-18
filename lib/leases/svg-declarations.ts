const doctype = /<!DOCTYPE\b/gi;

// Read the complete declaration without resolving its external or internal entities.
// Quotes and comments can contain brackets and >, so a single closing-tag regex
// can leave part of an internal subset in the SVG passed to the renderer.
function declarationEnd(source: string, start: number) {
  let quote = "";
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end < 0) {
        return source.length;
      }
      index = end + 2;
      continue;
    }
    switch (character) {
      case '"':
      case "'":
        quote = character;
        break;
      case "[":
        depth += 1;
        break;
      case "]":
        depth -= 1;
        break;
      case ">":
        if (depth <= 0) {
          return index + 1;
        }
        break;
      default:
        break;
    }
  }
  return source.length;
}

export function stripSvgDeclarations(source: string) {
  const fragments: string[] = [];
  let end = 0;
  for (const match of source.matchAll(doctype)) {
    if (match.index < end) {
      continue;
    }
    fragments.push(source.slice(end, match.index));
    end = declarationEnd(source, match.index);
  }
  fragments.push(source.slice(end));
  return fragments.join("");
}
