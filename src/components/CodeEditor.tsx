import { NodeData } from '../App';
import { Code } from 'lucide-react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-r';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme

interface CodeEditorProps {
    node: { id: string; data: NodeData } | null;
    onUpdate: (nodeId: string, data: NodeData) => void;
}

export const CodeEditor = ({ node, onUpdate }: CodeEditorProps) => {
    if (!node) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#666] p-8 text-center bg-[#121212]">
                <Code size={48} className="mb-4 opacity-50" />
                <span className="text-sm font-medium">Select a node to edit its code</span>
                <span className="text-xs mt-2 text-[#444]">Double-click a node in the workflow view</span>
            </div>
        );
    }

    const currentLanguage = node.data.language || 'python';

    const handleLanguageToggle = (lang: 'python' | 'r') => {
        onUpdate(node.id, { ...node.data, language: lang });
    };

    const highlightCode = (code: string) => {
        if (currentLanguage === 'python') {
            return highlight(code, languages.python, 'python');
        } else {
            return highlight(code, languages.r, 'r');
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#000]">
            <div className="h-9 flex shrink-0 items-center px-4 justify-between border-b border-[#121212] bg-[#1f1f23]">
                <div className="flex items-center gap-2">
                    <Code size={14} className="text-[#34d399]" />
                    <span className="text-xs font-bold text-[#e1e1e1] uppercase tracking-wide">
                        {node.data.label}
                    </span>
                    <span className="text-[10px] text-[#555] font-mono ml-2">
                        {node.id}
                    </span>
                </div>

                {/* Language Toggle Switch */}
                <div className="flex items-center gap-1 bg-[#121212] rounded-[2px] p-0.5 border border-[#333]">
                    <button
                        onClick={() => handleLanguageToggle('python')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-[2px] transition-all ${currentLanguage === 'python'
                            ? 'bg-[#34d399] text-[#000]'
                            : 'text-[#666] hover:text-[#999]'
                            }`}
                    >
                        PYTHON
                    </button>
                    <button
                        onClick={() => handleLanguageToggle('r')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-[2px] transition-all ${currentLanguage === 'r'
                            ? 'bg-[#34d399] text-[#000]'
                            : 'text-[#666] hover:text-[#999]'
                            }`}
                    >
                        R
                    </button>
                </div>
            </div>
            <div className="flex-1 relative bg-[#121212] overflow-auto">
                <Editor
                    value={node.data.code || ''}
                    onValueChange={(code) => onUpdate(node.id, { ...node.data, code })}
                    highlight={highlightCode}
                    padding={24}
                    style={{
                        fontFamily: '"Fira Code", "Fira Mono", monospace',
                        fontSize: 14,
                        backgroundColor: '#121212',
                        color: '#d4d4d4',
                        minHeight: '100%',
                    }}
                    textareaClassName="focus:outline-none"
                    placeholder={`# Start typing your ${currentLanguage === 'python' ? 'Python' : 'R'} code here...`}
                />
            </div>
        </div>
    );
};
