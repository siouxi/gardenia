import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import {
    InputIcon,
    QCIcon,
    PreprocessingIcon,
    StatisticalAnalysisIcon,
    VisualizationIcon,
    UtilitiesIcon
} from './BioinformaticsIcons';
import { ToolRegistry } from '../registry/tools';

// Icon mapping
const CategoryIcons: Record<string, React.FC<{ size?: number; className?: string }>> = {
    'Input': InputIcon,
    'QC': QCIcon,
    'Preprocessing': PreprocessingIcon,
    'Statistical Analysis': StatisticalAnalysisIcon,
    'Visualization': VisualizationIcon,
    'Utilities': UtilitiesIcon
};

export const Sidebar = () => {
    // Flatten tools with their category data for easy rendering
    const allTools = ToolRegistry.getAll();
    const categories = ToolRegistry.getCategories();

    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(categories)
    );
    const [searchTerm, setSearchTerm] = useState('');

    const toggleCategory = (categoryName: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryName)) {
                newSet.delete(categoryName);
            } else {
                newSet.add(categoryName);
            }
            return newSet;
        });
    };

    // Filter logic
    const displayedData = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase();

        return categories.map(catName => {
            const toolsInCat = allTools.filter(t =>
                t.category === catName &&
                t.name.toLowerCase().includes(lowerSearch)
            );

            return {
                name: catName,
                tools: toolsInCat,
                Icon: CategoryIcons[catName] || InputIcon
            };
        }).filter(group => group.tools.length > 0);

    }, [searchTerm, allTools, categories]);

    return (
        <div className="flex-1 overflow-y-auto bg-[#1f1f23] flex flex-col">
            {/* Search Bar */}
            <div className="p-3 border-b border-[#121212]">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666]" size={14} />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-8 pr-2 py-1.5 text-xs text-[#ccc] placeholder-[#666] focus:border-[#34d399] focus:outline-none transition-colors"
                    />
                </div>
            </div>

            {/* Categories */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                    {displayedData.map(category => (
                        <div key={category.name}>
                            {/* Category Header */}
                            <div
                                className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold text-[#666] uppercase hover:text-[#bbb] cursor-pointer transition-colors group"
                                onClick={() => toggleCategory(category.name)}
                            >
                                <span className={`transform transition-transform ${expandedCategories.has(category.name) ? 'rotate-90' : ''}`}>
                                    ▶
                                </span>
                                <category.Icon size={16} className="text-[#666] group-hover:text-[#34d399] transition-colors" />
                                {category.name}
                            </div>

                            {/* Category Nodes */}
                            {expandedCategories.has(category.name) && (
                                <div className="space-y-0.5">
                                    {category.tools.map(tool => (
                                        <div
                                            key={tool.id}
                                            draggable
                                            onDragStart={(event) => {
                                                event.dataTransfer.setData('application/reactflow', tool.id);
                                                event.dataTransfer.effectAllowed = 'move';
                                            }}
                                            className="group flex items-center gap-3 px-3 py-2 rounded-[2px] hover:bg-[#2a2a2a] cursor-grab active:cursor-grabbing transition-colors border border-transparent hover:border-[#333]"
                                            title={tool.description}
                                        >
                                            <div className="w-8 h-8 rounded bg-[#18181b] border border-[#2a2a2a] flex items-center justify-center text-[#666] group-hover:text-[#34d399] group-hover:border-[#34d399]/50 transition-all font-mono text-[10px]">
                                                {tool.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[12px] font-medium text-[#ccc] group-hover:text-white leading-none">
                                                    {tool.name}
                                                </span>
                                                <span className="text-[10px] text-[#666] leading-none mt-1">
                                                    {category.name}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

