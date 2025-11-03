
import React from 'react';

export const InputField: React.FC<{
    label: string, 
    value: string, 
    onChange: (val: string) => void, 
    type?: string, 
    required?: boolean
}> = ({label, value, onChange, type="text", required=false}) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <input 
            type={type} 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            required={required} 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
        />
    </div>
);

export const TextAreaField: React.FC<{
    label: string, 
    value: string, 
    onChange: (val: string) => void,
    rows?: number
}> = ({label, value, onChange, rows = 2}) => (
     <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <textarea 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            rows={rows} 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" 
        />
    </div>
);

export const SelectField: React.FC<{
    label: string, 
    value: number | null,
    onChange: (id: number | null) => void,
    options: { id: number, name: string }[],
    placeholder?: string
}> = ({ label, value, onChange, options, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <select 
            value={value ?? ""} 
            onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
            <option value="">{placeholder || 'Select...'}</option>
            {options.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
        </select>
    </div>
);
