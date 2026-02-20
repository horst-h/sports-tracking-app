export default function CyclingIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18.5" cy="17.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="5.5" cy="17.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="15" cy="5" r="1" fill="currentColor" />
      <path
        d="M12 17.5V14l-3-3 4-3 2 3h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
