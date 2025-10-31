
import React, { useState } from 'react';
import { Tag, Campaign } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';

interface TagsProps {
  tags: Tag[];
  setTags: React.Dispatch<React.SetStateAction<Tag[]>>;
  campaigns: Campaign[];
}

const Tags: React.FC<TagsProps> = ({ tags, setTags, campaigns }) => {
  const [newTagName, setNewTagName] = useState('');
  const [historyTag, setHistoryTag] = useState<Tag | null>(null);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTagName.trim()) {
      const newTag: Tag = {
        id: Date.now(),
        name: newTagName.trim(),
      };
      setTags(prev => [...prev, newTag]);
      setNewTagName('');
    }
  };

  const handleDeleteTag = (id: number) => {
    if (window.confirm('Are you sure you want to delete this tag? This will remove it from all subscribers.')) {
        // In a real app, you might want to handle this differently.
        // For now, we'll just remove the tag itself.
        // We could also update all subscribers to remove the tag.
      setTags(prev => prev.filter(tag => tag.id !== id));
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Manage Tags</h1>

      <form onSubmit={handleAddTag} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="New tag name"
          className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700"
        >
          {ICONS.plus} <span className="ml-2">Add Tag</span>
        </button>
      </form>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {tags.map(tag => (
            <li key={tag.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
              <span className="text-sm font-medium text-gray-900">{tag.name}</span>
              <div className="flex space-x-3">
                 <button
                    onClick={() => setHistoryTag(tag)}
                    className="text-gray-500 hover:text-gray-800"
                    title="View Campaign History"
                 >
                    {ICONS.history}
                 </button>
                <button
                  onClick={() => handleDeleteTag(tag.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Delete Tag"
                >
                  {ICONS.trash}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {historyTag && (
        <TagHistoryModal tag={historyTag} campaigns={campaigns} onClose={() => setHistoryTag(null)} />
      )}
    </div>
  );
};


const TagHistoryModal: React.FC<{
    tag: Tag;
    campaigns: Campaign[];
    onClose: () => void;
}> = ({ tag, campaigns, onClose }) => {
    // This is an approximation. It finds campaigns where this tag was used in targeting.
    const relevantCampaigns = campaigns.filter(c => c.status === 'Sent' && c.target?.tags.includes(tag.id));

    return (
        <Modal title={`Campaign History for "${tag.name}" Tag`} onClose={onClose}>
             {relevantCampaigns.length > 0 ? (
                <ul className="space-y-3">
                    {relevantCampaigns.map(c => (
                        <li key={c.id} className="p-3 bg-gray-50 rounded-md">
                            <p className="font-semibold text-gray-800">{c.subject}</p>
                            <p className="text-sm text-gray-500">Sent on {c.sent_at ? new Date(c.sent_at).toLocaleString() : 'N/A'}</p>
                            <p className="text-xs text-gray-400">Target Logic: {c.target?.logic}</p>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-600">No campaigns have been specifically targeted to this tag yet.</p>
            )}
        </Modal>
    )
}

export default Tags;
