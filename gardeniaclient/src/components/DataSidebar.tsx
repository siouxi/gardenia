import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Tag } from 'lucide-react';

export const DataSidebar = () => {
    const [isEnrichmentOpen, setIsEnrichmentOpen] = useState(true);
    const [isAnotationOpen, setIsAnotationOpen] = useState(true);

    return (
        <div className="flex-1 overflow-y-auto bg-[#1a1a1e] flex flex-col">
            {/* ENRICHMENT Section */}
            <div className="border-b border-[#2a2a2a]">
                <button
                    onClick={() => setIsEnrichmentOpen(!isEnrichmentOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#222226] hover:bg-[#2a2a2e] transition-colors group text-xs text-[#ccc] font-medium"
                >
                    <div className="flex items-center gap-2">
                        <Layers size={14} className="text-[#a8a8b3] group-hover:text-emerald-400 transition-colors" />
                        ENRICHMENT
                    </div>
                    {isEnrichmentOpen ? <ChevronDown size={14} className="text-[#666]" /> : <ChevronRight size={14} className="text-[#666]" />}
                </button>

                {isEnrichmentOpen && (
                    <div className="p-3 text-xs text-[#888] flex flex-col gap-2 bg-[#1a1a1e]">
                        {/* Placeholder for future ENRICHMENT tools/items */}
                        <div className="p-2 border border-[#333] border-dashed rounded text-center opacity-50">
                            Available enrichments will appear here
                        </div>
                    </div>
                )}
            </div>

            {/* ANNOTATION Section */}
            <div className="border-b border-[#2a2a2a]">
                <button
                    onClick={() => setIsAnotationOpen(!isAnotationOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#222226] hover:bg-[#2a2a2e] transition-colors group text-xs text-[#ccc] font-medium"
                >
                    <div className="flex items-center gap-2">
                        <Tag size={14} className="text-[#a8a8b3] group-hover:text-amber-400 transition-colors" />
                        ANNOTATION
                    </div>
                    {isAnotationOpen ? <ChevronDown size={14} className="text-[#666]" /> : <ChevronRight size={14} className="text-[#666]" />}
                </button>

                {isAnotationOpen && (
                    <div className="p-3 text-xs text-[#888] flex flex-col gap-2 bg-[#1a1a1e]">
                        {/* Placeholder for future ANOTACION tools/items */}
                        <div className="p-2 border border-[#333] border-dashed rounded text-center opacity-50">
                            Available annotations will appear here
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
