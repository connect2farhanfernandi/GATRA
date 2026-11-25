import { Calendar, RotateCcw } from 'lucide-react';
import { getQuickDateRange } from '../lib/lifecycle';

interface DateRangeFilterProps {
  fromDate: string;
  toDate: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onChangeRange?: (from: string, to: string) => void;
  onReset?: () => void;
  label?: string;
  compact?: boolean;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DateRangeFilter({
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
  onChangeRange,
  onReset,
  label = 'Rentang Tanggal Input',
  compact = false,
}: DateRangeFilterProps) {
  const normalizedFrom = ISO_DATE_RE.test(fromDate.trim()) ? fromDate.trim() : '';
  const normalizedTo = ISO_DATE_RE.test(toDate.trim()) ? toDate.trim() : '';

  const todayRange = getQuickDateRange('today');
  const sevenDaysRange = getQuickDateRange('7days');
  const monthRange = getQuickDateRange('month');

  const isToday = normalizedFrom === todayRange.from && normalizedTo === todayRange.to;
  const is7Days = normalizedFrom === sevenDaysRange.from && normalizedTo === sevenDaysRange.to;
  const isMonth = normalizedFrom === monthRange.from && normalizedTo === monthRange.to;
  const isAll = !normalizedFrom && !normalizedTo;

  const applyPreset = (preset: 'today' | '7days' | 'month') => {
    const r = getQuickDateRange(preset);
    if (onChangeRange) {
      onChangeRange(r.from, r.to);
    } else {
      onChangeFrom(r.from);
      onChangeTo(r.to);
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else if (onChangeRange) {
      onChangeRange('', '');
    } else {
      onChangeFrom('');
      onChangeTo('');
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>{label}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Dari Tanggal
          </label>
          <input
            type="date"
            aria-label="Dari Tanggal Input"
            value={normalizedFrom}
            onChange={(e) => onChangeFrom(e.target.value)}
            className="text-xs font-mono-tabular border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            Sampai Tanggal
          </label>
          <input
            type="date"
            aria-label="Sampai Tanggal Input"
            value={normalizedTo}
            onChange={(e) => onChangeTo(e.target.value)}
            className="text-xs font-mono-tabular border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset('today')}
            className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isToday
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => applyPreset('7days')}
            className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              is7Days
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => applyPreset('month')}
            className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isMonth
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            Bulan Ini
          </button>
          <button
            type="button"
            onClick={handleReset}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isAll
                ? 'bg-slate-100 text-slate-500 border-slate-200'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset / Semua</span>
          </button>
        </div>
      </div>
    </div>
  );
}
