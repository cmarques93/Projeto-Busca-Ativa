import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';

interface InfoTooltipProps {
  content: React.ReactNode;
  title?: string;
  className?: string;
  icon?: 'help' | 'info';
  size?: 'sm' | 'md';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  title,
  className = '',
  icon = 'help',
  size = 'sm',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const buttonClass =
    size === 'sm'
      ? 'p-0.5 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer inline-flex items-center justify-center'
      : 'p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer inline-flex items-center justify-center';

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={buttonClass}
        title={title || 'Clique para ver informações'}
        aria-label={title || 'Informações explicativas'}
      >
        {icon === 'help' ? <HelpCircle className={iconClass} /> : <Info className={iconClass} />}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-72 sm:w-80 p-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 text-xs font-normal leading-relaxed animate-in fade-in zoom-in-95 duration-150"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5 pb-1 border-b border-slate-800">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 text-[11px]">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>{title || 'Informação Explicativa'}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-slate-300 text-[11px] leading-relaxed">{content}</div>
        </div>
      )}
    </div>
  );
};
