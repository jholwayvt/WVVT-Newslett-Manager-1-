
import React, { useState } from 'react';
import { Tag, Campaign } from '../types';
import { ICONS } from '../constants';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import * as dbService from '../services/dbService';

interface TagsProps {
  db: dbService.DB;
  activeDatabaseId: number;
  refreshData: () => Promise<void>;
  tags: Tag[];
  campaigns: Campaign[];
}

const Tags: React.FC<TagsProps> = ({ db, activeDatabaseId, refreshData, tags, campaigns }) => {
  const [newTagName, setNewTagName] = useState('');
  const [historyTag, setHistoryTag] = useState<Tag | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deletingTag, setDeletingTag] = useState<Tag | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setIsSubmitting(true);
    await dbService.addTag(db, activeDatabaseId, newTagName.trim());
    await refreshData();
    setNewTagName('');
    setIsSubmitting(false);
  };
  
  const handleEditTag = async (tag: Tag) => {
      setIsSubmitting(true);
      await dbService.updateTag(db, tag);
      await refreshData();
      setEditingTag(null);
      setIsSubmitting(false);
  };

  const handleDeleteClick = (tag: Tag) => {
    setDeletingTag(tag);
  };
  
  const handleConfirmDelete = async () => {
      if (!deletingTag) return;
      setIsDeleting(true);
      await dbService.deleteTag(db, deletingTag.id);
      await refreshData();
      setIsDeleting(false);
      setDeletingTag(null);
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
          disabled={isSubmitting || !newTagName.trim()}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {ICONS.plus} <span className="ml-2">{isSubmitting ? 'Adding...' : 'Add Tag'}</span>
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
                    onClick={() => setEditingTag(tag)}
                    className="text-indigo-600 hover:text-indigo-800"
                    title="Edit Tag"
                 >
                    {ICONS.edit}
                 </button>
                <button
                  onClick={() => handleDeleteClick(tag)}
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
      {editingTag && (
        <EditTagModal 
            tag={editingTag} 
            onClose={() => setEditingTag(null)} 
            onSave={handleEditTag}
            isSaving={isSubmitting}
        />
      )}
      {deletingTag && (
        <ConfirmationModal
            isOpen={!!deletingTag}
            title="Delete Tag"
            message={`Are you sure you want to delete the tag "${deletingTag.name}"? This will remove it from all subscribers. This action cannot be undone.`}
            onConfirm={handleConfirmDelete}
            onCancel={() => setDeletingTag(null)}
            confirmText="Delete"
            isConfirming={isDeleting}
        />
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
};

const EditTagModal: React.FC<{
    tag: Tag;
    onClose: () => void;
    onSave: (tag: Tag) => void;
    isSaving: boolean;
}> = ({ tag, onClose, onSave, isSaving }) => {
    const [name, setName] = useState(tag.name);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSave({ ...tag, name: name.trim() });
        }
    };

    return (
        <Modal title="Edit Tag" onClose={onClose}>
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Tag Name</label>
                    <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                  <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                  <button type="submit" disabled={isSaving || !name.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">{isSaving ? 'Saving...' : 'Save'}</button>
                </div>
            </form>
        </Modal>
    );
};


export default Tags;