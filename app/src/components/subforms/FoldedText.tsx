import type * as ReactApi from 'react';

/** Uses the host widget's React instance so the preserved build shares one hook dispatcher. */
export function createFoldedText(React: typeof ReactApi) {
  return function FoldedText({ text }: { text: string }) {
    const [expanded, setExpanded] = React.useState(false);
    const [overflow, setOverflow] = React.useState(false);
    const preview = React.useRef<HTMLDivElement>(null);
    const id = React.useId();

    React.useLayoutEffect(() => {
      const element = preview.current;
      if (!element) return;
      const measure = () => {
        const style = getComputedStyle(element);
        const lineHeight =
          Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
        setOverflow(element.scrollHeight > lineHeight * 3 + 1);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }, [text]);

    return (
      <>
        <div
          id={id}
          ref={preview}
          className="subform-text-preview"
          data-expanded={expanded || undefined}
        >
          {text}
        </div>
        {overflow && (
          <button
            type="button"
            className="button text small"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </>
    );
  };
}
