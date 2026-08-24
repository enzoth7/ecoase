"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Boxes,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Factory,
  FileSpreadsheet,
  MessageSquareText,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  stages,
  validationCases,
  validationQuestions,
  type EvidenceKind,
  type EvidenceSource,
  type Stage,
  type StageId,
  type ValidationCase,
  type ValidationCaseStatus,
} from "./data";

const stageIcons: Record<StageId, LucideIcon> = {
  pedido: MessageSquareText,
  plan: CalendarRange,
  disponibilidad: Factory,
  preparacion: Truck,
  entrega: ClipboardCheck,
};

const evidenceIcons: Record<EvidenceKind, LucideIcon> = {
  excel: FileSpreadsheet,
  regla_relevada: BookOpenCheck,
  no_confirmado: CircleHelp,
};

const statusIcons: Record<ValidationCaseStatus, LucideIcon> = {
  cerrado: CheckCircle2,
  bloqueado: AlertTriangle,
  por_confirmar: CircleHelp,
};

function EvidenceBadge({ source }: { source: EvidenceSource }) {
  const Icon = evidenceIcons[source.kind];
  return (
    <span className={`evidence-badge ${source.kind}`}>
      <Icon size={14} aria-hidden="true" />
      {source.label}
    </span>
  );
}

function EvidenceList({ sources }: { sources: EvidenceSource[] }) {
  return (
    <div className="evidence-list" aria-label="Fuentes y pendientes de validación">
      {sources.map((source, index) => (
        <div className="evidence-row" key={`${source.reference}-${index}`}>
          <EvidenceBadge source={source} />
          <p>
            <strong>{source.reference}</strong>
            {source.note && <span>{source.note}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

function StageDetail({ stage }: { stage: Stage }) {
  return (
    <section className="stage-detail" id="stage-detail" aria-live="polite" aria-labelledby="stage-detail-title">
      <div className="detail-intro">
        <span className="detail-number">Etapa {stage.number}</span>
        <div>
          <p className="eyebrow">Detalle de la etapa seleccionada</p>
          <h2 id="stage-detail-title">{stage.title}</h2>
          <p>{stage.decision}</p>
        </div>
      </div>

      <div className="detail-columns">
        <article className="known-card">
          <div className="detail-card-title">
            <Check size={18} aria-hidden="true" />
            <h3>Qué sabemos</h3>
          </div>
          <ul>
            {stage.known.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="unknown-card">
          <div className="detail-card-title">
            <CircleHelp size={18} aria-hidden="true" />
            <h3>Qué falta confirmar</h3>
          </div>
          <ul>
            {stage.unknown.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>

      <EvidenceList sources={stage.evidence} />
    </section>
  );
}

function StatusBadge({ item }: { item: ValidationCase }) {
  const Icon = statusIcons[item.status];
  return (
    <span className={`case-status ${item.status}`}>
      <Icon size={14} aria-hidden="true" />
      {item.statusLabel}
    </span>
  );
}

function CaseDetail({ item }: { item: ValidationCase }) {
  const stage = stages.find((candidate) => candidate.id === item.currentStageId);

  return (
    <section className={`case-detail ${item.status}`} id="case-detail" aria-live="polite" aria-labelledby="case-detail-title">
      <div className="case-detail-heading">
        <div>
          <StatusBadge item={item} />
          <h3 id="case-detail-title">{item.client} · {item.reference}</h3>
          <p>{item.summary}</p>
        </div>
        {stage && (
          <span className="current-stage">
            Etapa actual
            <strong>{stage.number}. {stage.title}</strong>
          </span>
        )}
      </div>

      <div className="case-facts" aria-label="Hechos verificados">
        {item.facts.map((fact) => (
          <span key={fact}><Check size={15} aria-hidden="true" />{fact}</span>
        ))}
      </div>

      <div className="next-question">
        <CircleHelp size={20} aria-hidden="true" />
        <div>
          <span>Pregunta para validar</span>
          <p>{item.nextQuestion}</p>
        </div>
      </div>

      <EvidenceList sources={item.evidence} />
    </section>
  );
}

export default function Dashboard() {
  const [selectedStageId, setSelectedStageId] = useState<StageId>("pedido");
  const [selectedCaseId, setSelectedCaseId] = useState(validationCases[0].id);

  const selectedStage = useMemo(
    () => stages.find((stage) => stage.id === selectedStageId) ?? stages[0],
    [selectedStageId],
  );
  const selectedCase = useMemo(
    () => validationCases.find((item) => item.id === selectedCaseId) ?? validationCases[0],
    [selectedCaseId],
  );

  const selectCase = (item: ValidationCase) => {
    setSelectedCaseId(item.id);
    setSelectedStageId(item.currentStageId);
  };

  return (
    <div className="pilot-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>

      <header className="site-header">
        <div className="brand" aria-label="Ecoase">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <strong>Ecoase</strong>
            <small>Piloto operativo</small>
          </span>
        </div>
        <span className="pilot-pill">Piloto para validar con Jony</span>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">Modelo completo · una sola pantalla</p>
          <h1 id="page-title">Cómo se transforma un pedido en una entrega</h1>
          <p className="hero-copy">
            Esta no es una aplicación terminada. Es una lectura simple de la operación para confirmar
            si el recorrido, las decisiones y los pendientes están bien entendidos.
          </p>
          <div className="source-note">
            <FileSpreadsheet size={18} aria-hidden="true" />
            <p><strong>Datos ficticios de los archivos originales.</strong> Solo lectura: este piloto no modifica las planillas.</p>
          </div>
        </section>

        <section className="flow-section" aria-labelledby="flow-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">El recorrido en cinco decisiones</p>
              <h2 id="flow-title">Del pedido al cierre</h2>
            </div>
            <p>Seleccioná una etapa para ver lo confirmado y lo que falta preguntar.</p>
          </div>

          <div className="process-flow" aria-label="Etapas del recorrido operativo">
            {stages.map((stage) => {
              const Icon = stageIcons[stage.id];
              const active = selectedStage.id === stage.id;
              return (
                <button
                  type="button"
                  className={`stage-card ${active ? "active" : ""}`}
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  aria-pressed={active}
                  aria-controls="stage-detail"
                >
                  <span className="stage-topline">
                    <span className="stage-number">{stage.number}</span>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <strong>{stage.title}</strong>
                  <span className="stage-question">{stage.question}</span>
                  <span className="stage-decision">{stage.decision}</span>
                  <span className="stage-output">
                    Salida <b>{stage.output}</b>
                  </span>
                  <ChevronRight className="stage-chevron" size={18} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <StageDetail stage={selectedStage} />
        </section>

        <section className="cases-section" aria-labelledby="cases-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tres ejemplos de los Excel</p>
              <h2 id="cases-title">Casos para validar</h2>
            </div>
            <p>Acá no se completan huecos con supuestos: lo que falta aparece como “No confirmado”.</p>
          </div>

          <div className="case-grid">
            {validationCases.map((item) => {
              const active = selectedCase.id === item.id;
              return (
                <button
                  type="button"
                  className={`case-card ${item.status} ${active ? "active" : ""}`}
                  key={item.id}
                  onClick={() => selectCase(item)}
                  aria-pressed={active}
                  aria-controls="case-detail"
                >
                  <StatusBadge item={item} />
                  <span className="case-name">
                    <strong>{item.client}</strong>
                    <small>{item.reference}</small>
                  </span>
                  <span className="case-summary">{item.summary}</span>
                  <span className="case-action">Ver caso <ChevronRight size={16} aria-hidden="true" /></span>
                </button>
              );
            })}
          </div>

          <CaseDetail item={selectedCase} />
        </section>

        <section className="validation-section" aria-labelledby="validation-title">
          <div>
            <p className="eyebrow">Cierre de la conversación</p>
            <h2 id="validation-title">Tres preguntas para Jony</h2>
            <p>Si estas tres respuestas quedan claras, el piloto ya cumplió su objetivo.</p>
          </div>
          <ol>
            {validationQuestions.map((question, index) => (
              <li key={question}>
                <span>{index + 1}</span>
                <p>{question}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <div>
          <Boxes size={18} aria-hidden="true" />
          <span><strong>Ecoase · piloto de validación</strong>Basado en 6 Excel y el resumen existente de los audios.</span>
        </div>
        <p>No incluye automatización, edición ni integración con WhatsApp.</p>
      </footer>
    </div>
  );
}
