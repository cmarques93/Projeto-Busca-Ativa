import React, { useState, useMemo } from 'react';
import { School as SchoolType, isModuleEnabled } from '../types';
import {
  Building2,
  CheckCircle2,
  Plus,
  X,
  School,
  MapPin,
  FileBadge,
  Phone,
  UserCheck,
  Shield,
  ArrowRight,
  Search
} from 'lucide-react';

interface SchoolSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools: SchoolType[];
  currentSchoolId?: string;
  activeSchoolId?: string;
  onSelectSchool: (schoolId: string) => void;
  canManageSchools?: boolean;
  onOpenCreateSchool?: () => void;
  onOpenSystemManager?: () => void;
}

export const SchoolSelectorModal: React.FC<SchoolSelectorModalProps> = ({
  isOpen,
  onClose,
  schools,
  currentSchoolId,
  activeSchoolId,
  onSelectSchool,
  canManageSchools,
  onOpenCreateSchool,
  onOpenSystemManager,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const activeId = activeSchoolId || currentSchoolId;

  const filteredSchools = useMemo(() => {
    if (!searchQuery.trim()) return schools;
    const q = searchQuery.toLowerCase().trim();
    return schools.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.city && s.city.toLowerCase().includes(q)) ||
      (s.codeCie && s.codeCie.toLowerCase().includes(q)) ||
      (s.network && s.network.toLowerCase().includes(q))
    );
  }, [schools, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/80 border border-indigo-400/30 flex items-center justify-center text-white shadow-inner">
              <Building2 className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                  SigaEscola SaaS
                </span>
                <span className="text-xs text-slate-400">• Multi-Unidades</span>
              </div>
              <h2 className="text-base font-bold text-white mt-0.5">
                Selecionar Unidade Escolar
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Selecione a instituição escolar que deseja gerenciar. O sistema isola de forma segura todas as turmas, estudantes, chamadas de frequência, ocorrências disciplinares e portaria por escola.
          </p>

          {/* Campo de Busca por Digitação */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Digitar nome da escola ou cidade para filtrar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 text-xs rounded-xl border border-slate-300 bg-slate-50 hover:bg-white focus:bg-white text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {filteredSchools.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                Nenhuma escola encontrada com o termo "{searchQuery}".
              </div>
            ) : (
              filteredSchools.map(sch => {
              const isActive = sch.id === activeId;
              return (
                <div
                  key={sch.id}
                  onClick={() => {
                    onSelectSchool(sch.id);
                    onClose();
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-2 ring-indigo-500/20'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <School className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          {sch.name}
                        </h3>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            <CheckCircle2 className="w-3 h-3" />
                            Unidade Ativa
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        {sch.codeCie && (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <FileBadge className="w-3 h-3 text-slate-400" />
                            CIE: {sch.codeCie}
                          </span>
                        )}
                        {sch.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {sch.city}
                          </span>
                        )}
                        {sch.network && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                            {sch.network}
                          </span>
                        )}
                      </div>
                      {sch.directorName && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Direção: <strong className="text-slate-700 font-medium">{sch.directorName}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center sm:justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700'
                      }`}
                    >
                      <span>{isActive ? 'Gerenciando' : 'Acessar'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {canManageSchools && onOpenSystemManager && (
            <button
              onClick={() => {
                onClose();
                onOpenSystemManager();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              <Building2 className="w-4 h-4" />
              <span>Gerenciar Unidades & Módulos</span>
            </button>
          )}
          {onOpenCreateSchool && (
            <button
              onClick={() => {
                onClose();
                onOpenCreateSchool();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Nova Unidade Escolar</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-white text-slate-700 text-xs font-bold cursor-pointer transition-colors ml-auto"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
