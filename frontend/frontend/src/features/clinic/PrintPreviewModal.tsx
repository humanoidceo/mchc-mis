import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { buttonClassName, ghostButtonClassName } from '../../components/ui'

type PrintPreviewModalProps = {
  title: string
  subtitle: string
  printLabel: string
  onClose: () => void
  children: ReactNode
}

export function PrintPreviewModal({ title, subtitle, printLabel, onClose, children }: PrintPreviewModalProps) {
  useEffect(() => {
    document.body.classList.add('print-preview-open')
    return () => {
      document.body.classList.remove('print-preview-open')
    }
  }, [])

  return createPortal(
    <div className="print-preview-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm">
      <button className="print-preview-backdrop absolute inset-0 cursor-default" aria-label="Close preview" onClick={onClose} />
      <section className="print-preview-panel relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/70 bg-white shadow-2xl shadow-slate-950/25">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>{printLabel}</button>
            <button className={ghostButtonClassName} onClick={onClose}>Close</button>
          </div>
        </header>
        <div className="print-preview-scroll overflow-auto bg-slate-100 p-4">
          <div className="print-preview-sheet mx-auto w-fit bg-white shadow-lg shadow-slate-300/60">
            {children}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
