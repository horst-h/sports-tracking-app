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
          {avatarImage ? (
            <img
              src={avatarImage}
              alt="Profile"
              className="avatar__image"
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
