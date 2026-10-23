import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookOpen, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { GUIDE_STEPS } from '../guide-data'

export default function ProcessGuide({ index, onStep, onClose }: {
  index: number; onStep: (index: number) => void; onClose: () => void
}) {
  const reduced = useReducedMotion()
  const step = GUIDE_STEPS[index]
  return <section className="guide-panel process-guide" aria-label="공정과 채널 읽기 가이드">
    <header className="guide-panel-top"><span><BookOpen size={17} />공정 읽기</span><button className="icon-button" onClick={onClose} aria-label="공정 읽기 닫기"><X size={18} /></button></header>
    <div className="guide-step-navigation" aria-label="공정 읽기 이동">
      <button className="subtle-button" aria-label="공정 읽기 이전 단계" disabled={index === 0} onClick={() => onStep(index - 1)}><ChevronLeft size={16} />이전</button>
      <span aria-live="polite">{index + 1} / {GUIDE_STEPS.length}</span>
      <button className="primary-button compact" aria-label={index < GUIDE_STEPS.length - 1 ? '공정 읽기 다음 단계' : '공정 읽기 마치기'} onClick={() => index < GUIDE_STEPS.length - 1 ? onStep(index + 1) : onClose()}>{index < GUIDE_STEPS.length - 1 ? '다음' : '마치기'}<ChevronRight size={16} /></button>
    </div>
    <div className="process-guide-scroll">
      <details className="guide-outline"><summary>전체 단계 보기</summary><nav aria-label="공정 읽기 단계">{GUIDE_STEPS.map((item, stepIndex) => <button key={item.id} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => onStep(stepIndex)}><span>{stepIndex + 1}</span>{item.title}</button>)}</nav></details>
      <AnimatePresence mode="wait" initial={false}><motion.div key={step.id} className="guide-explanation" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
        <span className="guide-kind">{step.kind === 'practice' ? '설명용 연습' : step.kind === 'reading' ? '기록 읽는 방법' : '설비 공정 이해'}</span><h2>{step.title}</h2><p>{step.body}</p>
        <div className="guide-check"><Check size={17} /><div><strong>화면에서 확인</strong><p>{step.check}</p></div></div>
      </motion.div></AnimatePresence>
    </div>
    <footer className="process-guide-footer">종료 시 이전 LOT·시각으로 복귀 · 교육 진행은 저장하지 않음</footer>
  </section>
}
