import React from 'react';

export default function EmptyState({
  title = 'Nothing here yet',
  description = 'Get started by creating something new.',
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center mb-4">
        <span className="text-2xl text-teal-600">📄</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
