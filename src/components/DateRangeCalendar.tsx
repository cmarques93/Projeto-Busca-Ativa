import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, Sparkles, X, Clock, CalendarDays } from 'lucide-react';
import { normalizeDateStr } from '../lib/firestoreService';
import { formatDateBR, getLocalTodayStr } from '../utils/reportCalculator';

interface DateRangeCalendarProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onChange: (start: string, end: string, isSingleDay: boolean) => void;
  availableDatesWithAttendance?: Set<string>;
}

export const DateRangeCalendar: React.FC<DateRangeCalendarProps> = ({
  startDate,
  endDate,
  onChange,
  availableDatesWithAttendance = new Set()
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hoje no sistema no fuso horário do usuário
  const todayStr = getLocalTodayStr();

  // Normaliza valores recebidos
  const currentStart = normalizeDateStr(startDate) || todayStr;
  const currentEnd = normalizeDateStr(endDate) || currentStart;

  // Modo de seleção: 'single' (relatório diário com 1 clique) ou 'range' (sequência de dias)
  const isCurrentlySingle = currentStart === currentEnd;
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>(isCurrentlySingle ? 'single' : 'range');

  // Visualização de ano e mês no calendário
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = new Date(currentStart + 'T12:00:00');
    return isNaN(d.getTime()) ? 2026 : d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d = new Date(currentStart + 'T12:00:00');
    return isNaN(d.getTime()) ? 8 : d.getMonth(); // 0-indexed
  });

  // Atualiza mês/ano de visualização se o start mudar externamente
  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate + 'T12:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [startDate]);

  // Estado interno para controle de seleção de período em 2 passos
  const [pickingState, setPickingState] = useState<'idle' | 'has_first'>('idle');
  const [firstPick, setFirstPick] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setPickingState('idle');
        setFirstPick(null);
        setHoverDate(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Dias do mês atual
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Domingo

  // Helper para formatar string YYYY-MM-DD
  const formatYMD = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  // Ações de Presets rápidos
  const handleSelectPreset = (preset: 'today' | 'yesterday' | 'week' | 'last7' | 'month') => {
    const now = new Date();
    const todayYMD = todayStr;

    if (preset === 'today') {
      onChange(todayYMD, todayYMD, true);
      setSelectionMode('single');
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yYMD = formatYMD(y.getFullYear(), y.getMonth(), y.getDate());
      onChange(yYMD, yYMD, true);
      setSelectionMode('single');
    } else if (preset === 'week') {
      const d = new Date(now);
      const day = d.getDay();
      const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMonday));
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const monYMD = formatYMD(monday.getFullYear(), monday.getMonth(), monday.getDate());
      const friYMD = formatYMD(friday.getFullYear(), friday.getMonth(), friday.getDate());
      onChange(monYMD, friYMD, false);
      setSelectionMode('range');
    } else if (preset === 'last7') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      const pastYMD = formatYMD(past.getFullYear(), past.getMonth(), past.getDate());
      onChange(pastYMD, todayYMD, false);
      setSelectionMode('range');
    } else if (preset === 'month') {
      const startM = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
      const endM = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      onChange(startM, endM, false);
      setSelectionMode('range');
    }

    setPickingState('idle');
    setFirstPick(null);
    setHoverDate(null);
    setIsOpen(false);
  };

  // Clique em um dia do calendário:
  // Modo Relatório Diário = 1 CLIQUE e fecha imediatamente!
  // Modo Sequência de Dias = 1º clique início, 2º clique fim (preenchendo a sequência)
  const handleDayClick = (dateStr: string) => {
    if (selectionMode === 'single') {
      // 1 CLIQUE BASTA: Atualiza imediatamente para o dia selecionado e fecha o calendário
      onChange(dateStr, dateStr, true);
      setPickingState('idle');
      setFirstPick(null);
      setHoverDate(null);
      setIsOpen(false);
      return;
    }

    // Modo Intervalo (Sequência de dias):
    if (pickingState === 'idle' || !firstPick) {
      // 1º Clique: Seleciona início
      setFirstPick(dateStr);
      setPickingState('has_first');
      onChange(dateStr, dateStr, true);
    } else {
      // 2º Clique: Seleciona fim e preenche a sequência
      let start = firstPick;
      let end = dateStr;
      if (start > end) {
        const temp = start;
        start = end;
        end = temp;
      }
      const isSingle = start === end;
      onChange(start, end, isSingle);
      setPickingState('idle');
      setFirstPick(null);
      setHoverDate(null);
      setIsOpen(false);
    }
  };

  // Determina se uma data está no intervalo ativo ou no preview de hover
  const getDayStatus = (dateStr: string) => {
    let effectiveStart = currentStart;
    let effectiveEnd = currentEnd;

    if (selectionMode === 'range' && pickingState === 'has_first' && firstPick) {
      const targetHover = hoverDate || firstPick;
      if (firstPick <= targetHover) {
        effectiveStart = firstPick;
        effectiveEnd = targetHover;
      } else {
        effectiveStart = targetHover;
        effectiveEnd = firstPick;
      }
    }

    const isStart = dateStr === effectiveStart;
    const isEnd = dateStr === effectiveEnd;
    const isInRange = dateStr >= effectiveStart && dateStr <= effectiveEnd;
    const isSingle = effectiveStart === effectiveEnd;
    const isToday = dateStr === todayStr;
    const hasAttendance = availableDatesWithAttendance.has(dateStr);

    return { isStart, isEnd, isInRange, isSingle, isToday, hasAttendance };
  };

  // Contagem de dias no intervalo
  const calculateDaysCount = (start: string, end: string) => {
    try {
      const d1 = new Date(start + 'T12:00:00').getTime();
      const d2 = new Date(end + 'T12:00:00').getTime();
      const diff = Math.round(Math.abs((d2 - d1) / (1000 * 60 * 60 * 24))) + 1;
      return diff;
    } catch {
      return 1;
    }
  };

  const daysSelectedCount = calculateDaysCount(currentStart, currentEnd);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Botão Gatilho do Calendário */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          setPickingState('idle');
          setFirstPick(null);
        }}
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-200'
            : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-indigo-400'
        }`}
        title="Clique para abrir o calendário e filtrar por dia ou sequência de período"
      >
        <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
          <CalendarIcon className="w-4 h-4 text-indigo-600" />
        </div>

        <div className="text-left">
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
            <span>{isCurrentlySingle ? 'Relatório Diário' : `Sequência (${daysSelectedCount} dias)`}</span>
            {currentStart === todayStr && isCurrentlySingle && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
          <div className="text-xs sm:text-sm font-extrabold text-slate-900">
            {isCurrentlySingle ? (
              <span>{formatDateBR(currentStart)} {currentStart === todayStr && <span className="text-indigo-600 font-bold">(Hoje)</span>}</span>
            ) : (
              <span>{formatDateBR(currentStart)} <span className="text-slate-400 font-normal">até</span> {formatDateBR(currentEnd)}</span>
            )}
          </div>
        </div>

        <span className="ml-1 text-[11px] text-slate-500 font-bold">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Popover / Calendário Dropdown */}
      {isOpen && (
        <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in fade-in zoom-in-95 duration-150">
          {/* Header do Popover */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-indigo-600" />
                <span>Filtro de Frequência & Calendário</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                {selectionMode === 'single'
                  ? 'Modo Diário: Clique em qualquer dia para carregar na hora'
                  : 'Modo Período: Clique na data inicial e na data final'}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Abas Alternadoras de Modo: Dia Único vs Sequência de Período */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl my-2.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setSelectionMode('single');
                setPickingState('idle');
                setFirstPick(null);
                if (!isCurrentlySingle) {
                  onChange(currentStart, currentStart, true);
                }
              }}
              className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                selectionMode === 'single'
                  ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Dia Único (1 Clique)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectionMode('range');
                setPickingState('idle');
                setFirstPick(null);
              }}
              className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                selectionMode === 'range'
                  ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Sequência de Dias</span>
            </button>
          </div>

          {/* Barra de Presets Rápidos */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pb-3 border-b border-slate-100 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => handleSelectPreset('today')}
              className={`px-2 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                isCurrentlySingle && currentStart === todayStr
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('yesterday')}
              className="px-2 py-1.5 rounded-lg text-center bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all cursor-pointer"
            >
              Ontem
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('week')}
              className="px-2 py-1.5 rounded-lg text-center bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all cursor-pointer"
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('last7')}
              className="px-2 py-1.5 rounded-lg text-center bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all cursor-pointer"
            >
              7 Dias
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreset('month')}
              className="px-2 py-1.5 rounded-lg text-center bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-all cursor-pointer col-span-2 sm:col-span-1"
            >
              Mês Todo
            </button>
          </div>

          {/* Navegação de Mês */}
          <div className="flex items-center justify-between py-2 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center">
              <span className="text-sm font-extrabold text-slate-900">
                {monthNames[viewMonth]} {viewYear}
              </span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grade do Calendário */}
          <div className="mt-1">
            {/* Dias da Semana */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-slate-500 uppercase mb-1">
              <div>Dom</div>
              <div>Seg</div>
              <div>Ter</div>
              <div>Qua</div>
              <div>Qui</div>
              <div>Sex</div>
              <div>Sáb</div>
            </div>

            {/* Dias do Mês */}
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {/* Espaços vazios antes do 1º dia */}
              {Array.from({ length: firstDayWeekday }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-8 sm:h-9" />
              ))}

              {/* Dias do mês */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const dateStr = formatYMD(viewYear, viewMonth, day);
                const { isStart, isEnd, isInRange, isSingle, isToday, hasAttendance } = getDayStatus(dateStr);

                // Classes para preenchimento de sequência
                let cellStyle = 'text-slate-700 hover:bg-slate-100';
                let roundedStyle = 'rounded-lg';

                if (isInRange) {
                  if (isSingle) {
                    cellStyle = 'bg-indigo-600 text-white font-extrabold shadow-xs';
                    roundedStyle = 'rounded-lg';
                  } else if (isStart) {
                    cellStyle = 'bg-indigo-600 text-white font-extrabold shadow-xs';
                    roundedStyle = 'rounded-l-lg';
                  } else if (isEnd) {
                    cellStyle = 'bg-indigo-600 text-white font-extrabold shadow-xs';
                    roundedStyle = 'rounded-r-lg';
                  } else {
                    // Dia intermediário preenchido na sequência contínua
                    cellStyle = 'bg-indigo-100 text-indigo-900 font-bold';
                    roundedStyle = 'rounded-none';
                  }
                } else if (isToday) {
                  cellStyle = 'text-indigo-600 font-extrabold border border-indigo-300 hover:bg-indigo-50';
                }

                return (
                  <div
                    key={dateStr}
                    className="p-0.5"
                    onMouseEnter={() => {
                      if (selectionMode === 'range' && pickingState === 'has_first') {
                        setHoverDate(dateStr);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleDayClick(dateStr)}
                      className={`w-full h-8 sm:h-9 flex flex-col items-center justify-center text-xs transition-all cursor-pointer ${roundedStyle} ${cellStyle}`}
                    >
                      <span className="leading-none">{day}</span>
                      {/* Marcador verde se houver chamadas/frequências registradas nesta data */}
                      {hasAttendance && (
                        <span
                          className={`w-1 h-1 rounded-full mt-0.5 ${
                            isInRange && (isStart || isEnd || isSingle)
                              ? 'bg-emerald-300 ring-1 ring-white'
                              : 'bg-emerald-500'
                          }`}
                          title="Frequência registrada nesta data"
                        />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dica de Status e Rodapé */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span className="text-[11px]">Dias com chamada no sistema</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setPickingState('idle');
                setFirstPick(null);
                setHoverDate(null);
                setIsOpen(false);
              }}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Concluído
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
