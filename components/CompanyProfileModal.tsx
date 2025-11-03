

import React, { useState } from 'react';
import { Database, SocialLink } from '../types';
import Modal from './Modal';
import { ICONS } from '../constants';
import { InputField, TextAreaField } from './FormControls';

type SimpleDb = Omit<Database, 'subscribers' | 'tags' | 'campaigns'>;

interface CompanyProfileModalProps {
  profileToEdit: SimpleDb | null;
  onClose: () => void;
  onSave: (data: Omit<SimpleDb, 'id'> & {id?: number}) => void;
}

const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({ profileToEdit, onClose, onSave }) => {
  const [data, setData] = useState<Omit<SimpleDb, 'id'> & {id?: number}>(
    profileToEdit || { name: '', description: '', social_links: [] }
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setData(prev => ({...prev, logo_base64: reader.result as string}));
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleSocialChange = (index: number, field: 'platform' | 'url', value: string) => {
    setData(prev => {
        const newLinks = [...(prev.social_links || [])];
        newLinks[index] = { ...newLinks[index], [field]: value };
        return { ...prev, social_links: newLinks };
    });
  };
  
  const addSocialLink = () => {
    if ((data.social_links?.length || 0) < 4) {
      setData(prev => ({...prev, social_links: [...(prev.social_links || []), {platform: 'Other', url: ''}]}));
    }
  }

  const removeSocialLink = (index: number) => {
    setData(prev => ({...prev, social_links: prev.social_links?.filter((_, i) => i !== index)}));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (data.name.trim()) {
      onSave(data);
    }
  };

  return (
    <Modal title={profileToEdit ? 'Edit Company Profile' : 'Create New Company'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <InputField label="Company Name" value={data.name} onChange={val => setData(p => ({...p, name: val}))} required />
        <TextAreaField label="Description" value={data.description || ''} onChange={val => setData(p => ({...p, description: val}))} />
        <div>
          <label className="block text-sm font-medium text-gray-700">Logo</label>
          <div className="mt-1 flex items-center space-x-4">
            {data.logo_base64 && <img src={data.logo_base64} alt="logo preview" className="w-16 h-16 rounded-md object-cover" />}
            <input type="file" accept="image/*" onChange={handleFileChange} className="text-sm" />
          </div>
        </div>

        <hr/>
        <h3 className="text-lg font-semibold text-gray-800 pt-2">Contact Information</h3>
        <InputField label="Website URL" type="url" value={data.website || ''} onChange={val => setData(p => ({...p, website: val}))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Phone Number" type="tel" value={data.phone || ''} onChange={val => setData(p => ({...p, phone: val}))} />
            <InputField label="Fax Number" type="tel" value={data.fax_number || ''} onChange={val => setData(p => ({...p, fax_number: val}))} />
        </div>
        
        <h4 className="font-semibold text-gray-700 pt-2">Address</h4>
        <InputField label="Street" value={data.street || ''} onChange={val => setData(p => ({...p, street: val}))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="City" value={data.city || ''} onChange={val => setData(p => ({...p, city: val}))} />
          <InputField label="State / Province" value={data.state || ''} onChange={val => setData(p => ({...p, state: val}))} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField label="Zip / Postal Code" value={data.zip_code || ''} onChange={val => setData(p => ({...p, zip_code: val}))} />
          <InputField label="County" value={data.county || ''} onChange={val => setData(p => ({...p, county: val}))} />
        </div>
        
        <hr/>
        <h3 className="text-lg font-semibold text-gray-800 pt-2">Key Contact</h3>
        <InputField label="Contact Name" value={data.key_contact_name || ''} onChange={val => setData(p => ({...p, key_contact_name: val}))} />
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Contact Phone" type="tel" value={data.key_contact_phone || ''} onChange={val => setData(p => ({...p, key_contact_phone: val}))} />
            <InputField label="Contact Email" type="email" value={data.key_contact_email || ''} onChange={val => setData(p => ({...p, key_contact_email: val}))} />
        </div>

        <hr/>
        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700">Social Media Links (Max 4)</label>
          <div className="space-y-2 mt-1">
            {data.social_links?.map((link, index) => (
              <div key={index} className="flex items-center space-x-2">
                <select value={link.platform} onChange={e => handleSocialChange(index, 'platform', e.target.value as SocialLink['platform'])} className="w-1/3 px-3 py-2 border border-gray-300 rounded-md text-sm">
                  {(['Facebook', 'Twitter', 'LinkedIn', 'Instagram', 'Other'] as SocialLink['platform'][]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input type="url" placeholder="https://..." value={link.url} onChange={e => handleSocialChange(index, 'url', e.target.value)} className="flex-grow px-3 py-2 border border-gray-300 rounded-md text-sm" />
                <button type="button" onClick={() => removeSocialLink(index)} className="text-red-500 hover:text-red-700 p-1">{ICONS.trash}</button>
              </div>
            ))}
             {(data.social_links?.length || 0) < 4 && <button type="button" onClick={addSocialLink} className="text-sm text-indigo-600 hover:underline">+ Add Link</button>}
          </div>
        </div>

        <div className="pt-4 flex justify-end space-x-3 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Save</button>
        </div>
      </form>
    </Modal>
  );
};

export default CompanyProfileModal;