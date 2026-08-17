import { useState } from 'react';
import DataStatus from './DataStatus';

type SyncStatus = 'idle' | 'syncing' | 'error';

type AppHeaderProps = {
  title: string;
  syncStatus: SyncStatus;
  lastSync?: Date;
  avatarText: string;     // "RV"
  avatarImage?: string;   // URL to profile image (optional)
  onAvatarClick?: () => void;
};

export default function AppHeader({
  title,
  syncStatus,
  lastSync,
  avatarText,
  avatarImage,
  onAvatarClick,
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
    </header>
  );
}
