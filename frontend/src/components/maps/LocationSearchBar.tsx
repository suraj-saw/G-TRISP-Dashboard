import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import { searchLocation } from '../../api/geocodingApi';
import type { GeocodingResult } from '../../api/geocodingApi';

interface LocationSearchBarProps {
  bbox: [number, number, number, number] | null;
  onLocationSelect: (lat: number, lng: number) => void;
  onClear: () => void;
}

export default function LocationSearchBar({ bbox, onLocationSelect, onClear }: LocationSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const skipSearchRef = useRef(false);
  
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (query.trim().length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchLocation(query, bbox);
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setLoading(false);
      }
    }, 800); // 800ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [query, bbox]);

  const handleSelect = (result: GeocodingResult) => {
    skipSearchRef.current = true;
    setQuery(result.display_name.split(',')[0] || result.display_name);
    setIsOpen(false);
    onLocationSelect(parseFloat(result.lat), parseFloat(result.lon));
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onClear();
  };

  return (
    <div ref={wrapperRef} className="relative z-30 w-full font-sans mb-4 px-1">
      <div className="relative flex items-center w-full h-[42px] rounded-xl bg-white shadow-sm border border-[#E4E8F4] focus-within:border-[#1e3a8a] focus-within:ring-4 focus-within:ring-[#1e3a8a]/10 transition-all duration-200 group">
        <div className="flex items-center justify-center w-11 h-full text-[#6B7299] group-focus-within:text-[#1e3a8a] transition-colors">
          <Search size={16} strokeWidth={2.5} />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value === '') {
              onClear();
              setResults([]);
              setIsOpen(false);
            }
          }}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder="Search location..."
          className="flex-1 h-full w-full bg-transparent text-[13px] font-semibold text-[#1A1D2E] placeholder-[#949AB1] outline-none pr-10"
        />
        <div className="absolute right-0 flex items-center justify-center w-11 h-full">
          {loading ? (
            <Loader2 size={16} className="text-blue-500 animate-spin" />
          ) : query ? (
            <button onClick={clearSearch} className="text-slate-400 hover:text-slate-600 focus:outline-none p-1 rounded-md">
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white rounded-lg shadow-lg border border-slate-100 overflow-hidden max-h-64 overflow-y-auto">
          <ul>
            {results.map((result) => (
              <li key={result.place_id}>
                <button
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2 border-b border-slate-50 last:border-0 transition-colors focus:outline-none focus:bg-slate-100"
                  onClick={() => handleSelect(result)}
                >
                  <MapPin size={14} className="text-blue-500 mt-0.5 shrink-0" />
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {result.display_name.split(',')[0]}
                    </span>
                    <span className="text-xs text-slate-500 truncate">
                      {result.display_name.split(',').slice(1).join(',')}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {isOpen && !loading && query.trim().length >= 3 && results.length === 0 && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white rounded-lg shadow-lg border border-slate-100 px-4 py-3 text-sm text-slate-500 text-center">
          No locations found.
        </div>
      )}
    </div>
  );
}
