import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Award,
  Users,
  Building,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid
} from 'recharts';
import { MonthlyPedagogicalReport } from '../types';

interface MonthlyReportProps {
  report: MonthlyPedagogicalReport | null;
  onSelectMonth: (monthIndex: number) => void;
  selectedMonthIndex: number;
}

const COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6'];

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  report,
  onSelectMonth,
  selectedMonthIndex,
}) => {
  const [showPrintView, setShowPrintView] = useState(false);

  if (!report) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        Carregando dados consolidados do relatório pedagógico...
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Month Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
            <span>Diagnóstico Institucional</span>
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Relatório Mensal da Equipe Pedagógica
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Análise consolidada de frequência, mapa de calor de turmas críticas e eficácia da Busca Ativa.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input type="date" className="bg-transparent text-slate-800 focus:outline-hidden font-bold cursor-pointer" />
            <span className="text-slate-400">até</span>
            <input type="date" className="bg-transparent text-slate-800 focus:outline-hidden font-bold cursor-pointer" />
          </div>

          <button
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Imprimir ou salvar PDF do relatório"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Taxa Média de Frequência</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-slate-900">{report.averageAttendanceRate}%</span>
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+1.4%</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Acima do mínimo da LDB (75%)</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Alunos em Frequência Crítica</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-rose-700">{report.studentsWithCriticalAbsence}</span>
            <span className="text-xs text-rose-600 font-semibold">&lt; 75% assiduidade</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Prioridade absoluta de busca ativa</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Casos com Retorno Efetivo</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-emerald-700">{report.successfulReintegrations}</span>
            <span className="text-xs text-emerald-600 font-semibold">reintegrados</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">De {report.activeSearchCasesCount} casos instaurados</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500">Alertas Enviados aos Pais</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-indigo-700">{report.alertsDispatched}</span>
            <span className="text-xs text-indigo-600 font-semibold">disparos</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{report.alertsResponded} respondidos com feedback</div>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Attendance by Class */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Frequência Média por Turma (%)
              </h3>
              <p className="text-xs text-slate-500">
                Comparativo entre turmas do Ensino Fundamental e Ensino Médio
              </p>
            </div>
            <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-semibold">
              Meta: &gt; 85%
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.riskByClass} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="className" tick={{ fontSize: 11, fill: '#64748b' }} angle={-20} textAnchor="end" />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  formatter={(value: any) => [`${value}%`, 'Frequência']}
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="averageAttendance" name="Frequência Média (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Causes Distribution */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="font-bold text-slate-900 text-sm">
              Causas Primárias da Infrequência & Evasão
            </h3>
            <p className="text-xs text-slate-500">
              Mapeamento de vulnerabilidade das famílias entrevistadas
            </p>
          </div>

          <div className="space-y-3 mt-4">
            {report.absenceCausesDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium truncate pr-2">{item.cause}</span>
                  <span className="font-bold text-slate-900 shrink-0">{item.percentage}% ({item.count})</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: COLORS[idx % COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <div className="font-bold flex items-center gap-1.5 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
              <span>Destaque Pedagógico:</span>
            </div>
            O trabalho precoce e o transporte continuam respondendo por 58% do absenteísmo escolar no município.
          </div>
        </div>
      </div>

      {/* Institutional Pedagogical Insights (Parecer Técnico) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 font-bold text-slate-900 text-base border-b border-slate-100 pb-3">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span>Parecer Técnico da Equipe Pedagógica & Ações Estratégicas</span>
        </div>

        <div className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
          {report.pedagogicalInsights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <p className="text-xs sm:text-sm text-slate-800">{insight}</p>
            </div>
          ))}
        </div>

        {/* Priority Action Checklist for the upcoming month */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Plano de Intervenção Rápida para o Próximo Ciclo:
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
              <div className="font-bold text-indigo-900 mb-1">1. Plantão de Busca Ativa In Loco</div>
              <p className="text-slate-600 text-[11px]">
                Visitas domiciliares prioritárias aos 5 alunos da lista crítica antes do fechamento bimestral.
              </p>
            </div>

            <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
              <div className="font-bold text-emerald-900 mb-1">2. Articulação CRAS / Transporte</div>
              <p className="text-slate-600 text-[11px]">
                Reunião com a Secretaria de Transportes para inclusão na rota rural das turmas do 9º Ano e EM.
              </p>
            </div>

            <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <div className="font-bold text-purple-900 mb-1">3. Oficina de Nivelamento Escolar</div>
              <p className="text-slate-600 text-[11px]">
                Acolhimento pedagógico e recomposição de aprendizagem aos alunos reintegrados.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
