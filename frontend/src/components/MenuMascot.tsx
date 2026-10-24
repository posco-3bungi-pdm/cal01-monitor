import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { encouragements, idlePoses, mascotImage, randomOther, reactionPoses, spiritMessages } from '../mascot-data'
import type { MascotPose } from '../mascot-data'

export default function MenuMascot({ active }: { active: boolean }) {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const [pose, setPose] = useState<MascotPose>('greeting')
  const [message, setMessage] = useState(encouragements[0])
  const [reaction, setReaction] = useState(0)
  const animated = active && !paused && !reduced
  useEffect(() => {
    if (!animated) return
    const timer = window.setInterval(() => {
      setPose(value => randomOther<MascotPose>(idlePoses, value))
      setMessage(value => randomOther(encouragements, value))
    }, 9000)
    return () => window.clearInterval(timer)
  }, [animated, reaction])
  useEffect(() => {
    // Preload the supplied cutouts so a click never waits on an image download.
    for (const item of [...idlePoses, ...reactionPoses]) { const image = new Image(); image.src = mascotImage(item) }
  }, [])
  const nextMessage = () => {
    setPose(value => randomOther<MascotPose>(reactionPoses, value))
    setMessage(value => randomOther(spiritMessages, value))
    setReaction(value => value + 1)
  }
  return <section className="menu-mascot" data-animated={animated} aria-label="포석호의 응원">
    <div className="mascot-greeting">
      <motion.div className="mascot-bubble" key={message.title} initial={animated ? { opacity: 0, y: 2 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: animated ? 0.35 : 0 }}><small>포석호의 한마디</small><strong>{message.title}</strong><p>{message.detail}</p></motion.div>
      <button className="mascot-character" aria-label="포석호 표정과 포스코 정신 응원 문구 바꾸기" title="눌러서 표정과 응원 바꾸기" onClick={nextMessage}>
        <span className="mascot-idle"><span className="mascot-breath">
          <motion.span key={`${pose}-${reaction}`} className={`mascot-pose mascot-pose-${pose}`} aria-hidden="true"
            initial={animated ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: animated ? .28 : 0 }}>
            <img src={mascotImage(pose)} alt="" draggable={false} />
          </motion.span>
        </span></span>
      </button>
    </div>
    <div className="mascot-caption"><span>눌러봐요 · 오늘을 응원하는 마음</span><button className="icon-button" aria-label={paused ? '포석호 움직임과 문구 자동 전환 재개' : '포석호 움직임과 문구 자동 전환 멈춤'} aria-pressed={paused} disabled={Boolean(reduced)} onClick={() => setPaused(value => !value)} title={reduced ? '기기의 동작 줄이기 설정 적용 중' : paused ? '움직임·자동 전환 재개' : '움직임·자동 전환 멈춤'}>{paused || reduced ? <Play size={13} /> : <Pause size={13} />}</button></div>
  </section>
}
