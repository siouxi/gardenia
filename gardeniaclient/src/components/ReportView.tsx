/**
 * Report View
 * ============
 *
 * LaTeX report editor and preview.
 * Base template included — agents can modify the LaTeX content in the future.
 */

import { useState, useMemo } from 'react';
import { FileText, Eye, Code, Copy, Check } from 'lucide-react';

const DEFAULT_LATEX = [
    '\\documentclass{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\pagestyle{empty}',
    '',
    '\\begin{document}',
    '',
    '\\begin{center}',
    '',
    '\\Large \\textbf{Thank you for using this app.}',
    '',
    '\\vspace{1cm}',
    '',
    'Hello.',
    '',
    '\\vspace{0.5cm}',
    '',
    "If you're reading this...",
    '',
    'it means the program ran successfully.',
    '',
    '\\textit{(probably.)}',
    '',
    '\\vspace{1cm}',
    '',
    'Maybe you opened this app to solve a problem.',
    '',
    'Maybe to run an experiment.',
    '',
    'Maybe you were just curious.',
    '',
    '\\vspace{0.5cm}',
    '',
    'Or maybe...',
    '',
    'you clicked the wrong button.',
    '',
    '\\vspace{1cm}',
    '',
    "That's okay.",
    '',
    "You're here now.",
    '',
    '\\vspace{1cm}',
    '',
    'Every command you run,',
    '',
    'every button you press,',
    '',
    'every tiny piece of data you explore...',
    '',
    '\\vspace{0.5cm}',
    '',
    'gives this program a reason to exist.',
    '',
    '\\vspace{1cm}',
    '',
    'Because without users,',
    '',
    'an application is just',
    '',
    'lines of code',
    '',
    'sitting quietly',
    '',
    'in the dark.',
    '',
    '\\vspace{1cm}',
    '',
    'So...',
    '',
    '\\vspace{0.3cm}',
    '',
    'thank you.',
    '',
    '\\vspace{1cm}',
    '',
    'Truly.',
    '',
    '\\vspace{1cm}',
    '',
    'We hope this app helped you discover something.',
    '',
    'Or build something.',
    '',
    'Or at least',
    '',
    "didn't crash immediately.",
    '',
    '\\vspace{1cm}',
    '',
    'And if something \\textit{did} break...',
    '',
    '\\vspace{0.5cm}',
    '',
    '\\textit{that was definitely part of the experiment.}',
    '',
    '\\vspace{1cm}',
    '',
    '(Probably.)',
    '',
    '\\vspace{1.5cm}',
    '',
    'Thanks for being here.',
    '',
    '\\vspace{0.5cm}',
    '',
    '\\textit{See you next run.}',
    '',
    '\\end{center}',
    '',
    '\\end{document}',
].join('\n');

export function ReportView() {
    const [latex, setLatex] = useState(DEFAULT_LATEX);
    const [mode, setMode] = useState<'edit' | 'preview'>('preview');
    const [copied, setCopied] = useState(false);

    const lineCount = useMemo(() => latex.split('\n').length, [latex]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(latex);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0e0e12]">
            {/* Toolbar */}
            <div className="h-10 bg-[#1a1a20] border-b border-[#222] flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2">
                    <FileText size={14} className="text-amber-500" />
                    <span className="text-xs font-semibold text-[#ccc]">LaTeX Report</span>
                    <span className="text-[10px] text-[#555] ml-2">{lineCount} lines</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setMode('edit')}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors flex items-center gap-1.5 ${mode === 'edit'
                            ? 'bg-[#333] text-white'
                            : 'text-[#888] hover:text-[#ccc] hover:bg-[#252528]'
                            }`}
                    >
                        <Code size={11} />
                        Source
                    </button>
                    <button
                        onClick={() => setMode('preview')}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors flex items-center gap-1.5 ${mode === 'preview'
                            ? 'bg-[#333] text-white'
                            : 'text-[#888] hover:text-[#ccc] hover:bg-[#252528]'
                            }`}
                    >
                        <Eye size={11} />
                        Preview
                    </button>
                    <div className="w-px h-4 bg-[#333] mx-1" />
                    <button
                        onClick={handleCopy}
                        className="px-2.5 py-1 text-[10px] font-medium text-[#888] hover:text-[#ccc] hover:bg-[#252528] rounded transition-colors flex items-center gap-1.5"
                    >
                        {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>

            {/* Content */}
            {mode === 'edit' ? (
                <div className="flex-1 overflow-auto">
                    <textarea
                        value={latex}
                        onChange={(e) => setLatex(e.target.value)}
                        spellCheck={false}
                        className="w-full h-full bg-[#0e0e12] text-[#d4d4d8] text-[13px] leading-[1.6] p-6 outline-none resize-none"
                        style={{
                            fontFamily: '"Fira Code", "Fira Mono", "JetBrains Mono", monospace',
                            tabSize: 2,
                            minHeight: '100%',
                        }}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-auto p-6">
                    <div
                        className="max-w-3xl mx-auto bg-white rounded-lg shadow-2xl p-12 text-black"
                        style={{ fontFamily: '"Georgia", "Times New Roman", serif' }}
                    >
                        <LatexPreview latex={latex} />
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * LaTeX preview — extracts the document body and renders each line
 * as a block element, handling basic formatting commands naturally.
 */
function LatexPreview({ latex }: { latex: string }) {
    const elements = useMemo(() => {
        let body = latex;

        // Extract only the document body
        const beginDoc = body.indexOf('\\begin{document}');
        const endDoc = body.indexOf('\\end{document}');
        if (beginDoc !== -1) body = body.slice(beginDoc + '\\begin{document}'.length);
        if (endDoc !== -1) body = body.slice(0, body.indexOf('\\end{document}'));

        // Split into lines and process each one
        const lines = body.split('\n');
        const result: JSX.Element[] = [];
        let centered = false;
        let key = 0;

        for (const rawLine of lines) {
            const line = rawLine.trim();

            // Skip empty lines — they become spacing
            if (!line) {
                result.push(<div key={key++} style={{ height: '0.3em' }} />);
                continue;
            }

            // Skip comments
            if (line.startsWith('%')) continue;

            // Environment toggles
            if (line === '\\begin{center}') { centered = true; continue; }
            if (line === '\\end{center}') { centered = false; continue; }
            if (line.startsWith('\\begin{') || line.startsWith('\\end{')) continue;

            // Vertical spacing
            const vspaceMatch = line.match(/^\\vspace\{([^}]+)\}/);
            if (vspaceMatch) {
                const val = parseFloat(vspaceMatch[1]);
                result.push(<div key={key++} style={{ height: `${val}em` }} />);
                continue;
            }

            // Skip preamble-only commands
            if (/^\\(documentclass|usepackage|pagestyle|geometry|definecolor|fancyhf|renewcommand|fancyhead|fancyfoot)\b/.test(line)) continue;

            // \maketitle — skip
            if (line === '\\maketitle') continue;

            // Process inline formatting on the text
            let text = line;

            // \title{...} → render as title
            const titleMatch = text.match(/^\\title\{(.+)\}$/);
            if (titleMatch) {
                result.push(
                    <h1 key={key++} style={{ fontSize: '1.8em', fontWeight: 700, margin: '0.8em 0 0.4em', textAlign: centered ? 'center' : undefined }}>
                        {renderInline(titleMatch[1])}
                    </h1>
                );
                continue;
            }

            // \author{...}
            const authorMatch = text.match(/^\\author\{(.+)\}$/);
            if (authorMatch) {
                result.push(
                    <p key={key++} style={{ fontSize: '0.95em', color: '#666', margin: '0.2em 0', textAlign: centered ? 'center' : undefined }}>
                        {renderInline(authorMatch[1])}
                    </p>
                );
                continue;
            }

            // \date{...}  
            if (/^\\date\{/.test(text)) continue;

            // \section{...}
            const sectionMatch = text.match(/^\\section\*?\{(.+)\}$/);
            if (sectionMatch) {
                result.push(
                    <h2 key={key++} style={{ fontSize: '1.4em', fontWeight: 700, margin: '1.5em 0 0.5em', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.3em' }}>
                        {renderInline(sectionMatch[1])}
                    </h2>
                );
                continue;
            }

            // \subsection{...}
            const subMatch = text.match(/^\\subsection\*?\{(.+)\}$/);
            if (subMatch) {
                result.push(
                    <h3 key={key++} style={{ fontSize: '1.15em', fontWeight: 600, margin: '1.2em 0 0.4em' }}>
                        {renderInline(subMatch[1])}
                    </h3>
                );
                continue;
            }

            // Regular text line — apply inline formatting
            const style: React.CSSProperties = {
                margin: '0.15em 0',
                lineHeight: 1.7,
                textAlign: centered ? 'center' : undefined,
            };

            // Check for size commands
            if (/\\Large\b/.test(text)) {
                style.fontSize = '1.25em';
                text = text.replace(/\\Large\s*/g, '');
            }
            if (/\\large\b/.test(text)) {
                style.fontSize = '1.1em';
                text = text.replace(/\\large\s*/g, '');
            }
            if (/\\LARGE\b/.test(text)) {
                style.fontSize = '1.5em';
                text = text.replace(/\\LARGE\s*/g, '');
            }

            // Remove unknown commands but keep their content
            text = text.replace(/\\[a-zA-Z]+\s*/g, (match) => {
                // Keep known inline commands (they'll be processed by renderInline)
                if (/\\(textbf|textit|texttt|textcolor|emph|url|href)\b/.test(match)) return match;
                return '';
            });

            if (!text.trim()) continue;

            result.push(
                <p key={key++} style={style}>
                    {renderInline(text)}
                </p>
            );
        }

        return result;
    }, [latex]);

    return <div>{elements}</div>;
}

/** Process inline LaTeX formatting commands into React elements */
function renderInline(text: string): React.ReactNode {
    // Process from inside out: find the innermost commands first
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let safetyCounter = 0;

    while (remaining.length > 0 && safetyCounter++ < 200) {
        // Find the next command
        const cmdMatch = remaining.match(/\\(textbf|textit|texttt|emph|url|textcolor)\{/);

        if (!cmdMatch || cmdMatch.index === undefined) {
            // No more commands — push remaining text (clean braces)
            parts.push(remaining.replace(/[{}]/g, ''));
            break;
        }

        // Push text before the command
        if (cmdMatch.index > 0) {
            parts.push(remaining.slice(0, cmdMatch.index).replace(/[{}]/g, ''));
        }

        // Find matching closing brace
        const cmd = cmdMatch[1];
        const startIdx = cmdMatch.index + cmdMatch[0].length;
        let depth = 1;
        let endIdx = startIdx;

        for (let i = startIdx; i < remaining.length && depth > 0; i++) {
            if (remaining[i] === '{') depth++;
            if (remaining[i] === '}') depth--;
            if (depth === 0) endIdx = i;
        }

        const content = remaining.slice(startIdx, endIdx);

        // For textcolor, skip the color arg
        if (cmd === 'textcolor') {
            // \textcolor{color}{text} — we already consumed \textcolor{
            // content is "color}{text" — split on }{
            const splitIdx = content.indexOf('}{');
            if (splitIdx !== -1) {
                const innerText = content.slice(splitIdx + 2);
                parts.push(<span key={safetyCounter} style={{ color: '#34d399' }}>{renderInline(innerText)}</span>);
            } else {
                parts.push(<span key={safetyCounter} style={{ color: '#34d399' }}>{renderInline(content)}</span>);
            }
        } else if (cmd === 'textbf') {
            parts.push(<strong key={safetyCounter}>{renderInline(content)}</strong>);
        } else if (cmd === 'textit' || cmd === 'emph') {
            parts.push(<em key={safetyCounter}>{renderInline(content)}</em>);
        } else if (cmd === 'texttt') {
            parts.push(
                <code key={safetyCounter} style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, fontSize: '0.9em' }}>
                    {renderInline(content)}
                </code>
            );
        } else if (cmd === 'url') {
            parts.push(
                <a key={safetyCounter} href={content} style={{ color: '#059669', textDecoration: 'underline' }}>
                    {content}
                </a>
            );
        }

        remaining = remaining.slice(endIdx + 1);
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
}
