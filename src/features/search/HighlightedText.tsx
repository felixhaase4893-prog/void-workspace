import { highlightSegments } from '../../domain/search';

/** Marks the matching parts of `text`. Renders React nodes only, never HTML strings. */
export function HighlightedText({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-[3px] bg-accent-500/25 text-accent-50">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
