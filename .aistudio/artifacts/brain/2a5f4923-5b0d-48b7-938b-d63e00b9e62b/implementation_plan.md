# Otimização da Interface: 4 Módulos & Menos Poluição Visual (Estilo Atual Preservado)

Plano de modernização equilibrada da interface: reorganiza as 9 abas lineares em 4 módulos principais, limpa botões duplicados do topo e enxuga banners repetitivos, **preservando integralmente a identidade visual rica, as cores características, os ícones acolhedores e a estrutura de cartões do sistema atual**.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Diretrizes de Estilo & Equilíbrio (Conforme sua Solicitação):**
> 1. **Preservação da Identidade Visual Existente**: NÃO será um design minimalista frio ou monocromático. Manteremos os cartões arredondados, os tons acolhedores (azul, índigo, verde esmeralda, âmbar e roxo), os ícones expressivos e os badges informativos que você e a equipe já conhecem.
> 2. **Foco Estrito em Despoluição (Menos Ruído, Mais Usabilidade)**:
>    - Redução das 9-10 abas em **4 grandes áreas de trabalho** no topo (+ Gerenciador para Admin).
>    - Limpeza do cabeçalho superior (retirando apenas botões redundantes que já estão no Gerenciador).
>    - Banners informativos transformados em cartões compactos e elegantes, liberando altura de tela sem perder o contexto orientador.
> 3. **Todos os Recursos e Telas 100% Preservados**: Nenhuma funcionalidade, tabela ou modal será removido. Apenas a disposição visual será organizada em fluxos naturais de uso.

---

### 1. Overview & Core Concept

- **O que entrega**: Uma experiência visual limpa, organizada e fluida, mantendo o visual rico e profissional da escola, sem sensação de "painel abarrotado de informações".
- **Benefício Prático**:
  - Acesso mais rápido às rotinas diárias com menos rolagem de página.
  - Hierarquia clara entre o que é **operação do dia a dia** (chamadas, ocorrências, portaria, tablets) e o que é **administração/cadastros**.

---

### 2. User Experience & Visual Design

#### Navegação Superior Consolidada (Preservando Ícones e Estilo Visual)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR INSTITUCIONAL (Nome da Escola, Indicador SEDUC, Usuário e Botão Nuvem)         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ MÓDULOS PRINCIPAIS NO TOPO:                                                            │
│ [📋 Diário & Portaria]  [🚨 Busca Ativa & Ocorrências]  [📱 Tablets]  [📊 Relatórios]  [⚙️ Gerenciador] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SUB-BARRA CONTEXTUAL DO MÓDULO (Cartões e Pílulas no estilo visual atual):             │
│ Ex (Módulo Diário): [● Lançamento de Frequência]  [○ Portaria]  [○ Consulta de Ausências]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Equilíbrio Estético (Anti-Frieza / Manutenção do Estilo Atual):
- **Cores & Cartões Vivos**:
  - Cada módulo mantém sua cor temática de destaque (Índigo para Diário, Âmbar/Vermelho para Ocorrências, Céu/Azul para Tablets, Roxo para Gestão Master).
  - Cartões com sombras suaves (`shadow-xs`), bordas limpas e cantos arredondados (`rounded-2xl`).
- **Banners Redesenhados**:
  - Em vez de caixas de texto com 6 parágrafos, adotamos **cabeçalhos de seção refinados** com 1 linha descritiva e um ícone de apoio acolhedor.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Agrupamento Lógico por Rotina Escolar**
  - *Área 1 - Diário & Portaria*: Frequência do dia, entradas/saídas fora de hora e consulta médica/atestados.
  - *Área 2 - Busca Ativa & Ocorrências*: Triagem de casos, mediação disciplinar, acompanhamento de tutorados e alertas WhatsApp.
  - *Área 3 - Agendamento de Tablets*: Calendário semanal de reservas de tecnologia.
  - *Área 4 - Relatórios & Dossiês*: Fechamento mensal pedagógico e impressão de fichas.
  - *Área 5 - Gerenciador (Admin)*: Central de cadastros (Turmas, Alunos, Grade de Horários, Motivos, Medidas, Usuários, Nuvem).
- **Decisão 2: Manter Ações Rápidas Acessíveis sem Sobrecarregar o Topo**
  - O cabeçalho mantém os indicadores de frequência e casos críticos em formato elegante, liberando o espaço superior.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────┐
│                      App.tsx                             │
│       State: activeModule ('diario' | 'busca_ativa' |    │
│              'tablets' | 'relatorios' | 'admin')         │
│       State: activeSubTab (específica por módulo)        │
└────────┬───────────────────────────────────────┬─────────┘
         │                                       │
┌────────▼──────────────┐              ┌─────────▼──────────────┐
│     Header.tsx        │              │  Sub-Navegação Ativa   │
│  - 4 Módulos + Admin  │              │  - Pílulas e cartões   │
│  - Topo equilibrado   │              │  - Filtros contextuais │
└───────────────────────┘              └────────────────────────┘
```

#### Relação dos Módulos e Componentes Atuais:

1. **`diario`**:
   - `chamada`: `<RealTimeAttendance />`
   - `portaria`: `<GatePassManager />`
   - `ausencias`: `<TeacherAbsenceView />`
2. **`busca_ativa`**:
   - `ocorrencias`: `<OcorrenciasManager />`
   - `alertas`: `<AlertsManager />`
   - `casos`: `<InterventionsManager />`
3. **`tablets`**:
   - `<TabletsManager />`
4. **`relatorios`**:
   - `<MonthlyReport />`
5. **`admin` (Exclusivo Administrador)**:
   - `<SystemConfigManager />` (Turmas, Alunos, Grade de Horários, Ocorrências, Tablets, Usuários e Nuvem)
