import React, { useState, useEffect } from 'react';
import Modal from './Modal';

interface ScheduleModalProps {
  onClose: () => void;
  onSchedule: (isoDate: string) => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ onClose, onSchedule }) => {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState('');

  // Set initial date and time to a sensible default (e.g., tomorrow at 9:00 AM)
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    
    setDate(`${yyyy}-${mm}-${dd}`);
    setTime('09:00');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      setError('Please select both a date and a time.');
      return;
    }

    const scheduledDateTime = new Date(`${date}T${time}`);
    if (scheduledDateTime < new Date()) {
      setError('Scheduled time must be in the future.');
      return;
    }
    
    setError('');
    onSchedule(scheduledDateTime.toISOString());
  };

  return (
    <Modal title="Schedule Campaign" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Select a future date and time to automatically send this campaign.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="schedule-date" className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              id="schedule-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="schedule-time" className="block text-sm font-medium text-gray-700">Time</label>
            <input
              type="time"
              id="schedule-time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            Schedule
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ScheduleModal;