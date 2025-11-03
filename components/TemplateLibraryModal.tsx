import React from 'react';
import { TEMPLATES } from '../templates';
import Modal from './Modal';

interface TemplateLibraryModalProps {
  onClose: () => void;
  onSelect: (html: string) => void;
}

const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({ onClose, onSelect }) => {
  return (
    <Modal title="Choose a Template" onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto p-1">
        {TEMPLATES.map(template => (
          <div key={template.id} className="border rounded-lg overflow-hidden shadow-sm flex flex-col">
            <div 
              className="p-4 border-b h-48 overflow-hidden relative bg-white" 
              aria-label={`Preview of ${template.name} template`}
            >
              <iframe
                srcDoc={template.html}
                className="w-full h-full border-0 transform scale-50 origin-top-left"
                style={{ pointerEvents: 'none', width: '200%', height: '200%' }}
                title={`${template.name} Preview`}
              />
            </div>
            <div className="p-4 bg-gray-50 flex-grow flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{template.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
              </div>
              <button
                onClick={() => onSelect(template.html)}
                className="mt-4 w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700"
              >
                Select Template
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default TemplateLibraryModal;
