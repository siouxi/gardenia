import { useState, useCallback } from 'react';
import { NodeProps, useReactFlow } from '@xyflow/react';
import { StickyNote } from 'lucide-react';

// Color map for post-it notes
const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    yellow: {
        bg: 'bg-gradient-to-br from-yellow-200 to-yellow-300',
        border: 'border-yellow-400',
        text: 'text-gray-800'
    },
    pink: {
        bg: 'bg-gradient-to-br from-pink-200 to-pink-300',
        border: 'border-pink-400',
        text: 'text-gray-800'
    },
    blue: {
        bg: 'bg-gradient-to-br from-blue-200 to-blue-300',
        border: 'border-blue-400',
        text: 'text-gray-800'
    },
    green: {
        bg: 'bg-gradient-to-br from-green-200 to-green-300',
        border: 'border-green-400',
        text: 'text-gray-800'
    }
};

export const PostItNode = ({ data, selected, id }: NodeProps) => {
    const { setNodes } = useReactFlow();
    const paramValues = (data.parameterValues || {}) as Record<string, any>;
    const initialNote = paramValues.note || 'Add your note here...';
    const color = paramValues.color || 'yellow';
    const colors = colorMap[color] || colorMap.yellow;

    const [noteText, setNoteText] = useState(initialNote);
    const [isEditing, setIsEditing] = useState(false);

    // Update parent data when editing finishes
    const handleBlur = useCallback(() => {
        setIsEditing(false);
        // Update the node data through ReactFlow's setNodes
        if (noteText !== initialNote) {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === id) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                parameterValues: {
                                    ...paramValues,
                                    note: noteText
                                }
                            }
                        };
                    }
                    return node;
                })
            );
        }
    }, [noteText, initialNote, id, setNodes, paramValues]);

    const handleFocus = useCallback(() => {
        setIsEditing(true);
    }, []);

    return (
        <div className={`
            relative w-56 h-56 ${colors.bg} rounded-sm shadow-2xl
            border-t-4 ${colors.border}
            transition-all transform
            ${selected ? 'ring-2 ring-offset-2 ring-amber-500 scale-105' : 'hover:scale-105'}
            ${isEditing ? 'cursor-text' : 'cursor-move'}
        `}
            style={{
                boxShadow: '4px 4px 12px rgba(0, 0, 0, 0.3)',
                transform: isEditing ? 'rotate(0deg)' : 'rotate(-1deg)',
            }}
        >
            {/* Post-it sticky tape effect */}
            <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-12 h-4 bg-yellow-100 opacity-40 rounded-sm" />

            {/* Content */}
            <div className="p-4 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-400/30">
                    <StickyNote size={16} className={colors.text + ' opacity-60'} />
                    <span className={`text-xs font-semibold ${colors.text} opacity-60 uppercase tracking-wide`}>
                        Note
                    </span>
                </div>

                <textarea
                    className={`
                        flex-1 resize-none bg-transparent text-sm ${colors.text} 
                        font-handwriting whitespace-pre-wrap break-words
                        leading-relaxed outline-none border-none
                        placeholder-gray-500 placeholder-opacity-50
                    `}
                    style={{ fontFamily: "'Indie Flower', cursive, sans-serif" }}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Click to edit note..."
                    spellCheck={false}
                />
            </div>

            {/* Shadow effect */}
            <div className="absolute inset-0 rounded-sm pointer-events-none"
                style={{
                    background: 'linear-gradient(135deg, transparent 60%, rgba(0,0,0,0.05) 100%)'
                }}
            />
        </div>
    );
};
