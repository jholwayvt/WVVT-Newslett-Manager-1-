
import React, { useState, useMemo } from 'react';

interface MultiSelectCheckboxesProps {
    label: string;
    options: { id: number; name: string }[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
}

const MultiSelectCheckboxes: React.FC<MultiSelectCheckboxesProps> = ({ label, options, selectedIds, onChange }) => {
    const [searchTerm, setSearchTerm] = useState('');
    
    const filteredOptions = useMemo(() => 
        options.filter(opt => opt.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [options, searchTerm]
    );

    const handleToggle = (id: number) => {
        onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
                {filteredOptions.map(opt => (
                    <label key={opt.id} className="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(opt.id)}
                            onChange={() => handleToggle(opt.id)}
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-800">{opt.name}</span>
                    </label>
                ))}
            </div>
        </div>
    );
};

export default MultiSelectCheckboxes;
