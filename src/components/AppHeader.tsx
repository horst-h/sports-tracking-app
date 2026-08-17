import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import DataStatus from './DataStatus';

type SyncStatus = 'idle' | 'syncing' | 'error';

type AppHeaderProps = {
  title: string;
  syncStatus: SyncStatus;
  lastSync?: Date;
  avatarText: string;     // "RV"
  avatarImage?: string;   // URL to profile image (optional)
  onAvatarClick?: () => void;
  /** Omitted where there is nothing to refresh; the button is then not rendered. */
  onRefresh?: () => void;
};

export default function AppHeader({
  title,
  syncStatus,
  lastSync,
  avatarText,
  avatarImage,
  onAvatarClick,
  onRefresh,
}: AppHeaderProps) {
  /**
   * An avatar that will not load falls back to the initials rather than to a
   * broken-image icon. It is a remote URL on an app built to work offline, so
   * this is the ordinary case on a plane, not an edge case.
   *
   * Remembering which URL failed rather than a bare "it failed" is what lets a
   * later, different picture be tried: there is nothing to reset.
   */
  const [failedImage, setFailedImage] = useState<string | null>(null);

  const showImage = !!avatarImage && avatarImage !== failedImage;

  return (
    <header className="app-header" role="banner">
      <div className="app-header__inner">
        <img src="/icons/icon-192.png" alt="Sports Tracking App" className="app-logo" />
        <div className="app-brand" aria-label="App header">
          <div className="app-brand__title-wrapper">
            <span className="app-brand__title">{title}</span>
          </div>
          <DataStatus status={syncStatus} lastSync={lastSync} />
        </div>

        <div className="app-header__actions">
          {/* The only way to force a sync with a mouse: pull-to-refresh ignores
              mouse events by design, and a page reload re-reads the same cache
              rather than asking the server. */}
          {onRefresh && (
            <button
              type="button"
              className="header-refresh"
              onClick={onRefresh}
              disabled={syncStatus === 'syncing'}
              aria-label={syncStatus === 'syncing' ? 'Syncing' : 'Refresh data'}
              title="Refresh data"
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={syncStatus === 'syncing' ? 'header-refresh__icon--spinning' : undefined}
              />
            </button>
          )}

          <button className="avatar" type="button" aria-label="Open profile" onClick={onAvatarClick}>
            {showImage ? (
              <img
                src={avatarImage}
                alt="Profile"
                className="avatar__image"
                // Google serves these from lh3.googleusercontent.com and refuses
                // some requests that carry a referrer.
                referrerPolicy="no-referrer"
                onError={() => setFailedImage(avatarImage)}
              />
            ) : (
              <span className="avatar__fallback" aria-hidden="true">
                {avatarText}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
