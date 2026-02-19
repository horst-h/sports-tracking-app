type AppHeaderProps = {
  title: string;
  dateLabel: string;      // "Saturday, Feb 7, 2026"
  dateTimeIso: string;    // "2026-02-07"
  avatarText: string;     // "RV"
  avatarImage?: string;   // URL to profile image (optional)
  onAvatarClick?: () => void;
};

export default function AppHeader({
  title,
  dateLabel,
  dateTimeIso,
  avatarText,
  avatarImage,
  onAvatarClick,
}: AppHeaderProps) {
  return (
    <header className="app-header" role="banner">
      <div className="app-header__inner">
        <div className="app-logo-placeholder"></div>
        <div className="app-brand" aria-label="App header">
          <div className="app-brand__title-wrapper">
            <div className="app-brand__dots">
              <span className="dot dot--1"></span>
              <span className="dot dot--2"></span>
              <span className="dot dot--3"></span>
            </div>
            <span className="app-brand__title">{title}</span>
          </div>
          <time className="app-brand__date" dateTime={dateTimeIso} aria-label="Current date">
            {dateLabel}
          </time>
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
