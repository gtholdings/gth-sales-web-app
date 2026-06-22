'use client';

const STYLES = {
  pending: 'bg-gray-100 text-gray-700 border border-gray-300',
  awaiting_confirmation: 'bg-amber-100 text-amber-800 border border-amber-300',
  paid: 'bg-green-100 text-green-800 border border-green-300',
  overdue: 'bg-orange-100 text-orange-800 border border-orange-300',
  defaulted: 'bg-red-100 text-red-800 border border-red-300',
};

const LABELS = {
  pending: 'Pending',
  awaiting_confirmation: 'Awaiting Credit Officer',
  paid: 'Paid',
  overdue: 'Overdue',
  defaulted: 'Defaulted',
};

export function InstallmentStatusBadge({ status }) {
  const cls = STYLES[status] || STYLES.pending;
  const label = LABELS[status] || status;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
