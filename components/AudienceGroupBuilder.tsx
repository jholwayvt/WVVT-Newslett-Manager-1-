import React, { useState, useEffect, useRef } from 'react';
import { TagGroup, Tag, TagLogic } from '../types';
import { ICONS } from '../constants';

interface AudienceGroupBuilderProps {
  group: TagGroup;
  groupIndex: number;
  allTags: Tag[];
  onUpdate: (newGroupData: Partial<Omit<TagGroup, 'id'>>) => void;
  onRemove: () => void;
  canBeRemoved: boolean;
}

const AudienceGroupBuilder: React.FC<AudienceGroupBuilderProps> = ({
  group,
  groupIndex,
  allTags,
  onUpdate,
  onRemove,
  canBeRemoved,
}) => {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsSelectorOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTagSelect = (tagId: number) => {
    if (!group.tags.includes(tagId)) {
      onUpdate({ tags: [...group.tags, tagId] });
    }
  };

  const handleTagRemove = (tagId: number) => {
    onUpdate({ tags: group.tags.filter((id) => id !== tagId) });
  };

  const selectedTags = group.tags.map(id => allTags.find(t => t.id === id)).filter((t): t is Tag => !!t);
  const unselectedTags = allTags.filter(t => !group.tags.includes(t.id));
  const filteredTags = searchTerm
    ? unselectedTags.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : unselectedTags;

  return (
    <div className="border p-4 rounded-lg bg-gray-50/75 space-y-3 shadow-sm">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-gray-700">Group {groupIndex + 1}</h4>
        {canBeRemoved && (
          <button onClick={onRemove} className="text-red-500 hover:text-red-700 p-1" title="Remove Group">
            {ICONS.trash}
          </button>
        )}
      </div>

      <div className="flex items-center flex-wrap gap-2 text-sm">
        <span className="text-gray-600">Subscriber matches</span>
        <select
          value={group.logic}
          onChange={(e) => onUpdate({ logic: e.target.value as TagLogic })}
          className="font-semibold px-2 py-1 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
        >
          <option value="ANY">ANY</option>
          <option value="ALL">ALL</option>
          <option value="NONE">NONE</option>
          <option value="AT_LEAST">At Least</option>
        </select>
        {group.logic === 'AT_LEAST' && (
            <input 
                type="number"
                min="1"
                value={group.atLeast || 1}
                onChange={(e) => onUpdate({ atLeast: parseInt(e.target.value, 10) || 1 })}
                className="w-16 px-2 py-1 text-sm border-gray-300 rounded-md"
            />
        )}
        <span className="text-gray-600">of the following tags:</span>
      </div>

      <div className="flex flex-wrap gap-2 min-h-[34px]">
        {selectedTags.map(tag => (
          <span key={tag.id} className="flex items-center px-2.5 py-1 text-sm font-medium text-indigo-800 bg-indigo-100 rounded-full">
            {tag.name}
            <button
              onClick={() => handleTagRemove(tag.id)}
              className="ml-1.5 text-indigo-500 hover:text-indigo-800 focus:outline-none"
            >
              &times;
            </button>
          </span>
        ))}
        <div className="relative" ref={selectorRef}>
          <button
            onClick={() => setIsSelectorOpen(prev => !prev)}
            className="px-3 py-1 text-sm text-gray-600 bg-gray-200 rounded-full hover:bg-gray-300"
          >
            + Add Tag
          </button>
          {isSelectorOpen && (
            <div className="absolute z-20 w-56 mt-2 bg-white border border-gray-300 rounded-md shadow-lg">
              <div className="p-2">
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <ul className="max-h-48 overflow-y-auto">
                {filteredTags.length > 0 ? (
                  filteredTags.map(tag => (
                    <li
                      key={tag.id}
                      onClick={() => handleTagSelect(tag.id)}
                      className="px-4 py-2 text-sm text-gray-700 cursor-pointer hover:bg-indigo-50"
                    >
                      {tag.name}
                    </li>
                  ))
                ) : (
                  <li className="px-4 py-2 text-sm text-gray-500">No tags found.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudienceGroupBuilder;