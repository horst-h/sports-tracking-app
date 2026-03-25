import { useEffect, useState } from 'react';

type SyncStatus = 'idle' | 'syncing' | 'error';

interface DataStatusProps {
  status: SyncStatus;
  lastSync?: Date;
}

function formatLastSync(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // For older dates, show the actual date
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
  }
}

export default function DataStatus({ status, lastSync }: DataStatusProps) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    if (status !== 'idle' || !lastSync) return;

    const interval = setInterval(() => {
      setTick(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, [status, lastSync]);

  const now = new Date(tick);

  const getStatusText = () => {
    switch (status) {
      case 'syncing':
        return 'syncing…';
      case 'error':
        return 'sync failed';
      case 'idle':
      default:
        if (lastSync) {
          return `synced • ${formatLastSync(lastSync, now)}`;
        }
        return 'synced • not synced';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'error':
        return 'text-red-500';
      case 'syncing':
        return 'text-blue-500';
      case 'idle':
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm whitespace-nowrap">
      <span className={getStatusColor()}>{getStatusText()}</span>
      {status === 'syncing' && (
        <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}