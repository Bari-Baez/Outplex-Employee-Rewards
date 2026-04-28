'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DatePickerProps {
  date?: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  variant?: string;
}

export function ModernDatePicker({ 
  date, 
  onDateChange, 
  label, 
  placeholder = "Select date...",
  className,
  disabled,
  variant 
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(date ? new Date(date + 'T00:00:00') : new Date());
  
  const selectedDate = date ? new Date(date + 'T00:00:00') : null;
  
  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate));
    const end = endOfWeek(endOfMonth(viewDate));
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(subMonths(viewDate, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(addMonths(viewDate, 1));
  };

  const handleSelect = (d: Date) => {
    onDateChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <label className="text-xs font-medium text-[var(--text-muted)] ml-1">{label}</label>}
      
      <DropdownMenuPrimitive.Root open={disabled ? false : open} onOpenChange={setOpen}>
        <DropdownMenuPrimitive.Trigger asChild>
          <button 
            type="button"
            disabled={disabled}
            className="flex h-10 w-full items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-primary)] transition-all hover:border-[var(--border-strong)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CalendarIcon className="h-4 w-4 opacity-50" />
            <span className={cn(!date && "text-[var(--text-muted)]")}>
              {date ? format(selectedDate!, 'PPP') : placeholder}
            </span>
          </button>
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content 
            align="start" 
            sideOffset={8}
            className="z-[1001] min-w-[320px] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <button 
                type="button"
                onClick={handlePrevMonth}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {format(viewDate, 'MMMM yyyy')}
              </h2>
              <button 
                type="button"
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-[var(--text-muted)] uppercase py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, viewDate);
                
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelect(day)}
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center text-xs transition-all relative",
                      !isCurrentMonth && "opacity-20",
                      isToday(day) && !isSelected && "text-[var(--brand-primary-light)] font-bold",
                      isSelected ? "bg-[var(--brand-primary)] text-white shadow-lg shadow-[var(--brand-primary)]/20" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]",
                    )}
                  >
                    {format(day, 'd')}
                    {isToday(day) && !isSelected && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--brand-primary)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => handleSelect(new Date())}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => { onDateChange(''); setOpen(false); }}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-transparent border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Clear
              </button>
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}
