interface LogoProps {
    variant?: 'full' | 'icon';
    className?: string;
    theme?: 'light' | 'dark';
}

export function GardeniasLogo({ variant = 'full', className = '', theme = 'dark' }: LogoProps) {
    const textColor = theme === 'dark' ? '#ecfdf5' : '#047857';
    const subTextColor = theme === 'dark' ? '#34d399' : '#059669';

    if (variant === 'icon') {
        return (
            <svg
                viewBox="0 0 100 100"
                className={className}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle cx="50" cy="50" r="12" fill="url(#gradient1-icon)" />
                <path d="M 50 15 Q 35 20 35 35 Q 35 45 50 50 Q 35 55 35 65 Q 35 80 50 85"
                    stroke="url(#gradient2-icon)"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <path d="M 50 15 Q 65 20 65 35 Q 65 45 50 50 Q 65 55 65 65 Q 65 80 50 85"
                    stroke="url(#gradient2-icon)"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <ellipse cx="35" cy="25" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(-30 35 25)" />
                <ellipse cx="65" cy="25" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(30 65 25)" />
                <ellipse cx="25" cy="50" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(-90 25 50)" />
                <ellipse cx="75" cy="50" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(90 75 50)" />
                <ellipse cx="35" cy="75" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(-150 35 75)" />
                <ellipse cx="65" cy="75" rx="8" ry="12" fill="url(#gradient3-icon)" opacity="1" transform="rotate(150 65 75)" />
                <circle cx="35" cy="35" r="3" fill="#059669" opacity="1" />
                <circle cx="65" cy="35" r="3" fill="#059669" opacity="1" />
                <circle cx="35" cy="65" r="3" fill="#059669" opacity="1" />
                <circle cx="65" cy="65" r="3" fill="#059669" opacity="1" />

                <defs>
                    <linearGradient id="gradient1-icon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#047857" />
                    </linearGradient>
                    <linearGradient id="gradient2-icon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <linearGradient id="gradient3-icon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6ee7b7" />
                        <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                </defs>
            </svg>
        );
    }

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <svg
                viewBox="0 0 100 100"
                className="w-10 h-10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <circle cx="50" cy="50" r="12" fill="url(#gradient1-full)" />
                <path d="M 50 15 Q 35 20 35 35 Q 35 45 50 50 Q 35 55 35 65 Q 35 80 50 85"
                    stroke="url(#gradient2-full)"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <path d="M 50 15 Q 65 20 65 35 Q 65 45 50 50 Q 65 55 65 65 Q 65 80 50 85"
                    stroke="url(#gradient2-full)"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                />
                <ellipse cx="35" cy="25" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(-30 35 25)" />
                <ellipse cx="65" cy="25" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(30 65 25)" />
                <ellipse cx="25" cy="50" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(-90 25 50)" />
                <ellipse cx="75" cy="50" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(90 75 50)" />
                <ellipse cx="35" cy="75" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(-150 35 75)" />
                <ellipse cx="65" cy="75" rx="8" ry="12" fill="url(#gradient3-full)" opacity="1" transform="rotate(150 65 75)" />
                <circle cx="35" cy="35" r="3" fill="#059669" opacity="1" />
                <circle cx="65" cy="35" r="3" fill="#059669" opacity="1" />
                <circle cx="35" cy="65" r="3" fill="#059669" opacity="1" />
                <circle cx="65" cy="65" r="3" fill="#059669" opacity="1" />
                <defs>
                    <linearGradient id="gradient1-full" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#047857" />
                    </linearGradient>
                    <linearGradient id="gradient2-full" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#059669" />
                        <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                    <linearGradient id="gradient3-full" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6ee7b7" />
                        <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="flex flex-col">
                <span className="text-2xl tracking-tight" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 700, color: textColor }}>
                    GARDENIA
                </span>
                <span className="text-xs tracking-widest" style={{ fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 400, color: subTextColor, letterSpacing: '0.15em' }}>
                    BIOWORKFLOWS
                </span>
            </div>
        </div>
    );
}
