import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, RotateCcw, Calculator as CalcIcon } from 'lucide-react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Calculator({ isOpen, onClose }: CalculatorProps) {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [shouldReset, setShouldReset] = useState(false);

  const calculate = useCallback(() => {
    try {
      // Using Function constructor as a safer alternative to eval for simple math
      // In a real production app, use a math library like mathjs
      const result = new Function(`return ${equation.replace(/x/g, '*').replace(/÷/g, '/')}`)();
      const formattedResult = Number.isInteger(result) ? result.toString() : result.toFixed(2).replace(/\.?0+$/, '');
      
      setHistory(prev => [equation + ' = ' + formattedResult, ...prev].slice(0, 5));
      setDisplay(formattedResult);
      setEquation(formattedResult);
      setShouldReset(true);
    } catch (error) {
      setDisplay('Error');
      setShouldReset(true);
    }
  }, [equation]);

  const handleNumber = (num: string) => {
    if (shouldReset) {
      setDisplay(num);
      setEquation(num);
      setShouldReset(false);
    } else {
      setDisplay(prev => (prev === '0' ? num : prev + num));
      setEquation(prev => prev + num);
    }
  };

  const handleOperator = (op: string) => {
    setShouldReset(false);
    setDisplay('0');
    setEquation(prev => {
      const lastChar = prev.slice(-1);
      if (['+', '-', 'x', '÷'].includes(lastChar)) {
        return prev.slice(0, -1) + op;
      }
      return prev + op;
    });
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
    setShouldReset(false);
  };

  const backspace = () => {
    if (display.length > 1) {
      setDisplay(prev => prev.slice(0, -1));
      setEquation(prev => prev.slice(0, -1));
    } else {
      setDisplay('0');
      setEquation(prev => prev.slice(0, -1));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key >= '0' && e.key <= '9') handleNumber(e.key);
      if (e.key === '.') handleNumber('.');
      if (e.key === '+') handleOperator('+');
      if (e.key === '-') handleOperator('-');
      if (e.key === '*') handleOperator('x');
      if (e.key === '/') handleOperator('÷');
      if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculate();
      }
      if (e.key === 'Escape') onClose();
      if (e.key === 'Backspace') backspace();
      if (e.key === 'c' || e.key === 'C') clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, equation, calculate, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 z-[100] overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="bg-blue-600 p-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-2 font-bold text-sm">
          <CalcIcon size={16} />
          <span>Calculator</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-md transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Display */}
      <div className="bg-gray-900 p-4 text-right">
        <div className="text-gray-400 text-xs h-4 mb-1 overflow-hidden whitespace-nowrap">
          {equation || ' '}
        </div>
        <div className="text-white text-3xl font-mono font-bold overflow-hidden whitespace-nowrap">
          {display}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 max-h-20 overflow-y-auto">
          {history.map((item, i) => (
            <div key={i} className="text-[10px] text-gray-400 font-mono text-right truncate">
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="p-3 grid grid-cols-4 gap-2 bg-gray-50">
        <button onClick={clear} className="p-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors">C</button>
        <button onClick={backspace} className="p-3 bg-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-300 transition-colors flex items-center justify-center">
          <Delete size={18} />
        </button>
        <button onClick={() => handleOperator('÷')} className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors">÷</button>
        <button onClick={() => handleOperator('x')} className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors">x</button>

        <button onClick={() => handleNumber('7')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">7</button>
        <button onClick={() => handleNumber('8')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">8</button>
        <button onClick={() => handleNumber('9')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">9</button>
        <button onClick={() => handleOperator('-')} className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors">-</button>

        <button onClick={() => handleNumber('4')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">4</button>
        <button onClick={() => handleNumber('5')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">5</button>
        <button onClick={() => handleNumber('6')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">6</button>
        <button onClick={() => handleOperator('+')} className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors">+</button>

        <button onClick={() => handleNumber('1')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">1</button>
        <button onClick={() => handleNumber('2')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">2</button>
        <button onClick={() => handleNumber('3')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">3</button>
        <button onClick={calculate} className="p-3 bg-blue-600 text-white rounded-xl font-bold row-span-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">=</button>

        <button onClick={() => handleNumber('0')} className="p-3 col-span-2 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">0</button>
        <button onClick={() => handleNumber('.')} className="p-3 bg-white text-gray-800 rounded-xl font-bold border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors">.</button>
      </div>

      <div className="bg-white p-2 text-center border-t border-gray-100">
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Alt + C to toggle</span>
      </div>
    </div>
  );
}
