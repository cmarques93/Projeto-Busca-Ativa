import React from 'react';
import { CheckCircle2, Users, X } from 'lucide-react';

interface SaveSuccessModalProps {
  onClose: () => void;
  onContinue: () => void;
}

export const SaveSuccessModal: React.FC<SaveSuccessModalProps> = ({ onClose, onContinue }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 text-center">Registro salvo com sucesso!</h3>
        <p className="text-sm text-slate-600 text-center mt-2 mb-6">
          Deseja continuar lançando a frequência para outra turma?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
          >
            Ficar nesta turma
          </button>
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <Users className="w-4 h-4" />
            Outra Turma
          </button>
        </div>
      </div>
    </div>
  );
};
