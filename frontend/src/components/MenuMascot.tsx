import { useEffect, useState } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'

const messages = [
  { title: '오늘도 안전하게!', detail: '시작 전, 한 번 더 확인해요.' },
  { title: '오운완!', detail: '오늘 운전도 꼼꼼하게!' },
  { title: '오늘 하루도 수고했어', detail: '당신의 하루를 응원해요.' },
  { title: '안전 확인', detail: '나와 동료를 위한 작은 실천.' },
  { title: '신뢰', detail: '작은 확인이 큰 신뢰로.' },
  { title: '실천', detail: '아는 것을 행동으로, 오늘부터.' },
  { title: '무한한 창의', detail: '더 나은 방법을 함께 찾아요.' },
  { title: '끝없는 도전', detail: '어제보다 한 걸음 더!' },
  { title: '함께 확인해요', detail: '작은 변화도 동료와 나눠요.' },
  { title: '기록이 힘이 돼요', detail: '오늘의 기록이 내일의 배움으로.' },
]

export default function MenuMascot({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const response = useAnimationControls()
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(0)
  const animated = active && !paused && !reduced
  useEffect(() => {
    if (!animated) return
    const timer = window.setInterval(() => setIndex(value => (value + 1) % messages.length), 9000)
    return () => window.clearInterval(timer)
  }, [animated])
  useEffect(() => {
    if (!animated) {
      response.stop()
      if (!active || reduced) response.set({ rotate: 0, y: 0 })
      return
    }
    void response.start({ rotate: [null, -1.5, 0], transition: { duration: 1.8, ease: 'easeInOut' } })
    return () => response.stop()
  }, [active, animated, reduced, response])
  const nextMessage = () => {
    setIndex(value => (value + 1) % messages.length)
    if (animated) {
      // Continue from the current pose when clicked again during a nod.
      void response.start({ rotate: [null, -2.2, 0.4, 0], y: [null, 0.6, 0, 0], transition: { duration: 1.6, times: [0, 0.4, 0.72, 1], ease: 'easeInOut' } })
    }
  }
  const message = messages[index]
  return <section className="menu-mascot" data-animated={animated} aria-label="포석호의 응원">
    <div className="mascot-greeting">
      <motion.div className="mascot-bubble" key={index} initial={animated ? { opacity: 0, y: 2 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: animated ? 0.35 : 0 }}><small>포석호의 한마디</small><strong>{message.title}</strong><p>{message.detail}</p></motion.div>
      <button className="mascot-character" aria-label="포석호 응원 문구 바꾸기" title="눌러서 다른 응원 보기" onClick={nextMessage}>
        <motion.span className="mascot-response" animate={response} aria-hidden="true">
          <span className="mascot-idle"><span className="mascot-breath"><img src="/mascot/poseokho-greeting.png" alt="" width="1200" height="1310" draggable={false} /></span></span>
        </motion.span>
      </button>
    </div>
    <div className="mascot-caption"><span>오늘도 함께, 연속소둔공정</span><button className="icon-button" aria-label={paused ? '포석호 움직임과 문구 자동 전환 재개' : '포석호 움직임과 문구 자동 전환 멈춤'} aria-pressed={paused} disabled={Boolean(reduced)} onClick={() => setPaused(value => !value)} title={reduced ? '기기의 동작 줄이기 설정 적용 중' : paused ? '움직임·자동 전환 재개' : '움직임·자동 전환 멈춤'}>{paused || reduced ? <Play size={13} /> : <Pause size={13} />}</button></div>
  </section>
}
