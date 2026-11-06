import React from "react";

function inline(text) {
  return text.split(/(\*\*[^*\n]+\*\*|\[S\d+\])/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (/^\[S\d+\]$/.test(part)) {
      return (
        <span className="study-citation" key={index}>
          {part}
        </span>
      );
    }
    return part;
  });
}

// Render a deliberately small subset of text formatting. Model output is never HTML.
export default function StudyContent({ content }) {
  return (
    <div className="study-content">
      {String(content || "")
        .split("\n")
        .map((line, index) => {
          if (!line.trim()) return null;
          if (/^#{1,4}\s/.test(line))
            return (
              <h3 key={index}>{inline(line.replace(/^#{1,4}\s+/, ""))}</h3>
            );
          if (/^[-*•]\s/.test(line))
            return (
              <p className="study-list" key={index}>
                <span aria-hidden="true">•</span>
                <span>{inline(line.replace(/^[-*•]\s+/, ""))}</span>
              </p>
            );
          return <p key={index}>{inline(line)}</p>;
        })}
    </div>
  );
}
