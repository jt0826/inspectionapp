import React from 'react';

interface FadeInTextProps {
  children: React.ReactNode;
  visible?: boolean;
  className?: string;
}

export function FadeInText({ children, visible = true, className = '' }: FadeInTextProps) {
  return (
    <span className={`${className} transition-opacity transition-transform duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
      {children}
    </span>
  );
}

export default FadeInText;
