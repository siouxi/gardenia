import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

export const InputIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M12 14L16 18L12 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="19" y1="20" x2="24" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const QCIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M11 16L14.5 19.5L21 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" fill="none" opacity="0.4" />
  </svg>
);

export const PreprocessingIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M6 8L16 13L26 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 16L16 21L26 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 24L16 19L26 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="13" r="2" fill="currentColor" />
    <circle cx="16" cy="21" r="2" fill="currentColor" />
  </svg>
);

export const StatisticalAnalysisIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <line x1="6" y1="26" x2="26" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="26" x2="6" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="10" y="18" width="3" height="8" fill="currentColor" />
    <rect x="15" y="12" width="3" height="14" fill="currentColor" />
    <rect x="20" y="15" width="3" height="11" fill="currentColor" />
    <path d="M10 12Q13 8, 16 10T22 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

export const VisualizationIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M16 16L16 6" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16L21.6 11.5" stroke="currentColor" strokeWidth="2" />
    <path d="M16 16L23 21" stroke="currentColor" strokeWidth="2" />
    <circle cx="16" cy="16" r="2" fill="currentColor" />
    <path d="M8 10L6 8M24 10L26 8M8 22L6 24M24 22L26 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const UtilitiesIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M16 6L18 11L23 13L18 15L16 20L14 15L9 13L14 11L16 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    <circle cx="9" cy="23" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M20 21L22 23L26 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="19" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DataWranglingIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M8 6H24L20 14H24L20 22H24L16 26L8 22H12L8 14H12L8 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
  </svg>
);

export const NormalizationIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M4 24C8 24 10 6 16 6C22 6 24 24 28 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <line x1="4" y1="24" x2="28" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" opacity="0.5" />
    <line x1="16" y1="6" x2="16" y2="24" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
  </svg>
);

export const DifferentialExpressionIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M10 22L10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M7 13L10 10L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 10L22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M19 19L22 22L25 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="15" y1="16" x2="17" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const MachineLearningIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="7" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="7" cy="22" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="16" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="16" cy="24" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="25" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="9.5" y1="10" x2="13.5" y2="8" stroke="currentColor" strokeWidth="1" />
    <line x1="9.5" y1="10" x2="13.5" y2="16" stroke="currentColor" strokeWidth="1" />
    <line x1="9.5" y1="22" x2="13.5" y2="16" stroke="currentColor" strokeWidth="1" />
    <line x1="9.5" y1="22" x2="13.5" y2="24" stroke="currentColor" strokeWidth="1" />
    <line x1="18.5" y1="8" x2="22.5" y2="16" stroke="currentColor" strokeWidth="1" />
    <line x1="18.5" y1="16" x2="22.5" y2="16" stroke="currentColor" strokeWidth="1" />
    <line x1="18.5" y1="24" x2="22.5" y2="16" stroke="currentColor" strokeWidth="1" />
  </svg>
);

export const SequenceAnalysisIcon: React.FC<IconProps> = ({ size = 32, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M10 4C10 4 14 8 14 12C14 16 10 16 10 20C10 24 14 28 14 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <path d="M22 4C22 4 18 8 18 12C18 16 22 16 22 20C22 24 18 28 18 28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    <line x1="12" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="14" x2="19" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="18" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="24" x2="20" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

