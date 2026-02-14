type AppHeaderProps = {
  title: string;
  dateLabel: string;      // "Saturday, Feb 7, 2026"
  dateTimeIso: string;    // "2026-02-07"
  avatarText: string;     // "RV"
  onAvatarClick?: () => void;
};

export default function AppHeader({
  title,
  dateLabel,
  dateTimeIso,
  avatarText,
  onAvatarClick,
}: AppHeaderProps) {
  return (
    <header className="app-header" role="banner">
      <div className="app-header__inner">
        <div className="app-brand" aria-label="App header">
          <span className="app-brand__title">{title}</span>
          <time className="app-brand__date" dateTime={dateTimeIso} aria-label="Current date">
            {dateLabel}
          </time>
        </div>

        <button className="avatar" type="button" aria-label="Open profile" onClick={onAvatarClick}>
          <span className="avatar__fallback" aria-hidden="true">
            {avatarText}
          </span>
        </button>
      </div>
    </header>
  );
}
