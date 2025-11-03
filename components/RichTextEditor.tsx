import React, { useEffect, useRef } from 'react';

// Make Quill available in the global scope from the CDN script for TypeScript
declare global {
    interface Window { Quill: any; }
}

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const quillInstanceRef = useRef<any>(null); // Holds the Quill instance

    // Initialize Quill editor
    useEffect(() => {
        if (editorRef.current && !quillInstanceRef.current) {
            const quill = new window.Quill(editorRef.current, {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, 4, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['link', 'image'],
                        ['clean']
                    ],
                },
                placeholder: 'Start writing your newsletter here...',
            });

            // Set initial content
            if (value) {
                quill.clipboard.dangerouslyPasteHTML(value);
            }

            // Add listener for user-driven text changes
            quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
                if (source === 'user') {
                    onChange(quill.root.innerHTML);
                }
            });
            
            quillInstanceRef.current = quill;
        }
    }, [onChange, value]); // Added value to re-initialize if needed, though it's mainly for the initial content

    // Sync external value changes (e.g., loading a template) to the editor
    useEffect(() => {
        const quill = quillInstanceRef.current;
        if (quill && quill.root.innerHTML !== value) {
            const currentSelection = quill.getSelection();
            quill.clipboard.dangerouslyPasteHTML(value);
            // Restore cursor position if possible to avoid jumping to the top
            if (currentSelection) {
                quill.setSelection(currentSelection.index, currentSelection.length);
            }
        }
    }, [value]);

    // Use a wrapper div because Quill modifies the DOM of the element it's attached to.
    return (
      <div>
        <div ref={editorRef}></div>
      </div>
    );
};

export default RichTextEditor;