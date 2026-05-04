"use client";

import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const renderInline = (text: string) => {
  const segments = text.split(/(\*\*.*?\*\*|\*[^*\n]+\*|`[^`\n]+`)/g);
  return segments.map((segment, i) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return <strong key={i}>{segment.slice(2, -2)}</strong>;
    }
    if (segment.startsWith("*") && segment.endsWith("*") && segment.length > 2) {
      return <em key={i}>{segment.slice(1, -1)}</em>;
    }
    if (segment.startsWith("`") && segment.endsWith("`") && segment.length > 2) {
      return <code key={i} className="px-1 py-0.5 rounded bg-muted text-foreground/90 text-[0.85em]">{segment.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{segment}</Fragment>;
  });
};

export const MarkdownContent = ({ content }: { content: string }) => {
  const parts = content.split(/(\[START_TABLE\][\s\S]*?\[END_TABLE\])/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("[START_TABLE]") && part.endsWith("[END_TABLE]")) {
          const tableContent = part.replace("[START_TABLE]", "").replace("[END_TABLE]", "").trim();
          if (!tableContent) return null;
          const rows = tableContent.split("\n").map((row) => row.split("|").map((cell) => cell.trim()));
          const headers = ["Date", "Amount", "Description", "Category"];
          return (
            <div key={index} className="my-2 w-full max-w-full overflow-x-auto rounded-md border bg-background/50">
              <Table className="text-xs min-w-[500px] sm:min-w-0">
                <TableHeader><TableRow>{headers.map((header, i) => <TableHead key={i} className="font-semibold whitespace-nowrap">{header}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{rows.map((row, i) => (<TableRow key={i}>{row.map((cell, j) => <TableCell key={j} className="whitespace-nowrap">{cell}</TableCell>)}</TableRow>))}</TableBody>
              </Table>
            </div>
          );
        }
        if (!part.trim()) return null;

        const blocks: JSX.Element[] = [];
        const lines = part.split("\n");
        let i = 0;
        let key = 0;

        while (i < lines.length) {
          const line = lines[i];
          const trimmed = line.trim();

          if (!trimmed) { i++; continue; }

          // Headings
          const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2];
            const sizeClass = level <= 2 ? "text-lg font-semibold mt-3" : level === 3 ? "text-base font-semibold mt-2" : "text-sm font-semibold mt-2";
            blocks.push(
              level <= 2
                ? <h2 key={key++} className={sizeClass}>{renderInline(text)}</h2>
                : level === 3
                  ? <h3 key={key++} className={sizeClass}>{renderInline(text)}</h3>
                  : <h4 key={key++} className={sizeClass}>{renderInline(text)}</h4>
            );
            i++;
            continue;
          }

          // Unordered list
          if (/^([-*•])\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length && /^([-*•])\s+/.test(lines[i].trim())) {
              items.push(lines[i].trim().replace(/^([-*•])\s+/, ""));
              i++;
            }
            blocks.push(
              <ul key={key++} className="list-disc pl-5 space-y-1 my-1">
                {items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}
              </ul>
            );
            continue;
          }

          // Ordered list
          if (/^\d+\.\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
              items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
              i++;
            }
            blocks.push(
              <ol key={key++} className="list-decimal pl-5 space-y-1 my-1">
                {items.map((it, idx) => <li key={idx}>{renderInline(it)}</li>)}
              </ol>
            );
            continue;
          }

          // Paragraph (collapse adjacent non-empty, non-special lines)
          const paraLines: string[] = [trimmed];
          i++;
          while (i < lines.length) {
            const next = lines[i].trim();
            if (!next) break;
            if (/^(#{1,6})\s+/.test(next)) break;
            if (/^([-*•])\s+/.test(next)) break;
            if (/^\d+\.\s+/.test(next)) break;
            paraLines.push(next);
            i++;
          }
          blocks.push(<p key={key++} className="leading-relaxed">{renderInline(paraLines.join(" "))}</p>);
        }

        return <div key={index} className="space-y-1">{blocks}</div>;
      })}
    </>
  );
};
