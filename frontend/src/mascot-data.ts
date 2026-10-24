export const idlePoses = ['greeting', 'double-thumbs', 'thumbs-up'] as const
export const reactionPoses = ['inspect', 'fighting', 'celebrate'] as const
export type MascotPose = typeof idlePoses[number] | typeof reactionPoses[number]
export const mascotImage = (pose: MascotPose) => `/mascot/poseokho-${pose}.png`

export const encouragements = [
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
  { title: '잠깐, 숨도 고르세요', detail: '당신의 건강도 소중하니까요.' },
  { title: '오늘의 한 걸음', detail: '작은 노력도 차곡차곡 쌓여요.' },
]

// Titles draw on POSCO's founding philosophy; details are original encouragement,
// not quotations, equipment assessments, or a list of current corporate values.
export const spiritMessages = [
  { title: '창업정신 · 제철보국', detail: '좋은 철을 향한 당신의 정성, 오늘도 세상을 잇습니다.' },
  { title: '창의', detail: '익숙한 일에도 새로운 물음 하나. 더 나은 방법의 시작이에요.' },
  { title: '인재육성', detail: '함께 배우고 함께 성장해요. 오늘의 배움이 내일의 힘!' },
  { title: '희생과 봉사', detail: '동료를 위한 작은 도움, 함께 일하는 힘이 됩니다.' },
  { title: '도전', detail: '처음부터 완벽하지 않아도 괜찮아. 한 걸음씩 함께 가요.' },
  { title: '신뢰', detail: '작은 확인을 꾸준히. 당신의 꼼꼼함이 믿음이 됩니다.' },
  { title: '실천', detail: '좋은 생각을 작은 행동으로. 오늘 할 수 있는 하나부터!' },
  { title: '배려', detail: '동료에게 건네는 따뜻한 한마디. 오늘도 함께여서 든든해요.' },
  { title: '기본과 원칙', detail: '급할수록 차근차근. 안전을 먼저 살피는 당신을 응원해요.' },
]

export function randomOther<T>(items: readonly T[], previous: T, random = Math.random): T {
  const choices = items.filter(item => item !== previous)
  return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))] ?? previous
}
