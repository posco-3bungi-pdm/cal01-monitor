import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { GUIDE_CATEGORIES, GUIDE_STEPS } from '../guide-data'
import type { GuideStep } from '../guide-data'

function GuidePractice({ practice }: { practice: NonNullable<GuideStep['practice']> }) {
  const [answer, setAnswer] = useState<number | null>(null)
  return <section className="guide-practice" aria-label="설명용 연습 문제"><strong>{practice.question}</strong>
    <div>{practice.options.map((option, i) => <button key={option.label} aria-pressed={answer === i} onClick={() => setAnswer(i)}>{option.label}</button>)}</div>
    {answer !== null && <p role="status" data-correct={practice.options[answer].correct}><strong>{practice.options[answer].correct ? '올바른 해석' : '다시 생각해 보기'}</strong>{practice.options[answer].feedback}</p>}
  </section>
}

function MaintenancePattern() {
  return <figure className="guide-maintenance-pattern"><figcaption>정비 정지 → 재가동에서 나타날 수 있는 변화</figcaption>
    <svg viewBox="0 0 400 160" role="img" aria-label="설명용 추세. 출력이 먼저 내려간 뒤 온도가 낮아지고, 재가동 때 출력이 먼저 오른 뒤 온도가 따라 오른다.">
      <rect x="125" y="14" width="125" height="112" rx="8" className="maintenance-window" />
      <path d="M24 26 H375 M24 126 H375" className="guide-pattern-grid" />
      <path d="M24 38 H98 L120 116 H232 L255 38 H375" className="guide-pattern-op" />
      <path d="M24 46 H100 C135 46 144 108 182 108 H240 C280 108 294 46 330 46 H375" className="guide-pattern-tc" />
      <text x="24" y="151">운전</text><text x="187" y="151" textAnchor="middle">정비 정지</text><text x="375" y="151" textAnchor="end">재가동</text>
    </svg><div><span>━ TC 온도</span><span>┄ OP 출력</span></div><p>설명용 양상 · 수치·시간 축척 없음. 실제 정비 기록과 일치하는지 먼저 확인한다.</p>
  </figure>
}

export default function ProcessGuide({ index, onStep, onClose }: {
  index: number; onStep: (index: number) => void; onClose: () => void
}) {
  const reduced = useReducedMotion()
  const step = GUIDE_STEPS[index]
  const category = step.category ?? 'process'
  const scroll = useRef<HTMLDivElement>(null)
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }) }, [step.id])
  return <section className="guide-panel process-guide" aria-label="공정과 채널 읽기 가이드">
    <header className="guide-panel-top"><span><BookOpen size={17} />소둔로 공정 가이드</span><button className="icon-button" onClick={onClose} aria-label="공정 읽기 닫기"><X size={18} /></button></header>
    <nav className="guide-categories" aria-label="가이드 주제">{GUIDE_CATEGORIES.map(item => <button key={item.id} aria-current={category === item.id ? 'page' : undefined} onClick={() => onStep(GUIDE_STEPS.findIndex(candidate => (candidate.category ?? 'process') === item.id))}>{item.label}</button>)}</nav>
    <div className="guide-step-navigation" aria-label="공정 읽기 이동">
      <button className="subtle-button" aria-label="공정 읽기 이전 단계" disabled={index === 0} onClick={() => onStep(index - 1)}><ChevronLeft size={16} />이전</button>
      <span aria-live="polite">{index + 1} / {GUIDE_STEPS.length}</span>
      <button className="primary-button compact" aria-label={index < GUIDE_STEPS.length - 1 ? '공정 읽기 다음 단계' : '공정 읽기 마치기'} onClick={() => index < GUIDE_STEPS.length - 1 ? onStep(index + 1) : onClose()}>{index < GUIDE_STEPS.length - 1 ? '다음' : '마치기'}<ChevronRight size={16} /></button>
    </div>
    <div ref={scroll} className="process-guide-scroll">
      <details className="guide-outline"><summary>전체 단계 보기</summary><nav aria-label="공정 읽기 단계">{GUIDE_STEPS.map((item, stepIndex) => <button key={item.id} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => onStep(stepIndex)}><span>{stepIndex + 1}</span>{item.title}</button>)}</nav></details>
      <AnimatePresence mode="wait" initial={false}><motion.div key={step.id} className="guide-explanation" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
        <span className="guide-kind">{step.kind === 'practice' ? '설명용 연습' : step.kind === 'reading' ? '기록 읽는 방법' : '설비 공정 이해'}</span><h2>{step.title}</h2><p>{step.body}</p>
        {step.pattern && <MaintenancePattern />}
        {step.sections && <div className="guide-topic-sections">{step.sections.map(section => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}</div>}
        <div className="guide-check"><Check size={17} /><div><strong>화면에서 확인</strong><p>{step.check}</p></div></div>
        {step.practice && <GuidePractice key={step.id} practice={step.practice} />}
        {step.sources && <details className="guide-sources"><summary>참고 자료와 적용 범위</summary><p>일반 공정 설명의 참고 자료다. CAL01의 존 역할·태그 연결은 제공 자료를 바탕으로 한 화면 설명이며 현장 운전 기준과 구분한다.</p>{step.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</details>}
      </motion.div></AnimatePresence>
    </div>
    <footer className="process-guide-footer">종료 시 이전 LOT·시각으로 복귀 · 교육 진행은 저장하지 않음</footer>
  </section>
}
