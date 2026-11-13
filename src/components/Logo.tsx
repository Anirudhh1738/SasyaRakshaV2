interface LogoProps {
  className?: string;
}

export function SasyaRakshaLogo({ className = 'w-7 h-7' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 3L6 7.2V15.4C6 21.8 10.3 27.3 16 29C21.7 27.3 26 21.8 26 15.4V7.2L16 3Z"
        stroke="var(--sr-accent-ink)"
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill="var(--sr-accent-soft)"
      />
      <path
        d="M16 22.5C12.2 22.5 10.2 19.6 10.5 16.2C10.8 12.6 14.3 9.8 20.5 9.8C20.5 15.8 18.8 22.5 16 22.5Z"
        fill="var(--sr-accent-ink)"
      />
      <path
        d="M12.2 21.4C14.2 18.7 16.8 15.6 19.4 11.4"
        stroke="var(--sr-canvas)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const AgriGuardLogo = SasyaRakshaLogo;
